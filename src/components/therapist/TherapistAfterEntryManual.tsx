import { useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// マイページ「入室後のマニュアル」：お店が管理画面（/therapist-manual）で登録した項目（説明・動画・写真）を見る。
// ルームを決めた項目はそのルームの見出しの下に、決めていない項目は「全ルーム共通」に出す。RPC get_therapist_manual（本人のトークン）

type ManualItem = {
  id: string;
  title: string;
  body: string | null;
  video_url: string | null;
  image_url: string | null;
  room_name: string | null;
};

export function TherapistAfterEntryManual({ token, onOpenTransport }: { token: string; onOpenTransport?: () => void }) {
  const [items, setItems] = useState<ManualItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc("get_therapist_manual" as never, { p_token: token } as never);
      if (!alive) return;
      if (error) { setFailed(true); setItems([]); return; }
      setItems((Array.isArray(data) ? data : []) as ManualItem[]);
    })();
    return () => { alive = false; };
  }, [token]);

  const groups = useMemo(() => {
    const map = new Map<string, ManualItem[]>();
    for (const item of items ?? []) {
      const key = item.room_name || "全ルーム共通";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === "全ルーム共通" ? -1 : b === "全ルーム共通" ? 1 : a.localeCompare(b, "ja")));
  }, [items]);

  if (items === null) return <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></div>;
  if (failed) return <p className="py-10 text-center text-sm text-muted-foreground">マニュアルを読み込めませんでした。時間をおいて開き直してください。</p>;
  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">まだマニュアルがありません。</p>;

  let number = 0;
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
        <BookOpen size={14} className="mt-0.5 shrink-0" />
        お部屋に入ってからの流れです。はじめての方は動画を最後まで見てください。
      </p>
      {groups.map(([room, list]) => (
        <section key={room} className="space-y-3">
          {groups.length > 1 && <h2 className="text-sm font-bold">{room}</h2>}
          {list.map((item) => {
            number += 1;
            const isTransport = /交通費|領収書/.test(item.title);
            return (
              <article key={item.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex items-center gap-2 border-b px-4 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{number}</span>
                  <h3 className="font-bold leading-snug">{item.title}</h3>
                </div>
                {item.video_url && (
                  <video src={item.video_url} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />
                )}
                {!item.video_url && item.image_url && (
                  <img src={item.image_url} alt="" className="w-full object-contain" loading="lazy" />
                )}
                {(item.body || isTransport) && (
                  <div className="space-y-3 px-4 py-3">
                    {item.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.body}</p>}
                    {isTransport && onOpenTransport && (
                      <Button variant="outline" size="sm" onClick={onOpenTransport}>
                        <Plane size={14} className="mr-1" />交通費申請を開く
                      </Button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
