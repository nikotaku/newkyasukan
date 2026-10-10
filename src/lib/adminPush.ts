// 管理画面アプリ（ホーム画面に追加）のプッシュ通知：この端末の登録・解除・状態の確認。
// 送るのは Edge Function push-notify（DBトリガーから）。LINE通知は今まで通り並行して送られる。

import { supabase } from "@/integrations/supabase/client";

// VAPID の公開鍵（秘密鍵は Vault。公開鍵はブラウザに渡すものなので載せてよい）
export const WEB_PUSH_PUBLIC_KEY = "BLXhjiI5yW7D08urhtATu5KZyR-SMnRiMeqCvNvdV4me6zChRS9obsgH8cbBFxGKvUiO4rA9koMih6tGwU38Cbo";
const WORKER_URL = "/sw-push.js";

export const PUSH_TOPICS = [
  { key: "web_booking", label: "WEB予約が入ったとき", hint: "公開サイト・セラピストの予約フォームからの予約" },
  { key: "sms_reply", label: "お客様からSMSの返信が来たとき", hint: "こちらから送ったことのある番号の返信だけ" },
  { key: "sms_balance", label: "SMSの残高が少ないとき", hint: "実質残高が1,000円を切ったら（1日1回まで）" },
  { key: "daily_sales", label: "セラピストが精算を入力したとき", hint: "マイページから今日の売上（精算）を送った・送り直したとき" },
  { key: "estama_scout", label: "エステ魂スカウトの確認", hint: "毎日の候補がそろったとき（OKで送信）・送り終わったとき" },
  { key: "estama_login", label: "エステ魂のログインが切れたとき", hint: "自動で再ログインできない・ログイン情報が未登録のとき（空き枠の更新などが止まります）" },
  { key: "therapist_notify", label: "セラピストに予約通知が届かないとき", hint: "マイページの通知が未設定・送信に失敗したとき（直接連絡が必要）" },
] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number]["key"];
export const ALL_PUSH_TOPICS: PushTopic[] = PUSH_TOPICS.map((topic) => topic.key);

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** ホーム画面から開いているか（iPhoneはこのときだけ通知を受け取れる） */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || isIOS() ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "端末";
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [device, isStandalone() ? "ホーム画面" : browser].filter(Boolean).join("・");
}

export async function workerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active?.scriptURL.endsWith(WORKER_URL)) return existing;
  await navigator.serviceWorker.register(WORKER_URL, { scope: "/" });
  return navigator.serviceWorker.ready;
}

/** この端末の購読（なければ null）。Service Worker を新しく入れることはしない */
export async function currentPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function saveSubscription(subscription: PushSubscription, storeId: string, topics: PushTopic[]) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("通知の登録情報を取得できませんでした");
  const { error } = await supabase.rpc("save_push_subscription" as never, {
    p_store_id: storeId,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_topics: topics,
    p_device_label: deviceLabel(),
  } as never);
  if (error) throw new Error(error.message);
}

/** 通知を許可してもらい、この端末を登録する（ボタンを押したときに呼ぶこと。iPhoneはタップ操作からでないと許可を出せない） */
export async function enablePush(storeId: string, topics: PushTopic[] = ALL_PUSH_TOPICS) {
  if (!isPushSupported()) throw new Error("このブラウザは通知に対応していません");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("通知が許可されませんでした。端末の設定から通知を許可してください");
  const registration = await workerRegistration();
  const subscription = (await registration.pushManager.getSubscription())
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(WEB_PUSH_PUBLIC_KEY) });
  await saveSubscription(subscription, storeId, topics);
  return subscription;
}

export async function updatePushTopics(storeId: string, topics: PushTopic[]) {
  const subscription = await currentPushSubscription();
  if (!subscription) throw new Error("この端末はまだ通知を受け取る設定になっていません");
  await saveSubscription(subscription, storeId, topics);
}

export async function disablePush() {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => false);
  await supabase.from("push_subscriptions" as never).delete().eq("endpoint", endpoint);
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke("push-notify", { body: { action: "test" } });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  return data as { targets: number; sent: number };
}
