/**
 * Webアプリ エントリポイント
 * フロントエンドから Content-Type: text/plain;charset=utf-8 でPOSTされたJSONを処理する
 * (プリフライトCORSを回避するため。GAS側はcontent-typeの値に関わらずbodyをJSONとしてparseする)
 */

// Sandbox 30req/分 のレート制限に対し安全マージンを持たせた直列実行間隔(ms)
var QUOTE_REQUEST_INTERVAL_MS = 2200;

function doPost(e) {
  var output;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('リクエストボディがありません');
    }
    var request = JSON.parse(e.postData.contents);
    var action = request.action;
    if (action === 'quote') {
      output = handleQuote_(request);
    } else if (action === 'cities') {
      output = { ok: true, serviceTypes: getJapanServiceTypes_() };
    } else {
      output = { ok: false, error: 'UNKNOWN_ACTION', message: '不明なactionです: ' + action };
    }
  } catch (err) {
    output = { ok: false, error: 'SERVER_ERROR', message: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * action=quote のハンドラ
 * @param {{destAddress:string, pickupAddress?:string, serviceTypes?:string[]}} request
 */
function handleQuote_(request) {
  var destAddress = request.destAddress;
  if (!destAddress) {
    return { ok: false, error: 'MISSING_DEST_ADDRESS', message: 'お届け先住所を入力してください' };
  }

  var props = PropertiesService.getScriptProperties();
  var pickupAddress = request.pickupAddress || props.getProperty('PICKUP_ADDRESS');
  if (!pickupAddress) {
    return { ok: false, error: 'MISSING_PICKUP_ADDRESS', message: '集荷元住所が設定されていません' };
  }

  var pickupCoords;
  try {
    pickupCoords = request.pickupAddress
      ? geocodeAddress_(request.pickupAddress)
      : getPickupCoordinates_();
  } catch (e) {
    return { ok: false, error: 'PICKUP_GEOCODE_FAILED', message: '集荷元住所を認識できませんでした' };
  }

  var destCoords;
  try {
    destCoords = geocodeAddress_(destAddress);
  } catch (e) {
    return { ok: false, error: 'GEOCODE_FAILED', message: 'お届け先住所を認識できませんでした。住所を確認してください。' };
  }

  var allServiceTypes = getJapanServiceTypes_();
  var serviceTypes;
  if (request.serviceTypes && request.serviceTypes.length > 0) {
    var typeMap = {};
    allServiceTypes.forEach(function (t) { typeMap[t.key] = t; });
    serviceTypes = request.serviceTypes.map(function (key) {
      return typeMap[key] || { key: key, description: key };
    });
  } else {
    serviceTypes = allServiceTypes;
  }

  if (serviceTypes.length === 0) {
    return { ok: false, error: 'NO_SERVICE_TYPES', message: '利用可能な車種が見つかりませんでした' };
  }

  var results = [];
  serviceTypes.forEach(function (svc, idx) {
    if (idx > 0) {
      Utilities.sleep(QUOTE_REQUEST_INTERVAL_MS);
    }
    var entry = { serviceType: svc.key, description: svc.description };
    try {
      var result = getQuotation_(svc.key, pickupCoords, pickupAddress, destCoords, destAddress);
      if (result.code === 200 && result.body && result.body.data) {
        var data = result.body.data;
        entry.total = Number(data.priceBreakdown.total);
        entry.currency = data.priceBreakdown.currency;
        entry.distanceM = Number(data.distance.value);
        entry.expiresAt = data.expiresAt;
      } else {
        var errInfo = extractError_(result.body);
        entry.error = errInfo.id;
        entry.errorMessage = errInfo.message;
      }
    } catch (e) {
      entry.error = 'REQUEST_FAILED';
      entry.errorMessage = String(e && e.message ? e.message : e);
    }
    results.push(entry);
  });

  return {
    ok: true,
    pickupAddress: pickupAddress,
    destAddress: destAddress,
    results: results
  };
}
