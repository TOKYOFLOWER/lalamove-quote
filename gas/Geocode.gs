/**
 * 住所ジオコーディング (GASビルトインMapsサービス)
 */

function geocodeAddress_(address) {
  var geocoder = Maps.newGeocoder().setLanguage('ja').setRegion('jp');
  var response = geocoder.geocode(address);
  if (response.status !== 'OK' || !response.results || response.results.length === 0) {
    throw new Error('住所を認識できませんでした: ' + address);
  }
  var loc = response.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

/**
 * 座標から住所文字列を逆引きする(地図ピン選択モード用)。
 * Lalamove APIはstops[].addressを必須とするため、失敗時もフォールバック文字列を返す。
 */
function reverseGeocodeAddress_(lat, lng) {
  try {
    var geocoder = Maps.newGeocoder().setLanguage('ja');
    var response = geocoder.reverseGeocode(lat, lng);
    if (response.status === 'OK' && response.results && response.results.length > 0) {
      return response.results[0].formatted_address;
    }
  } catch (e) {
    // フォールバックへ
  }
  return '東京都内（座標指定）';
}

/**
 * 集荷元(店舗)座標を取得。PICKUP_ADDRESSが前回と同じならScript Propertiesのキャッシュを再利用する。
 */
function getPickupCoordinates_() {
  var props = PropertiesService.getScriptProperties();
  var pickupAddress = props.getProperty('PICKUP_ADDRESS');
  if (!pickupAddress) {
    throw new Error('PICKUP_ADDRESSが設定されていません。setup()を実行してください。');
  }
  var cachedAddress = props.getProperty('PICKUP_ADDRESS_CACHED');
  var cachedCoords = props.getProperty('PICKUP_COORDS_CACHED');
  if (cachedAddress === pickupAddress && cachedCoords) {
    return JSON.parse(cachedCoords);
  }
  var coords = geocodeAddress_(pickupAddress);
  props.setProperty('PICKUP_ADDRESS_CACHED', pickupAddress);
  props.setProperty('PICKUP_COORDS_CACHED', JSON.stringify(coords));
  return coords;
}
