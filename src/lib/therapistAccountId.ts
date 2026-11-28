// セラピストの外部アカウント（O2・エステ魂の魂セラピスト）のユーザー名・メールアドレス。
// 決まり（2026-11-28）：enka_〇〇@enka-salon.jp（〇〇は源氏名の名前のローマ字。ほかの人と同じなら苗字）。ユーザー名も同じ enka_〇〇。
// パスワードは店舗で共通（Vault の therapist_account_password。コードには書かない）。テスト tests/therapistAccountId.test.ts

export const ACCOUNT_EMAIL_DOMAIN = "enka-salon.jp";
export const ACCOUNT_PREFIX = "enka_";

const BASE: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n", ゔ: "vu",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
};
const SMALL_Y: Record<string, string> = { ゃ: "a", ゅ: "u", ょ: "o" };

/** カタカナをひらがなに */
export const toHiragana = (value: string) =>
  value.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));

/** ひらがな・カタカナをローマ字（ヘボン式・長音は書かない）に。かな以外は捨てる */
export function kanaToRomaji(value: string) {
  const kana = toHiragana(value);
  let out = "";
  for (let index = 0; index < kana.length; index += 1) {
    const char = kana[index];
    const next = kana[index + 1];
    if (char === "っ") {
      const following = BASE[next ?? ""];
      if (following) out += following.startsWith("ch") ? "t" : following[0];
      continue;
    }
    if (char === "ー") continue;
    let roman = BASE[char];
    if (!roman) continue;
    if (next && SMALL_Y[next] && /i$/.test(roman) && roman !== "i") {
      roman = /^(shi|chi|ji)$/.test(roman) ? roman.slice(0, -1) + SMALL_Y[next] : roman.slice(0, -1) + "y" + SMALL_Y[next];
      index += 1;
    }
    out += roman;
  }
  return out;
}

/** 源氏名の後ろのかな（如月ゆず → ゆず）。かなだけの名前ならそのまま */
export function givenNameKana(stageName: string) {
  const match = stageName.trim().match(/[ぁ-ゖァ-ヺーー]+$/);
  return match ? match[0] : "";
}

export interface AccountNameSource {
  name: string;
  name_kana?: string | null;
  name_en?: string | null;
}

/** 使える形か（O2のユーザー名・メールの左側） */
export const isAccountLocalPart = (value: string) => /^enka_[a-z][a-z0-9_]{1,24}$/.test(value);

/** 候補（名前 → 苗字）。作れないときは理由 */
export function accountNameCandidates(source: AccountNameSource): { candidates: string[]; reason?: string } {
  const name = (source.name || "").trim();
  if (!name || name === "源氏名未定") return { candidates: [], reason: "源氏名が決まっていません" };
  if (/[&＆]/.test(name)) return { candidates: [], reason: "2人で1つの名前（ペア）は自動で作れません" };
  const english = (source.name_en || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const givenKana = givenNameKana(name);
  const given = kanaToRomaji(givenKana) || english[0] || "";
  const fullKana = toHiragana((source.name_kana || "").replace(/[\s\u3000・]/g, ""));
  const givenHira = toHiragana(givenKana);
  const surnameKana = givenHira && fullKana.endsWith(givenHira) ? fullKana.slice(0, -givenHira.length) : "";
  const surname = kanaToRomaji(surnameKana) || (english.length > 1 ? english[english.length - 1] : "");
  const candidates = [...new Set([given, surname].filter((part) => part.length >= 2).map((part) => `${ACCOUNT_PREFIX}${part}`))]
    .filter(isAccountLocalPart);
  if (!candidates.length) return { candidates: [], reason: "源氏名の読み（ふりがな）からローマ字を作れません。スタッフ画面で読みを入れてください" };
  return { candidates };
}

/** 使われていない最初の候補。全部使われていたら名前に 2, 3, … を付ける */
export function pickAccountLocalPart(source: AccountNameSource, used: Iterable<string>) {
  const taken = new Set([...used].map((value) => value.toLowerCase()));
  const { candidates, reason } = accountNameCandidates(source);
  if (!candidates.length) return { localPart: null, reason: reason ?? "候補を作れません" };
  const free = candidates.find((candidate) => !taken.has(candidate));
  if (free) return { localPart: free };
  for (let number = 2; number < 100; number += 1) {
    const candidate = `${candidates[0]}${number}`;
    if (!taken.has(candidate)) return { localPart: candidate };
  }
  return { localPart: null, reason: "使えるユーザー名が見つかりません" };
}

export const accountEmail = (localPart: string) => `${localPart}@${ACCOUNT_EMAIL_DOMAIN}`;
