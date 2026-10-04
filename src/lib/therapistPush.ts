// セラピストのマイページ（ホーム画面に追加したアプリ）で予約のプッシュ通知を受け取る：この端末の登録・解除・状態。
// ログインは無く、本人のマイページのURL（casts.access_token）で本人の端末として登録する。
// 送るのは Edge Function notify-therapist（予約の確定・変更・キャンセルのたびに therapist_notifications から）。

import { supabase } from "@/integrations/supabase/client";
import {
  WEB_PUSH_PUBLIC_KEY,
  base64UrlToBytes,
  currentPushSubscription,
  deviceLabel,
  isPushSupported,
  isStandalone,
  workerRegistration,
} from "@/lib/adminPush";

export { isIOS, isPushSupported, isStandalone } from "@/lib/adminPush";

export interface TherapistPushStatus {
  /** このセラピストの通知を受け取る端末の数 */
  devices: number;
  /** この端末が登録されているか */
  thisDevice: boolean;
  /** この端末でテスト通知を受け取ったか */
  thisDeviceTestConfirmed: boolean;
}

const callRpc = (name: string, args: Record<string, unknown>) => supabase.rpc(name as never, args as never);

export async function getTherapistPushStatus(token: string): Promise<TherapistPushStatus> {
  const subscription = await currentPushSubscription().catch(() => null);
  const { data, error } = await callRpc("get_therapist_push_status", {
    p_token: token,
    p_endpoint: subscription?.endpoint ?? null,
  });
  if (error) throw new Error(error.message);
  const status = (data ?? {}) as { devices?: number; this_device?: boolean; this_device_test_confirmed?: boolean };
  return {
    devices: Number(status.devices ?? 0),
    // 通知の許可が取り消されていたら届かないので、未設定として扱う
    thisDevice: Boolean(status.this_device) && (typeof Notification === "undefined" || Notification.permission === "granted"),
    thisDeviceTestConfirmed: Boolean(status.this_device_test_confirmed),
  };
}

/** 通知を許可してもらい、この端末を登録する（ボタンを押したときに呼ぶこと。iPhoneはタップ操作からでないと許可を出せない） */
export async function enableTherapistPush(token: string) {
  if (!isPushSupported()) throw new Error("このブラウザは通知に対応していません");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("通知が許可されませんでした。スマホの設定から通知を許可してください");
  const registration = await workerRegistration();
  const subscription = (await registration.pushManager.getSubscription())
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(WEB_PUSH_PUBLIC_KEY) });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("通知の登録情報を取得できませんでした");
  const { error } = await callRpc("save_therapist_push_subscription", {
    p_token: token,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_device_label: deviceLabel(),
  });
  if (error) throw new Error(error.message);
  // ホーム画面に追加したアプリから開いているか（管理画面の「SNS・媒体登録の完了状況」に出す）
  if (isStandalone()) {
    await callRpc("mark_therapist_push_standalone", { p_token: token, p_endpoint: json.endpoint });
  }
}

/** テスト通知が届いた（通知をタップした・「届いた」を押した）ことを記録する */
export async function confirmTherapistPushTest(token: string) {
  const subscription = await currentPushSubscription();
  if (!subscription) return false;
  const { data, error } = await callRpc("confirm_therapist_push_test", { p_token: token, p_endpoint: subscription.endpoint });
  if (error) throw new Error(error.message);
  return data === true;
}

/**
 * この端末で受け取るのをやめる。端末の購読そのものは解除しない
 * （同じ端末・同じブラウザで管理画面の通知も受け取っている場合に、そちらまで止めないため）。
 */
export async function disableTherapistPush(token: string) {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  const { error } = await callRpc("delete_therapist_push_subscription", { p_token: token, p_endpoint: subscription.endpoint });
  if (error) throw new Error(error.message);
}

export async function sendTherapistTestPush(token: string) {
  const { data, error } = await supabase.functions.invoke("notify-therapist", { body: { action: "test", token } });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  return data as { targets: number; sent: number };
}
