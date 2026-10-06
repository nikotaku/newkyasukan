// セラピストのマイページ：承認された精算と、不足分の受け取り方（振込・次回出勤日に相殺）・振込先。
// 読み書きは本人のトークンで RPC（get_therapist_settlements / choose_therapist_shortage_method /
// mark_therapist_settlement_seen / save_therapist_bank_account）。

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BankAccountInput, ShortageMethod } from "@/lib/settlementApproval";

export interface TherapistSettlement {
  id: string;
  date: string;
  salary_amount: number;
  cash_sales: number;
  shortage_amount: number;
  shortage_method: ShortageMethod | null;
  shortage_method_at: string | null;
  shortage_settled_at: string | null;
  shortage_settled_note: string | null;
  receipt: unknown;
  approved_at: string;
  therapist_seen_at: string | null;
  payout_method: string | null;
}

export interface TherapistBankAccount {
  bank_name: string;
  branch_name: string;
  account_type: string;
  account_last4: string;
  account_holder: string;
  updated_at: string;
}

export interface TherapistSettlementData {
  bank_account: TherapistBankAccount | null;
  settlements: TherapistSettlement[];
}

const callRpc = (name: string, args: Record<string, unknown>) => supabase.rpc(name as never, args as never);

export function useTherapistSettlements(token: string | undefined) {
  const [data, setData] = useState<TherapistSettlementData | null>(null);
  const reload = useCallback(async () => {
    if (!token) return;
    const { data: result, error } = await callRpc("get_therapist_settlements", { p_token: token });
    if (error) {
      console.error("精算を読めませんでした", error);
      return;
    }
    setData((result as unknown as TherapistSettlementData | null) ?? { bank_account: null, settlements: [] });
  }, [token]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, reload };
}

/** 本人がまだ何かすること・見ることがある精算（新しい承認、不足分の受け取り方、振込先） */
export function settlementNeedsAttention(settlement: TherapistSettlement, hasBankAccount: boolean) {
  if (!settlement.therapist_seen_at) return true;
  if (settlement.shortage_amount <= 0 || settlement.shortage_settled_at) return false;
  return !settlement.shortage_method || (settlement.shortage_method === "transfer" && !hasBankAccount);
}

export async function chooseShortageMethod(token: string, clearanceId: string, method: ShortageMethod) {
  const { error } = await callRpc("choose_therapist_shortage_method", { p_token: token, p_clearance_id: clearanceId, p_method: method });
  if (error) throw new Error(error.message);
}

export async function markSettlementSeen(token: string, clearanceId: string) {
  const { error } = await callRpc("mark_therapist_settlement_seen", { p_token: token, p_clearance_id: clearanceId });
  if (error) throw new Error(error.message);
}

export async function saveBankAccount(token: string, account: BankAccountInput) {
  const { data, error } = await callRpc("save_therapist_bank_account", {
    p_token: token,
    p_bank_name: account.bank_name,
    p_branch_name: account.branch_name,
    p_account_type: account.account_type,
    p_account_number: account.account_number,
    p_account_holder: account.account_holder,
  });
  if (error) throw new Error(error.message);
  return data as unknown as TherapistBankAccount;
}
