// エステ魂の管理画面「お店への予約」（/admin/reserve/）の文字から、仮予約を1件ずつ取り出す（画面に依存しない部分）。
// テスト: tests/estamaReserveParse.test.ts（実在のお客様の情報はテストに書かない）

export interface EstamaReservation {
  externalKey: string; // 受付日時＋電話番号＋希望日時（同じ予約を二重に取り込まない）
  receivedAt: string; // ISO（日本時間）
  hopeDate: string; // YYYY-MM-DD（カレンダーの日付。深夜0〜6時もその日付のまま）
  hopeTime: string; // HH:MM
  nominationLabel: string; // 「伊藤れな🔰(26)」「フリー(指名なし)」
  isFree: boolean;
  castName: string | null; // 年齢・記号を除いた名前
  courseLabel: string | null; // 「艶華コース」
  courseMinutes: number | null;
  coursePrice: number | null;
  nominationFee: number | null;
  totalPrice: number | null;
  coupon: string | null;
  requestNote: string | null;
  visitKind: string | null; // 新規予約 / リピート予約
  memberLabel: string | null; // エステ魂会員 / 未認証 など
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}

const RECEIVED = /(\d{4})年(\d{1,2})月(\d{1,2})日(\d{1,2})時(\d{2})分\s*受付/g;
const pad = (value: number | string) => String(value).padStart(2, "0");
const yen = (value: string | undefined) => (value ? Number(value.replace(/[,，]/g, "")) : null);
const dash = (value: string | null | undefined) => {
  const text = (value ?? "").trim();
  return !text || /^[ー\-―‐]$/.test(text) ? null : text;
};

/** 「伊藤れな🔰(26)」→「伊藤れな」（年齢・絵文字・記号を除く） */
export function castNameFromLabel(label: string) {
  return label
    .normalize("NFKC")
    .replace(/\(\d{1,2}\)\s*$/, "")
    .replace(/[^\p{L}\p{N}ー々・&＆]/gu, "")
    .trim() || null;
}

/** 名前の照合用（空白・記号・絵文字を除き、カタカナはそのまま） */
export function normalizeCastName(name: string) {
  return name.normalize("NFKC").replace(/\(\d{1,2}\)/g, "").replace(/[^\p{L}\p{N}ー々]/gu, "");
}

function between(block: string, start: string, ends: string[]) {
  const index = block.indexOf(start);
  if (index < 0) return null;
  const rest = block.slice(index + start.length);
  let cut = rest.length;
  for (const end of ends) {
    const at = rest.indexOf(end);
    if (at >= 0 && at < cut) cut = at;
  }
  return rest.slice(0, cut).trim();
}

/** 希望日（月/日）に年を付ける。受付より前の月なら翌年（12月に1月の予約が入るなど） */
function hopeYear(receivedYear: number, receivedMonth: number, hopeMonth: number) {
  return hopeMonth < receivedMonth - 6 ? receivedYear + 1 : hopeMonth > receivedMonth + 6 ? receivedYear - 1 : receivedYear;
}

export function parseEstamaReservations(pageText: string): EstamaReservation[] {
  const text = pageText.normalize("NFKC").replace(/\s+/g, " ");
  const marks = [...text.matchAll(RECEIVED)];
  const results: EstamaReservation[] = [];
  marks.forEach((mark, index) => {
    const block = text.slice(mark.index! + mark[0].length, index + 1 < marks.length ? marks[index + 1].index : text.length);
    const [, ry, rm, rd, rh, rmin] = mark;
    const hope = block.match(/日時\s*(\d{1,2})\/(\d{1,2})\s*\([^)]*\)\s*(\d{1,2}):(\d{2})/);
    if (!hope) return;
    const hopeMonth = Number(hope[1]);
    const hopeDate = `${hopeYear(Number(ry), Number(rm), hopeMonth)}-${pad(hopeMonth)}-${pad(hope[2])}`;
    const hopeTime = `${pad(hope[3])}:${hope[4]}`;

    const nominationLabel = between(block, "指名", ["コース"]) ?? "";
    const isFree = /フリー|指名なし/.test(nominationLabel);
    const course = between(block, "コース", ["オプション"]) ?? "";
    const courseMatch = course.match(/^(.*?)\((\d+)分\)\s*([\d,]+)\s*円/);
    const fee = between(block, "指名料", ["合計金額"]);
    const total = block.match(/合計金額\s*([\d,]+)\s*円/);
    // 「※合計金額は、クーポン適用前の料金…」にも「クーポン」があるので、合計金額の後ろから探す
    const afterTotal = total ? block.slice(block.indexOf(total[0]) + total[0].length).replace(/^.*?料金となります。/, "") : block;
    const coupon = between(afterTotal, "クーポン", ["ご要望"]);
    const visit = block.match(/(新規予約|リピート予約)/);
    const requestNote = between(block, "ご要望", ["新規予約", "リピート予約"]);
    const person = visit ? between(block.slice(block.indexOf(visit[1])), visit[1], ["連絡先"]) : null;
    const memberMatch = person?.match(/^(エステ魂会員|未認証|非会員|会員)\s*(.*)$/);
    const contact = between(block, "連絡先", ["ブラックリスト", "MEMO"]) ?? "";
    const phone = contact.match(/0\d{1,4}-?\d{1,4}-?\d{3,4}/)?.[0]?.replace(/-/g, "") ?? null;
    const email = contact.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? null;

    results.push({
      externalKey: `${ry}${pad(rm)}${pad(rd)}${pad(rh)}${rmin}|${phone ?? email ?? ""}|${hopeDate}T${hopeTime}`,
      receivedAt: `${ry}-${pad(rm)}-${pad(rd)}T${pad(rh)}:${rmin}:00+09:00`,
      hopeDate,
      hopeTime,
      nominationLabel,
      isFree,
      castName: isFree ? null : castNameFromLabel(nominationLabel),
      courseLabel: courseMatch ? courseMatch[1].trim() : dash(course),
      courseMinutes: courseMatch ? Number(courseMatch[2]) : null,
      coursePrice: courseMatch ? yen(courseMatch[3]) : null,
      nominationFee: fee && /[\d,]+\s*円/.test(fee) ? yen(fee.match(/([\d,]+)\s*円/)![1]) : null,
      totalPrice: total ? yen(total[1]) : null,
      coupon: dash(coupon)?.slice(0, 300) ?? null,
      requestNote: dash(requestNote)?.slice(0, 1000) ?? null,
      visitKind: visit?.[1] ?? null,
      memberLabel: memberMatch ? memberMatch[1] : null,
      customerName: (memberMatch ? memberMatch[2] : person)?.trim() || null,
      customerPhone: phone,
      customerEmail: email,
    });
  });
  return results;
}

/**
 * 管理画面の上に出る「(ご契約期間:2026年10月24日 15:32 まで)」を読む（サブスクの見張りでプランが切れていないか見る）。
 * 日本時間として ISO で返す。読めなければ null
 */
export function parseEstamaContractUntil(text: string): string | null {
  const match = text.normalize("NFKC").match(/ご契約期間\s*[:：]?\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?\s*まで/);
  if (!match) return null;
  const [, year, month, day, hour = "23", minute = "59"] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) - 9 * 3_600_000;
  return Number.isNaN(utc) ? null : new Date(utc).toISOString();
}
