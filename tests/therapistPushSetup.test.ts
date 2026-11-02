import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { therapistPushSetupStep } from "../src/lib/therapistPushSetup.ts";

const unregistered = {
  devices: 0,
  thisDevice: false,
  thisDeviceTestConfirmed: false,
  setupComplete: false,
};

test("1台目が未登録なら通知をオンにする欄を表示する", () => {
  assert.equal(therapistPushSetupStep(unregistered), "enable");
});

test("1台目が設定完了していても、未登録の2台目には通知設定欄を表示する", () => {
  const secondPhone = { ...unregistered, devices: 1, setupComplete: true };
  assert.equal(therapistPushSetupStep(secondPhone), "enable");
});

test("登録した2台目は、1台目の確認状態に関係なくテスト受取確認欄を表示する", () => {
  for (const setupComplete of [false, true]) {
    const secondPhone = { ...unregistered, devices: 2, thisDevice: true, setupComplete };
    assert.equal(therapistPushSetupStep(secondPhone), "confirm");
  }
});

test("このスマホで通知がオンかつ受取確認済みの場合だけ設定欄を隠す", () => {
  for (const setupComplete of [false, true]) {
    const confirmedPhone = { ...unregistered, devices: 2, thisDevice: true, thisDeviceTestConfirmed: true, setupComplete };
    assert.equal(therapistPushSetupStep(confirmedPhone), "complete");
  }
});

test("通知許可の取消や登録解除後は、過去に確認済みでも設定欄を再表示する", () => {
  const revokedPhone = { ...unregistered, devices: 2, thisDeviceTestConfirmed: true, setupComplete: true };
  assert.equal(therapistPushSetupStep(revokedPhone), "enable");
});

test("2台のスマホはそれぞれ独立して登録・確認を完了できる", () => {
  const firstPhone = { ...unregistered, devices: 1, thisDevice: true, thisDeviceTestConfirmed: true, setupComplete: true };
  let secondPhone = { ...unregistered, devices: 1, setupComplete: true };
  assert.equal(therapistPushSetupStep(firstPhone), "complete");
  assert.equal(therapistPushSetupStep(secondPhone), "enable");

  secondPhone = { ...secondPhone, devices: 2, thisDevice: true };
  assert.equal(therapistPushSetupStep(secondPhone), "confirm");
  assert.equal(therapistPushSetupStep(firstPhone), "complete");

  secondPhone = { ...secondPhone, thisDeviceTestConfirmed: true };
  assert.equal(therapistPushSetupStep(secondPhone), "complete");
  assert.equal(therapistPushSetupStep(firstPhone), "complete");
});

test("通知カードは端末別の判定を使い、全端末共通の完了状態では隠さない", async () => {
  const source = await readFile(new URL("../src/components/therapist/TherapistPushCard.tsx", import.meta.url), "utf8");
  assert.match(source, /therapistPushSetupStep\(status\)/);
  assert.match(source, /setupStep === "complete"/);
  assert.match(source, /setupStep === "confirm"/);
  assert.doesNotMatch(source, /status\.setupComplete/);
  assert.match(source, /1台ずつ通知をオンにしてください/);
});
