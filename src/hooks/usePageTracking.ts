import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const PUBLIC_PATHS: string[] = ["/", "/lp"];
const PUBLIC_PREFIXES: string[] = ["/schedule", "/casts", "/pricing", "/access", "/booking", "/page/"];
// /system は公開ページ（/system/... は管理画面なので除外）

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  if (path === "/system") return true;
  return PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix));
}

function isBot(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return /bot|crawler|spider|crawling|googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebot|ia_archiver|semrushbot|ahrefsbot/.test(ua);
}

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    if (!isPublicPath(location.pathname)) return;
    if (isBot()) return;

    // 同一タブ内でのセッション（新規タブ=新規セッション）
    const isNewSession = !sessionStorage.getItem("tracked");
    if (isNewSession) sessionStorage.setItem("tracked", "1");

    // 日次ユニーク訪問者（同一ブラウザ・同一日は1カウント）
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = localStorage.getItem("last_visit");
    const isNewDailyVisitor = lastDate !== today;
    if (isNewDailyVisitor) localStorage.setItem("last_visit", today);

    supabase
      .rpc("record_page_view", {
        p_path: location.pathname,
        p_is_new_session: isNewSession,
        p_is_new_daily_visitor: isNewDailyVisitor,
      })
      .then(() => {}, () => {});
  }, [location.pathname]);
}
