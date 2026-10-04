import assert from "node:assert/strict";
import test from "node:test";

import {
  codeDigits,
  dialMoves,
  isVideoFile,
  keypadPosition,
  keypadSequence,
  normalizeKeyType,
  normalizeRouteSteps,
  normalizeWifiSecurity,
  wifiQrPayload,
} from "../src/lib/roomEntry.ts";

test("番号は数字だけを順に取り出す（全角・区切りも可）", () => {
  assert.deepEqual(codeDigits("12-34"), ["1", "2", "3", "4"]);
  assert.deepEqual(codeDigits("５６７８"), ["5", "6", "7", "8"]);
  assert.deepEqual(codeDigits(null), []);
  assert.deepEqual(codeDigits("なし"), []);
});

test("テンキーは数字を押したあと ✓ を押す", () => {
  assert.deepEqual(keypadSequence("3051").map((press) => press.key), ["3", "0", "5", "1", "check"]);
  assert.deepEqual(keypadSequence(""), []);
});

test("SwitchBot キーパッドのボタンの位置", () => {
  assert.deepEqual(keypadPosition("1"), { row: 0, col: 0 });
  assert.deepEqual(keypadPosition("0"), { row: 4, col: 1 });
  assert.deepEqual(keypadPosition("9"), { row: 4, col: 0 });
  assert.deepEqual(keypadPosition("check"), { row: 5, col: 1 });
  assert.equal(keypadPosition("x"), null);
});

test("ダイヤルは近い向きに回す", () => {
  assert.deepEqual(dialMoves("0000", "3807"), [
    { from: 0, to: 3, steps: 3 },
    { from: 0, to: 8, steps: -2 },
    { from: 0, to: 0, steps: 0 },
    { from: 0, to: 7, steps: -3 },
  ]);
  // 戻すとき
  assert.deepEqual(dialMoves("3807", "0000").map((move) => move.steps), [-3, 2, 0, 3]);
  // 戻す番号が無ければ 0 から
  assert.deepEqual(dialMoves(null, "12").map((move) => move.steps), [1, 2]);
});

test("鍵の種類は決まった値だけ", () => {
  assert.equal(normalizeKeyType("keypad"), "keypad");
  assert.equal(normalizeKeyType("dial_lock"), "dial_lock");
  assert.equal(normalizeKeyType("other"), null);
  assert.equal(normalizeKeyType(null), null);
});

test("道順は空のステップを外し、寄る位置を範囲内にそろえる", () => {
  const steps = normalizeRouteSteps([
    { image_url: "https://example.com/a.jpg", text: "建物の横", focus: { x: 120, y: -5, zoom: 9 } },
    { text: "  " },
    { video_url: "https://example.com/b.mp4" },
    "壊れた値",
    { text: "奥へ", focus: { x: "a", y: 3 } },
  ]);
  assert.equal(steps.length, 3);
  assert.deepEqual(steps[0].focus, { x: 100, y: 0, zoom: 4 });
  assert.equal(steps[1].video_url, "https://example.com/b.mp4");
  assert.equal(steps[2].focus, null);
  assert.deepEqual(normalizeRouteSteps(null), []);
});

test("動画のファイルを見分ける", () => {
  assert.equal(isVideoFile({ type: "video/quicktime", name: "a.MOV" }), true);
  assert.equal(isVideoFile({ type: "", name: "route.mp4" }), true);
  assert.equal(isVideoFile({ type: "image/jpeg", name: "a.jpg" }), false);
});

test("Wi-Fi の QR コードは記号をエスケープする", () => {
  assert.equal(wifiQrPayload({ ssid: "Room-5G", password: "pass;word", security: "WPA" }), "WIFI:T:WPA;S:Room-5G;P:pass\\;word;;");
  assert.equal(wifiQrPayload({ ssid: 'a"b:c', password: "x\\y,z", security: "WEP" }), 'WIFI:T:WEP;S:a\\"b\\:c;P:x\\\\y\\,z;;');
  // パスワードなし
  assert.equal(wifiQrPayload({ ssid: "Free", password: "", security: "WPA" }), "WIFI:T:nopass;S:Free;;");
  assert.equal(wifiQrPayload({ ssid: "Hidden", password: "p", hidden: true }), "WIFI:T:WPA;S:Hidden;P:p;H:true;;");
  assert.equal(normalizeWifiSecurity("nopass"), "nopass");
  assert.equal(normalizeWifiSecurity("???"), "WPA");
});
