import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import {
  BASE,
  attrs,
  forms,
  links,
  text,
  safeUrl,
  assertPage,
  parseVerificationMail,
  relationRequests,
  relationShopId,
  memberIds,
  type Form,
  type VerificationMail,
} from "./protocol.ts";
const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const now = () => new Date().toISOString();
async function saveSettings(storeId: string, patch: Record<string, unknown>) {
  checked(
    await admin
      .from("o2_control_settings")
      .upsert(
        { store_id: storeId },
        { onConflict: "store_id", ignoreDuplicates: true },
      ),
  );
  checked(
    await admin
      .from("o2_control_settings")
      .update({ ...patch, updated_at: now() })
      .eq("store_id", storeId),
  );
}
const fail = (message: string) => {
  throw new Error(message);
};
const checked = <T>(result: { data: T; error: unknown }) => {
  if (result.error) throw new Error("ZR OSへの記録に失敗しました");
  return result.data;
};
type Session = { cookies: Record<string, string>; url?: string };
type Page = { html: string; url: string };
class O2Session {
  state: Session;
  constructor(state?: Session) {
    this.state = state || { cookies: {} };
  }
  async request(
    url: string,
    init: RequestInit = {},
    jsonResponse = false,
  ): Promise<Page> {
    url = safeUrl(url);
    for (let n = 0; n < 8; n++) {
      const response = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": "ZR-OS/1.0",
          Cookie: Object.entries(this.state.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join("; "),
          ...(init.headers || {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const pos = pair.indexOf("=");
        if (pos > 0)
          this.state.cookies[pair.slice(0, pos)] = pair.slice(pos + 1);
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) fail("02の転送先を取得できません");
        url = safeUrl(location!, url);
        if ([301, 302, 303].includes(response.status)) init = {};
        continue;
      }
      if (!response.ok) fail(`02への接続に失敗しました（${response.status}）`);
      const html = await response.text();
      if (!jsonResponse) assertPage(html);
      this.state.url = url;
      return { html, url };
    }
    return fail("02の画面遷移が完了しませんでした");
  }
  async api(path: string, body?: Record<string, unknown>) {
    const page = await this.request(
      safeUrl(path),
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
      true,
    );
    let data;
    try {
      data = JSON.parse(page.html);
    } catch {
      fail("02側の応答形式を確認できません");
    }
    if (!data || data.success !== true) fail("02側で処理が完了しませんでした");
    return data;
  }
  async submit(form: Form, fields: Record<string, string>) {
    if (form.method !== "POST") fail("この02の操作形式は未確認です");
    return this.request(form.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...form.fields, ...fields }),
    });
  }
  async login(kind: "shop" | "cast", id: string, password: string) {
    const page = await this.request(`${BASE}/${kind}/login/`);
    const candidates = forms(page.html, page.url).filter((f) =>
      f.inputs.some((i) => i.type === "password"),
    );
    if (candidates.length !== 1) fail("02のログイン画面の形式を確認できません");
    const form = candidates[0];
    const identity = form.inputs.find(
      (i) =>
        i.name && /^(email|username|login_id|login|user_login)$/.test(i.name),
    );
    const pw = form.inputs.find((i) => i.name && i.type === "password");
    if (!identity || !pw) fail("02のログイン項目を確認できません");
    const result = await this.submit(form, {
      [identity!.name]: id,
      [pw!.name]: password,
    });
    if (
      forms(result.html, result.url).some((f) =>
        f.inputs.some((i) => i.type === "password"),
      ) ||
      /ログインに失敗|パスワードが違|認証に失敗/.test(text(result.html))
    )
      fail("02へログインできません。保存済みのログイン情報を確認してください");
    if (
      !new RegExp(`/${kind}/`).test(new globalThis.URL(result.url).pathname) ||
      !/ログアウト|logout/i.test(result.html)
    )
      fail("02のログイン完了を確認できません");
    return result;
  }
}
async function storeCredentials(storeId: string) {
  const c = checked(
    await admin
      .from("store_site_credentials")
      .select("login_id,password")
      .eq("store_id", storeId)
      .eq("site", "o2")
      .maybeSingle(),
  );
  if (!c?.login_id || !c.password)
    fail("教育・媒体登録の店舗02設定にログイン情報を保存してください");
  return c!;
}
async function castDetails(storeId: string, castId: string) {
  const c = checked(
    await admin
      .from("casts")
      .select(
        "id,name,is_active,is_visible,o2_login_email,o2_created,o2_linkage_requested,age,photo,therapist_comment,height,bust_size,cup_size,waist,hip,blood_type",
      )
      .eq("store_id", storeId)
      .eq("id", castId)
      .maybeSingle(),
  );
  if (!c?.is_active) fail("在籍中のセラピストが見つかりません");
  const cred = checked(
    await admin
      .from("cast_site_credentials")
      .select("login_id,password")
      .eq("store_id", storeId)
      .eq("cast_id", castId)
      .eq("site", "o2")
      .maybeSingle(),
  );
  if (!cred?.login_id || !cred.password || !c!.o2_login_email)
    fail(
      "先に02の登録メール・ユーザー名・パスワードをSNS設定に保存してください",
    );
  return { cast: c!, credentials: cred! };
}
async function findRequestPage(
  session: O2Session,
  initial: Page,
): Promise<Page> {
  if (relationRequests(initial.html, initial.url).length) return initial;
  const all = links(initial.html, initial.url).filter(
    (l) =>
      new globalThis.URL(l.url).pathname.startsWith("/shop/") &&
      /連携|セラピスト管理|申請|所属セラピスト/.test(l.label),
  );
  const urls = [
    ...new Set(
      all
        .sort(
          (a, b) =>
            Number(/申請|承認/.test(b.label)) -
            Number(/申請|承認/.test(a.label)),
        )
        .map((l) => l.url),
    ),
  ].slice(0, 3);
  for (const url of urls) {
    const page = await session.request(url);
    if (
      relationRequests(page.html, page.url).length ||
      /連携申請はありません|申請中のセラピストはいません|承認待ち[：:\s]*0|申請[はが]ありません/.test(
        text(page.html),
      )
    )
      return page;
    const nested = links(page.html, page.url).find(
      (l) =>
        new globalThis.URL(l.url).pathname.startsWith("/shop/") &&
        /申請|承認待ち/.test(l.label),
    );
    if (nested) {
      const p = await session.request(nested.url);
      if (
        relationRequests(p.html, p.url).length ||
        /申請[はが]ありません|承認待ち[：:\s]*0/.test(text(p.html))
      )
        return p;
    }
  }
  fail(
    "02の連携申請一覧を判別できません。未確認のため承認操作を停止しています",
  );
}
async function syncStore(storeId: string) {
  const credentials = await storeCredentials(storeId);
  const session = new O2Session();
  const page = await findRequestPage(
    session,
    await session.login("shop", credentials.login_id, credentials.password),
  );
  const pending = relationRequests(page.html, page.url);
  relationShopId(page.html);
  const castCreds =
    checked(
      await admin
        .from("cast_site_credentials")
        .select("cast_id,login_id")
        .eq("store_id", storeId)
        .eq("site", "o2"),
    ) || [];
  const active =
    checked(
      await admin
        .from("casts")
        .select("id")
        .eq("store_id", storeId)
        .eq("is_active", true),
    ) || [];
  const activeIds = new Set(active.map((c) => c.id));
  const old =
    checked(
      await admin
        .from("o2_link_requests")
        .select("id,username,status")
        .eq("store_id", storeId),
    ) || [];
  for (const request of pending) {
    const previous = old.find((r) => r.username === request.username);
    const matches = castCreds.filter(
      (c) =>
        c.login_id.toLowerCase() === request.username.toLowerCase() &&
        activeIds.has(c.cast_id),
    );
    const payload = {
      store_id: storeId,
      username: request.username,
      display_name: request.name,
      profile_url: request.profileUrl,
      source_url: page.url,
      cast_id: matches.length === 1 ? matches[0].cast_id : null,
      last_seen_at: now(),
    };
    if (previous)
      checked(
        await admin
          .from("o2_link_requests")
          .update({
            ...payload,
            ...(previous.status !== "approving"
              ? {
                  status: "pending",
                  error: null,
                  decided_at: null,
                  decided_by: null,
                }
              : {}),
          })
          .eq("id", previous.id),
      );
    else checked(await admin.from("o2_link_requests").insert(payload));
  }
  // Disappearance is not evidence of approval. Keep ambiguous requests for review.
  for (const previous of old.filter(
    (r) =>
      r.status === "pending" && !pending.some((p) => p.username === r.username),
  )) {
    checked(
      await admin
        .from("o2_link_requests")
        .update({
          status: "review_required",
          error: "申請一覧から見つからなくなりました。承認済みかは未確認です",
        })
        .eq("id", previous.id),
    );
  }
  await saveSettings(storeId, {
    checked_at: now(),
    last_status: "ok",
    last_error: null,
  });
  return { pending: pending.length };
}
async function approve(storeId: string, requestId: string, userId: string) {
  const r = checked(
    await admin
      .from("o2_link_requests")
      .select("*")
      .eq("id", requestId)
      .eq("store_id", storeId)
      .maybeSingle(),
  );
  if (!r || r.status !== "pending") fail("承認待ちの申請が見つかりません");
  if (!r.cast_id)
    fail(
      "ZR OSの在籍セラピストと一致していません。SNS設定のユーザー名を確認してください",
    );
  const { credentials: castCred, cast } = await castDetails(storeId, r.cast_id);
  if (castCred.login_id !== r.username || !cast.is_active)
    fail("申請者と現在のセラピスト設定が一致しません");
  const c = await storeCredentials(storeId);
  const session = new O2Session();
  const page = await findRequestPage(
    session,
    await session.login("shop", c.login_id, c.password),
  );
  const match = relationRequests(page.html, page.url).filter(
    (p) => p.username === r.username,
  );
  const shopId = relationShopId(page.html);
  if (match.length !== 1)
    fail("02で同一の申請を確認できません。再取得してください");
  const claimed = checked(
    await admin
      .from("o2_link_requests")
      .update({ status: "approving", decided_by: userId, error: null })
      .eq("id", r.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle(),
  );
  if (!claimed) fail("別の承認処理が実行中です");
  try {
    await session.api(`${BASE}/api/cast-shop/respond.php`, {
      shop_id: Number(shopId),
      cast_id: Number(match[0].remoteId),
      action: "approve",
    });
    const verified = await session.request(page.url);
    if (
      relationRequests(verified.html, verified.url).some(
        (p) => p.username === r.username,
      )
    )
      fail("承認後も申請が残っています。再送を停止しています");
    const membersLink = links(
      (await session.request(`${BASE}/shop/dashboard/`)).html,
      `${BASE}/shop/dashboard/`,
    ).find((l) => /在籍セラピスト/.test(l.label));
    if (!membersLink) fail("承認後の在籍一覧を確認できません");
    const members = await session.request(membersLink.url);
    if (!memberIds(members.html).has(match[0].remoteId))
      fail("承認後の在籍一覧で対象者を確認できません。再送を停止しています");
    checked(
      await admin
        .from("o2_link_requests")
        .update({ status: "approved", decided_at: now(), error: null })
        .eq("id", r.id),
    );
    checked(
      await admin
        .from("casts")
        .update({ o2_linkage_requested: true })
        .eq("id", r.cast_id)
        .eq("store_id", storeId),
    );
    return { status: "approved" };
  } catch (e) {
    checked(
      await admin
        .from("o2_link_requests")
        .update({ status: "review_required", error: message(e) })
        .eq("id", r.id),
    );
    throw e;
  }
}
async function profilePhoto(raw: string) {
  const allowed = (u: URL) =>
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    !u.port &&
    [
      "enka-salon.jp",
      "lh3.googleusercontent.com",
      "drive.google.com",
      "cdn2-caskan.com",
      "imrxzkivwrkqbhqfbbes.supabase.co",
    ].includes(u.hostname);
  let url = new globalThis.URL(raw);
  if (!allowed(url)) fail("このプロフィール画像の保存先には未対応です");
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      url = new globalThis.URL(res.headers.get("location") || "", url);
      if (!allowed(url)) fail("画像の転送先を確認できません");
      continue;
    }
    if (!res.ok) fail("HPのプロフィール画像を取得できません");
    const mime = res.headers.get("content-type")?.split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime || ""))
      fail("画像はJPEG・PNG・WebPで保存してください");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024)
      fail("プロフィール画像を4MB以下にしてください");
    let binary = "";
    for (let at = 0; at < bytes.length; at += 8192)
      binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
    return `data:${mime};base64,${btoa(binary)}`;
  }
  return fail("プロフィール画像の転送が完了しません");
}
async function syncCastProfile(
  session: O2Session,
  dashboard: Page,
  cast: Record<string, any>,
) {
  const edit = links(dashboard.html, dashboard.url).find((l) =>
    /^(プロフ編集|プロフィール編集)$/.test(l.label),
  );
  if (!edit) fail("02のプロフィール編集画面が見つかりません");
  const page = await session.request(edit.url);
  const candidates = forms(page.html, page.url).filter(
    (f) =>
      f.inputs.some((i) => i.name === "stage_name") &&
      f.inputs.some((i) => i.name === "profile_image_data"),
  );
  if (candidates.length !== 1) fail("02のプロフィール編集項目を確認できません");
  const form = candidates[0];
  const fields: Record<string, string> = {
    ...form.fields,
    stage_name: cast.name,
  };
  const map: Record<string, string> = {
    age: "age",
    height: "height",
    bust: "bust_size",
    cup: "cup_size",
    waist: "waist",
    hip: "hip",
    blood_type: "blood_type",
    comment: "therapist_comment",
  };
  for (const [target, source] of Object.entries(map)) {
    const v = cast[source];
    if (v !== null && v !== undefined && String(v).trim())
      fields[target] =
        target === "blood_type"
          ? String(v).trim().replace("型", "")
          : String(v).trim();
  }
  if (!fields.sub_area_id) {
    const option = /<option\b([^>]*)>\s*仙台\s*<\/option>/i.exec(form.html);
    if (!option) fail("02の活動エリアを確認してください");
    fields.sub_area_id = attrs(option[1]).value;
  }
  if (!fields.area_id) fail("02の活動エリアを先に設定してください");
  if (cast.photo) fields.profile_image_data = await profilePhoto(cast.photo);
  const result = await session.submit(form, fields);
  if (
    !/保存しました|更新しました|保存が完了|更新が完了/.test(text(result.html))
  )
    fail("02側のプロフィール保存結果を確認できません");
  const reread = await session.request(page.url);
  const saved = forms(reread.html, reread.url).find((f) =>
    f.inputs.some((i) => i.name === "stage_name"),
  );
  if (!saved || saved.fields.stage_name !== cast.name)
    fail("保存後の02プロフィールで名前を確認できません");
}

