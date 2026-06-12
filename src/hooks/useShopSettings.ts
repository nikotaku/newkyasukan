import { useState, useEffect, useMemo } from "react";
import { subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface ShopSettings {
  business_day_start: string;
}

const DEFAULT_SETTINGS: ShopSettings = {
  business_day_start: "10:00",
};

let cachedSettings: ShopSettings | null = null;

/** ページ初期化時（useState lazy init）で使う。キャッシュがあればそこから、なければ暦日ベースの今日を返す */
export function getBusinessDateFromCache(): Date {
  const now = new Date();
  if (!cachedSettings) return now;
  const h = parseInt(cachedSettings.business_day_start.split(":")[0], 10);
  return now.getHours() < h ? subDays(now, 1) : now;
}

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

  // 「今日」の営業日: dayStartHour前は前日扱い
  const businessToday = useMemo(() => {
    const h = parseInt(settings.business_day_start.split(":")[0], 10);
    const now = new Date();
    return now.getHours() < h ? subDays(now, 1) : now;
  }, [settings.business_day_start]);

  return { settings, loaded, dayStartTime, businessToday };
}
