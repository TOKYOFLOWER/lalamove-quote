(function () {
  const ERROR_MESSAGES = {
    ERR_OUT_OF_SERVICE_AREA: 'この住所はLalamove配達エリア外です',
    ERR_INVALID_SERVICE_TYPE: 'この車種は現在地域でご利用いただけません',
    GEOCODE_FAILED: 'お届け先住所を認識できませんでした。住所をご確認ください',
    PICKUP_GEOCODE_FAILED: '集荷元住所を認識できませんでした。住所をご確認ください',
    MISSING_DEST_ADDRESS: 'お届け先住所を入力してください',
    MISSING_PICKUP_ADDRESS: '集荷元住所が設定されていません',
    NO_SERVICE_TYPES: '利用可能な車種が見つかりませんでした',
    SERVER_ERROR: 'サーバーでエラーが発生しました。しばらくしてから再度お試しください',
    UNKNOWN_ACTION: '不明なリクエストです',
    REQUEST_FAILED: '通信エラーが発生しました'
  };

  const PICKUP_STORAGE_KEY = 'lalamove_pickup_address_override';
  // 集荷元(銀座1-20-2)のジオコーディング済み座標。地図の初期中心にのみ使用する。
  const PICKUP_APPROX_COORDS = { lat: 35.6729469, lng: 139.7705724 };

  const pickupInput = document.getElementById('pickup-address');
  const pickupEditBtn = document.getElementById('pickup-edit-btn');
  const destInput = document.getElementById('dest-address');
  const quoteBtn = document.getElementById('quote-btn');
  const quoteBtnText = quoteBtn.querySelector('.btn-text');
  const statusArea = document.getElementById('status-area');
  const resultArea = document.getElementById('result-area');
  const resultList = document.getElementById('result-list');
  const resolvedAddressNote = document.getElementById('resolved-address-note');
  const modeTabs = document.querySelectorAll('.mode-tab');
  const addressModeSection = document.getElementById('address-mode-section');
  const mapModeSection = document.getElementById('map-mode-section');
  const mapCoordsEl = document.getElementById('map-coords');

  let currentMode = 'address';
  let selectedCoords = null;
  let map = null;
  let marker = null;

  function localizeError(code, fallbackMessage) {
    return ERROR_MESSAGES[code] || fallbackMessage || 'エラーが発生しました';
  }

  function formatYen(amount) {
    return '¥' + Number(amount).toLocaleString('ja-JP');
  }

  function formatKm(distanceM) {
    return (Number(distanceM) / 1000).toFixed(1) + ' km';
  }

  function formatExpiry(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `見積有効期限 ${hh}:${mm}まで`;
  }

  function loadPickupAddress() {
    return localStorage.getItem(PICKUP_STORAGE_KEY) || DEFAULT_PICKUP_ADDRESS;
  }

  function initPickupField() {
    pickupInput.value = loadPickupAddress();
  }

  function updateMapCoordsDisplay() {
    mapCoordsEl.textContent = selectedCoords
      ? `選択座標: ${selectedCoords.lat.toFixed(4)}, ${selectedCoords.lng.toFixed(4)}`
      : '地図をタップしてピンを設置してください';
  }

  function setMarker(lat, lng) {
    selectedCoords = { lat: lat, lng: lng };
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        selectedCoords = { lat: pos.lat, lng: pos.lng };
        updateMapCoordsDisplay();
      });
    }
    updateMapCoordsDisplay();
  }

  function initMapIfNeeded() {
    if (map) return;
    map = L.map('map').setView([PICKUP_APPROX_COORDS.lat, PICKUP_APPROX_COORDS.lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    map.on('click', (e) => {
      setMarker(e.latlng.lat, e.latlng.lng);
    });
  }

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentMode = tab.dataset.mode;
      modeTabs.forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      addressModeSection.hidden = currentMode !== 'address';
      mapModeSection.hidden = currentMode !== 'map';
      quoteBtnText.textContent = currentMode === 'map' ? 'この場所で料金を調べる' : '料金を調べる';

      if (currentMode === 'map') {
        initMapIfNeeded();
        // 非表示状態で初期化されたLeafletのサイズ計算がずれるため、表示後に再計算する
        setTimeout(() => map.invalidateSize(), 50);
      }
    });
  });

  pickupEditBtn.addEventListener('click', () => {
    const isReadonly = pickupInput.hasAttribute('readonly');
    if (isReadonly) {
      pickupInput.removeAttribute('readonly');
      pickupInput.focus();
      pickupInput.select();
      pickupEditBtn.textContent = '確定';
    } else {
      const value = pickupInput.value.trim() || DEFAULT_PICKUP_ADDRESS;
      pickupInput.value = value;
      localStorage.setItem(PICKUP_STORAGE_KEY, value);
      pickupInput.setAttribute('readonly', 'readonly');
      pickupEditBtn.textContent = '変更';
    }
  });

  function setLoading() {
    statusArea.hidden = false;
    statusArea.className = 'status-area loading';
    statusArea.textContent = '料金を取得しています…';
    resultArea.hidden = true;
    resultList.innerHTML = '';
    quoteBtn.disabled = true;
  }

  function setError(message) {
    statusArea.hidden = false;
    statusArea.className = 'status-area error';
    statusArea.textContent = message;
    resultArea.hidden = true;
    quoteBtn.disabled = false;
  }

  function clearStatus() {
    statusArea.hidden = true;
    statusArea.textContent = '';
    statusArea.className = 'status-area';
    quoteBtn.disabled = false;
  }

  /** APIの実見積結果と、pricing.jsの関東運賃表から算出した参考価格を統合したカード一覧を作る */
  function buildVehicleCards(results) {
    const successEntries = results.filter(r => !r.error);
    const vehiclePricing = (typeof KANTO_VEHICLE_PRICING !== 'undefined') ? KANTO_VEHICLE_PRICING : [];

    const realCards = successEntries.map(entry => {
      const meta = vehiclePricing.find(v => v.key === entry.serviceType) || null;
      return {
        type: 'real',
        key: entry.serviceType,
        nameJa: meta ? meta.nameJa : entry.serviceType,
        description: entry.description,
        price: entry.total,
        distanceM: entry.distanceM,
        expiresAt: entry.expiresAt,
        meta: meta
      };
    });

    // 実見積が取れた距離を参考価格の計算に流用する(車種が変わっても経路距離は同じとみなす)
    const distanceSource = successEntries.length > 0 ? successEntries[0].distanceM : null;
    const matchedKeys = new Set(successEntries.map(e => e.serviceType));

    const referenceCards = distanceSource != null
      ? vehiclePricing
          .filter(v => !matchedKeys.has(v.key))
          .map(v => ({
            type: 'reference',
            key: v.key,
            nameJa: v.nameJa,
            description: v.capacityNote,
            price: calcReferencePrice(distanceSource, v),
            distanceM: distanceSource,
            meta: v
          }))
      : [];

    // 実見積・参考価格を統合した配列に対してソート・最安判定の両方を行う
    // (別々の配列に対して判定すると、この2つが今後も食い違う原因になる)
    const allCards = realCards.concat(referenceCards).sort((a, b) => a.price - b.price);
    const cheapest = allCards.length > 0
      ? Math.min(...allCards.map(c => c.price))
      : null;
    allCards.forEach(card => {
      card.isBest = card.price === cheapest;
    });

    return allCards;
  }

  function renderVehicleCard(card) {
    const el = document.createElement('div');
    const badgeClass = card.type === 'real' ? 'badge-real' : 'badge-reference';
    const badgeLabel = card.type === 'real' ? '実見積' : '参考価格';
    const metaLine = card.meta
      ? `最大${card.meta.maxLoadKg}kg・${escapeHtml(card.meta.size)}`
      : '';

    el.className = 'vehicle-card' + (card.isBest ? ' best' : '') + (card.type === 'reference' ? ' reference-card' : '');
    el.innerHTML = `
      <div class="vehicle-card-top">
        <div class="vehicle-info">
          <span class="type-badge ${badgeClass}">${badgeLabel}</span>
          <span class="vehicle-name">${escapeHtml(card.nameJa)}</span>
          <span class="vehicle-meta">${escapeHtml(card.description || '')} ・ ${formatKm(card.distanceM)}</span>
          ${metaLine ? `<span class="vehicle-capacity">${metaLine}</span>` : ''}
        </div>
        <div class="vehicle-price">
          <span class="price-value">${formatYen(card.price)}</span>
          ${card.type === 'real' ? `<span class="price-expiry">${formatExpiry(card.expiresAt)}</span>` : ''}
        </div>
      </div>
      ${card.type === 'reference' ? '<p class="reference-note">公式料金表による概算。ピーク割増・待機料金等は含みません</p>' : ''}
    `;
    return el;
  }

  function renderResults(payload, showResolvedAddress) {
    clearStatus();
    resultList.innerHTML = '';
    resolvedAddressNote.hidden = true;

    const successEntries = payload.results.filter(r => !r.error);
    const errorEntries = payload.results.filter(r => r.error);

    if (successEntries.length === 0) {
      setError('見積を取得できる車種がありませんでした。' + (errorEntries[0] ? localizeError(errorEntries[0].error, errorEntries[0].errorMessage) : ''));
      return;
    }

    if (showResolvedAddress && payload.destAddress) {
      resolvedAddressNote.textContent = `この住所として見積もりました: ${payload.destAddress}`;
      resolvedAddressNote.hidden = false;
    }

    const cards = buildVehicleCards(payload.results);
    cards.forEach(card => resultList.appendChild(renderVehicleCard(card)));

    errorEntries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'vehicle-card error-card';
      card.innerHTML = `
        <div class="vehicle-info">
          <span class="vehicle-name">${escapeHtml(entry.serviceType)}</span>
          <span class="error-text">${escapeHtml(localizeError(entry.error, entry.errorMessage))}</span>
        </div>
      `;
      resultList.appendChild(card);
    });

    resultArea.hidden = false;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
  }

  async function fetchQuote() {
    let requestBody;

    if (currentMode === 'map') {
      if (!selectedCoords) {
        setError('地図をタップしてお届け先を選択してください');
        return;
      }
      requestBody = {
        action: 'quote',
        destLat: selectedCoords.lat,
        destLng: selectedCoords.lng,
        pickupAddress: pickupInput.value.trim()
      };
    } else {
      const destAddress = destInput.value.trim();
      if (!destAddress) {
        setError(ERROR_MESSAGES.MISSING_DEST_ADDRESS);
        return;
      }
      requestBody = {
        action: 'quote',
        destAddress: destAddress,
        pickupAddress: pickupInput.value.trim()
      };
    }

    setLoading();

    try {
      // text/plain でPOSTしてCORSプリフライトを回避する
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        setError('通信エラーが発生しました（HTTP ' + response.status + '）');
        return;
      }

      const payload = await response.json();

      if (!payload.ok) {
        setError(localizeError(payload.error, payload.message));
        return;
      }

      renderResults(payload, currentMode === 'map');
    } catch (err) {
      setError('通信に失敗しました。ネットワーク状況をご確認ください。');
    }
  }

  quoteBtn.addEventListener('click', fetchQuote);
  destInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchQuote();
  });

  initPickupField();
})();
