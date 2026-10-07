// SUBLINE（050番号アプリ）の呼び出し方。汎用のAPIは公開されていないので、公式の kintone プラグイン
// 「SUBLINE 電話発信リンク」と同じ2つだけを使う：
//   GET  https://api.subline.jp/v1/setting/member/  … メンバー一覧（050番号・外部連携オンなら device_id）
//   POST https://api.subline.jp/v1/push-call/       … そのメンバーのスマホへ「発信してください」の通知
// 認証はヘッダー x-subline-token（管理画面「外部連携管理 › API設定」で発行したアクセストークン）。

export const SUBLINE_API_BASE = "https://api.subline.jp/v1";

export interface SublineMember {
  account_code: string;
  account_name: string;
  group_name: string;
  disp_number: string;
  device_id?: string | null;
}

/** 画面に返すメンバー（device_id は返さない） */
export interface SublineMemberView {
  account_code: string;
  account_name: string;
  group_name: string;
  number: string;
  /** スマホアプリの「設定 → 外部連携の設定」がオン（＝パソコンから発信の通知を受けられる） */
  linked: boolean;
}

/** 電話番号を数字だけにする（+81 は 0 に） */
export function normalizeDialNumber(value: unknown) {
  const raw = String(value ?? "").trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const digits = raw.replace(/[^\d+]/g, "");
  const domestic = digits.startsWith("+81") ? `0${digits.slice(3)}` : digits.replace(/\+/g, "");
  return /^0\d{9,10}$/.test(domestic) ? domestic : "";
}

/** エラー応答の中身を文字にする（error は {code,message} のこともある） */
export function sublineErrorMessage(data: unknown, status: number) {
  const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return String(e.message || e.code || `HTTP ${status}`);
  }
  if (typeof error === "string" && error) return error;
  if (typeof record.status === "string" && record.status !== "OK") return record.status;
  return `HTTP ${status}`;
}

export function parseMembers(data: unknown): SublineMember[] {
  const list = (data && typeof data === "object" ? (data as Record<string, unknown>).member : null);
  if (!Array.isArray(list)) return [];
  return list
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object")
    .map((m) => ({
      account_code: String(m.account_code ?? ""),
      account_name: String(m.account_name ?? ""),
      group_name: String(m.group_name ?? ""),
      disp_number: String(m.disp_number ?? ""),
      device_id: m.device_id ? String(m.device_id) : null,
    }))
    .filter((m) => m.account_code);
}

export function toMemberView(member: SublineMember): SublineMemberView {
  return {
    account_code: member.account_code,
    account_name: member.account_name,
    group_name: member.group_name,
    number: member.disp_number,
    linked: Boolean(member.device_id),
  };
}

/** 通知を送るメンバー：設定したメンバー（外部連携オン）→ 外部連携オンの最初の人 */
export function pickCallMember(members: SublineMember[], preferredCode: string | null | undefined) {
  const linked = members.filter((m) => m.device_id);
  return linked.find((m) => m.account_code === preferredCode) || linked[0] || null;
}

export function pushCallBody(member: SublineMember, number: string, name: string, callId: string) {
  return {
    title: "SUBLINE",
    device_id: member.device_id,
    number,
    name: name.slice(0, 40),
    icon: "",
    call_id: callId,
  };
}
