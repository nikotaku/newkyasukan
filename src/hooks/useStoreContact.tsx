import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * 店舗の連絡先（電話番号・予約用LINE）を store_info から取得する共通フック。
 * 管理画面の「店舗情報」（/hp/store-info）で変更すると公開HP全体に反映される。
 */

const DEFAULT_PHONE = "09081264042";
const DEFAULT_LINE_URL = "https://lin.ee/RdRhmXw";

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
  loaded: boolean;
}

// モジュール内キャッシュ（ページ遷移ごとの再フェッチを避ける）
let cached: { phone: string; lineUrl: string } | null = null;

export const useStoreContact = (): StoreContact => {
  const [phone, setPhone] = useState(cached?.phone ?? DEFAULT_PHONE);
  const [lineUrl, setLineUrl] = useState(cached?.lineUrl ?? DEFAULT_LINE_URL);
  const [loaded, setLoaded] = useState(!!cached);

  useEffect(() => {
    if (cached) return;
    supabase
      .from("store_info" as any)
      .select("phone, line_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const p = ((data as any)?.phone || DEFAULT_PHONE).replace(/\D/g, "");
        const l = (data as any)?.line_url || DEFAULT_LINE_URL;
        cached = { phone: p, lineUrl: l };
        setPhone(p);
        setLineUrl(l);
        setLoaded(true);
      });
  }, []);

  return {
    phone,
    phoneDisplay: formatPhone(phone),
    telHref: `tel:${phone}`,
    lineUrl,
    loaded,
  };
};
