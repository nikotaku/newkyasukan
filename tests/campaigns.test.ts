import assert from "node:assert/strict";
import test from "node:test";
import { campaignDaysLeft, campaignPeriodLabel, campaignStatus, sortCampaigns, todayJst, validateCampaign } from "../src/lib/campaigns.ts";

const base = { id: "x", name: "a", details: null, notes: null, discount_id: null, archived_at: null, display_order: 0 };

test("期間とアーカイブで状態を出す", () => {
  const today = "2026-11-18";
  assert.equal(campaignStatus({ start_date: "2026-11-01", end_date: "2026-11-30", archived_at: null }, today), "running");
  assert.equal(campaignStatus({ start_date: "2026-11-18", end_date: "2026-11-18", archived_at: null }, today), "running");
  assert.equal(campaignStatus({ start_date: "2026-12-01", end_date: null, archived_at: null }, today), "upcoming");
  assert.equal(campaignStatus({ start_date: "2026-10-01", end_date: "2026-11-17", archived_at: null }, today), "ended");
  assert.equal(campaignStatus({ start_date: null, end_date: null, archived_at: null }, today), "running");
  assert.equal(campaignStatus({ start_date: "2026-11-01", end_date: "2026-11-30", archived_at: "2026-11-10T00:00:00Z" }, today), "archived");
});

test("期間の書き方・残りの日数", () => {
  assert.equal(campaignPeriodLabel({ start_date: "2026-11-01", end_date: "2026-11-30" }), "2026/11/1 〜 2026/11/30");
  assert.equal(campaignPeriodLabel({ start_date: "2026-11-01", end_date: null }), "2026/11/1 〜 （期限なし）");
  assert.equal(campaignPeriodLabel({ start_date: null, end_date: null }), "期間の決まりなし");
  assert.equal(campaignDaysLeft({ end_date: "2026-11-20" }, "2026-11-18"), 2);
  assert.equal(campaignDaysLeft({ end_date: "2026-11-18" }, "2026-11-18"), 0);
  assert.equal(campaignDaysLeft({ end_date: "2026-11-17" }, "2026-11-18"), null);
});

test("入力の確かめ・並び順・日本時間の今日", () => {
  assert.equal(validateCampaign({ name: " ", start_date: "", end_date: "" }), "キャンペーンの名前を入れてください");
  assert.match(validateCampaign({ name: "a", start_date: "2026-12-01", end_date: "2026-11-01" }) ?? "", /前/);
  assert.equal(validateCampaign({ name: "a", start_date: "", end_date: "" }), null);
  const rows = [
    { ...base, id: "archived", start_date: null, end_date: null, archived_at: "2026-01-01" },
    { ...base, id: "ended", start_date: "2026-01-01", end_date: "2026-01-31" },
    { ...base, id: "running", start_date: "2026-11-01", end_date: null },
    { ...base, id: "upcoming", start_date: "2026-12-01", end_date: null },
  ];
  assert.deepEqual(sortCampaigns(rows, "2026-11-18").map((row) => row.id), ["running", "upcoming", "ended", "archived"]);
  assert.equal(todayJst(new Date("2026-11-18T16:00:00Z")), "2026-11-19");
});