const message = (e: unknown) =>
  e instanceof Error ? e.message : "処理を完了できませんでした";

async function requestCastLink(storeId: string, castId: string) {
  const d = await castDetails(storeId, castId);
  const shop = await storeCredentials(storeId);
  const ss = new O2Session();
  const storePage = await findRequestPage(
    ss,
    await ss.login("shop", shop.login_id, shop.password),
  );
  const shopId = relationShopId(storePage.html);
  const cs = new O2Session();
  const dashboard = await cs.login(
    "cast",
    d.credentials.login_id,
    d.credentials.password,
  );
  assertCastIdentity(dashboard, d.credentials.login_id);
  const shopsLink = links(dashboard.html, dashboard.url).find(
    (l) => l.label === "店舗連携",
  );
  if (!shopsLink) fail("02の店舗連携画面を確認できません");
  let page = await cs.request(shopsLink.url);
  const remoteId = /\bconst\s+CAST_ID\s*=\s*(\d+)\s*;/.exec(page.html)?.[1];
  if (!remoteId || !page.html.includes("/api/cast-shop/request.php"))
    fail("02の店舗連携申請の仕様を確認できません");
  const status = (html: string) =>
    new RegExp(`leaveShop\\(\\s*${shopId}\\s*[,)]`).test(html)
      ? "linked"
      : new RegExp(`cancelRequest\\(\\s*${shopId}\\s*\\)`).test(html)
        ? "pending"
        : null;
  let state = status(page.html);
  if (!state) {
    const search = forms(page.html, page.url).find(
      (f) => f.method === "GET" && f.inputs.some((i) => i.name === "q"),
    );
    if (!search) fail("02の店舗検索画面を確認できません");
    const store = checked(
      await admin.from("stores").select("name").eq("id", storeId).single(),
    );
    const url = new globalThis.URL(search.url);
    url.searchParams.set("q", store.name);
    page = await cs.request(url.href);
    state = status(page.html);
    if (!state) {
      if (!new RegExp(`sendRequest\\(\\s*${shopId}\\s*\\)`).test(page.html))
        fail("02の検索結果で対象店舗を確認できません");
      await cs.api(`${BASE}/api/cast-shop/request.php`, {
        cast_id: Number(remoteId),
        shop_id: Number(shopId),
      });
      page = await cs.request(shopsLink.url);
      state = status(page.html);
      if (!state)
        fail("02側で店舗連携申請の完了を確認できません。再送を停止しました");
    }
  }
  checked(
    await admin
      .from("casts")
      .update({ o2_linkage_requested: true })
      .eq("id", castId)
      .eq("store_id", storeId),
  );
  await syncStore(storeId);
  return { status: state };
}
function assertCastIdentity(page: Page, username: string) {
  const self = links(page.html, page.url)
    .filter((l) => l.label === "プロフィール")
    .map((l) => new globalThis.URL(l.url).pathname);
  if (!self.includes(`/profile/@${username}`))
    fail("02のログイン先と対象セラピストが一致しません");
}

