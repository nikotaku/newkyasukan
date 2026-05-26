import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Heart, Repeat2, Share, MessageCircle as Reply, BadgeCheck, Menu, Phone, X as CloseIcon } from "lucide-react";
import { driveImgUrl } from "@/lib/drive";
import { SEO, LOCAL_BUSINESS_JSON_LD } from "@/components/SEO";

interface CastLite {
  id: string;
  name: string;
  photo: string | null;
  x_account: string | null;
  is_visible?: boolean;
}

interface Post {
  id: string;
  cast_id: string;
  body: string;
  image_urls: string[] | null;
  created_at: string;
  casts: CastLite | null;
}

const NAV_LINKS = [
  { to: "/", label: "TOP" },
  { to: "/schedule", label: "SCHEDULE" },
  { to: "/casts", label: "THERAPIST" },
  { to: "/system", label: "SYSTEM" },
  { to: "/access", label: "ACCESS" },
  { to: "/news", label: "NEWS" },
  { to: "/recruit", label: "RECRUIT" },
  { to: "/reserve", label: "RESERVE" },
];

const LINE_URL = "https://line.me/R/ti/p/@zenryoku";
const TEL = "09081264042";

const Top = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const { data } = await supabase
      .from("cast_posts")
      .select("id,cast_id,body,image_urls,created_at,casts(id,name,photo,x_account,is_visible)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      const filtered = (data as any[]).filter(p => p.casts && p.casts.is_visible !== false) as Post[];
      setPosts(filtered);
    }
    setLoading(false);
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const diffH = (Date.now() - d.getTime()) / 3600000;
    if (diffH < 1) return `${Math.max(1, Math.floor(diffH * 60))}分`;
    if (diffH < 24) return `${Math.floor(diffH)}時間`;
    if (diffH < 24 * 7) return `${Math.floor(diffH / 24)}日`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const handle = (c: CastLite) =>
    (c.x_account?.replace(/^@?/, "").replace(/^https?:\/\/.*\//, "")) || `zr_${c.id.slice(0, 8)}`;

  return (
    <div className="min-h-screen pb-20 bg-black text-white">
      <SEO
        title="仙台のメンズエステ"
        description="全力エステ 仙台店｜セラピストの最新つぶやきタイムライン。仙台のメンズエステサロン。Tel: 090-8126-4042"
        path="/"
        jsonLd={LOCAL_BUSINESS_JSON_LD}
      />

      <main className="max-w-xl mx-auto border-x border-white/10 min-h-screen">
        {/* Timeline */}
        {loading ? (
          <div className="py-20 text-center text-white/40 text-sm">読み込み中…</div>
        ) : posts.length === 0 ? (
          <div className="py-20 text-center text-white/40 text-sm">
            まだ投稿がありません
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {posts.map((p) => {
              const c = p.casts!;
              return (
                <article key={p.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="flex gap-3">
                    <Link to={`/casts/${c.id}`} className="flex-shrink-0">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-white/10">
                        {c.photo ? (
                          <img src={driveImgUrl(c.photo, 200)} alt={c.name} className="w-full h-full object-cover object-top" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#c49480] to-[#a87b65] text-base font-bold">
                            {c.name.charAt(0)}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-[15px]">
                        <Link to={`/casts/${c.id}`} className="font-bold truncate hover:underline">{c.name}</Link>
                        <BadgeCheck size={15} className="text-[#1d9bf0] flex-shrink-0" />
                        <span className="text-white/50 truncate">@{handle(c)}</span>
                        <span className="text-white/50">·</span>
                        <span className="text-white/50 whitespace-nowrap">{fmtDate(p.created_at)}</span>
                      </div>
                      {p.body && (
                        <p className="mt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{p.body}</p>
                      )}
                      {p.image_urls && p.image_urls.length > 0 && (
                        <Link to={`/casts/${c.id}`} className="block mt-2">
                          <div className={`rounded-2xl overflow-hidden border border-white/10 grid gap-0.5 ${p.image_urls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                            {p.image_urls.slice(0, 4).map((url, i) => (
                              <img
                                key={i}
                                src={driveImgUrl(url, 800)}
                                alt=""
                                className="w-full object-cover"
                                style={{
                                  maxHeight: p.image_urls!.length === 1 ? 520 : 240,
                                  aspectRatio: p.image_urls!.length === 1 ? "auto" : "1/1",
                                }}
                                loading="lazy"
                              />
                            ))}
                          </div>
                        </Link>
                      )}
                      <div className="mt-2 flex items-center justify-between max-w-xs text-white/50 text-xs">
                        <button className="flex items-center gap-1.5 hover:text-[#1d9bf0] transition-colors"><Reply size={16} /></button>
                        <button className="flex items-center gap-1.5 hover:text-green-500 transition-colors"><Repeat2 size={16} /></button>
                        <button className="flex items-center gap-1.5 hover:text-pink-500 transition-colors"><Heart size={16} /></button>
                        <button className="flex items-center gap-1.5 hover:text-[#1d9bf0] transition-colors"><Share size={16} /></button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

      </main>

      {/* Slide-up menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute bottom-16 left-0 right-0 max-w-xl mx-auto bg-black border-t border-white/10 rounded-t-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-white/60">メニュー</span>
              <button onClick={() => setMenuOpen(false)} className="text-white/60 hover:text-white">
                <CloseIcon size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMenuOpen(false)}
                  className="px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-center text-sm font-semibold tracking-wider"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fixed bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-white/10">
        <div className="max-w-xl mx-auto grid grid-cols-3 h-16">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex flex-col items-center justify-center gap-0.5 text-white hover:bg-white/5 transition-colors"
          >
            <Menu size={22} />
            <span className="text-[10px] tracking-wider">MENU</span>
          </button>
          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-0.5 text-white bg-[#06C755] hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6.48 2 2 5.78 2 10.43c0 4.17 3.55 7.66 8.36 8.32.32.07.76.21.87.49.1.25.07.65.03.91l-.14.84c-.04.25-.2.97.85.53 1.05-.44 5.66-3.33 7.72-5.71C21.06 14.27 22 12.46 22 10.43 22 5.78 17.52 2 12 2zM8.28 13.05H6.3a.42.42 0 0 1-.42-.42V8.7a.42.42 0 1 1 .84 0v3.51h1.56a.42.42 0 1 1 0 .84zm1.65-.42a.42.42 0 0 1-.84 0V8.7a.42.42 0 0 1 .84 0v3.93zm4.71 0a.42.42 0 0 1-.29.4.46.46 0 0 1-.13.02.42.42 0 0 1-.34-.17l-2.02-2.75v2.5a.42.42 0 0 1-.84 0V8.7a.42.42 0 0 1 .29-.4.4.4 0 0 1 .13-.02c.13 0 .25.06.33.16l2.03 2.75V8.7a.42.42 0 0 1 .84 0v3.93zm3.17-2.39a.42.42 0 1 1 0 .84h-1.56v1h1.56a.42.42 0 1 1 0 .84h-1.98a.42.42 0 0 1-.42-.42V8.7a.42.42 0 0 1 .42-.42h1.98a.42.42 0 1 1 0 .84h-1.56v1h1.56z"/></svg>
            <span className="text-[10px] tracking-wider font-bold">LINE</span>
          </a>
          <a
            href={`tel:${TEL}`}
            className="flex flex-col items-center justify-center gap-0.5 text-white bg-[#c49480] hover:opacity-90 transition-opacity"
          >
            <Phone size={22} />
            <span className="text-[10px] tracking-wider font-bold">TEL</span>
          </a>
        </div>
      </nav>
    </div>
  );
};

export default Top;
