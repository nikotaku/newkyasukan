// 電話（SUBLINE）連携。管理画面から呼ぶ（ログイン中スタッフのJWTで、所属店舗だけ）。
//   action "members" … 接続確認：メンバー一覧（050番号・外部連携のオン/オフ）を返す（店長・オーナー）
//   action "call"    … パソコンからの発信：設定したメンバーのスマホへ「発信してください」の通知を送る
// アクセストークンは Vault（RPC get_subline_connection、service_role のみ）。画面には返さない。

import {
  normalizeDialNumber,
  parseMembers,
  pickCallMember,
  pushCallBody,
  SUBLINE_API_BASE,
  sublineErrorMessage,
  toMemberView,
} from "./sublineApi.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

const rpc = (fn: string, args: Record<string, unknown>) =>
  sb(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

// 管理権限は user_stores の role で持つ（このプロジェクトに user_roles テーブルはない）
async function membership(req: Request, storeId: string) {
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!jwt || jwt === SB_KEY) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return null;
  const user = await r.json();
  if (!user?.id) return null;
  const rows = (await sb(
    `user_stores?user_id=eq.${user.id}&store_id=eq.${encodeURIComponent(storeId)}&select=role`,
  )) as Array<{ role: string }> | null;
  if (!rows?.length) return null;
  return { manager: rows.some((row) => row.role === "owner" || row.role === "manager") };
}

async function subline(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUBLINE_API_BASE}${path}`, {
    ...init,
    headers: { "x-subline-token": token, Accept: "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  const ok = r.ok && (data as Record<string, unknown> | null)?.status === "OK";
  return { ok, data, message: ok ? "" : sublineErrorMessage(data, r.status) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSONで送ってください" }, 400); }
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const action = body.action;
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return json({ error: "店舗が指定されていません" }, 400);

  const caller = await membership(req, storeId).catch(() => null);
  if (!caller) return json({ error: "この店舗の電話は使えません" }, 403);

  const connection = (await rpc("get_subline_connection", { p_store_id: storeId })) as
    | { token: string | null; member_account_code: string | null }
    | null;
  const token = connection?.token || "";
  if (!token) return json({ error: "SUBLINEのアクセストークンが登録されていません（設定 → 電話（SUBLINE））" }, 409);

  try {
    if (action === "members") {
      if (!caller.manager) return json({ error: "店長・オーナーだけが確認できます" }, 403);
      const result = await subline(token, "/setting/member/");
      await rpc("record_subline_check", {
        p_store_id: storeId,
        p_ok: result.ok,
        p_message: result.ok ? "接続できました" : result.message,
      }).catch(() => null);
      if (!result.ok) return json({ error: `SUBLINEにつながりませんでした（${result.message}）` }, 502);
      return json({ members: parseMembers(result.data).map(toMemberView) });
    }

    if (action === "call") {
      const number = normalizeDialNumber(body.phone);
      if (!number) return json({ error: "電話番号の形ではありません" }, 400);
      const list = await subline(token, "/setting/member/");
      if (!list.ok) return json({ error: `SUBLINEにつながりませんでした（${list.message}）` }, 502);
      const member = pickCallMember(parseMembers(list.data), connection?.member_account_code);
      if (!member) {
        return json({
          error: "通知を受けられるメンバーがいません。スマホのSUBLINEアプリで「設定 → 外部連携の設定」をオンにしてください",
        }, 409);
      }
      const name = typeof body.name === "string" ? body.name : "";
      const callId = typeof body.callId === "string" ? body.callId.slice(0, 80) : "";
      const pushed = await subline(token, "/push-call/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pushCallBody(member, number, name, callId)),
      });
      if (!pushed.ok) return json({ error: `発信の通知を送れませんでした（${pushed.message}）` }, 502);
      return json({ ok: true, member: member.account_name });
    }

    return json({ error: "action が違います" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("subline error", message);
    return json({ error: `SUBLINEの呼び出しに失敗しました（${message.slice(0, 160)}）` }, 502);
  }
});
