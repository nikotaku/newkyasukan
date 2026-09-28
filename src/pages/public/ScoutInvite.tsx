import { useEffect, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { supabase } from "@/integrations/supabase/client";
import { Banknote, Home, ListChecks, MessageCircle, Phone, X as XIcon, Lock } from "lucide-react";
import { normalizeScoutInvite, SCOUT_INVITE_KEY, type ScoutInvite } from "@/lib/scoutInvite";

/**
 * 引き抜きDMのリンク先（非公開・noindex）。/invite?to=名前 で「◯◯さんへ」と表示する。
 */

const MINCHO = { fontFamily: '"Shippori Mincho", "Noto Serif JP", serif' };
const GOLD = "bg-gradient-to-r from-[#c9a24a] via-[#f3dc9a] to-[#b8862d] bg-clip-text text-transparent";

function SectionTitle({ icon: Icon, en, ja }: { icon: typeof Banknote; en: string; ja: string }) {
  return (
    <div className="mb-6 text-center">
      <Icon className="mx-auto mb-2 h-5 w-5 text-[#d8b765]" />
      <p className="text-[11px] tracking-[0.35em] text-[#d8b765]/80">{en}</p>
      <h2 className="mt-1 text-xl font-semibold text-white" style={MINCHO}>{ja}</h2>
    </div>
  );
}

function Gallery({ images, onOpen }: { images: string[]; onOpen: (src: string) => void }) {
  if (!images.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {images.map((src, i) => (
        <button
          key={src}
          type="button"
          onClick={() => onOpen(src)}
          className={`overflow-hidden rounded-lg border border-[#d8b765]/25 ${images.length % 2 === 1 && i === 0 ? "col-span-2" : ""}`}
        >
          <img src={src} alt="" loading="lazy" className="h-full max-h-[420px] w-full object-cover" />
        </button>
      ))}
    </div>
  );
}

export default function ScoutInvitePage() {
  const { store, storeId, loading: storeLoading } = useStore();
  const [invite, setInvite] = useState<ScoutInvite | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const to = new URLSearchParams(window.location.search).get("to")?.trim().slice(0, 30) || "";
  const storeName = store?.name ?? "";

  useEffect(() => {
    document.title = `${storeName ? `${storeName} ` : ""}特別なご案内`;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, [storeName]);

  useEffect(() => {
    if (storeLoading) return;
    supabase
      .from("site_content")
      .select("value")
      .eq("store_id", storeId)
      .eq("key", SCOUT_INVITE_KEY)
      .maybeSingle()
      .then(({ data }) => {
        let parsed: unknown = null;
        try { parsed = data?.value ? JSON.parse(data.value) : null; } catch { parsed = null; }
        setInvite(normalizeScoutInvite(parsed));
      });
  }, [storeId, storeLoading]);

  if (!invite) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0d0b09] text-sm text-white/50">読み込み中...</div>;
  }

  const lineUrl = invite.lineUrl || (typeof store?.settings?.recruit_line_url === "string" ? store.settings.recruit_line_url : "");
  const xHandle = invite.xAccount.replace(/^@/, "");

  return (
    <div className="min-h-screen bg-[#0d0b09] text-white/85">
      {/* ヒーロー */}
      <header className="relative overflow-hidden px-6 pb-14 pt-16 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(216,183,101,0.22),transparent_60%)]" />
        <div className="relative mx-auto max-w-md">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-[#d8b765]/40 px-3 py-1 text-[11px] tracking-[0.2em] text-[#e8cf8a]">
            <Lock className="h-3 w-3" /> PRIVATE INVITATION
          </p>
          {to && <p className="mt-6 text-lg text-white" style={MINCHO}>{to} さんへ</p>}
          <h1 className={`mt-3 whitespace-pre-line text-[28px] font-bold leading-snug ${GOLD}`} style={MINCHO}>{invite.headline}</h1>
          {storeName && <p className="mt-3 text-xs tracking-[0.3em] text-white/50">{storeName}</p>}
          <p className="mt-8 whitespace-pre-line text-left text-sm leading-7 text-white/75">{invite.message}</p>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-16 px-5 pb-32">
        {/* 稼ぎ */}
        <section>
          <SectionTitle icon={Banknote} en="REAL EARNINGS" ja="実際の稼ぎ明細" />
          <div className="space-y-2">
            {invite.earnings.filter((e) => e.label || e.amount).map((e, i) => (
              <div key={i} className="rounded-xl border border-[#d8b765]/25 bg-white/[0.03] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-white/70">{e.label}</span>
                  <span className={`shrink-0 text-lg font-bold ${GOLD}`} style={MINCHO}>{e.amount}</span>
                </div>
                {e.note && <p className="mt-1 text-xs text-white/45">{e.note}</p>}
              </div>
            ))}
          </div>
          {invite.earningsImages.length > 0 && (
            <div className="mt-4">
              <Gallery images={invite.earningsImages} onOpen={setPreview} />
              <p className="mt-2 text-center text-[11px] text-white/40">タップで拡大できます</p>
            </div>
          )}
        </section>

        {/* ルーム */}
        {(invite.roomImages.length > 0 || invite.roomNote) && (
          <section>
            <SectionTitle icon={Home} en="ROOM" ja="ルーム" />
            <Gallery images={invite.roomImages} onOpen={setPreview} />
            {invite.roomNote && <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/70">{invite.roomNote}</p>}
          </section>
        )}

        {/* 条件 */}
        <section>
          <SectionTitle icon={ListChecks} en="CONDITIONS" ja="勤務条件" />
          <dl className="divide-y divide-[#d8b765]/15 overflow-hidden rounded-xl border border-[#d8b765]/25">
            {invite.conditions.filter((c) => c.label || c.value).map((c, i) => (
              <div key={i} className="grid grid-cols-[88px_1fr] gap-3 px-4 py-3 text-sm">
                <dt className="text-[#e8cf8a]">{c.label}</dt>
                <dd className="whitespace-pre-line text-white/80">{c.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 連絡先 */}
        <section>
          <SectionTitle icon={MessageCircle} en="CONTACT" ja="ご連絡先" />
          <div className="space-y-3">
            {lineUrl && (
              <a href={lineUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-full bg-[#06C755] py-3.5 font-semibold text-white">
                <MessageCircle className="h-5 w-5" /> LINEで話を聞いてみる
              </a>
            )}
            {invite.phone && (
              <a href={`tel:${invite.phone.replace(/[^\d+]/g, "")}`} className="flex items-center justify-center gap-2 rounded-full border border-[#d8b765]/50 py-3 text-[#f3dc9a]">
                <Phone className="h-4 w-4" /> {invite.phone}
              </a>
            )}
            {xHandle && (
              <a href={`https://x.com/${xHandle}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-full border border-white/20 py-3 text-white/80">
                <XIcon className="h-4 w-4" /> @{xHandle} にDM
              </a>
            )}
          </div>
          {invite.contactNote && <p className="mt-4 whitespace-pre-line text-center text-xs leading-6 text-white/55">{invite.contactNote}</p>}
        </section>
      </main>

      {/* 固定ボタン */}
      {lineUrl && (
        <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-[#0d0b09] via-[#0d0b09]/95 to-transparent px-5 pb-5 pt-6">
          <a href={lineUrl} target="_blank" rel="noopener noreferrer" className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#c9a24a] via-[#f3dc9a] to-[#b8862d] py-3.5 font-bold text-[#1a1408] shadow-lg">
            {to ? `${to}さん専用の条件を聞く` : "特別条件を聞いてみる"}
          </a>
        </div>
      )}

      {preview && (
        <button type="button" onClick={() => setPreview(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <img src={preview} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}
