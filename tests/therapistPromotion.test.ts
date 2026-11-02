import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  groupPromotionPostings,
  promotionDate,
  promotionPlanUrl,
  promotionPostingProgress,
  promotionReportedAt,
  type TherapistPromotionPlan,
  type TherapistPromotionTask,
} from "../src/lib/therapistPromotion.ts";

const posting: TherapistPromotionTask = {
  id: "task-1",
  taskType: "posting",
  scheduledOn: "2026-11-03",
  groupLabel: "初回告知",
  label: "本人X：お知らせ",
  isCompleted: false,
  completedAt: null,
  storeCompleted: true,
  sortOrder: 10,
};
const plan: TherapistPromotionPlan = {
  id: "plan-1",
  title: "11月の告知",
  therapistLabel: "花宮みれい",
  description: null,
  startsOn: "2026-11-03",
  endsOn: "2026-11-10",
  tasks: [posting],
  channels: [],
};

test("投稿日・グループ別にまとめ、準備タスクと混ぜず日付と表示順で並べる", () => {
  const rows = [
    { ...posting, id: "later", scheduledOn: "2026-11-04" },
    { ...posting, id: "second", sortOrder: 20 },
    { ...posting, id: "prep", taskType: "preparation" },
    { ...posting, id: "undated", scheduledOn: null },
    posting,
  ];
  const groups = groupPromotionPostings(rows);
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups[0].tasks.map((task) => task.id),
    ["task-1", "second"],
  );
  assert.equal(groups[1].date, "2026-11-04");
  assert.equal(groups[2].date, null);
  assert.equal(rows[0].id, "later", "元の配列の順序を変えない");
});

test("店舗の完了だけでは本人の投稿報告を完了にせず、準備物は投稿件数に含めない", () => {
  const plans = [
    {
      ...plan,
      tasks: [
        posting,
        { ...posting, id: "prep", taskType: "preparation", isCompleted: true },
      ],
    },
  ];
  assert.deepEqual(promotionPostingProgress(plans), { total: 1, completed: 0 });
  assert.deepEqual(
    promotionPostingProgress([
      { ...plan, tasks: [{ ...posting, isCompleted: true }] },
    ]),
    { total: 1, completed: 1 },
  );
  assert.deepEqual(promotionPostingProgress([]), { total: 0, completed: 0 });
});

test("日付と報告日時を日本時間で表示する", () => {
  assert.equal(promotionDate(null), "日付未設定");
  assert.equal(promotionDate("invalid"), "日付未設定");
  assert.match(promotionDate("2026-11-03"), /11\/3.*火/);
  assert.match(promotionReportedAt("2026-11-02T15:05:00Z"), /11\/3.*00:05/);
  assert.equal(promotionReportedAt("invalid"), "");
});

test("通知から企画スケジュールの対象計画へ移動するURLを生成する", () => {
  assert.equal(
    promotionPlanUrl("abc-123"),
    "/promotion-schedule?tab=plans&plan=abc-123",
  );
  assert.equal(
    promotionPlanUrl("a&tab=quota"),
    "/promotion-schedule?tab=plans&plan=a%26tab%3Dquota",
  );
});

test("マイページの入口と直接リンクが新しい投稿報告画面につながる", async () => {
  const portal = await readFile(
    new URL("../src/pages/TherapistPortal.tsx", import.meta.url),
    "utf8",
  );
  assert.match(portal, /title: "投稿宣伝スケジュール"/);
  assert.match(portal, /requested === "promotion"/);
  assert.match(portal, /<TherapistPromotionSummary token=\{token\}/);
  assert.match(portal, /<TherapistPromotionSchedule token=\{token\}/);
  assert.doesNotMatch(portal, /get_therapist_growth_stats|fetchPromotionPlans/);
});

test("投稿しましたはチェックボックスで本人のRPCへ保存し、同じタスクの二重操作を防ぐ", async () => {
  const [component, hook] = await Promise.all([
    readFile(
      new URL(
        "../src/components/therapist/TherapistPromotionSchedule.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/hooks/useTherapistPromotion.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(component, /type="checkbox"/);
  assert.match(component, /checked=\{task\.isCompleted\}/);
  assert.match(component, /busyIds\.current\.has\(task\.id\)/);
  assert.match(component, /disabled=\{savingIds\.has\(task\.id\)\}/);
  assert.match(
    component,
    /await completeTherapistPromotionTask\(\s*token,\s*task\.id,\s*completed,?\s*\)/,
  );
  assert.match(component, /if \(saved !== completed\)\s*throw new Error/);
  assert.match(component, /投稿しました/);
  assert.match(hook, /"get_therapist_promotion_schedule"/);
  assert.match(hook, /"complete_therapist_promotion_task"/);
});

test("管理画面の通知ベル・報告一覧・確認済み処理が接続されている", async () => {
  const [header, schedule, reports, hook] = await Promise.all([
    readFile(
      new URL("../src/components/DashboardHeader.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/pages/PromotionSchedule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/promotion/TherapistPromotionReports.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/hooks/useTherapistPromotion.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    header,
    /<TherapistPromotionReportAlert storeId=\{adminStore\?\.id\}/,
  );
  assert.match(schedule, /<TherapistPromotionReports storeId=/);
  assert.match(schedule, /previous\.has\(requestedPlan\)/);
  assert.match(
    schedule,
    /if \(value !== "plans"\)[\s\S]*next\.delete\("plan"\)/,
  );
  assert.match(reports, /確認済みにする/);
  assert.match(hook, /"get_therapist_promotion_reports"/);
  assert.match(hook, /"mark_therapist_promotion_report_seen"/);
  assert.match(hook, /enabled: Boolean\(storeId && user\)/);
});
