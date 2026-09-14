import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_RESERVATION_INTERVAL_MINUTES,
  findNextAvailableStart,
  formatAvailabilityTime,
} from "../src/lib/availability.js";

const O2_BASE = "https://m-sns.net";
export const O2_STORE_LOGIN_URL = `${O2_BASE}/shop/login/`;
export const O2_STORE_POST_CREATE_URL = `${O2_BASE}/shop/post/create/`;
export const O2_STORE_POST_LIST_URL = `${O2_BASE}/shop/post/`;
const REVIEW_REQUIRED_PREFIX = "【要確認・再送停止】";
const JST_TIME_ZONE = "Asia/Tokyo";

export type O2StoreAvailability = {
  castId: string;
  castName: string;
  startTime: string;
  endTime: string;
  nextAvailableAt: string;
  photoUrl: string;
};

type ShiftRow = {
  id: string;
  cast_id: string;
  start_time: string;
  end_time: string;
  casts: {
    id: string;
    name: string;
    photo: string | null;
    is_active: boolean;
    is_visible: boolean;
  } | null;
};

type ReservationRow = {
  cast_id: string;
  start_time: string;
  duration: number;
};

type ExistingPost = {
  id: string;
  status: string;
  o2_post_url: string | null;
  error_message: string | null;
};

type StoreCredential = {
  login_id: string;
  password: string;
  login_url: string;
};

type O2StorePostRow = {
  id: string;
  store_id: string;
  business_date: string;
  body: string;
  image_url: string | null;
  status: string;
  attempts: number;
};

type HtmlForm = {
  action: string;
  method: string;
  html: string;
};

type O2PostReference = {
  id: string;
  url: string;
};

export type O2StorePostingResult = {
  storeId: string;
  status: "posted" | "skipped" | "already_handled" | "failed" | "review_required";
  postId?: string;
  url?: string;
  reason?: string;
};

const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";

const toJstParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
};

