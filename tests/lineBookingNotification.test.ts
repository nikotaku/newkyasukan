import assert from "node:assert/strict";
import test from "node:test";

import {
  lineErrorCode,
  resolveLineBookingRoutes,
} from "../supabase/functions/notify-line-booking/lineBookingRoutes.ts";
import { parseBookingDestinationCommand } from "../supabase/functions/line-booking-webhook/bookingDestinationCommand.ts";

test("予約通知専用アカウントを先に、メインアカウントを予備にする", () => {
  const { routes, missingCode } = resolveLineBookingRoutes({
    bookingToken: "booking-token",
    bookingGroupId: "booking-group",
    mainToken: "main-token",
    mainGroupId: "main-group",
  });
  assert.equal(missingCode, null);
  assert.deepEqual(routes.map((route) => [route.account, route.token, route.groupId]), [
    ["booking", "booking-token", "booking-group"],
    ["main", "main-token", "main-group"],
  ]);
});

test("専用アカウントの送信先が未登録ならメインアカウントだけで送る", () => {
  const { routes } = resolveLineBookingRoutes({
    bookingToken: "booking-token",
    bookingGroupId: null,
    mainToken: "main-token",
    mainGroupId: "main-group",
  });
  assert.deepEqual(routes.map((route) => route.account), ["main"]);
});

test("専用アカウント未設定なら従来どおりメインアカウントで送る", () => {
  const { routes } = resolveLineBookingRoutes({
    mainToken: "main-token",
    mainGroupId: "main-group",
  });
  assert.deepEqual(routes.map((route) => route.account), ["main"]);
});

test("送れる経路がないときは原因を返す", () => {
  assert.equal(resolveLineBookingRoutes({}).missingCode, "line_token_missing");
  assert.equal(
    resolveLineBookingRoutes({ mainToken: "main-token", bookingToken: "booking-token" }).missingCode,
    "line_destination_missing",
  );
});

test("エラーコードはアカウントごとに区別し、メインは従来の形式を保つ", () => {
  assert.equal(lineErrorCode("main", "http_429"), "line_http_429");
  assert.equal(lineErrorCode("booking", "http_429"), "line_booking_http_429");
});

test("予約通知登録コマンドを店舗ごとに解釈する", () => {
  assert.deepEqual(parseBookingDestinationCommand("予約通知登録"), {
    kind: "register",
    storeId: "404499ab-5350-490f-9608-5814faffda6f",
    storeLabel: "艶華",
  });
  assert.deepEqual(parseBookingDestinationCommand(" 予約通知登録\u3000全力 "), {
    kind: "register",
    storeId: "00000000-0000-0000-0000-000000000001",
    storeLabel: "全力",
  });
  assert.deepEqual(parseBookingDestinationCommand("予約通知登録 本店"), {
    kind: "unknown_store",
    storeName: "本店",
  });
  assert.equal(parseBookingDestinationCommand("通知先登録"), null);
  assert.equal(parseBookingDestinationCommand("予約通知登録してください"), null);
});
