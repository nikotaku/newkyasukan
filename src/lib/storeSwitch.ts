import { supabase } from "@/integrations/supabase/client";

/**
 * 管理画面の店舗切替。各店舗は専用アカウント（同一パスワード）に紐付いており、
 * トグルで「相手店舗のアカウントに再ログイン → リロード」して切り替える。
 * RLS（store_isolation）が店舗ごとにデータを分離するため、混在は起きない。
 */

export const ZENRYOKU_STORE_ID = "00000000-0000-0000-0000-000000000001";
export const ENKA_STORE_ID = "404499ab-5350-490f-9608-5814faffda6f";

export interface StoreDef {
  id: string;
  name: string;
  short: string; // ロゴ代わりの短縮表記（艶華="艶"）
  email: string;
}

export const STORE_DEFS: StoreDef[] = [
  { id: ZENRYOKU_STORE_ID, name: "全力エステ", short: "ZR", email: "saito.crow@gmail.com" },
  { id: ENKA_STORE_ID, name: "艶華", short: "艶", email: "saito.crow+enka@gmail.com" },
];

export function otherStore(currentId: string): StoreDef | null {
  return STORE_DEFS.find((s) => s.id !== currentId) ?? null;
}

/** 相手店舗のアカウントへ再ログインしてリロード。パスワードが無ければ /login へ誘導。 */
export async function switchToStore(target: StoreDef): Promise<{ ok: boolean; needLogin?: boolean; error?: string }> {
  const pw = (() => { try { return sessionStorage.getItem("admin_pw"); } catch { return null; } })();
  if (!pw) return { ok: false, needLogin: true };

  localStorage.setItem("current_store_id", target.id);
  const { error } = await supabase.auth.signInWithPassword({ email: target.email, password: pw });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
