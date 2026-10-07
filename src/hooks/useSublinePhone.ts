// 電話（SUBLINE）連携の状態と発信。設定は RPC get_subline_settings（トークンは「登録済み」かどうかだけ）。
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStore } from "@/hooks/useAdminStore";
import { isLikelyPhoneDevice } from "@/lib/sublinePhone";

export interface SublineSettings {
  token_registered: boolean;
  can_manage: boolean;
  token_set_at: string | null;
  member_account_code: string | null;
  member_name: string | null;
  member_number: string | null;
  last_checked_at: string | null;
  last_check_ok: boolean | null;
  last_check_message: string | null;
}

export interface SublineMemberView {
  account_code: string;
  account_name: string;
  group_name: string;
  number: string;
  linked: boolean;
}

const settingsCache = new Map<string, Promise<SublineSettings | null>>();

export async function loadSublineSettings(storeId: string, fresh = false) {
  if (fresh) settingsCache.delete(storeId);
  if (!settingsCache.has(storeId)) {
    settingsCache.set(storeId, (async () => {
      const { data, error } = await supabase.rpc("get_subline_settings" as never, { p_store_id: storeId } as never);
      if (error) {
        settingsCache.delete(storeId);
        return null;
      }
      return data as unknown as SublineSettings;
    })());
  }
  return settingsCache.get(storeId)!;
}

/** Edge Function subline を呼ぶ（エラーは Error で返す） */
export async function invokeSubline<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("subline", { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      const detail = await context.json().catch(() => null) as { error?: string } | null;
      if (detail?.error) message = detail.error;
    }
    throw new Error(message);
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

export function useSublinePhone() {
  const { store } = useAdminStore();
  const storeId = store?.id ?? null;
  const [settings, setSettings] = useState<SublineSettings | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void loadSublineSettings(storeId).then((value) => {
      if (!cancelled) setSettings(value);
    });
    return () => { cancelled = true; };
  }, [storeId]);

  const call = useCallback(async (phone: string, name?: string, callId?: string) => {
    if (!storeId) throw new Error("店舗が読み込めていません");
    return invokeSubline<{ ok: boolean; member: string }>({ action: "call", storeId, phone, name: name ?? "", callId: callId ?? "" });
  }, [storeId]);

  const phoneDevice = typeof navigator !== "undefined" && isLikelyPhoneDevice(navigator.userAgent);
  return { storeId, settings, enabled: Boolean(settings?.token_registered), phoneDevice, call };
}