export const jstDate = (date = new Date()) => {
  const parts = toJstParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

const jstDateLabel = (date = new Date()) => {
  const parts = toJstParts(date);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
  return `${parts.month}月${parts.day}日（${weekday}）`;
};

const minutesFromTime = (time: string) => {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 29 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const sourcePhotoUrl = (photo: string | null | undefined) => {
  const raw = stringValue(photo);
  if (!raw) return "";
  if (/^https:\/\/(?!drive\.google\.com|www\.drive\.google\.com)/i.test(raw)) return raw;
  const fileMatch = raw.match(/\/file\/d\/([^/?]+)/);
  const idMatch = raw.match(/[?&]id=([^&]+)/);
  const id = fileMatch?.[1] || idMatch?.[1] || raw.split("?")[0].split("/")[0];
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000` : "";
};

const isValidAvailability = (item: O2StoreAvailability) =>
  Boolean(item.castId && item.castName && item.nextAvailableAt && item.photoUrl);

export function buildO2StoreAvailability(
  shifts: ShiftRow[],
  reservations: ReservationRow[],
  now = new Date(),
  intervalMinutes = DEFAULT_RESERVATION_INTERVAL_MINUTES,
): O2StoreAvailability[] {
  const nowParts = toJstParts(now);
  const currentMinutes = nowParts.hour * 60 + nowParts.minute;
  const seenCastIds = new Set<string>();
  const availabilities: O2StoreAvailability[] = [];

  for (const shift of [...shifts].sort((left, right) => left.start_time.localeCompare(right.start_time))) {
    const cast = shift.casts;
    if (!cast?.is_active || !cast.is_visible || seenCastIds.has(shift.cast_id)) continue;

    const start = minutesFromTime(shift.start_time);
    const rawEnd = minutesFromTime(shift.end_time);
    if (start === null || rawEnd === null || rawEnd === start) continue;
    const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
    const castReservations = reservations
      .filter((reservation) => reservation.cast_id === shift.cast_id)
      .flatMap((reservation) => {
        const rawReservationStart = minutesFromTime(reservation.start_time);
        const duration = Number(reservation.duration);
        if (rawReservationStart === null || !Number.isFinite(duration) || duration <= 0) return [];
        return [{
          start: rawReservationStart < start ? rawReservationStart + 24 * 60 : rawReservationStart,
          duration: Math.trunc(duration),
        }];
      });

    const nextStart = findNextAvailableStart({
      shiftStart: start,
      shiftEnd: end,
      currentTime: currentMinutes < rawEnd && rawEnd <= start ? currentMinutes + 24 * 60 : currentMinutes,
      reservations: castReservations,
      intervalMinutes,
    });
    const item: O2StoreAvailability = {
      castId: cast.id,
      castName: cast.name,
      startTime: shift.start_time.slice(0, 5),
      endTime: shift.end_time.slice(0, 5),
      nextAvailableAt: nextStart === null ? "" : formatAvailabilityTime(nextStart),
      photoUrl: sourcePhotoUrl(cast.photo),
    };
    if (nextStart !== null) {
      seenCastIds.add(shift.cast_id);
      if (isValidAvailability(item)) availabilities.push(item);
    }
  }

  return availabilities;
}

export function buildO2StoreAvailabilityBody(
  storeName: string,
  availability: O2StoreAvailability[],
  now = new Date(),
) {
  const listedAvailability = availability.slice(0, 10);
  const lines = [
    `【${jstDateLabel(now)} 空き情報】`,
    "本日のご案内可能なセラピストです。",
    "",
    ...listedAvailability.map((item) => `・${item.castName}\u3000最短 ${item.nextAvailableAt}〜`),
    ...(availability.length > listedAvailability.length ? [`ほか ${availability.length - listedAvailability.length}名`] : []),
    "",
    `ご予約は${storeName}のプロフィールからお願いいたします。`,
  ];
  return lines.join("\n").slice(0, 1000);
}

class O2StoreReviewRequiredError extends Error {
  readonly postId: string | null;
  readonly postUrl: string | null;

  constructor(message: string, reference?: O2PostReference | null) {
    super(`${REVIEW_REQUIRED_PREFIX}${message}。O2側を確認するまで再送できません`);
    this.name = "O2StoreReviewRequiredError";
    this.postId = reference?.id || null;
    this.postUrl = reference?.url || null;
  }
}

class CookieJar {
  private readonly values = new Map<string, string>();

  capture(response: Response) {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const cookies = headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""];
    for (const raw of cookies) {
      for (const part of raw.split(/,(?=[^;,]+=)/)) {
        const pair = part.split(";", 1)[0];
        const separator = pair.indexOf("=");
        if (separator > 0) this.values.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }
    }
  }

  header() {
    return [...this.values.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

const decodeHtml = (value: string) => value
  .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#([0-9]+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
  .replaceAll("&nbsp;", " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#039;", "'")
  .replaceAll("&apos;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

const attributeMap = (raw: string) => {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2]);
  }
  return attributes;
};

const formsFrom = (html: string, baseUrl: string): HtmlForm[] =>
  [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((match) => {
    const attributes = attributeMap(match[1]);
    return {
      action: new URL(attributes.action || baseUrl, baseUrl).toString(),
      method: (attributes.method || "post").toUpperCase(),
      html: match[2],
    };
  });

const fieldsFrom = (html: string, tag: "input" | "textarea" | "button") =>
  [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))]
    .map((match) => attributeMap(match[1]))
    .filter((attributes) => attributes.name);

const hiddenFields = (html: string) => {
  const fields = new Map<string, string>();
  for (const attribute of fieldsFrom(html, "input")) {
    if ((attribute.type || "text").toLowerCase() === "hidden") fields.set(attribute.name, attribute.value || "");
  }
  return fields;
};

const isO2StoreLoginPage = (html: string) =>
  /name=["']email["']/i.test(html) && /name=["']password["']/i.test(html) && /店舗ログイン/.test(html);

const request = async (jar: CookieJar, url: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (jar.header()) headers.set("Cookie", jar.header());
  headers.set("User-Agent", "Mozilla/5.0 (compatible; CaskanO2StoreAvailability/1.0)");
  const response = await fetch(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  jar.capture(response);
  return response;
};

const follow = async (jar: CookieJar, response: Response, fallbackUrl: string, maxRedirects = 5) => {
  let current = response;
  let currentUrl = fallbackUrl;
  for (let index = 0; index < maxRedirects && [301, 302, 303, 307, 308].includes(current.status); index += 1) {
    const location = current.headers.get("location");
    const nextUrl = location ? new URL(location, currentUrl).toString() : O2_BASE;
    current = await request(jar, nextUrl, { method: "GET", headers: { Referer: currentUrl } });
    currentUrl = nextUrl;
  }
  return current;
};

const o2PostReferenceFromUrl = (rawUrl: string): O2PostReference | null => {
  try {
    const url = new URL(decodeHtml(rawUrl), O2_BASE);
    if (!/^(?:www\.)?m-sns\.net$/i.test(url.hostname)) return null;
    if (url.pathname.replace(/\/+$/, "") !== "/post") return null;
    const id = stringValue(url.searchParams.get("id"));
    return /^\d+$/.test(id) ? { id, url: `${O2_BASE}/post/?id=${id}` } : null;
  } catch {
    return null;
  }
};

const extractO2PostReferences = (html: string, baseUrl: string) => {
  const references = new Map<string, O2PostReference>();
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const reference = o2PostReferenceFromUrl(new URL(decodeHtml(match[1]), baseUrl).toString());
    if (reference && !references.has(reference.id)) references.set(reference.id, reference);
  }
  return [...references.values()];
};

const normalizeO2Text = (html: string) => decodeHtml(html)
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .normalize("NFC")
  .replace(/[\u200B-\u200D\uFEFF]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const postDetailMatches = (html: string, expectedBody: string) => {
  const bodyMatches = normalizeO2Text(html).includes(normalizeO2Text(expectedBody));
  const imageMatches = [...html.matchAll(/<img\b([^>]*)>/gi)].some((match) => {
    const attributes = attributeMap(match[1]);
    return /投稿画像/.test(`${attributes.alt || ""} ${attributes["aria-label"] || ""}`);
  });
  return bodyMatches && imageMatches;
};

const loadO2StorePostList = async (jar: CookieJar, referer: string) => {
  let response = await request(jar, O2_STORE_POST_LIST_URL, { headers: { Referer: referer } });
  response = await follow(jar, response, O2_STORE_POST_LIST_URL);
  const html = await response.text();
  if (response.status >= 400) throw new Error(`O2店舗の投稿一覧を取得できません（HTTP ${response.status}）`);
  if (isO2StoreLoginPage(html)) throw new Error("O2店舗ログインの有効期限が切れました。投稿は行っていません");
  return {
    url: response.url || O2_STORE_POST_LIST_URL,
    references: extractO2PostReferences(html, response.url || O2_STORE_POST_LIST_URL),
  };
};

const downloadImage = async (rawUrl: string) => {
  const url = new URL(rawUrl);
  const allowedHost = url.hostname.endsWith(".supabase.co")
    || url.hostname === "drive.google.com"
    || url.hostname === "storage.googleapis.com";
  if (url.protocol !== "https:" || !allowedHost) {
    throw new Error("セラピスト画像の保存先が許可されていません");
  }
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`セラピスト画像を取得できません（HTTP ${response.status}）`);
  const contentType = response.headers.get("content-type") || "";
  if (!/^image\/(jpeg|png|webp)$/i.test(contentType)) throw new Error("セラピスト画像はJPEG・PNG・WebPのみ対応です");
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > 10 * 1024 * 1024) throw new Error("セラピスト画像のサイズを確認してください");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw new Error("セラピスト画像のサイズを確認してください");
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  return { blob: new Blob([bytes], { type: contentType }), name: `availability.${extension}` };
};

export async function postToO2Store(
  email: string,
  password: string,
  body: string,
  imageUrl: string,
) {
  const jar = new CookieJar();
  const loginPage = await request(jar, O2_STORE_LOGIN_URL);
  const loginHtml = await loginPage.text();
  const loginForm = formsFrom(loginHtml, O2_STORE_LOGIN_URL).find((form) => /name=["']email["']/i.test(form.html) && /type=["']password/i.test(form.html));
  if (!loginForm) throw new Error("O2店舗ログインフォームが見つかりません（画面仕様変更の可能性）");

  const loginBody = new URLSearchParams();
  for (const [name, value] of hiddenFields(loginForm.html)) loginBody.set(name, value);
  loginBody.set("email", email);
  loginBody.set("password", password);
  let loggedIn = await request(jar, loginForm.action, {
    method: loginForm.method,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: O2_STORE_LOGIN_URL },
    body: loginBody.toString(),
  });
  loggedIn = await follow(jar, loggedIn, loginForm.action);
  let currentUrl = loggedIn.url || O2_BASE;
  const loggedInHtml = await loggedIn.text();
  if (loggedIn.status >= 400 || isO2StoreLoginPage(loggedInHtml)) {
    throw new Error("O2店舗へログインできません。メールアドレス・パスワードを確認してください");
  }

  let createPage = await request(jar, O2_STORE_POST_CREATE_URL, { headers: { Referer: currentUrl } });
  createPage = await follow(jar, createPage, O2_STORE_POST_CREATE_URL);
  currentUrl = createPage.url || O2_STORE_POST_CREATE_URL;
  const createHtml = await createPage.text();
  if (isO2StoreLoginPage(createHtml)) throw new Error("O2店舗ログインの有効期限が切れました。投稿は完了していません");

  const postForm = formsFrom(createHtml, currentUrl).find((form) => {
    const textareas = fieldsFrom(form.html, "textarea");
    const controls = [...fieldsFrom(form.html, "button"), ...fieldsFrom(form.html, "input")];
    return new URL(form.action).pathname === "/shop/post/create/"
      && textareas.some((field) => /content|body|text|message/i.test(field.name))
      && controls.some((field) => field.name === "status" && field.value === "published");
  });
  if (!postForm) throw new Error("O2店舗の投稿フォームが見つかりません（画面仕様変更の可能性）。投稿は行っていません");

  const form = new FormData();
  for (const [name, value] of hiddenFields(postForm.html)) form.set(name, value);
  const textareas = fieldsFrom(postForm.html, "textarea");
  const inputs = fieldsFrom(postForm.html, "input");
  const buttons = fieldsFrom(postForm.html, "button");
  const bodyField = textareas.find((field) => /body|content|text|message|post|caption/i.test(field.name))?.name || textareas[0]?.name;
  if (!bodyField) throw new Error("O2店舗の投稿本文欄を特定できません。投稿は行っていません");
  form.set(bodyField, body);
  const publicVisibility = inputs.find((field) => (field.type || "").toLowerCase() === "radio" && field.name === "visibility" && field.value === "public");
  if (publicVisibility?.name) form.set(publicVisibility.name, publicVisibility.value || "public");
  const publishControl = [...buttons, ...inputs].find((field) =>
    (field.type || "").toLowerCase() === "submit" && field.name === "status" && field.value === "published"
  );
  if (publishControl?.name) form.set(publishControl.name, publishControl.value || "published");

  const fileField = inputs.find((field) => (field.type || "").toLowerCase() === "file");
  if (!fileField?.name) throw new Error("O2店舗の画像入力欄が見つかりません。投稿は行っていません");
  const image = await downloadImage(imageUrl);
  form.append(fileField.name, image.blob, image.name);
  if (form.getAll(fileField.name).filter((item) => item instanceof Blob).length !== 1) {
    throw new Error("O2店舗の送信フォームへ画像を1枚設定できませんでした。投稿は行っていません");
  }

  const before = await loadO2StorePostList(jar, currentUrl);
  const previousIds = new Set(before.references.map((reference) => reference.id));
  let submitted: Response;
  try {
    submitted = await request(jar, postForm.action, {
      method: postForm.method === "GET" ? "POST" : postForm.method,
      headers: { Referer: currentUrl },
      body: form,
    });
    submitted = await follow(jar, submitted, postForm.action);
  } catch {
    throw new O2StoreReviewRequiredError("O2店舗へ送信しましたが、応答を受け取れず掲載結果を確認できませんでした");
  }
  const responseHtml = await submitted.text();
  if (submitted.status >= 500) {
    throw new O2StoreReviewRequiredError(`O2店舗へ送信後にサーバーエラーが返り、掲載結果を確認できませんでした（HTTP ${submitted.status}）`);
  }
  if (submitted.status >= 400) throw new Error(`O2店舗投稿エラー（HTTP ${submitted.status}）。投稿は完了していません`);
  if (isO2StoreLoginPage(responseHtml)) throw new Error("O2店舗ログインの有効期限が切れました。投稿は完了していません");
  const responseUrl = submitted.url || postForm.action;
  if (/\/shop\/post\/create\/?(?:\?|$)/i.test(responseUrl) && formsFrom(responseHtml, responseUrl).some((formItem) => /<textarea\b/i.test(formItem.html))) {
    throw new Error("O2店舗が投稿を受け付けませんでした。入力項目の仕様変更を確認してください");
  }

  const responseReferences = extractO2PostReferences(responseHtml, responseUrl);
  const directReference = o2PostReferenceFromUrl(responseUrl);
  let candidate: O2PostReference | null = null;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 600 : 1_000));
      const after = await loadO2StorePostList(jar, responseUrl);
      const references = [
        ...(directReference ? [directReference] : []),
        ...responseReferences,
        ...after.references,
      ].filter((reference, index, collection) => !previousIds.has(reference.id) && collection.findIndex((item) => item.id === reference.id) === index);
      for (const reference of references) {
        candidate = reference;
        let detail = await request(jar, reference.url, { headers: { Referer: after.url } });
        detail = await follow(jar, detail, reference.url);
        const detailHtml = await detail.text();
        if (detail.status < 400 && !isO2StoreLoginPage(detailHtml) && postDetailMatches(detailHtml, body)) {
          return { postId: reference.id, url: reference.url };
        }
      }
    }
  } catch (error) {
    if (error instanceof O2StoreReviewRequiredError) throw error;
    throw new O2StoreReviewRequiredError("O2店舗への送信後、投稿詳細の取得に失敗し掲載結果を確認できませんでした", candidate);
  }
  throw new O2StoreReviewRequiredError(
    candidate
      ? `O2店舗の投稿ID ${candidate.id} を取得しましたが、本文・画像を確認できませんでした`
      : "O2店舗への送信後、新しい投稿IDを取得できず掲載結果を確認できませんでした",
    candidate,
  );
}

const loadAvailability = async (admin: SupabaseClient, storeId: string, now: Date) => {
  const businessDate = jstDate(now);
  const [storeResult, shiftsResult, reservationsResult, settingsResult] = await Promise.all([
    admin.from("stores").select("name").eq("id", storeId).maybeSingle(),
    admin
      .from("shifts")
      .select("id,cast_id,start_time,end_time,casts(id,name,photo,is_active,is_visible)")
      .eq("store_id", storeId)
      .eq("shift_date", businessDate)
      .order("start_time", { ascending: true }),
    admin.rpc("get_reservation_slots", { p_date: businessDate, p_cast_id: null }),
    admin
      .from("shop_settings")
      .select("reservation_interval_minutes")
      .eq("store_id", storeId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (storeResult.error) throw storeResult.error;
  if (shiftsResult.error) throw shiftsResult.error;
  if (reservationsResult.error) throw reservationsResult.error;
  if (settingsResult.error) throw settingsResult.error;

  return {
    businessDate,
    storeName: stringValue(storeResult.data?.name) || "店舗",
    availability: buildO2StoreAvailability(
      (shiftsResult.data || []) as unknown as ShiftRow[],
      (reservationsResult.data || []) as ReservationRow[],
      now,
      Number(settingsResult.data?.reservation_interval_minutes) || DEFAULT_RESERVATION_INTERVAL_MINUTES,
    ),
  };
};

async function insertSkippedPost(
  admin: SupabaseClient,
  storeId: string,
  businessDate: string,
  triggerSource: "scheduled" | "manual",
  reason: string,
) {
  const { error } = await admin.from("o2_store_availability_posts").upsert({
    store_id: storeId,
    business_date: businessDate,
    trigger_source: triggerSource,
    status: "skipped",
    body: "本日はご案内可能なセラピスト情報がありません。",
    availability: [],
    error_message: reason,
  }, { onConflict: "store_id,business_date", ignoreDuplicates: true });
  if (error) throw error;
}

export async function processO2StoreAvailabilityPost(
  admin: SupabaseClient,
  storeId: string,
  options: { now?: Date; triggerSource?: "scheduled" | "manual" } = {},
): Promise<O2StorePostingResult> {
  const now = options.now || new Date();
  const triggerSource = options.triggerSource || "scheduled";
  const { businessDate, storeName, availability } = await loadAvailability(admin, storeId, now);

  const { data: existing, error: existingError } = await admin
    .from("o2_store_availability_posts")
    .select("id,status,o2_post_url,error_message")
    .eq("store_id", storeId)
    .eq("business_date", businessDate)
    .maybeSingle<ExistingPost>();
  if (existingError) throw existingError;
  if (existing) {
    return {
      storeId,
      status: "already_handled",
      postId: existing.id,
      url: existing.o2_post_url || undefined,
      reason: existing.status === "posted" ? "本日はすでにO2へ投稿済みです" : `本日の投稿は${existing.status}のため再実行しません`,
    };
  }

  if (!availability.length) {
    await insertSkippedPost(admin, storeId, businessDate, triggerSource, "本日のご案内可能なセラピストがいないため投稿しませんでした");
    return { storeId, status: "skipped", reason: "本日のご案内可能なセラピストがいません" };
  }

  const featured = availability[0];
  const body = buildO2StoreAvailabilityBody(storeName, availability, now);
  const { data: created, error: createError } = await admin
    .from("o2_store_availability_posts")
    .insert({
      store_id: storeId,
      business_date: businessDate,
      trigger_source: triggerSource,
      status: "pending",
      body,
      image_url: featured.photoUrl,
      featured_cast_id: featured.castId,
      availability,
    })
    .select("id,store_id,business_date,body,image_url,status,attempts")
    .single<O2StorePostRow>();
  if (createError?.code === "23505") {
    return { storeId, status: "already_handled", reason: "本日の投稿は別の処理が開始済みです" };
  }
  if (createError || !created) throw createError || new Error("O2店舗投稿の履歴を作成できませんでした");

  const { data: locked, error: lockError } = await admin
    .from("o2_store_availability_posts")
    .update({ status: "posting", attempts: Number(created.attempts || 0) + 1, last_attempt_at: new Date().toISOString() })
    .eq("id", created.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (lockError || !locked) {
    return { storeId, status: "already_handled", postId: created.id, reason: "本日の投稿は別の処理が開始済みです" };
  }

  try {
    const { data: credential, error: credentialError } = await admin
      .from("store_site_credentials")
      .select("login_id,password,login_url")
      .eq("store_id", storeId)
      .eq("site", "o2")
      .maybeSingle<StoreCredential>();
    if (credentialError) throw credentialError;
    if (!credential?.login_id || !credential.password || credential.login_url !== O2_STORE_LOGIN_URL) {
      const reason = "O2店舗ログイン情報が未設定です";
      await admin.from("o2_store_availability_posts").update({ status: "skipped", error_message: reason }).eq("id", created.id);
      return { storeId, status: "skipped", postId: created.id, reason };
    }

    const result = await postToO2Store(credential.login_id, credential.password, body, featured.photoUrl);
    const { error: completeError } = await admin.from("o2_store_availability_posts").update({
      status: "posted",
      o2_post_id: result.postId,
      o2_post_url: result.url,
      error_message: null,
      posted_at: new Date().toISOString(),
    }).eq("id", created.id).eq("status", "posting");
    if (completeError) {
      throw new O2StoreReviewRequiredError("O2店舗への公開後、管理画面へ投稿結果を保存できませんでした", {
        id: result.postId,
        url: result.url,
      });
    }
    return { storeId, status: "posted", postId: created.id, url: result.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reviewRequired = message.startsWith(REVIEW_REQUIRED_PREFIX);
    const reference: { o2_post_id?: string | null; o2_post_url?: string | null } = error instanceof O2StoreReviewRequiredError ? {
      o2_post_id: error.postId,
      o2_post_url: error.postUrl,
    } : {};
    const { error: saveError } = await admin.from("o2_store_availability_posts").update({
      status: reviewRequired ? "review_required" : "failed",
      error_message: message.slice(0, 4000),
      ...reference,
    }).eq("id", created.id).eq("status", "posting");
    if (saveError) console.error(JSON.stringify({ msg: "o2_store_post_failure_persistence_failed", storeId, error: saveError.message }));
    return { storeId, status: reviewRequired ? "review_required" : "failed", postId: created.id, url: reference.o2_post_url || undefined, reason: message };
  }
}

export async function processEnabledO2StoreAvailabilityPosts(admin: SupabaseClient, now = new Date()) {
  const { data: settings, error } = await admin
    .from("o2_store_availability_settings")
    .select("store_id")
    .eq("is_enabled", true)
    .limit(50);
  if (error) throw error;

  const results: O2StorePostingResult[] = [];
  for (const setting of settings || []) {
    try {
      results.push(await processO2StoreAvailabilityPost(admin, setting.store_id, { now, triggerSource: "scheduled" }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ msg: "o2_store_scheduled_post_failed", storeId: setting.store_id, error: reason }));
      results.push({ storeId: setting.store_id, status: "failed", reason });
    }
  }
  return results;
}
