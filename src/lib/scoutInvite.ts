/**
 * 引き抜き（スカウト）DM用の限定案内ページ。
 * 管理画面 /recruit-scout で編集し、公開ページ /invite?to=名前 で表示する。
 * 保存先は site_content（key = scout_invite）に JSON。画像は cast-photos バケットの scout-invite/ 配下。
 */

export interface ScoutEarning {
  label: string;
  amount: string;
  note: string;
}

export interface ScoutCondition {
  label: string;
  value: string;
}

export interface ScoutDmTemplate {
  label: string;
  body: string;
}

export interface ScoutInvite {
  version: 1;
  headline: string;
  message: string;
  earnings: ScoutEarning[];
  earningsImages: string[];
  roomImages: string[];
  roomNote: string;
  conditions: ScoutCondition[];
  lineUrl: string;
  phone: string;
  xAccount: string;
  contactNote: string;
  dmTemplates: ScoutDmTemplate[];
}

export const SCOUT_INVITE_KEY = "scout_invite";
export const SCOUT_IMAGE_BUCKET = "cast-photos";
export const SCOUT_IMAGE_DIR = "scout-invite";

export const DEFAULT_SCOUT_INVITE: ScoutInvite = {
  version: 1,
  headline: "あなたにだけ、\n特別なご案内です",
  message:
    "このページは、店長が直接お声がけした方だけにお送りしている非公開のご案内です。\n一般の求人には載せていない、実際の稼ぎ・ルーム・条件をそのままお見せします。\n見るだけでも大丈夫です。気になることがあれば、いつでも気軽にご連絡ください。",
  earnings: [
    { label: "在籍セラピストAさん（週3日）", amount: "月 ◯◯万円", note: "明細の写真は下に載せています" },
    { label: "在籍セラピストBさん（週末のみ）", amount: "月 ◯◯万円", note: "" },
    { label: "1日の最高（◯月）", amount: "1日 ◯万◯千円", note: "日払い・全額その日にお渡し" },
  ],
  earningsImages: [],
  roomImages: [],
  roomNote: "1人1ルームの個室待機。他のセラピストと顔を合わせにくく、プライバシーに配慮しています。",
  conditions: [
    { label: "バック", value: "60分 ◯◯円〜／指名料 全額バック" },
    { label: "お給料", value: "日払い（その日に全額お渡し）" },
    { label: "出勤", value: "完全自由出勤・週1日／短時間OK" },
    { label: "待機", value: "1人1ルームの個室待機" },
    { label: "送迎", value: "終電後はタクシー送迎あり" },
    { label: "集客", value: "SNS投稿・写メ日記・お客様への営業はお店が管理" },
    { label: "サポート", value: "税金の相談・不動産会社／アリバイ会社の紹介" },
    { label: "移籍特典", value: "◯◯（例：初月バックアップ・保証など）" },
  ],
  lineUrl: "",
  phone: "",
  xAccount: "",
  contactNote: "LINEが一番早くお返事できます。今のお店に知られることはありませんので、安心してご連絡ください。",
  dmTemplates: [
    {
      label: "限定ご招待（初回）",
      body:
        "{name}さん、突然のDM失礼します。\n仙台の{store}で店長をしている者です。\n\n{name}さんの投稿を拝見して、ぜひ一度お話ししてみたいと思いご連絡しました。\n\n今回は一般の求人には出していない条件で、私から直接お声がけした方にだけご案内しています。\n実際の稼ぎ明細・ルームの写真・勤務条件をこちらにまとめました👇\n{link}\n\n見るだけでも大丈夫です。\n気になることがあれば、LINEかこのDMでいつでもどうぞ。\nLINE：{line}",
    },
    {
      label: "短め",
      body:
        "{name}さん、突然すみません。仙台{store}の店長です。\n{name}さんにだけ、非公開の条件をご案内させてください。\n稼ぎ明細・ルーム・条件はこちら👇\n{link}\nご興味あればLINEでお気軽に✉️ {line}",
    },
    {
      label: "フォロー（3日後）",
      body:
        "{name}さん、先日はDM失礼しました。\nご案内ページはご覧いただけましたか？\n{name}さん向けの条件は、今月いっぱいお取り置きしています。\n{link}\n話を聞くだけ・質問だけでも大歓迎です🙏",
    },
  ],
};

export const normalizeScoutInvite = (raw: unknown): ScoutInvite => {
  if (!raw || typeof raw !== "object") return DEFAULT_SCOUT_INVITE;
  const v = raw as Partial<ScoutInvite>;
  const str = (x: unknown, d: string) => (typeof x === "string" ? x : d);
  const arr = <T,>(x: unknown, d: T[]) => (Array.isArray(x) ? (x as T[]) : d);
  return {
    version: 1,
    headline: str(v.headline, DEFAULT_SCOUT_INVITE.headline),
    message: str(v.message, DEFAULT_SCOUT_INVITE.message),
    earnings: arr(v.earnings, DEFAULT_SCOUT_INVITE.earnings),
    earningsImages: arr<string>(v.earningsImages, []),
    roomImages: arr<string>(v.roomImages, []),
    roomNote: str(v.roomNote, DEFAULT_SCOUT_INVITE.roomNote),
    conditions: arr(v.conditions, DEFAULT_SCOUT_INVITE.conditions),
    lineUrl: str(v.lineUrl, ""),
    phone: str(v.phone, ""),
    xAccount: str(v.xAccount, ""),
    contactNote: str(v.contactNote, DEFAULT_SCOUT_INVITE.contactNote),
    dmTemplates: arr(v.dmTemplates, DEFAULT_SCOUT_INVITE.dmTemplates),
  };
};

export const buildScoutLink = (origin: string, name: string) => {
  const url = new URL("/invite", origin);
  if (name.trim()) url.searchParams.set("to", name.trim());
  return url.toString();
};

export const fillScoutDm = (
  template: string,
  values: { name: string; store: string; link: string; line: string },
) =>
  template
    .replace(/\{name\}/g, values.name || "◯◯")
    .replace(/\{store\}/g, values.store)
    .replace(/\{link\}/g, values.link)
    .replace(/\{line\}/g, values.line || "（LINE URL未設定）");
