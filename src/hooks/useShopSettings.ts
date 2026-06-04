import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ShopSettings {
  business_day_start: string;
}

const DEFAULT_SETTINGS: ShopSettings = {
  business_day_start: "10:00",
};

let cachedSettings: ShopSettings | null = null;

export function useShopSettings() {
  const [settings, setSettings] = useState<ShopSettings>(cachedSettings ?? DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(cachedSettings !== null);

  useEffect(() => {
    if (cachedSettings) return;
    supabase
      .from("shop_settings" as any)
      .select("business_day_start")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const s = data as ShopSettings | null;
        const resolved = s?.business_day_start ? s : DEFAULT_SETTINGS;
        cachedSettings = resolved;
        setSettings(resolved);
        setLoaded(true);
      });
  }, []);

  // Returns "HH:MM:SS" format for SQL comparisons
  const dayStartTime = settings.business_day_start.length === 5
    ? settings.business_day_start + ":00"
    : settings.business_day_start;

  return { settings, loaded, dayStartTime };
}
