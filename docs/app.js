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

  const pickupInput = document.getElementById('pickup-address');
  const pickupEditBtn = document.getElementById('pickup-edit-btn');
  const destInput = document.getElementById('dest-address');
  const quoteBtn = document.getElementById('quote-btn');
  const statusArea = document.getElementById('status-area');
  const resultArea = document.getElementById('result-area');
  const resultList = document.getElementById('result-list');

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

  function renderResults(payload) {
    clearStatus();
    resultList.innerHTML = '';

    const successEntries = payload.results.filter(r => !r.error);
    const errorEntries = payload.results.filter(r => r.error);

    if (successEntries.length === 0) {
      setError('見積を取得できる車種がありませんでした。' + (errorEntries[0] ? localizeError(errorEntries[0].error, errorEntries[0].errorMessage) : ''));
      return;
    }

    successEntries.sort((a, b) => a.total - b.total);
    const cheapestTotal = successEntries[0].total;

    successEntries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'vehicle-card' + (entry.total === cheapestTotal ? ' best' : '');
      card.innerHTML = `
        <div class="vehicle-info">
          <span class="vehicle-name">${escapeHtml(entry.serviceType)}</span>
          <span class="vehicle-meta">${escapeHtml(entry.description || '')} ・ ${formatKm(entry.distanceM)}</span>
        </div>
        <div class="vehicle-price">
          <span class="price-value">${formatYen(entry.total)}</span>
          <span class="price-expiry">${formatExpiry(entry.expiresAt)}</span>
        </div>
      `;
      resultList.appendChild(card);
    });

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
    const destAddress = destInput.value.trim();
    if (!destAddress) {
      setError(ERROR_MESSAGES.MISSING_DEST_ADDRESS);
      return;
    }

    setLoading();

    const requestBody = {
      action: 'quote',
      destAddress: destAddress,
      pickupAddress: pickupInput.value.trim()
    };

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

      renderResults(payload);
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
