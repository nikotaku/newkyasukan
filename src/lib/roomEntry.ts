// セラピストのマイページ「入室方法」で使う、鍵の開け方・道順・Wi-Fi のデータと計算。
// 暗証番号・Wi-Fiのパスワードは rooms にだけ入れ、マイページには RPC get_therapist_entry_rooms（トークンで本人確認）で渡す。
// リポジトリ（公開）には実際の番号を書かないこと。

/** 鍵の種類：keypad = ドアのテンキー（SwitchBot キーパッド）、dial_lock = ダイヤル式の鍵（キーボックス） */
export type RoomKeyType = "keypad" | "dial_lock";

export const ROOM_KEY_TYPES: Array<{ value: RoomKeyType | "none"; label: string; description: string }> = [
  { value: "none", label: "番号だけ表示", description: "アニメーションなしで番号だけ出します" },
  { value: "keypad", label: "ドアのテンキー（SwitchBot）", description: "数字を順に押して ✓ で開けるアニメーション" },
  { value: "dial_lock", label: "ダイヤル式の鍵（キーボックス）", description: "ダイヤルを合わせて外し、閉めるときに戻すアニメーション" },
];

export function normalizeKeyType(value: unknown): RoomKeyType | null {
  return value === "keypad" || value === "dial_lock" ? value : null;
}

/** 番号から数字だけを取り出す（「12-09」「１２０９」なども数字の並びとして扱う） */
export function codeDigits(value: string | null | undefined): string[] {
  if (!value) return [];
  const halfWidth = value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  return halfWidth.replace(/\D/g, "").split("");
}

export type KeypadPress = { key: string; label: string };

/** テンキーで押す順番。数字のあとに ✓（確定）を押す */
export function keypadSequence(code: string | null | undefined): KeypadPress[] {
  const digits = codeDigits(code);
  if (digits.length === 0) return [];
  return [...digits.map((digit) => ({ key: digit, label: digit })), { key: "check", label: "✓" }];
}

/** SwitchBot キーパッドのボタンの並び（2列×6段）。null の位置は何もない */
export const KEYPAD_LAYOUT: string[][] = [
  ["1", "2"],
  ["3", "4"],
  ["5", "6"],
  ["7", "8"],
  ["9", "0"],
  ["lock", "check"],
];

export function keypadPosition(key: string): { row: number; col: number } | null {
  for (let row = 0; row < KEYPAD_LAYOUT.length; row += 1) {
    const col = KEYPAD_LAYOUT[row].indexOf(key);
    if (col >= 0) return { row, col };
  }
  return null;
}

/**
 * ダイヤルを from から to に合わせるときの、各ダイヤルの回し方（上のダイヤルから順に）。
 * steps は近い向きに回したときのコマ数（+ は数字が増える向き）。
 */
export function dialMoves(from: string | null | undefined, to: string | null | undefined): Array<{ from: number; to: number; steps: number }> {
  const target = codeDigits(to).map(Number);
  const start = codeDigits(from).map(Number);
  return target.map((digit, index) => {
    const origin = start[index] ?? 0;
    let steps = (digit - origin + 10) % 10;
    if (steps > 5) steps -= 10;
    return { from: origin, to: digit, steps };
  });
}

export interface EntryRouteFocus {
  /** 写真の中の位置（左上が 0、右下が 100 の％） */
  x: number;
  y: number;
  /** 寄る大きさ（1 = 寄らない） */
  zoom: number;
}

export interface EntryRouteStep {
  image_url?: string | null;
  video_url?: string | null;
  text?: string | null;
  /** 写真のこの位置に寄って、丸で示す */
  focus?: EntryRouteFocus | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normalizeFocus(value: unknown): EntryRouteFocus | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const zoom = Number(raw.zoom);
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100), zoom: Number.isFinite(zoom) ? clamp(zoom, 1, 4) : 1.8 };
}

/** DB（jsonb）から読んだ道順を、画面で使える形にそろえる。写真・動画・説明のどれも無いステップは外す */
export function normalizeRouteSteps(value: unknown): EntryRouteStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      image_url: typeof item.image_url === "string" && item.image_url ? item.image_url : null,
      video_url: typeof item.video_url === "string" && item.video_url ? item.video_url : null,
      text: typeof item.text === "string" ? item.text : null,
      focus: normalizeFocus(item.focus),
    }))
    .filter((step) => step.image_url || step.video_url || step.text?.trim());
}

const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

export function isVideoFile(file: { type?: string; name?: string }) {
  return (file.type || "").startsWith("video/") || VIDEO_EXTENSIONS.test(file.name || "");
}

export type WifiSecurity = "WPA" | "WEP" | "nopass";

export const WIFI_SECURITY_OPTIONS: Array<{ value: WifiSecurity; label: string }> = [
  { value: "WPA", label: "WPA / WPA2 / WPA3（ふつうはこれ）" },
  { value: "WEP", label: "WEP（古いルーター）" },
  { value: "nopass", label: "パスワードなし" },
];

export function normalizeWifiSecurity(value: unknown): WifiSecurity {
  return value === "WEP" || value === "nopass" ? value : "WPA";
}

// QRコードの Wi-Fi 形式では \ ; , : " の前に \ を付ける
const escapeWifiValue = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");

/** スマホのカメラで読み取るとそのままつながる Wi-Fi の QR コードの中身 */
export function wifiQrPayload({ ssid, password, security, hidden = false }: {
  ssid: string;
  password?: string | null;
  security?: WifiSecurity | null;
  hidden?: boolean;
}): string {
  const type = security === "nopass" || !password ? "nopass" : (security || "WPA");
  const parts = [`T:${type}`, `S:${escapeWifiValue(ssid)}`];
  if (type !== "nopass") parts.push(`P:${escapeWifiValue(password || "")}`);
  if (hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}
