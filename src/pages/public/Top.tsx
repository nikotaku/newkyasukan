import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { BadgeCheck } from "lucide-react";
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

const Top = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

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
    <div className="min-h-screen pb-20 md:pb-0 bg-black text-white">
      <SEO
        title="仙台のメンズエステ"
        description="全力エステ 仙台店｜セラピストの最新つぶやきタイムライン。仙台のメンズエステサロン。Tel: 090-8126-4042"
        path="/"
        jsonLd={LOCAL_BUSINESS_JSON_LD}
      />
      <PublicNavigation />

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

      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
};

export default Top;
