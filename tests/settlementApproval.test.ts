import assert from "node:assert/strict";
import test from "node:test";

import {
  maskedAccountNumber,
  normalizeBankAccount,
  offsetClearanceIds,
  offsetItemsFor,
  settlementAnnouncement,
  settlementCashToDeposit,
  settlementShortage,
} from "../src/lib/settlementApproval.ts";
import {
  combineClearanceExtraItems,
  splitClearanceExtraItems,
  splitSalaryAdjustments,
} from "../src/lib/clearanceExtraItems.ts";

test("現金預かりが給与に足りない分が不足分", () => {
  assert.equal(settlementShortage(20_000, 26_000), 6_000);
  assert.equal(settlementShortage(30_000, 26_000), 0);
  assert.equal(settlementCashToDeposit(30_000, 26_000), 4_000);
  assert.equal(settlementCashToDeposit(20_000, 26_000), 0);
});

test("不足分があるときだけ振込・相殺のお知らせ", () => {
  assert.equal(settlementAnnouncement(6_000).shortageText, "不足分 ¥6,000 は、振込もしくは次回出勤日の相殺になります");
  assert.equal(settlementAnnouncement(0).shortageText, null);
});

test("相殺を選んだ前回の不足分を、今回の給与に上乗せする", () => {
  const items = offsetItemsFor([
    { clearance_id: "b", date: "2026-10-05", shortage_amount: 6_000 },
    { clearance_id: "a", date: "2026-10-01", shortage_amount: 3_000 },
    { clearance_id: "c", date: "2026-10-02", shortage_amount: 0 },
  ]);
  assert.deepEqual(items, [
    { label: "前回の不足分（10/1）", amount: 3_000, kind: "shortage_offset", source_clearance_id: "a" },
    { label: "前回の不足分（10/5）", amount: 6_000, kind: "shortage_offset", source_clearance_id: "b" },
  ]);
  assert.deepEqual(
    offsetClearanceIds([...items, { label: "追加", amount: 1_000, kind: "salary_addition" }, { ...items[0], amount: 0, source_clearance_id: "z" }]),
    ["a", "b"],
  );
});

test("振込先：口座番号は7桁、名義はカタカナにそろえる", () => {
  const result = normalizeBankAccount({
    bank_name: " 七十七銀行 ",
    branch_name: "本店",
    account_type: "普通",
    account_number: "１２３-45",
    account_holder: "やまだ はなこ",
  });
  assert.deepEqual(result, {
    ok: true,
    value: {
      bank_name: "七十七銀行",
      branch_name: "本店",
      account_type: "普通",
      account_number: "0012345",
      account_holder: "ヤマダ　ハナコ",
    },
  });
  assert.equal(normalizeBankAccount({ ...baseAccount, account_holder: "Yamada" }).ok, false);
  assert.equal(normalizeBankAccount({ ...baseAccount, account_number: "12a" }).ok, false);
  assert.equal(normalizeBankAccount({ ...baseAccount, account_type: "定期" }).ok, false);
  assert.equal(maskedAccountNumber("2345"), "＊＊＊2345");
  assert.equal(maskedAccountNumber(null), "");
});

const baseAccount = {
  bank_name: "七十七銀行",
  branch_name: "本店",
  account_type: "普通",
  account_number: "1234567",
  account_holder: "ヤマダ　ハナコ",
};

test("追加支給は経費、不足分の相殺は利益に入れない（保存しても種類が残る）", () => {
  const saved = combineClearanceExtraItems(
    [{ label: "備品", amount: 500, kind: "deduction" }],
    [
      { label: "講習手当", amount: 10_000, kind: "salary_addition" },
      { label: "給与不足分", amount: 4_000, kind: "shortage_offset" },
      { label: "前回の不足分（10/1）", amount: 3_000, kind: "salary_addition", source_clearance_id: "a" },
    ],
  );
  assert.deepEqual(saved.map((item) => item.kind), ["deduction", "salary_addition", "shortage_offset", "shortage_offset"]);

  const { deductions, salaryAdditions } = splitClearanceExtraItems(saved);
  assert.equal(deductions.length, 1);
  const split = splitSalaryAdjustments(salaryAdditions);
  assert.equal(split.additionTotal, 10_000);
  assert.equal(split.offsetTotal, 7_000);
});

test("手で入れた不足分の相殺の行は、まだ払っていない不足分に古い順に当てる", () => {
  const outstanding = [
    { clearance_id: "x", date: "2026-10-09", shortage_amount: 5_000 },
    { clearance_id: "w", date: "2026-10-08", shortage_amount: 3_000 },
  ];
  const manual = [{ label: "給与不足分", amount: 8_000, kind: "shortage_offset" as const }];
  assert.deepEqual(offsetClearanceIds(manual, outstanding).sort(), ["w", "x"]);
  // 足りないときは払いきれる分だけ
  assert.deepEqual(offsetClearanceIds([{ ...manual[0], amount: 4_000 }], outstanding), ["w"]);
  // 追加支給は当てない
  assert.deepEqual(offsetClearanceIds([{ label: "講習手当", amount: 8_000, kind: "salary_addition" }], outstanding), []);
});
