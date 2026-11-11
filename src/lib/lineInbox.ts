// LINE対応（お客様用の公式LINEの見張り）の画面用：会話の状態と、自動応答までの残り時間。
// テスト: npm run test:line-customer（tests/lineInbox.test.ts）

export type LineThreadStatus = "waiting" | "replying" | "handled" | "auto_replied" | "failed";

export interface LineThread {
  id: string;
  store_id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: LineThreadStatus;
  waiting_since: string | null;
  last_message_at: string;
  last_message_text: string | null;
  handled_at: string | null;
  auto_replied_at: string | null;
  error: string | null;
}

export interface LineMessage {
  id: string;
  thread_id: string;
  direction: "in" | "staff" | "ai";
  message_type: string;
  text: string | null;
  created_at: string;
  media_path: string | null;
  updated_at?: string;
  delivery_status: "sending" | "sent" | "failed";
}

export const LINE_THREAD_COLUMNS =
  "id,store_id,line_user_id,display_name,picture_url,status,waiting_since,last_message_at,last_message_text,handled_at,auto_replied_at,error";

export const STATUS_LABEL: Record<LineThreadStatus, { label: string; className: string }> = {
  waiting: { label: "返事待ち", className: "bg-rose-500 text-white" },
  replying: { label: "自動応答中", className: "bg-sky-500 text-white" },
  failed: { label: "自動応答に失敗", className: "bg-amber-500 text-white" },
  auto_replied: { label: "自動で一次対応", className: "bg-violet-100 text-violet-800" },
  handled: { label: "対応済み", className: "bg-emerald-100 text-emerald-800" },
};

/** スタッフの対応が要る会話か（自動で一次対応したものも、本対応はスタッフ） */
export const needsStaff = (thread: Pick<LineThread, "status">) => thread.status !== "handled";

/** 返事待ちになってからの分と、自動応答までの残り分（自動応答しない設定なら null） */
export function waitingInfo(
  thread: Pick<LineThread, "status" | "waiting_since">,
  now: number,
  autoMinutes: number | null,
) {
  if (!thread.waiting_since || (thread.status !== "waiting" && thread.status !== "replying")) return null;
  const elapsed = Math.max(0, Math.floor((now - Date.parse(thread.waiting_since)) / 60_000));
  const remaining = autoMinutes == null ? null : Math.max(0, autoMinutes - elapsed);
  return { elapsed, remaining };
}

const ORDER: Record<LineThreadStatus, number> = { waiting: 0, failed: 1, replying: 2, auto_replied: 3, handled: 4 };

/** 返事待ち（古い順）→ 失敗 → 自動応答 → 対応済み（新しい順） */
export function sortThreads<T extends Pick<LineThread, "status" | "waiting_since" | "last_message_at">>(threads: T[]) {
  return [...threads].sort((a, b) => {
    if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status];
    if (a.status === "waiting" && b.status === "waiting") {
      return Date.parse(a.waiting_since ?? a.last_message_at) - Date.parse(b.waiting_since ?? b.last_message_at);
    }
    return Date.parse(b.last_message_at) - Date.parse(a.last_message_at);
  });
}

/** LINE Developers に設定する Webhook URL */
export const lineWebhookUrl = (supabaseUrl: string, webhookKey: string) =>
  `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/line-customer-webhook?k=${webhookKey}`;

export const LINE_MESSAGE_COLUMNS = "id,thread_id,direction,message_type,text,created_at,updated_at,media_path,delivery_status";
export const LINE_MEDIA_BUCKET = "line-customer-media";
export const MAX_LINE_IMAGE_BYTES = 5 * 1024 * 1024;

/** 読み込み直しても重複せず、同時刻でも安定して並ぶ。 */
export function mergeLineMessages(previous: LineMessage[], incoming: LineMessage[]) {
  const byId = new Map(previous.map((m) => [m.id, m]));
  for (const m of incoming) {
    const previousMessage = byId.get(m.id);
    if (previousMessage?.updated_at && m.updated_at && previousMessage.updated_at > m.updated_at) continue;
    byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function filterLineThreads(threads: LineThread[], query: string, pendingOnly: boolean) {
  const q = query.trim().toLocaleLowerCase();
  return sortThreads(threads.filter((t) => (!pendingOnly || needsStaff(t)) &&
    (!q || `${t.display_name ?? ""} ${t.last_message_text ?? ""}`.toLocaleLowerCase().includes(q))));
}
