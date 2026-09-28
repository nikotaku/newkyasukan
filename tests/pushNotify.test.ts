import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { base64UrlDecode, base64UrlEncode, encryptPayload, vapidAuthorization } from "../supabase/functions/_shared/webPush.ts";
import { smsBalanceMessage, smsReplyMessage, webBookingMessage } from "../supabase/functions/push-notify/messages.ts";

const reservation = {
  id: "11111111-2222-4333-8444-555555555555",
  booking_origin: "web_form",
  reservation_date: "2026-09-28",
  start_time: "19:00:00",
  duration: 90,
  course_name: "アロマ",
  customer_name: "山田",
  price: 23000,
  nomination_type: "本指名",
};

test("WEB予約の通知：日時・コース・セラピスト・お客様・料金を短く", () => {
  const message = webBookingMessage(reservation, "あさみ");
  assert.equal(message.title, "🔔 WEB予約が入りました");
  assert.equal(message.body, "9/28(月) 19:00〜 アロマ 90分\nあさみ（本指名） / 山田様\n¥23,000");
  assert.equal(message.url, "/schedule/web-bookings");
  assert.equal(webBookingMessage({ ...reservation, booking_origin: "cast_form", nomination_type: "フリー" }, null).body.split("\n")[1], "指名なし / 山田様");
});

test("SMS返信の通知：本文は120文字まで、タップで受信箱のそのお客様を開く", () => {
  const message = smsReplyMessage({ fromNumber: "+819012345678", body: "あ".repeat(200), customerName: "山田" });
  assert.equal(message.title, "💬 SMSの返信（山田様）");
  assert.ok(message.body.startsWith("あ".repeat(119) + "…"));
  assert.ok(message.body.endsWith("09012345678"));
  assert.equal(message.url, "/sms?to=%2B819012345678");
});

test("SMS残高の通知", () => {
  assert.match(smsBalanceMessage(1044.4).body, /残り 約1,044円/);
});

test("本文の暗号化はブラウザ側の鍵で読める（RFC 8291 の手順で復号して確かめる）", async () => {
  const ua = crypto.createECDH("prime256v1");
  ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const payload = JSON.stringify(webBookingMessage(reservation, "あさみ"));
  const body = await encryptPayload({ p256dh: base64UrlEncode(ua.getPublicKey()), auth: base64UrlEncode(auth) }, new TextEncoder().encode(payload));

  // 受け取る側の手順（salt 16 / rs 4 / idlen 1 / 送信側の公開鍵 65 / 暗号文）
  const salt = body.subarray(0, 16);
  const asPublic = body.subarray(21, 21 + body[20]);
  const ciphertext = body.subarray(21 + body[20]);
  const hmac = (key: Uint8Array, data: Uint8Array) => crypto.createHmac("sha256", key).update(data).digest();
  const hkdf = (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => hmac(hmac(s, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, len);
  const ecdh = ua.computeSecret(asPublic);
  const ikm = hkdf(auth, ecdh, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  assert.equal(plain.at(-1), 2);
  assert.equal(plain.subarray(0, -1).toString("utf8"), payload);
});

test("VAPIDの署名はプッシュサービスの origin 宛てで、公開鍵で検証できる", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pub = base64UrlEncode(publicKey.export({ format: "der", type: "spki" }).subarray(-65));
  const header = await vapidAuthorization("https://web.push.apple.com/QGuK1b", {
    publicKey: pub,
    privateKeyJwk: privateKey.export({ format: "jwk" }),
    subject: "https://enka-salon.jp",
  });
  const [, token, key] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
  const [h, c, s] = token.split(".");
  assert.equal(key, pub);
  assert.equal(JSON.parse(Buffer.from(base64UrlDecode(c)).toString()).aud, "https://web.push.apple.com");
  assert.ok(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, base64UrlDecode(s)));
});
