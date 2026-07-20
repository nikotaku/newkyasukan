import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_STORE_ID } from "@/hooks/useStore";

/**
 * 管理画面用：ログイン中ユーザーの所属店舗（user_stores→stores）を返す。
 * 全力エステのアカウントなら全力エステ、艶花のアカウントなら艶花になる。
 */

interface AdminStore {
  id: string;
  name: string;
  slug: string;
}

let cachedByUser: Record<string, AdminStore> = {};

export const useAdminStore = () => {
  const { user } = useAuth();
  const cached = user ? cachedByUser[user.id] : undefined;
  const [store, setStore] = useState<AdminStore | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!user) return;
    if (cachedByUser[user.id]) {
      setStore(cachedByUser[user.id]);
      setLoading(false);
      return;
    }
    supabase
      .from("user_stores" as any)
      .select("store_id, stores(id, name, slug)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const s = (data as any)?.stores;
        const resolved: AdminStore = s
          ? { id: s.id, name: s.name, slug: s.slug }
          : { id: DEFAULT_STORE_ID, name: "全力エステ 仙台", slug: "main" };
        cachedByUser[user.id] = resolved;
        setStore(resolved);
        setLoading(false);
      });
  }, [user?.id]);

  return { store, storeId: store?.id ?? DEFAULT_STORE_ID, loading };
};
