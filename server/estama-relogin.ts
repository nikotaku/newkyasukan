// エステ魂の自動再ログイン（Vercel /api/cron/estama-appeal?action=estama-relogin）
// ログインが切れた店舗で、pg_cron（private.dispatch_estama_relogin）から一回限りのトークン付きで呼ばれる。
// 店舗が登録したメールアドレス・パスワード（Vault）で、Browserbase の保存済みブラウザ状態にログインし直す。
// ログイン情報はログに出さない・結果にも入れない。
import { createClient } from "@supabase/supabase-js";
import type { Page } from "playwright-core";
import {
  connectSession,
  createBrowserSession,
  disconnect,
  ESTAMA_CAST_EDIT_URL,
  releaseSession,
} from "./estama-automation.js";
import { classifyLoginResult, scrubSecrets } from "./estama-relogin-result.js";

export { classifyLoginResult, scrubSecrets };

const SUPABASE_URL = process.env.SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || "https://imrxzkivwrkqbhqfbbes.supabase.co";
const PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || "sb_publishable_T0a9mtOIbupU5n_VAe9caw_xlnbbWfB";

export const ESTAMA_SHOP_LOGIN_URL = "https://estama.jp/login/?r=/admin/cast_edit/";

type RequestLike = { body?: unknown };
type ResponseLike = {
  status(code: number): ResponseLike;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
};

type ClaimedRelogin = {
  runToken?: string;
  storeId?: string;
  contextId?: string;
  mail?: string;
  password?: string;
  deferred?: boolean;
  unavailable?: boolean;
  reason?: string;
};

const createPublicClient = () => createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parseBody(value: unknown) {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function onEditor(page: Page) {
  return (await page.locator("#Name").count()) > 0;
}

/** 店舗ログイン画面でメールアドレス・パスワードを入れてログインする */
export async function loginEstamaAdmin(page: Page, mail: string, password: string) {
  await page.goto(ESTAMA_CAST_EDIT_URL, { waitUntil: "domcontentloaded" });
  if (await onEditor(page)) return { ok: true as const, already: true };

  if (!(await page.locator("#inputEmail").count())) {
    await page.goto(ESTAMA_SHOP_LOGIN_URL, { waitUntil: "domcontentloaded" });
  }
  const email = page.locator("#form-login_shop #inputEmail");
  const pass = page.locator("#form-login_shop #inputPassword");
  if (!(await email.count()) || !(await pass.count())) {
    return { ok: false as const, error: "エステ魂の店舗ログイン画面が見つかりません（画面が変わった可能性があります）" };
  }
  await email.fill(mail);
  await pass.fill(password);
  await Promise.all([
    page.waitForURL(/\/admin\//, { timeout: 25_000 }).catch(() => null),
    page.locator('#form-login_shop a[data-post="login_shop"]').click(),
  ]);
  await page.waitForLoadState("domcontentloaded").catch(() => null);

  // 管理画面に移ったら、セラピスト編集画面が開けることまで確かめる
  if (/\/admin\//.test(page.url())) {
    await page.goto(ESTAMA_CAST_EDIT_URL, { waitUntil: "domcontentloaded" });
  }
  const validation = await page.locator("#form-login_shop .validation-error, #form-login_shop .all_vali, .return_vali")
    .allInnerTexts().then((texts) => texts.join(" ")).catch(() => "");
  return {
    ...classifyLoginResult({
      url: page.url(),
      hasEditor: await onEditor(page),
      hasPasswordField: (await page.locator('input[type="password"]').count()) > 0,
      validation,
    }),
    already: false,
  };
}

export async function handleEstamaReloginRequest(req: RequestLike, res: ResponseLike) {
  res.setHeader("Cache-Control", "private, no-store");
  let body: Record<string, unknown>;
  try {
    body = parseBody(req.body);
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[0-9a-f]{64}$/.test(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const client = createPublicClient();
  const { data, error: claimError } = await client.rpc("claim_estama_relogin_run", { p_token: token });
  if (claimError) {
    res.status(500).json({ error: claimError.message });
    return;
  }
  const claimed = (data || null) as ClaimedRelogin | null;
  if (!claimed?.storeId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (claimed.deferred || claimed.unavailable || !claimed.runToken || !claimed.contextId || !claimed.mail || !claimed.password) {
    res.status(409).json({ ok: false, storeId: claimed.storeId, deferred: Boolean(claimed.deferred), reason: claimed.reason });
    return;
  }

  const secrets = [claimed.password, claimed.mail];
  let ok = false;
  let message = "";
  let sessionId = "";
  let bb: Awaited<ReturnType<typeof createBrowserSession>>["bb"] | null = null;
  try {
    const created = await createBrowserSession(claimed.contextId, false, { action: "auto-relogin", storeId: claimed.storeId });
    bb = created.bb;
    sessionId = created.session.id;
    const { browser, page } = await connectSession(created.session.connectUrl);
    try {
      const result = await loginEstamaAdmin(page, claimed.mail, claimed.password);
      ok = result.ok;
      message = result.ok ? (result.already ? "すでにログインしていました" : "ログインし直しました") : result.error;
    } finally {
      await disconnect(browser);
    }
  } catch (error) {
    ok = false;
    message = `自動ログインを実行できませんでした：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (bb && sessionId) await releaseSession(bb, sessionId).catch(() => null);
  }

  message = scrubSecrets(message, secrets);
  const { error: finishError } = await client.rpc("finish_estama_relogin_run", {
    p_run_token: claimed.runToken,
    p_ok: ok,
    p_error: ok ? null : message,
    p_shop_id: null,
  });
  res.status(ok ? 200 : 502).json({
    ok,
    storeId: claimed.storeId,
    message,
    ...(finishError ? { finishError: finishError.message } : {}),
  });
}