async function processJob(job: Record<string, any>) {
  let submitted = false;
  try {
    const { cast, credentials } = await castDetails(job.store_id, job.cast_id);
    if (job.status === "awaiting_email") {
      const secret = checked(
        await admin
          .from("o2_control_secrets")
          .select("*")
          .eq("job_id", job.id)
          .maybeSingle(),
      );
      if (!secret || new Date(secret.expires_at).getTime() < Date.now())
        fail("メール認証の待機時間が切れました。02側の状態を確認してください");
      if (!secret.code) return;
      const session = new O2Session(secret.session as Session);
      const page = await session.request(secret.session.url);
      const candidates = forms(page.html, page.url).filter((f) =>
        f.inputs.some((i) =>
          /^(code|verification_code|verify_code|auth_code|otp)$/.test(
            i.name || "",
          ),
        ),
      );
      if (candidates.length !== 1)
        fail("02の認証コード入力画面を確認できません");
      const f = candidates[0],
        input = f.inputs.find((i) =>
          /^(code|verification_code|verify_code|auth_code|otp)$/.test(
            i.name || "",
          ),
        )!;
      checked(
        await admin
          .from("o2_account_jobs")
          .update({ status: "running", updated_at: now() })
          .eq("id", job.id)
          .eq("status", "awaiting_email"),
      );
      submitted = true;
      const result = await session.submit(f, { [input.name]: secret.code });
      if (
        !/メール認証.{0,15}完了|認証が完了|認証.{0,10}成功|審査.{0,10}お待ち/.test(
          text(result.html),
        )
      )
        fail("02側のメール認証完了を確認できません。再送を停止しました");
      checked(
        await admin
          .from("o2_account_jobs")
          .update({ status: "awaiting_review", error: null, updated_at: now() })
          .eq("id", job.id),
      );
      checked(
        await admin
          .from("casts")
          .update({ o2_created: true })
          .eq("id", cast.id)
          .eq("store_id", job.store_id),
      );
      checked(
        await admin.from("o2_control_secrets").delete().eq("job_id", job.id),
      );
      return;
    }
    const claim = checked(
      await admin
        .from("o2_account_jobs")
        .update({ status: "running", started_at: now(), updated_at: now() })
        .eq("id", job.id)
        .eq("status", "queued")
        .select("id")
        .maybeSingle(),
    );
    if (!claim) return;
    const session = new O2Session();
    if (job.kind === "check" || job.kind === "profile") {
      const page = await session.login(
        "cast",
        credentials.login_id,
        credentials.password,
      );
      assertCastIdentity(page, credentials.login_id);
      if (job.kind === "profile") {
        submitted = true;
        await syncCastProfile(session, page, cast);
      }
      const status = /審査中|審査待ち/.test(text(page.html))
        ? "awaiting_review"
        : /メール認証|認証コード/.test(text(page.html))
          ? "review_required"
          : "completed";
      if (job.kind === "check" && status === "completed") {
        const registration = checked(
          await admin
            .from("o2_account_jobs")
            .select("id")
            .eq("store_id", job.store_id)
            .eq("cast_id", cast.id)
            .eq("kind", "register")
            .eq("status", "awaiting_review")
            .limit(1)
            .maybeSingle(),
        );
        if (registration) {
          // Mark before external writes: if interrupted, do not silently repeat profile/link operations.
          checked(
            await admin
              .from("o2_account_jobs")
              .update({
                status: "review_required",
                error: "審査後のプロフィール・店舗連携の反映結果を確認中です",
                updated_at: now(),
              })
              .eq("id", registration.id),
          );
          submitted = true;
          await syncCastProfile(session, page, cast);
          await requestCastLink(job.store_id, cast.id);
          checked(
            await admin
              .from("o2_account_jobs")
              .update({ status: "completed", error: null, updated_at: now() })
              .eq("id", registration.id),
          );
        }
      }
      checked(
        await admin
          .from("o2_account_jobs")
          .update({
            status,
            error:
              status === "review_required"
                ? "02側でメール認証が必要です"
                : null,
            updated_at: now(),
          })
          .eq("id", job.id),
      );
      if (status === "completed")
        checked(
          await admin
            .from("casts")
            .update({ o2_created: true })
            .eq("id", cast.id)
            .eq("store_id", job.store_id),
        );
      return;
    }
    if (cast.o2_created)
      fail("既に02作成済みです。「状態を確認」を使用してください");
    const page = await session.request(`${BASE}/cast-register/`);
    const candidates = forms(page.html, page.url).filter(
      (f) =>
        f.inputs.some((i) => i.type === "password") &&
        f.inputs.some((i) => /email|mail/.test(i.name || "")),
    );
    if (candidates.length !== 1)
      fail("02の登録画面が複数段階のため、自動登録の入力項目を確認できません");
    const f = candidates[0],
      fields: Record<string, string> = {};
    const store = checked(
      await admin
        .from("stores")
        .select("name,custom_domain")
        .eq("id", job.store_id)
        .single(),
    );
    if (!cast.is_visible || !cast.photo || !cast.age || Number(cast.age) < 18)
      fail(
        "HPで公開中・写真あり・18歳以上のプロフィールを先に用意してください",
      );
    if (store.name !== "艶華" || store.custom_domain !== "enka-salon.jp")
      fail("この店舗の02登録エリアをまだ設定していません");
    const expected = [
      "csrf_token",
      "username",
      "email",
      "password",
      "password_confirm",
      "area_id",
      "shop_name_verify",
      "stage_name_verify",
      "profile_url",
      "agree_rules",
    ];
    if (f.inputs.some((i) => i.name && !expected.includes(i.name)))
      fail("02登録の入力項目が変更されています。確認が必要です");
    const region = /<option\b([^>]*)>\s*宮城\s*<\/option>/i.exec(f.html);
    if (!region || !attrs(region[1]).value)
      fail("02の宮城エリアを確認できません");
    const publicUrl = `https://enka-salon.jp/casts/${cast.id}`;
    const publicPage = await fetch(publicUrl, {
      signal: AbortSignal.timeout(15000),
    });
    if (!publicPage.ok) fail("HPの公開プロフィールを取得できません");
    // User-authorized registration uses the verified live fields, not guessed names.
    Object.assign(fields, {
      username: credentials.login_id,
      email: cast.o2_login_email!,
      password: credentials.password,
      password_confirm: credentials.password,
      area_id: attrs(region![1]).value,
      shop_name_verify: store.name,
      stage_name_verify: cast.name,
      profile_url: publicUrl,
      agree_rules: f.inputs.find((i) => i.name === "agree_rules")?.value || "1",
    });
    submitted = true;
    let result = await session.submit(f, fields);
    const confirmation = forms(result.html, result.url).filter(
      (form) =>
        /登録内容.{0,10}確認|確認内容/.test(text(result.html)) &&
        /登録する|登録申請/.test(form.label) &&
        form.inputs.every(
          (i) =>
            !i.name || ["hidden", "submit", "button"].includes(i.type || ""),
        ),
    );
    if (confirmation.length === 1)
      result = await session.submit(confirmation[0], {});
    const verify = forms(result.html, result.url).filter((f) =>
      f.inputs.some((i) =>
        /^(code|verification_code|verify_code|auth_code|otp)$/.test(
          i.name || "",
        ),
      ),
    );
    if (verify.length !== 1)
      fail(
        "02へ登録を送信しましたが、認証待ちの結果を確認できません。重複登録を防ぐため停止しました",
      );
    checked(
      await admin
        .from("o2_control_secrets")
        .upsert({
          job_id: job.id,
          session: session.state,
          expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
        }),
    );
    checked(
      await admin
        .from("o2_account_jobs")
        .update({ status: "awaiting_email", error: null, updated_at: now() })
        .eq("id", job.id),
    );
  } catch (e) {
    checked(
      await admin
        .from("o2_account_jobs")
        .update({
          status: submitted ? "review_required" : "failed",
          error: message(e),
          updated_at: now(),
        })
        .eq("id", job.id),
    );
    checked(
      await admin.from("o2_control_secrets").delete().eq("job_id", job.id),
    );
  }
}
async function ingest(req: Request, payload: Record<string, any>) {
  const token = req.headers.get("x-ingest-token") || "";
  if (token.length < 24) return json({ error: "Unauthorized" }, 401);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const hash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const t = checked(
    await admin
      .from("report_ingest_tokens")
      .select("id,store_id")
      .eq("token_hash", hash)
      .maybeSingle(),
  );
  if (!t) return json({ error: "Unauthorized" }, 401);
  let imported = 0;
  const acceptedMessageIds: string[] = [];
  const jobs =
    checked(
      await admin
        .from("o2_account_jobs")
        .select("id,login_email,started_at")
        .eq("store_id", t.store_id)
        .eq("status", "awaiting_email"),
    ) || [];
  for (const raw of (Array.isArray(payload.messages)
    ? payload.messages
    : []
  ).slice(0, 30)) {
    if (
      typeof raw?.body !== "string" ||
      raw.body.length > 20000 ||
      typeof raw.id !== "string"
    )
      continue;
    const parsed = parseVerificationMail(raw as VerificationMail);
    if (!parsed) continue;
    const matched = jobs.filter(
      (j) =>
        parsed.recipients.includes(j.login_email?.toLowerCase()) &&
        new Date(parsed.receivedAt).getTime() >=
          new Date(j.started_at).getTime() - 5000,
    );
    if (matched.length !== 1) continue;
    const s = checked(
      await admin
        .from("o2_control_secrets")
        .select("job_id,code_received_at")
        .eq("job_id", matched[0].id)
        .gt("expires_at", now())
        .maybeSingle(),
    );
    if (!s || (s.code_received_at && s.code_received_at >= parsed.receivedAt))
      continue;
    const receipt = await admin
      .from("o2_control_mail_receipts")
      .insert({ store_id: t.store_id, message_id: raw.id })
      .select("message_id")
      .maybeSingle();
    if (receipt.error || !receipt.data) continue;
    const result = await admin
      .from("o2_control_secrets")
      .update({
        code: parsed.code,
        message_id: raw.id,
        code_received_at: parsed.receivedAt,
      })
      .eq("job_id", s.job_id)
      .is("code", null)
      .select("job_id")
      .maybeSingle();
    if (!result.error && result.data) {
      imported++;
      acceptedMessageIds.push(raw.id);
    } else if (result.error)
      checked(
        await admin
          .from("o2_control_mail_receipts")
          .delete()
          .eq("store_id", t.store_id)
          .eq("message_id", raw.id),
      );
  }
  await saveSettings(t.store_id, { email_checked_at: now() });
  if (imported)
    checked(await admin.rpc("wake_o2_control", { p_store_id: t.store_id }));
  return json({
    received: Math.min(payload.messages?.length || 0, 30),
    imported,
    acceptedMessageIds,
  });
}
async function runStore(storeId: string) {
  if (
    !checked(await admin.rpc("claim_o2_control_lock", { p_store_id: storeId }))
  )
    return { storeId, status: "busy" };
  try {
    checked(
      await admin.from("o2_control_secrets").delete().lt("expires_at", now()),
    );
    checked(
      await admin
        .from("o2_control_mail_receipts")
        .delete()
        .lt(
          "received_at",
          new Date(Date.now() - 24 * 60 * 60000).toISOString(),
        ),
    );
    let result;
    try {
      result = await syncStore(storeId);
    } catch (e) {
      await saveSettings(storeId, {
        last_status: "failed",
        last_error: message(e),
      });
    }
    // Rotate through existing accounts without writing profiles or creating accounts automatically.
    const enabled = checked(
      await admin
        .from("o2_control_settings")
        .select("enabled")
        .eq("store_id", storeId)
        .maybeSingle(),
    );
    const existing =
      checked(
        await admin
          .from("o2_account_jobs")
          .select("cast_id,status,updated_at")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(400),
      ) || [];
    if (
      enabled?.enabled &&
      !existing.some((j) =>
        ["queued", "running", "awaiting_email"].includes(j.status),
      )
    ) {
      const active =
        checked(
          await admin
            .from("casts")
            .select("id,o2_login_email")
            .eq("store_id", storeId)
            .eq("is_active", true)
            .eq("o2_created", true),
        ) || [];
      const creds =
        checked(
          await admin
            .from("cast_site_credentials")
            .select("cast_id,login_id")
            .eq("store_id", storeId)
            .eq("site", "o2"),
        ) || [];
      const targets = active.filter(
        (c) =>
          c.o2_login_email &&
          creds.some((d) => d.cast_id === c.id) &&
          (!existing.find((j) => j.cast_id === c.id) ||
            Date.now() -
              new Date(
                existing.find((j) => j.cast_id === c.id)!.updated_at,
              ).getTime() >
              (existing.find((j) => j.cast_id === c.id)?.status ===
              "awaiting_review"
                ? 5
                : 60) *
                60000),
      );
      targets.sort((a, b) =>
        String(
          existing.find((j) => j.cast_id === a.id)?.updated_at || "",
        ).localeCompare(
          String(existing.find((j) => j.cast_id === b.id)?.updated_at || ""),
        ),
      );
      if (targets[0])
        checked(
          await admin
            .from("o2_account_jobs")
            .insert({
              store_id: storeId,
              cast_id: targets[0].id,
              kind: "check",
              login_email: targets[0].o2_login_email,
              username: creds.find((d) => d.cast_id === targets[0].id)!
                .login_id,
            }),
        );
    }
    const jobs =
      checked(
        await admin
          .from("o2_account_jobs")
          .select("*")
          .eq("store_id", storeId)
          .in("status", ["queued", "awaiting_email"])
          .order("status")
          .order("created_at")
          .limit(3),
      ) || [];
    for (const job of jobs) await processJob(job);
    checked(
      await admin
        .from("o2_account_jobs")
        .update({
          status: "review_required",
          error: "前回の操作が中断されました。02側の結果を確認してください",
          updated_at: now(),
        })
        .eq("store_id", storeId)
        .eq("status", "running")
        .lt("updated_at", new Date(Date.now() - 5 * 60000).toISOString()),
    );
    return {
      storeId,
      status: result ? "ok" : "failed",
      pending: result?.pending,
    };
  } finally {
    checked(
      await admin.from("o2_control_locks").delete().eq("store_id", storeId),
    );
  }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const payload = await req.json();
    const { action, storeId } = payload;
    if (action === "ingest") return await ingest(req, payload);
    if (action === "worker") {
      const valid = checked(
        await admin.rpc("verify_o2_control_worker", {
          p_secret: req.headers.get("x-o2-worker-secret"),
        }),
      );
      if (!valid) return json({ error: "Unauthorized" }, 401);
      const settings =
        checked(
          await admin
            .from("o2_control_settings")
            .select("store_id")
            .eq("enabled", true),
        ) || [];
      const ids = storeId ? [storeId] : settings.map((s) => s.store_id);
      const results = [];
      for (const id of ids) results.push(await runStore(id));
      return json({ results });
    }
    const bearer =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(bearer);
    if (error || !user) return json({ error: "ログインが必要です" }, 401);
    const scoped = createClient(URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false },
    });
    if (
      typeof storeId !== "string" ||
      !checked(await scoped.rpc("can_manage_store", { p_store_id: storeId }))
    )
      return json({ error: "この店舗を管理する権限がありません" }, 403);
    if (action === "settings") {
      await saveSettings(storeId, { enabled: payload.enabled === true });
      return json({ ok: true });
    }
    if (action === "sync") return json(await runStore(storeId));
    if (action === "request-link") {
      if (
        !checked(
          await admin.rpc("claim_o2_control_lock", { p_store_id: storeId }),
        )
      )
        return json({ error: "02の確認中です" }, 409);
      try {
        return json(await requestCastLink(storeId, payload.castId));
      } finally {
        checked(
          await admin.from("o2_control_locks").delete().eq("store_id", storeId),
        );
      }
    }
    if (action === "approve") {
      if (
        !checked(
          await admin.rpc("claim_o2_control_lock", { p_store_id: storeId }),
        )
      )
        return json(
          { error: "02の確認中です。少し待ってから操作してください" },
          409,
        );
      try {
        return json(await approve(storeId, payload.requestId, user.id));
      } finally {
        checked(
          await admin.from("o2_control_locks").delete().eq("store_id", storeId),
        );
      }
    }
    if (action === "register" || action === "check" || action === "profile") {
      const d = await castDetails(storeId, payload.castId);
      if (action === "register") {
        const old = checked(
          await admin
            .from("o2_account_jobs")
            .select("status")
            .eq("store_id", storeId)
            .eq("cast_id", d.cast.id)
            .eq("kind", "register")
            .in("status", ["awaiting_review", "review_required"])
            .limit(1),
        );
        if (old?.length)
          return json(
            { error: "前回の登録結果の確認が必要です。重複登録は行いません" },
            409,
          );
      }
      if (action === "register") {
        const setting = checked(
          await admin
            .from("o2_control_settings")
            .select("email_checked_at")
            .eq("store_id", storeId)
            .maybeSingle(),
        );
        if (
          !setting?.email_checked_at ||
          Date.now() - new Date(setting.email_checked_at).getTime() > 3 * 60000
        )
          return json(
            {
              error: "先に認証メールの転送先Gmailで連携設定を完了してください",
            },
            422,
          );
      }
      if (action === "register" && d.cast.o2_created)
        return json({ error: "02は作成済みです" }, 409);
      const inserted = await admin
        .from("o2_account_jobs")
        .insert({
          store_id: storeId,
          cast_id: d.cast.id,
          kind: action,
          login_email: d.cast.o2_login_email,
          username: d.credentials.login_id,
        })
        .select("id")
        .single();
      if (inserted.error)
        return json(
          { error: "処理中の登録・認証があります。重複して開始しません" },
          409,
        );
      checked(await admin.rpc("wake_o2_control", { p_store_id: storeId }));
      return json({ queued: true, jobId: inserted.data.id });
    }
    return json({ error: "未対応の操作です" }, 400);
  } catch (e) {
    return json({ error: message(e) }, 422);
  }
});
