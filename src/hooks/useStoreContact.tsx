import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";

/**
 * 店舗の連絡先（電話番号・予約用LINE・営業時間）を store_info から取得する共通フック。
 * サブドメインで解決された店舗（useStore）の行を参照するため、店舗ごとに値が切り替わる。
 * 管理画面の「店舗情報」（/hp/store-info）で変更すると公開HP全体に反映される。
 */

const DEFAULT_PHONE = "09081264042";
const DEFAULT_LINE_URL = "https://lin.ee/RdRhmXw";
const DEFAULT_HOURS = "12:00〜26:00(24:40最終受付)";

// 11桁の携帯番号を 090-1234-5678 形式に整形（それ以外はそのまま返す）
export const formatPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw;
};

interface StoreContact {
  /** 数字のみ（tel: リンク用） */
  phone: string;
  /** ハイフン区切りの表示用 */
  phoneDisplay: string;
  telHref: string;
  lineUrl: string;
  hours: string;
  loaded: boolean;
}

// 店舗IDごとのキャッシュ（ページ遷移ごとの再フェッチを避ける）
const cache = new Map<string, { phone: string; lineUrl: string; hours: string }>();

export const useStoreContact = (): StoreContact => {
  const { storeId, loading: storeLoading } = useStore();
  const cached = cache.get(storeId);
  const [phone, setPhone] = useState(cached?.phone ?? DEFAULT_PHONE);
  const [lineUrl, setLineUrl] = useState(cached?.lineUrl ?? DEFAULT_LINE_URL);
  const [hours, setHours] = useState(cached?.hours ?? DEFAULT_HOURS);
  const [loaded, setLoaded] = useState(!!cached);

  useEffect(() => {
    if (storeLoading) return;
    const hit = cache.get(storeId);
    if (hit) {
      setPhone(hit.phone);
      setLineUrl(hit.lineUrl);
      setHours(hit.hours);
      setLoaded(true);
      return;
    }
    supabase
      .from("store_info" as any)
      .select("phone, line_url, hours")
      .eq("store_id", storeId)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const p = ((data as any)?.phone || DEFAULT_PHONE).replace(/\D/g, "");
        const l = (data as any)?.line_url || DEFAULT_LINE_URL;
        const h = (data as any)?.hours || DEFAULT_HOURS;
        cache.set(storeId, { phone: p, lineUrl: l, hours: h });
        setPhone(p);
        setLineUrl(l);
        setHours(h);
        setLoaded(true);
      });
  }, [storeId, storeLoading]);

  return {
    phone,
    phoneDisplay: formatPhone(phone),
    telHref: `tel:${phone}`,
    lineUrl,
    hours,
    loaded,
  };
};
