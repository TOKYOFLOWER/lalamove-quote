/**
 * Script Properties設定・疎通テスト用のユーティリティ。
 * このファイルに秘密情報を直接書かないこと。
 * 実際のAPIキー投入は SetupLocal.gs (gitignore対象・非コミット) で行う。
 */

/**
 * APIキー等をScript Propertiesに設定する。
 * Apps Scriptエディタでこの関数を選択して実行するか、
 * clasp run setCredentials --params '["pk_...","sk_...","sandbox","住所"]' で実行する。
 */
function setCredentials(apiKey, apiSecret, env, pickupAddress) {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    LALAMOVE_API_KEY: apiKey,
    LALAMOVE_API_SECRET: apiSecret,
    LALAMOVE_ENV: env || 'sandbox',
    PICKUP_ADDRESS: pickupAddress
  });
  props.deleteProperty('PICKUP_ADDRESS_CACHED');
  props.deleteProperty('PICKUP_COORDS_CACHED');
  Logger.log('Script Propertiesを設定しました: env=' + (env || 'sandbox') + ' pickupAddress=' + pickupAddress);
}

/** 現在の設定状況を確認する(値そのものはログに出さない) */
function checkConfig() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('LALAMOVE_API_KEY set: ' + !!props.getProperty('LALAMOVE_API_KEY'));
  Logger.log('LALAMOVE_API_SECRET set: ' + !!props.getProperty('LALAMOVE_API_SECRET'));
  Logger.log('LALAMOVE_ENV: ' + props.getProperty('LALAMOVE_ENV'));
  Logger.log('PICKUP_ADDRESS: ' + props.getProperty('PICKUP_ADDRESS'));
}

/** GET /v3/cities 疎通テスト。エディタから直接実行する。 */
function testCities() {
  var serviceTypes = getJapanServiceTypes_();
  Logger.log(JSON.stringify(serviceTypes, null, 2));
  return serviceTypes;
}

/** 見積取得の疎通テスト。エディタから直接実行する。 */
function testQuote() {
  var result = handleQuote_({ destAddress: '東京都渋谷区渋谷2-24-12' });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/** POST /v3/quotations の生レスポンス(HTTPコード込み)を確認するデバッグ用。 */
function testQuoteRaw() {
  var pickup = getPickupCoordinates_();
  var dest = geocodeAddress_('東京都渋谷区渋谷2-24-12');
  var result = getQuotation_('MOTORCYCLE', pickup, PropertiesService.getScriptProperties().getProperty('PICKUP_ADDRESS'), dest, '東京都渋谷区渋谷2-24-12');
  Logger.log('HTTP ' + result.code);
  Logger.log(JSON.stringify(result.body, null, 2));
  return result;
}
