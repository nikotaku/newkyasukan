import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { ArrowLeft, Search, MoreHorizontal, MessageCircle, Phone, Calendar, Star, X, Heart, Repeat2, Share, MessageCircle as Reply, Clock } from "lucide-react";
import { SEO } from "@/components/SEO";
import { driveImgUrl } from "@/lib/drive";

interface Cast {
  id: string;
  name: string;
  age: number | null;
  height: number | null;
  bust: number | null;
  cup_size: string | null;
  waist: number | null;
  hip: number | null;
  blood_type: string | null;
  therapist_years: number | null;
  type: string;
  status: string;
  is_online: boolean;
  photo: string | null;
  photos: string[] | null;
  profile: string | null;
  message: string | null;
  favorite_techniques: string | null;
  favorite_food: string | null;
  celebrity_lookalike: string | null;
  day_off_activities: string | null;
  hobbies: string | null;
  ideal_type: string | null;
  room: string | null;
  x_account: string | null;
  line_url: string | null;
  litlink_url: string | null;
  o2_url: string | null;
  tags: string[] | null;
}

interface Post {
  id: string;
  body: string;
  image_urls: string[] | null;
  created_at: string;
  posted_at: string | null;
}

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

const TEL = "09081264042";

const CastDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cast, setCast] = useState<Cast | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgName, setMsgName] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgSent, setMsgSent] = useState(false);
  const [tab, setTab] = useState<"posts" | "profile">("posts");
  const [todayShifts, setTodayShifts] = useState<TodayShift[]>([]);
  const [todayRes, setTodayRes] = useState<TodayRes[]>([]);
  const [slotModal, setSlotModal] = useState<{ castId: string; castName: string; time: string } | null>(null);

  useEffect(() => { if (id) fetchAll(); }, [id]);

  const fetchAll = async () => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const [castRes, postRes, shiftRes, resRes] = await Promise.all([
        supabase.from("casts").select("*").eq("id", id).single(),
        supabase.from("cast_posts").select("id,body,image_urls,created_at,posted_at").eq("cast_id", id).order("created_at", { ascending: false }).limit(20),
        supabase.from("shifts").select("cast_id,start_time,end_time").eq("shift_date", dateStr).eq("cast_id", id),
        supabase.rpc("get_reservation_slots", { p_date: dateStr, p_cast_id: id }),
      ]);
      if (castRes.error) throw castRes.error;
      setCast(castRes.data);
      setPosts((postRes.data ?? []) as Post[]);
      setTodayShifts((shiftRes.data ?? []) as TodayShift[]);
      setTodayRes(((resRes.data as any[]) ?? []).map((x) => ({
        cast_id: x.cast_id,
        start_time: x.start_time,
        duration: x.duration,
      })));
      document.title = `${castRes.data.name} | 全力エステ`;
    } catch {
      navigate("/casts");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
      </div>
    );
  }
  if (!cast) return null;

  let profileJson: Record<string, any> | null = null;
  if (cast.profile && cast.profile.trimStart().startsWith("{")) {
    try { profileJson = JSON.parse(cast.profile); } catch {}
  }

  const displayAge    = cast.age    ?? profileJson?.age    ?? null;
  const displayHeight = cast.height ?? profileJson?.height ?? null;
  const displayBust   = cast.bust   ?? profileJson?.bust   ?? null;
  const displayWaist  = cast.waist  ?? profileJson?.waist  ?? null;
  const displayHip    = cast.hip    ?? profileJson?.hip    ?? null;
  const displayBlood  = cast.blood_type ?? profileJson?.blood_type ?? null;

  const allPhotos = (cast.photos && cast.photos.length > 0
    ? cast.photos
    : cast.photo ? [cast.photo] : []
  ).filter(Boolean);

  const bannerPhoto = allPhotos[1] ?? allPhotos[0] ?? null;
  const avatarPhoto = allPhotos[0] ?? null;
  const handle = (cast.x_account?.replace(/^@?/, "").replace(/^https?:\/\/.*\//, "")) || `zr_${cast.id.slice(0, 8)}`;

  // Build timeline items: prefer posts, fallback to photos as cards (5 items)
  const timeline: Post[] = posts.length > 0
    ? posts.slice(0, 10)
    : allPhotos.slice(0, 5).map((p, i) => ({
        id: `photo-${i}`,
        body: i === 0 && cast.message ? cast.message : "",
        image_urls: [p],
        created_at: new Date(Date.now() - i * 86400000).toISOString(),
        posted_at: null,
      }));

  const stats: { label: string; value: string }[] = [];
  if (displayAge)    stats.push({ label: "年齢", value: `${displayAge}` });
  if (displayHeight) stats.push({ label: "身長", value: `${displayHeight}` });
  if (displayBust)   stats.push({ label: "B", value: `${displayBust}${cast.cup_size ? cast.cup_size : ""}` });
  if (displayWaist)  stats.push({ label: "W", value: `${displayWaist}` });
  if (displayHip)    stats.push({ label: "H", value: `${displayHip}` });

  const handleSendMessage = async () => {
    if (!msgName.trim() || !msgBody.trim()) return;
    setMsgSending(true);
    await supabase.from("cast_messages" as any).insert([{
      cast_id: cast.id,
      sender_name: msgName.trim(),
      message: msgBody.trim(),
    }]);
    setMsgSending(false);
    setMsgSent(true);
    setMsgName("");
    setMsgBody("");
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const diffH = (Date.now() - d.getTime()) / 3600000;
    if (diffH < 1) return `${Math.max(1, Math.floor(diffH * 60))}分`;
    if (diffH < 24) return `${Math.floor(diffH)}時間`;
    if (diffH < 24 * 7) return `${Math.floor(diffH / 24)}日`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const quickBook = (castId: string, time: string) => {
    const dateStr = new Date().toISOString().slice(0, 10);
    navigate(`/booking?castId=${castId}&date=${dateStr}&time=${time}`);
  };

  const slotsToday = (castId: string): { time: string; available: boolean }[] => {
    const shift = todayShifts.find((s) => s.cast_id === castId);
    if (!shift) return [];
    const now = new Date();
    const [sh, sm] = shift.start_time.split(":").map(Number);
    const [eh, em] = shift.end_time.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    const cur = now.getHours() * 60 + now.getMinutes();
    const reserved = todayRes
      .filter((r) => r.cast_id === castId)
      .map((r) => {
        const [h, m] = r.start_time.split(":").map(Number);
        const s = h * 60 + m;
        return { start: s, end: s + r.duration + 30 };
      });

    const out: { time: string; available: boolean }[] = [];
    for (let t = start; t + 60 <= end; t += 10) {
      if (t < cur) continue;
      const conflict = reserved.some((b) => t < b.end && t + 60 > b.start);
      const hh = String(Math.floor(t / 60)).padStart(2, "0");
      const mm = String(t % 60).padStart(2, "0");
      out.push({ time: `${hh}:${mm}`, available: !conflict });
    }
    return out;
  };

  const castDescription = cast.message
    ? `${cast.name}のプロフィール。${cast.message.slice(0, 80)}…`
    : `${cast.name}のプロフィール・出勤情報。全力エステ 仙台店のセラピスト。`;

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-black text-white">
      <SEO
        title={cast.name}
        description={castDescription}
        path={`/casts/${cast.id}`}
        image={cast.photo ?? undefined}
        type="profile"
      />
      <PublicNavigation />

      <main className="max-w-xl mx-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-20 backdrop-blur bg-black/70 flex items-center justify-between px-4 py-3 border-b border-white/10">
          <button onClick={() => navigate("/casts")} className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center hover:bg-white/10">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center hover:bg-white/10">
              <Search size={16} />
            </button>
            <button className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center hover:bg-white/10">
              <MoreHorizontal size={16} />
            </button>
          </div>
        </div>

        {/* Banner */}
        <div className="relative h-44 sm:h-56 bg-gradient-to-br from-[#3a1a2e] via-[#1f1322] to-[#0d0a14] overflow-hidden">
          {bannerPhoto && (
            <img src={driveImgUrl(bannerPhoto, 1200)} alt="" className="w-full h-full object-cover opacity-60" style={{ objectPosition: "center 30%" }} />
          )}
        </div>

        {/* Avatar + CTA */}
        <div className="px-4 relative">
          <div className="flex justify-between items-start -mt-12 sm:-mt-14">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-black ring-4 ring-black overflow-hidden">
              {avatarPhoto ? (
                <img src={driveImgUrl(avatarPhoto, 400)} alt={cast.name} className="w-full h-full object-cover object-top" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#c49480] to-[#a87b65] text-3xl font-bold">
                  {cast.name.charAt(0)}
                </div>
              )}
            </div>
            <button
              onClick={() => { setMsgOpen(true); setMsgSent(false); }}
              className="mt-14 sm:mt-16 px-5 py-2 rounded-full bg-white text-black font-bold text-sm hover:bg-white/90 transition-colors"
            >
              メッセージ
            </button>
          </div>

          {/* Name */}
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold">{cast.name}</h1>
              {cast.is_online && <span className="w-2 h-2 rounded-full bg-green-500" />}
            </div>
            <p className="text-sm text-white/50">@{handle}</p>
          </div>

          {/* Bio = message (1 line if exists) */}
          {cast.message && (
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-white/90">{cast.message}</p>
          )}

          {/* Stats line (replaces 福岡) */}
          {stats.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
              {stats.map((s, i) => (
                <span key={i} className="flex items-baseline gap-1">
                  <span className="text-white/40 text-xs">{s.label}</span>
                  <span className="font-semibold text-white">{s.value}</span>
                </span>
              ))}
              {displayBlood && (
                <span className="flex items-baseline gap-1">
                  <span className="text-white/40 text-xs">血液型</span>
                  <span className="font-semibold text-white">{displayBlood}</span>
                </span>
              )}
            </div>
          )}

          {/* Followers row (sub CTAs) */}
          <div className="mt-3 flex items-center gap-4 text-sm text-white/60">
            <a href="tel:09081264042" className="flex items-center gap-1 hover:underline">
              <Phone size={13} /><span className="text-white font-semibold">電話予約</span>
            </a>
            <Link to="/booking" className="flex items-center gap-1 hover:underline">
              <Calendar size={13} /><span className="text-white font-semibold">Web予約</span>
            </Link>
            {cast.o2_url && (
              <a href={cast.o2_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                <Star size={13} /><span className="text-white font-semibold">口コミ</span>
              </a>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 grid grid-cols-2 border-b border-white/10 sticky top-[57px] z-10 bg-black/80 backdrop-blur">
          {([
            { k: "posts", label: "ポスト" },
            { k: "profile", label: "プロフィール" },
          ] as const).map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className="relative py-3.5 text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              <span className={tab === t.k ? "text-white" : "text-white/50"}>{t.label}</span>
              {tab === t.k && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 rounded-full bg-[#1d9bf0]" />}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {tab === "posts" && (
          <div className="divide-y divide-white/10">
            {timeline.length === 0 && (
              <div className="py-16 text-center text-white/40 text-sm">まだ投稿がありません</div>
            )}
            {timeline.map((p) => (
              <article key={p.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
                    {avatarPhoto && <img src={driveImgUrl(avatarPhoto, 200)} alt="" className="w-full h-full object-cover object-top" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm">
                      <span className="font-bold truncate">{cast.name}</span>
                      <span className="text-white/50 truncate">@{handle}</span>
                      <span className="text-white/50">·</span>
                      <span className="text-white/50">{fmtDate(p.created_at)}</span>
                    </div>
                    {p.body && (
                      <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{p.body}</p>
                    )}
                    {p.image_urls && p.image_urls.length > 0 && (
                      <div className={`mt-2 rounded-2xl overflow-hidden border border-white/10 grid gap-0.5 ${p.image_urls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                        {p.image_urls.slice(0, 4).map((url, i) => (
                          <img key={i} src={driveImgUrl(url, 800)} alt="" className="w-full object-cover" style={{ maxHeight: p.image_urls!.length === 1 ? 480 : 240, aspectRatio: p.image_urls!.length === 1 ? "auto" : "1/1" }} />
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between max-w-xs text-white/50">
                      <button className="flex items-center gap-1.5 text-xs hover:text-[#1d9bf0] transition-colors"><Reply size={15} /></button>
                      <button className="flex items-center gap-1.5 text-xs hover:text-green-500 transition-colors"><Repeat2 size={15} /></button>
                      <button className="flex items-center gap-1.5 text-xs hover:text-pink-500 transition-colors"><Heart size={15} /></button>
                      <button className="flex items-center gap-1.5 text-xs hover:text-[#1d9bf0] transition-colors"><Share size={15} /></button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Profile tab */}
        {tab === "profile" && (
          <div className="px-4 py-4 space-y-4">
            {cast.message && (
              <section>
                <h3 className="text-xs font-bold tracking-widest text-white/40 mb-2">MESSAGE</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{cast.message}</p>
              </section>
            )}
            {(cast.favorite_techniques || cast.hobbies || cast.favorite_food || cast.celebrity_lookalike || cast.day_off_activities || cast.ideal_type) && (
              <section>
                <h3 className="text-xs font-bold tracking-widest text-white/40 mb-2">INTERVIEW</h3>
                <dl className="divide-y divide-white/10 border border-white/10 rounded-xl overflow-hidden">
                  {[
                    cast.therapist_years != null && { q: "セラピスト歴", a: `${cast.therapist_years}年` },
                    cast.favorite_techniques && { q: "得意な施術", a: cast.favorite_techniques },
                    cast.hobbies && { q: "趣味・特技", a: cast.hobbies },
                    cast.favorite_food && { q: "好きな食べ物", a: cast.favorite_food },
                    cast.celebrity_lookalike && { q: "似ている芸能人", a: cast.celebrity_lookalike },
                    cast.day_off_activities && { q: "休日の過ごし方", a: cast.day_off_activities },
                    cast.ideal_type && { q: "好みのタイプ", a: cast.ideal_type },
                  ].filter(Boolean).map((it: any) => (
                    <div key={it.q} className="px-4 py-3 flex gap-4 text-sm">
                      <dt className="shrink-0 w-24 text-white/50">{it.q}</dt>
                      <dd className="whitespace-pre-wrap">{it.a}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {(cast.x_account || cast.line_url || cast.litlink_url || cast.o2_url) && (
              <section>
                <h3 className="text-xs font-bold tracking-widest text-white/40 mb-2">LINKS</h3>
                <div className="flex flex-wrap gap-2">
                  {cast.x_account && <a href={cast.x_account.startsWith("http") ? cast.x_account : `https://twitter.com/${cast.x_account}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-full border border-white/20 text-sm hover:bg-white/10">X</a>}
                  {cast.line_url && <a href={cast.line_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-full border border-green-500/50 text-green-400 text-sm hover:bg-green-500/10">LINE</a>}
                  {cast.litlink_url && <a href={cast.litlink_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-full border border-white/20 text-sm hover:bg-white/10">リットリンク</a>}
                  {cast.o2_url && <a href={cast.o2_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-full border border-pink-400/50 text-pink-300 text-sm hover:bg-pink-500/10">O2 口コミ</a>}
                </div>
              </section>
            )}
          </div>
        )}

        <div className="text-center py-6">
          <Link to="/casts" className="text-sm text-white/40 hover:underline">← セラピスト一覧に戻る</Link>
        </div>
      </main>

      <PublicFooter />
      <FixedBottomBar />

      {/* メッセージ送信ダイアログ */}
      {msgOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#16181c] shadow-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <p className="font-semibold text-sm">{cast.name}へメッセージ</p>
              <button onClick={() => setMsgOpen(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>
            {msgSent ? (
              <div className="px-6 py-10 text-center space-y-3">
                <div className="text-4xl">💌</div>
                <p className="font-semibold">メッセージを送りました！</p>
                <p className="text-sm text-white/60">{cast.name}に届きます。お楽しみに♪</p>
                <button onClick={() => setMsgOpen(false)} className="mt-2 px-6 py-2 rounded-full text-sm font-semibold bg-white text-black">閉じる</button>
              </div>
            ) : (
              <div className="px-5 py-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-white/60 block mb-1">お名前（ニックネームOK）</label>
                  <input type="text" value={msgName} onChange={e => setMsgName(e.target.value)} placeholder="例：タロウ"
                    className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1d9bf0]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/60 block mb-1">メッセージ</label>
                  <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} placeholder={`${cast.name}へのメッセージを入力...`} rows={4}
                    className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1d9bf0] resize-none" />
                </div>
                <button onClick={handleSendMessage} disabled={msgSending || !msgName.trim() || !msgBody.trim()}
                  className="w-full py-3 rounded-full bg-white text-black font-bold text-sm disabled:opacity-40">
                  {msgSending ? "送信中..." : "送信する"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CastDetail;
