import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BadgeCheck, Menu, Phone, X as CloseIcon, Clock } from "lucide-react";
import { format } from "date-fns";
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

interface RecCourse {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  interval_posts: number;
  display_order: number;
}

type TimelineItem =
  | { kind: "post"; post: Post }
  | { kind: "rec"; rec: RecCourse; key: string };

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

interface TodayShift {
  cast_id: string;
  start_time: string;
  end_time: string;
}
interface TodayRes {
  cast_id: string;
  start_time: string;
  duration: number;
}

const Top = () => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [recs, setRecs] = useState<RecCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [todayShifts, setTodayShifts] = useState<TodayShift[]>([]);
  const [todayRes, setTodayRes] = useState<TodayRes[]>([]);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const [{ data: postData }, { data: recData }, { data: shiftData }, { data: resData }] = await Promise.all([
      supabase
        .from("cast_posts")
        .select("id,cast_id,body,image_urls,created_at,casts(id,name,photo,x_account,is_visible)")
        .eq("post_type", "cast_message")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("recommended_courses")
        .select("id,title,description,image_url,link_url,interval_posts,display_order")
        .eq("is_active", true)
        .order("display_order"),
      supabase
        .from("shifts")
        .select("cast_id,start_time,end_time")
        .eq("shift_date", dateStr),
      supabase.rpc("get_reservation_slots", { p_date: dateStr, p_cast_id: null }),
    ]);
    if (postData) {
      const filtered = (postData as any[]).filter(p => p.casts && p.casts.is_visible !== false) as Post[];
      setPosts(filtered);
    }
    setRecs((recData as RecCourse[]) || []);
    setTodayShifts((shiftData as TodayShift[]) || []);
    setTodayRes(((resData as any[]) || []).map((x) => ({
      cast_id: x.cast_id, start_time: x.start_time, duration: x.duration,
    })));
    setLoading(false);
  };

  // Interleave: for each active rec, insert after every interval_posts posts
  const timeline: TimelineItem[] = (() => {
    const items: TimelineItem[] = posts.map((p) => ({ kind: "post" as const, post: p }));
    if (recs.length === 0) return items;
    const out: TimelineItem[] = [];
    const counters = new Map<string, number>(recs.map((r) => [r.id, 0]));
    let postIdx = 0;
    items.forEach((it) => {
      out.push(it);
      postIdx += 1;
      recs.forEach((r) => {
        if (r.interval_posts > 0 && postIdx % r.interval_posts === 0) {
          const n = (counters.get(r.id) ?? 0) + 1;
          counters.set(r.id, n);
          out.push({ kind: "rec", rec: r, key: `${r.id}-${n}` });
        }
      });
    });
    return out;
  })();


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

  // Earliest available 60m slot today for a cast (30m buffer after each reservation)
  const earliestToday = (castId: string): string | null => {
    const shift = todayShifts.find((s) => s.cast_id === castId);
    if (!shift) return null;
    const now = new Date();
    const [sh, sm] = shift.start_time.split(":").map(Number);
    const [eh, em] = shift.end_time.split(":").map(Number);
    let cursor = sh * 60 + sm;
    const end = eh * 60 + em;
    const cur = now.getHours() * 60 + now.getMinutes();
    if (cur > cursor) cursor = Math.ceil(cur / 30) * 30;
    const reserved = todayRes
      .filter((r) => r.cast_id === castId)
      .map((r) => {
        const [h, m] = r.start_time.split(":").map(Number);
        const start = h * 60 + m;
        return { start, end: start + r.duration + 30 };
      });
    while (cursor + 60 <= end) {
      const c = reserved.find((b) => cursor < b.end && cursor + 60 > b.start);
      if (!c) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
        const mm = String(cursor % 60).padStart(2, "0");
        return `${hh}:${mm}`;
      }
      cursor = c.end;
    }
    return null;
  };

  const quickBook = (castId: string, time: string) => {
    const dateStr = format(new Date(), "yyyy-MM-dd");
    navigate(`/booking?castId=${castId}&date=${dateStr}&time=${time}`);
  };

  return (
    <div className="min-h-screen pb-20 bg-black text-white">
      <SEO
        title="仙台のメンズエステ"
        description="全力エステ 仙台店｜セラピストの最新つぶやきタイムライン。仙台のメンズエステサロン。Tel: 090-8126-4042"
        path="/"
        jsonLd={LOCAL_BUSINESS_JSON_LD}
      />

      {/* Logo header */}
      <div className="max-w-xl mx-auto border-x border-white/10 border-b border-white/10 bg-black sticky top-0 z-30">
        <div className="flex items-center justify-center h-16">
          <Link to="/">
            <img
              src="https://cdn2-caskan.com/caskan/img/shop_logo/1401_logo_1750237137.png"
              alt="全力エステ 仙台"
              className="h-10 object-contain"
            />
          </Link>
        </div>
      </div>

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
            {timeline.map((item) => {
              if (item.kind === "rec") {
                const r = item.rec;
                const Inner = (
                  <article className="px-4 py-3 hover:bg-white/[0.02] transition-colors bg-gradient-to-br from-[#c49480]/10 to-transparent">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-[#c49480] to-[#a87b65] flex items-center justify-center text-base font-bold">
                          PR
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 text-[15px]">
                          <span className="font-bold truncate">おすすめコース</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 ml-1">PR</span>
                        </div>
                        <p className="mt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words font-semibold">{r.title}</p>
                        {r.description && (
                          <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap break-words text-white/80">{r.description}</p>
                        )}
                        {r.image_url && (
                          <div className="mt-2 rounded-2xl overflow-hidden border border-white/10">
                            <img src={r.image_url} alt={r.title} className="w-full object-cover" style={{ maxHeight: 520 }} loading="lazy" />
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
                return r.link_url ? (
                  r.link_url.startsWith("http") ? (
                    <a key={item.key} href={r.link_url} target="_blank" rel="noopener noreferrer" className="block">{Inner}</a>
                  ) : (
                    <Link key={item.key} to={r.link_url} className="block">{Inner}</Link>
                  )
                ) : (
                  <div key={item.key}>{Inner}</div>
                );
              }
              const p = item.post;
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
                      {(() => {
                        const t = earliestToday(c.id);
                        if (!t) return null;
                        return (
                          <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#c49480]/40 bg-[#c49480]/5 px-3 py-2">
                            <Clock size={14} className="text-[#c49480] flex-shrink-0" />
                            <div className="flex-1 text-[13px]">
                              <span className="text-white/60">本日最短</span>{" "}
                              <span className="font-bold text-white">{t}〜</span>
                            </div>
                            <button
                              onClick={() => quickBook(c.id, t)}
                              className="px-3 py-1 rounded-full bg-[#c49480] hover:bg-[#a87b65] text-white text-[12px] font-bold whitespace-nowrap transition-colors"
                            >
                              60分で予約
                            </button>
                          </div>
                        );
                      })()}
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
