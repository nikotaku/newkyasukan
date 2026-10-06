// 日別精算の承認（管理画面）。承認した精算と不足分（settlement_approvals）、セラピストの振込先（cast_bank_accounts）。
// 承認は RPC approve_daily_settlement（セラピストのマイページへの通知もここで積む）。

import { supabase } from "@/integrations/supabase/client";
import type { ShortageMethod } from "@/lib/settlementApproval";
import type { TherapistNotificationStatus } from "@/lib/therapistNotifications";

export interface SettlementApprovalRow {
  clearance_id: string;
  cast_id: string;
  date: string;
  salary_amount: number;
  cash_sales: number;
  shortage_amount: number;
  shortage_method: ShortageMethod | null;
  shortage_method_at: string | null;
  shortage_settled_at: string | null;
  shortage_settled_note: string | null;
  approved_at: string;
  therapist_seen_at: string | null;
  casts?: { name: string } | null;
}

export interface CastBankAccountRow {
  cast_id: string;
  bank_name: string;
  branch_name: string;
  account_type: string;
  account_number: string;
  account_holder: string;
  updated_at: string;
}

export interface SettlementNoticeRow {
  status: TherapistNotificationStatus;
  channel: "push" | "line" | null;
  clearance_id: string;
  created_at: string;
}

const APPROVAL_COLUMNS =
  "clearance_id,cast_id,date,salary_amount,cash_sales,shortage_amount,shortage_method,shortage_method_at,shortage_settled_at,shortage_settled_note,approved_at,therapist_seen_at";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** その日に承認した精算（セラピストごと） */
export async function loadDayApprovals(date: string) {
  const { data, error } = await supabase
    .from("settlement_approvals" as never)
    .select(APPROVAL_COLUMNS)
    .eq("date", date);
  fail(error);
  return (data ?? []) as unknown as SettlementApprovalRow[];
}

/** まだ払っていない不足分（全部の日。新しい順） */
export async function loadOutstandingShortages() {
  const { data, error } = await supabase
    .from("settlement_approvals" as never)
    .select(`${APPROVAL_COLUMNS},casts(name)`)
    .gt("shortage_amount", 0)
    .is("shortage_settled_at", null)
    .order("date", { ascending: false })
    .limit(100);
  fail(error);
  return (data ?? []) as unknown as SettlementApprovalRow[];
}

export async function loadBankAccounts(castIds: string[]) {
  if (!castIds.length) return [] as CastBankAccountRow[];
  const { data, error } = await supabase
    .from("cast_bank_accounts" as never)
    .select("cast_id,bank_name,branch_name,account_type,account_number,account_holder,updated_at")
    .in("cast_id", castIds);
  fail(error);
  return (data ?? []) as unknown as CastBankAccountRow[];
}

/** マイページへの「精算が承認されました」の届き具合（承認ごとに最新の1件） */
export async function loadSettlementNotices(clearanceIds: string[]) {
  if (!clearanceIds.length) return new Map<string, SettlementNoticeRow>();
  const { data, error } = await supabase
    .from("therapist_notifications" as never)
    .select("status,channel,created_at,clearance_id:snapshot->>clearance_id")
    .eq("kind", "settlement")
    .in("snapshot->>clearance_id", clearanceIds)
    .order("created_at", { ascending: false });
  fail(error);
  const latest = new Map<string, SettlementNoticeRow>();
  for (const row of (data ?? []) as unknown as SettlementNoticeRow[]) {
    if (!latest.has(row.clearance_id)) latest.set(row.clearance_id, row);
  }
  return latest;
}

export async function approveDailySettlement(input: {
  castId: string;
  date: string;
  salary: number;
  cashSales: number;
  receipt: unknown;
  offsetClearanceIds: string[];
}) {
  const { data, error } = await supabase.rpc("approve_daily_settlement" as never, {
    p_cast_id: input.castId,
    p_date: input.date,
    p_salary: Math.round(input.salary),
    p_cash_sales: Math.round(input.cashSales),
    p_receipt: input.receipt,
    p_offset_clearance_ids: input.offsetClearanceIds,
  } as never);
  fail(error);
  return data as unknown as { clearance_id: string; shortage_amount: number };
}

export async function markShortagePaid(clearanceId: string, paid = true) {
  const { error } = await supabase.rpc("mark_settlement_shortage_paid" as never, {
    p_clearance_id: clearanceId,
    p_paid: paid,
  } as never);
  fail(error);
}

export function bankAccountLine(account: Pick<CastBankAccountRow, "bank_name" | "branch_name" | "account_type" | "account_number" | "account_holder">) {
  return `${account.bank_name} ${account.branch_name} ${account.account_type} ${account.account_number} ${account.account_holder}`;
}

/** マイページへのお知らせがどうなったか */
export function settlementNoticeLabel(notice: SettlementNoticeRow | null | undefined) {
  if (!notice) return "";
  switch (notice.status) {
    case "queued":
    case "sending":
      return "マイページに通知中";
    case "sent":
      return notice.channel === "line" ? "本人のLINEに通知済み" : "マイページに通知済み";
    case "skipped":
      return "スマホ通知は未設定（マイページを開くと見られます）";
    default:
      return "通知できませんでした（マイページを開くと見られます）";
  }
}
