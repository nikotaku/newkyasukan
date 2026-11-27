import test from "node:test";
import assert from "node:assert/strict";
import { allocationSchedule, allocationForMonth, distribution, capitalReturnSchedule, nextBankBusinessDay } from "../src/lib/contractProfit.ts";
test("350000 yen over 24 months, final residual and repeatability", () => {
  const rows = allocationSchedule(350000, 24, "2026-12");
  assert.equal(rows.length, 24);
  assert.ok(rows.slice(0, 23).every(r => r.amount === 14583));
  assert.deepEqual(rows[23], { month: "2028-11", amount: 14591 });
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 350000);
  assert.deepEqual(rows, allocationSchedule(350000, 24, "2026-12"));
  assert.equal(allocationForMonth(350000, 24, null, "2026-12"), 0);
  assert.equal(allocationForMonth(350000, 24, "2026-12", "2028-12"), 0);
});
test("profit split, principal deduction and capital return independence", () => {
  const result = distribution({sales:3000000,ordinaryExpenses:2000000,allocation:14583,paidLoanPrincipal:200000,investorEligible:true});
  assert.deepEqual(result,{distributableProfit:785417,investor:235625,operator:549792});
  assert.equal(result.investor + 35000, 270625);
  assert.equal(distribution({sales:1,ordinaryExpenses:0,allocation:0,paidLoanPrincipal:0,investorEligible:true}).operator,1);
});
test("loss and eligibility", () => {
  assert.deepEqual(distribution({sales:0,ordinaryExpenses:100,allocation:0,paidLoanPrincipal:0,investorEligible:true}),{distributableProfit:-100,investor:0,operator:0});
  assert.equal(distribution({sales:1000,ordinaryExpenses:0,allocation:0,paidLoanPrincipal:0,investorEligible:false}).investor,0);
  assert.equal(distribution({sales:1000,ordinaryExpenses:0,allocation:0,paidLoanPrincipal:0,investorEligible:true}).investor,300);
});
test("capital return starts two months after receipt; three installments only", () => {
  assert.deepEqual(capitalReturnSchedule("2026-11-24",105000,3),[
    {month:"2027-01",amount:35000,nominalDueDate:"2027-01-15"},
    {month:"2027-02",amount:35000,nominalDueDate:"2027-02-15"},
    {month:"2027-03",amount:35000,nominalDueDate:"2027-03-15"}]);
  assert.deepEqual(capitalReturnSchedule(null,105000,3),[]);
  assert.equal(nextBankBusinessDay("2026-11-15",new Set(["2026-11-16"])),"2026-11-17");
});
