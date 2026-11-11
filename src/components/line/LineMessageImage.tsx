import { useCallback, useEffect, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { LineMessage } from "@/lib/lineInbox";

export function LineMessageImage({ message }: { message: LineMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: failed } = await supabase.functions.invoke("line-customer-reply", {
      body: { action: "media", messageId: message.id },
    });
    if (failed || !data?.url) setError("画像を読み込めませんでした。再試行できます");
    else setUrl(data.url);
    setLoading(false);
  }, [message.id]);
  useEffect(() => { if (message.delivery_status === "sent") void load(); }, [load, message.delivery_status, message.media_path]);
  if (url) return <a href={url} target="_blank" rel="noreferrer" aria-label="画像を拡大"><img src={url} alt="トークの画像" className="max-h-72 max-w-full rounded-lg object-contain" onError={() => { setUrl(null); setError("画像の表示期限が切れました。再読み込みしてください"); }} /></a>;
  return <div className="space-y-1">
    <Button size="sm" variant="secondary" disabled={loading || message.delivery_status !== "sent"} onClick={() => void load()}>
      {loading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <ImageIcon size={14} className="mr-1" />}画像を読み込む
    </Button>
    {error && <p className="text-xs">{error}</p>}
  </div>;
}
