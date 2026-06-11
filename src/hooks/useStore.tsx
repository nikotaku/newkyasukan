import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Store {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  theme_color: string | null;
  settings: Record<string, unknown>;
  is_default: boolean;
}

// デフォルト店舗（既存データはすべてこの店舗に帰属）
export const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

interface StoreContextValue {
  store: Store | null;
  storeId: string;
  loading: boolean;
}

const StoreContext = createContext<StoreContextValue>({
  store: null,
  storeId: DEFAULT_STORE_ID,
  loading: true,
});

// サブドメインから店舗スラッグを判定。
// localhost / IP / *.vercel.app / apex / www はデフォルト店舗扱い（null）
function getSubdomainSlug(): string | null {
  const host = window.location.hostname;
  if (host === "localhost" || /^[\d.]+$/.test(host)) return null;
  if (host.endsWith(".vercel.app")) return null;
  const parts = host.split(".");
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (sub === "www") return null;
  return sub;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolve = async () => {
      const slug = getSubdomainSlug();
      let data: Store | null = null;

      if (slug) {
        const { data: bySlug } = await supabase
          .from("stores" as any)
          .select("*")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();
        data = bySlug as unknown as Store | null;
      }

      if (!data) {
        const { data: byDefault } = await supabase
          .from("stores" as any)
          .select("*")
          .eq("is_default", true)
          .maybeSingle();
        data = byDefault as unknown as Store | null;
      }

      if (data?.theme_color) {
        // shadcn の --primary を店舗テーマ色（HSL値）で上書き
        document.documentElement.style.setProperty("--primary", data.theme_color);
      }

      setStore(data);
      setLoading(false);
    };
    resolve();
  }, []);

  return (
    <StoreContext.Provider value={{ store, storeId: store?.id ?? DEFAULT_STORE_ID, loading }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
