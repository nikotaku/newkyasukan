import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { trackPublicEvent } from "@/lib/publicAnalytics";

export function RealtimeNotice({ storeId }: { storeId?: string | null }) {
  const [body, setBody] = useState("");
  useEffect(() => {
    if (!storeId) return;
    let disposed = false;
    let sequence = 0;
    let expiry: number;
    async function refresh() {
      const request = ++sequence;
      const started = Date.now();
      const { data } = await supabase.rpc("current_realtime_notice", { p_store: storeId! });
      if (disposed || sequence !== request) return;
      clearTimeout(expiry);
      const row = data?.[0];
      const remaining = (row?.remaining_ms ?? 0) - (Date.now() - started);
      setBody(remaining > 0 && row ? row.body : "");
      if (remaining > 0) expiry = window.setTimeout(() => setBody(""), remaining);
    }
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(expiry);
      window.removeEventListener("focus", refresh);
    };
  }, [storeId]);
  if (!body) return null;
  return <section aria-label="リアルタイム集客" className="mx-auto mb-8 max-w-2xl px-4">
    <div className="rounded-xl border p-4 text-center" style={{borderColor:"var(--pub-accent,#d4547a)",background:"var(--pub-card,#211320)",color:"var(--pub-text,#f7e9f0)"}}>
      <h2 className="text-xs">リアルタイム集客</h2>
      <p className="my-3 whitespace-pre-wrap break-words font-bold">{body}</p>
      <Link to="/booking" onClick={() => trackPublicEvent("booking_cta_click",{placement:"home_realtime",method:"web"})} className="block rounded-lg p-3 font-bold text-white" style={{background:"var(--pub-accent,#d4547a)"}}>Web予約する</Link>
    </div>
  </section>;
}
