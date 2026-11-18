// Wセラピスト（「りりか&ももか」のように2人で1つの名前）の清算明細を、1人ずつに分けて出すための計算。
// 金額は2人で半分ずつ。割り切れないときは1人目に1円多く付ける（2人分を足すと元の金額になる）。

/** 「りりか&ももか」→ ["りりか", "ももか"]。2人の組でなければ null */
export function splitPairNames(castName: string): [string, string] | null {
  const parts = castName.split(/[&＆]/).map((part) => part.trim()).filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

/** 2人分の金額のうち、index 番目（0 か 1）の人の分 */
export function pairShare(total: number, index: 0 | 1): number {
  const first = Math.ceil(total / 2);
  return index === 0 ? first : total - first;
}

const yen = (value: number) => `¥${value.toLocaleString()}`;

/** 「¥60,000 (¥30,000)」＝2人分（この人の分）。料金・売上・現金はこの形 */
export function pairTotalFirst(total: number, index: 0 | 1, sign = ""): string {
  return `${sign}${yen(total)} (${sign}${yen(pairShare(total, index))})`;
}

/** 「¥71,000 (¥142,000)」＝この人の分（2人分）。給与・経費はこの形 */
export function pairShareFirst(total: number, index: 0 | 1, sign = ""): string {
  return `${sign}${yen(pairShare(total, index))} (${sign}${yen(total)})`;
}
