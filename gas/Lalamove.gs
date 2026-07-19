/**
 * Lalamove API v3 (JP market) クライアント
 * https://developers.lalamove.com/
 */

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('LALAMOVE_API_KEY');
  var apiSecret = props.getProperty('LALAMOVE_API_SECRET');
  var env = props.getProperty('LALAMOVE_ENV') || 'sandbox';
  if (!apiKey || !apiSecret) {
    throw new Error('APIキー/シークレットが設定されていません。setup()を実行してください。');
  }
  return { apiKey: apiKey, apiSecret: apiSecret, env: env };
}

function getBaseUrl_(env) {
  return env === 'production'
    ? 'https://rest.lalamove.com'
    : 'https://rest.sandbox.lalamove.com';
}

/** byte配列(署名)を小文字hex文字列に変換 */
function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    var v = b < 0 ? b + 256 : b;
    var hex = v.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function hmacSha256Hex_(secret, message) {
  // 文字列オーバーロードは非ASCII文字(日本語住所など)で既定エンコーディングが
  // UTF-8と一致しない場合があるため、UTF-8バイト配列を明示的に渡す。
  var keyBytes = Utilities.newBlob(secret).getBytes();
  var messageBytes = Utilities.newBlob(message).getBytes();
  var signatureBytes = Utilities.computeHmacSha256Signature(messageBytes, keyBytes);
  return bytesToHex_(signatureBytes);
}

/**
 * Lalamove APIへHMAC署名付きリクエストを送信する。
 * @param {string} method GET/POST
 * @param {string} path バージョン込みパス 例: /v3/quotations
 * @param {Object|null} bodyObj リクエストボディ(オブジェクト)。GETはnull。
 * @return {{code:number, body:Object}}
 */
function lalamoveRequest_(method, path, bodyObj) {
  var config = getConfig_();
  var baseUrl = getBaseUrl_(config.env);
  var timestamp = String(new Date().getTime());
  // JSON.stringifyは1回だけ実行し、署名と送信payloadで同一文字列を使い回す
  var bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  var rawSignature = timestamp + '\r\n' + method + '\r\n' + path + '\r\n\r\n' + bodyStr;
  var signature = hmacSha256Hex_(config.apiSecret, rawSignature);
  var authHeader = 'hmac ' + config.apiKey + ':' + timestamp + ':' + signature;

  var options = {
    method: method,
    contentType: 'application/json; charset=utf-8',
    headers: {
      'Authorization': authHeader,
      'Market': 'JP',
      'Request-ID': Utilities.getUuid()
    },
    muteHttpExceptions: true
  };
  if (bodyStr) {
    options.payload = bodyStr;
  }

  var response = UrlFetchApp.fetch(baseUrl + path, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  var json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    json = { raw: text };
  }
  return { code: code, body: json };
}

/** GET /v3/cities の結果を6時間キャッシュして返す(全都市) */
function getCities_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('LALAMOVE_CITIES');
  if (cached) {
    return JSON.parse(cached);
  }
  var result = lalamoveRequest_('GET', '/v3/cities', null);
  if (result.code !== 200 || !result.body || !result.body.data) {
    throw new Error('cities取得に失敗しました: HTTP ' + result.code + ' ' + JSON.stringify(result.body));
  }
  var cities = result.body.data;
  cache.put('LALAMOVE_CITIES', JSON.stringify(cities), 21600); // 6時間
  return cities;
}

/** 日本(JP)の都市のみ抽出 */
function getJapanCities_() {
  var cities = getCities_();
  return cities.filter(function (c) {
    return c.locode && c.locode.indexOf('JP') === 0;
  });
}

/** 日本国内の全都市からserviceTypeキーを重複排除して抽出 */
function getJapanServiceTypes_() {
  var cities = getJapanCities_();
  var map = {};
  var order = [];
  cities.forEach(function (city) {
    (city.services || []).forEach(function (svc) {
      if (!map[svc.key]) {
        map[svc.key] = { key: svc.key, description: svc.description || svc.key };
        order.push(svc.key);
      }
    });
  });
  return order.map(function (k) { return map[k]; });
}

/**
 * 見積取得
 * @param {string} serviceType
 * @param {{lat:number,lng:number}} pickupCoords
 * @param {string} pickupAddress
 * @param {{lat:number,lng:number}} destCoords
 * @param {string} destAddress
 */
function getQuotation_(serviceType, pickupCoords, pickupAddress, destCoords, destAddress) {
  var body = {
    data: {
      serviceType: serviceType,
      language: 'ja_JP',
      stops: [
        {
          coordinates: { lat: String(pickupCoords.lat), lng: String(pickupCoords.lng) },
          address: pickupAddress
        },
        {
          coordinates: { lat: String(destCoords.lat), lng: String(destCoords.lng) },
          address: destAddress
        }
      ]
    }
  };
  return lalamoveRequest_('POST', '/v3/quotations', body);
}

/** APIエラーレスポンスからid/messageを抽出 */
function extractError_(body) {
  if (body && body.errors && body.errors.length > 0) {
    var e = body.errors[0];
    return {
      id: e.id || 'UNKNOWN_ERROR',
      message: e.message || e.detail || 'エラーが発生しました'
    };
  }
  if (body && body.message) {
    return { id: 'ERROR', message: body.message };
  }
  return { id: 'UNKNOWN_ERROR', message: '不明なエラーが発生しました' };
}
