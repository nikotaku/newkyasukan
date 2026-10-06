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
    { label: "前回の不足分（10/1）", amount: 3_000, kind: "salary_addition", source_clearance_id: "a" },
    { label: "前回の不足分（10/5）", amount: 6_000, kind: "salary_addition", source_clearance_id: "b" },
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
