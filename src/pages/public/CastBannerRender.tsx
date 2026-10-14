import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CastHeroBannerSlide } from "@/components/public/CastHeroBannerSlide";
import { castHeroBannersForDay, type BannerShiftRow } from "@/lib/castHeroBanners";

// セラピストのバナーを画像にするための画面（1000×500 のバナーだけを出す）。
//   /banner-render?store=<store_id>&date=YYYY-MM-DD&cast=<cast_id>
// エステ魂のカバー画像のローテーション（server/estama-cover-banners.ts）が、この画面をブラウザで開いて撮る。
// 写真・並び順はHPのトップと同じ決め方（selectCastHeroBanners）。「最短◯時〜」は1日の中で変わるので出さない。
// 準備ができたら [data-banner-ready="1"]、出せないときは [data-banner-ready="error"]。

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CastBannerRender() {
  const [params] = useSearchParams();
  const storeId = params.get("store") ?? "";
  const date = params.get("date") ?? "";
  const castId = params.get("cast") ?? "";
  const valid = UUID.test(storeId) && UUID.test(castId) && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const [shifts, setShifts] = useState<BannerShiftRow[] | null>(null);
  const [storeName, setStoreName] = useState<string | undefined>(undefined);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    document.body.style.margin = "0";
    return () => { meta.remove(); };
  }, []);

  useEffect(() => {
    if (!valid) {
      setState("error");
      return;
    }
    Promise.all([
      supabase
        .from("shifts")
        .select("cast_id, start_time, end_time, casts (id, name, age, is_active, is_visible, join_date, banner_images, banner_copy, banner_enabled)")
        .eq("shift_date", date)
        .eq("store_id", storeId)
        .order("start_time"),
      supabase.from("stores").select("name").eq("id", storeId).maybeSingle(),
    ]).then(([shiftResult, storeResult]) => {
      if (shiftResult.error) {
        setState("error");
        return;
      }
      setShifts((shiftResult.data ?? []) as unknown as BannerShiftRow[]);
      setStoreName((storeResult.data as { name?: string } | null)?.name ?? undefined);
    });
  }, [valid, storeId, date]);

  // HPのトップと同じ決め方（写真も同じものになる）
  const banner = useMemo(
    () => (shifts ? castHeroBannersForDay(shifts, date, Number.MAX_SAFE_INTEGER).find((item) => item.castId === castId) ?? null : null),
    [shifts, date, castId],
  );

  useEffect(() => {
    if (!shifts) return;
    if (!banner) {
      setState("error");
      return;
    }
    let cancelled = false;
    const image = new Image();
    const done = () => {
      // 画像とフォントがそろってから撮ってもらう
      void document.fonts.ready.then(() => {
        if (!cancelled) setState(image.naturalWidth > 0 ? "ready" : "error");
      });
    };
    image.onload = done;
    image.onerror = done;
    image.src = banner.image;
    return () => { cancelled = true; };
  }, [shifts, banner]);

  return (
    <div
      data-banner-ready={state === "loading" ? undefined : state === "ready" ? "1" : "error"}
      data-banner-root=""
      style={{ position: "relative", width: 1000, height: 500, overflow: "hidden", background: "#150a11" }}
    >
      {banner && <CastHeroBannerSlide banner={banner} storeName={storeName} eager />}
    </div>
  );
}
