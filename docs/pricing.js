/**
 * 関東エリア 距離制運賃表 (Lalamove公式サイトより転記)
 * 参照: https://www.lalamove.com/ja-jp/all-vehicle-pricing-detail?&city=kanto (取得日: 2026-07-19)
 *
 * 注意:
 * - 金額はすべて税込。ピーク割増(注文料金の20〜25%)・待機料金(750円/15分)等は含まない概算。
 * - 端数処理(km未満の距離の丸め方)は公式ページに明記がないため、距離をkm単位で
 *   切り上げて計算する仮定を採用している(calcReferencePrice参照)。
 * - key は Lalamove API の serviceType と一致する想定。GET /v3/cities が返す実際の
 *   キーと異なる場合は自動昇格(実見積カードへの切り替え)が働かないため要修正。
 *   MOTORCYCLE は Sandbox(JP)で確認済み。VAN / TRUCK は本番未確認の推測値
 *   → 本番切替後に SETUP.md のTODOに従いキー名を実際の値へ修正すること。
 */
const KANTO_VEHICLE_PRICING = [
  {
    key: 'MOTORCYCLE',
    nameJa: '二輪車',
    maxLoadKg: 15,
    size: '(奥)26cm×(幅)36cm×(高)56cm',
    baseFare: 1300,
    perKm: 150,
    perKmOver15: 90,
    capacityNote: '書類・小物向け'
  },
  {
    key: 'VAN', // TODO: 本番 /v3/cities のキーに合わせて要修正(未確認の推測値)
    nameJa: '小型軽貨物車',
    maxLoadKg: 165,
    size: '(奥)120cm×(幅)120cm×(高)120cm',
    baseFare: 1540,
    perKm: 150,
    perKmOver15: 85,
    capacityNote: '花束・アレンジメント複数向け'
  },
  {
    key: 'TRUCK', // TODO: 本番 /v3/cities のキーに合わせて要修正(未確認の推測値)
    nameJa: '軽貨物車',
    maxLoadKg: 350,
    size: '(奥)180cm×(幅)120cm×(高)120cm',
    baseFare: 2050,
    perKm: 150,
    perKmOver15: 85,
    capacityNote: '胡蝶蘭・スタンド花向け'
  }
];

/**
 * 距離(m)から関東・距離制運賃表による参考価格を計算する。
 * 1km未満: 基本料金のみ
 * 1〜15km: 基本料金 + (切り上げ距離-1km) × perKm
 * 15km超: さらに超過分 × perKmOver15 を加算
 */
function calcReferencePrice(distanceM, vehicle) {
  const distanceKm = distanceM / 1000;
  if (distanceKm <= 1) {
    return vehicle.baseFare;
  }
  const billedKm = Math.ceil(distanceKm);
  const extraKm = billedKm - 1;
  const within15 = Math.min(extraKm, 14);
  const over15 = Math.max(extraKm - 14, 0);
  return vehicle.baseFare + within15 * vehicle.perKm + over15 * vehicle.perKmOver15;
}
