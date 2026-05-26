import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { ArrowLeft, Phone, Calendar, Star, MessageCircle, X } from "lucide-react";
import { SEO } from "@/components/SEO";
import useEmblaCarousel from "embla-carousel-react";
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

interface TherapistProfile {
  self_introduction: string | null;
  comment: string | null;
  hobbies: string | null;
  special_skills: string | null;
  preferred_type: string | null;
  mbti: string | null;
  career_history: string | null;
  massage_skills: string | null;
  training_count: number | null;
}

const SectionHeader = ({ label, sub }: { label: string; sub?: string }) => (
  <div className="px-5 py-3 border-b border-[#f0e4df]" style={{ background: "#2a2320" }}>
    <h3 className="text-sm font-bold tracking-widest" style={{ color: "#c49480" }}>{label}</h3>
    {sub && <p className="text-[10px] mt-0.5" style={{ color: "#7a706c" }}>{sub}</p>}
  </div>
);

const CastDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cast, setCast] = useState<Cast | null>(null);
  const [profile, setProfile] = useState<TherapistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgName, setMsgName] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgSent, setMsgSent] = useState(false);

  useEffect(() => {
    if (id) fetchAll();
  }, [id]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  const fetchAll = async () => {
    try {
      const [castRes, profileRes] = await Promise.all([
        supabase.from("casts").select("*").eq("id", id).single(),
        supabase.from("therapist_profiles").select("*").eq("cast_id", id).maybeSingle(),
      ]);
      if (castRes.error) throw castRes.error;
      setCast(castRes.data);
      setProfile(profileRes.data ?? null);
      document.title = `${castRes.data.name} | 全力エステ`;
    } catch {
      navigate("/casts");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8f6f3" }}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#c49480]" />
      </div>
    );
  }

  if (!cast) return null;

  // Parse profile JSON if stored as JSON in the profile field
  let profileJson: Record<string, any> | null = null;
  let profileText: string | null = cast.profile;
  if (cast.profile && cast.profile.trimStart().startsWith("{")) {
    try { profileJson = JSON.parse(cast.profile); profileText = null; } catch { /* keep as text */ }
  }

  const displayAge    = cast.age    ?? profileJson?.age    ?? null;
  const displayHeight = cast.height ?? profileJson?.height ?? null;
  const displayBust   = cast.bust   ?? profileJson?.bust   ?? null;
  const displayWaist  = cast.waist  ?? profileJson?.waist  ?? null;
  const displayHip    = cast.hip    ?? profileJson?.hip    ?? null;
  const displayWeight = profileJson?.weight ?? null;
  const displayBlood  = cast.blood_type ?? profileJson?.blood_type ?? null;

  const allPhotos = (cast.photos && cast.photos.length > 0
    ? cast.photos
    : cast.photo ? [cast.photo] : []
  ).filter(Boolean);

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

  // Build interview items from both casts columns and therapist_profiles
  const interviewItems: { q: string; a: string }[] = [
    profile?.self_introduction && { q: "自己紹介", a: profile.self_introduction },
    cast.therapist_years != null && { q: "セラピスト歴", a: `${cast.therapist_years}年` },
    (profile?.massage_skills || cast.favorite_techniques) && { q: "得意な施術", a: profile?.massage_skills ?? cast.favorite_techniques ?? "" },
    profile?.career_history && { q: "エステ経歴", a: profile.career_history },
    profile?.training_count != null && { q: "研修回数", a: `${profile.training_count}回` },
    (profile?.hobbies || cast.hobbies) && { q: "趣味・特技", a: profile?.hobbies ?? cast.hobbies ?? "" },
    profile?.special_skills && { q: "特技", a: profile.special_skills },
    cast.favorite_food && { q: "好きな食べ物", a: cast.favorite_food },
    cast.celebrity_lookalike && { q: "似ている芸能人", a: cast.celebrity_lookalike },
    cast.day_off_activities && { q: "休日の過ごし方", a: cast.day_off_activities },
    (profile?.preferred_type || cast.ideal_type) && { q: "好みのタイプ", a: profile?.preferred_type ?? cast.ideal_type ?? "" },
    profile?.mbti && { q: "MBTI", a: profile.mbti },
    displayBlood && { q: "血液型", a: `${displayBlood}型` },
  ].filter(Boolean) as { q: string; a: string }[];

  const therapistComment = cast.message ?? null;
  const shopComment = profile?.comment ?? null;

  const castDescription = cast.message
    ? `${cast.name}のプロフィール。${cast.message.slice(0, 80)}…`
    : `${cast.name}のプロフィール・口コミ・出勤情報。全力エステ 仙台店のセラピスト。`;

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "#f8f6f3" }}>
      <SEO
        title={cast.name}
        description={castDescription}
        path={`/casts/${cast.id}`}
        image={cast.photo ?? undefined}
        type="profile"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Person",
          "name": cast.name,
          "description": castDescription,
          "url": `https://zenryokuesthe.com/casts/${cast.id}`,
          "worksFor": { "@type": "Organization", "name": "全力エステ 仙台店" },
        }}
      />
      <PublicNavigation />

      <main className="container py-3 md:py-6 px-2 md:px-4">
        <div className="max-w-3xl mx-auto">

          <button
            onClick={() => navigate("/casts")}
            className="flex items-center gap-1 text-sm mb-4 hover:underline"
            style={{ color: "#7a706c" }}
          >
            <ArrowLeft size={14} />
            セラピスト一覧に戻る
          </button>

          <div className="bg-white rounded-lg overflow-hidden shadow-md">

            {/* ── Photo carousel ── */}
            <div className="relative bg-black">
              {allPhotos.length > 0 ? (
                <>
                  <div className="overflow-hidden" ref={emblaRef}>
                    <div className="flex">
                      {allPhotos.map((photo, i) => (
                        <div key={i} className="flex-[0_0_100%] min-w-0">
                          <img
                            src={driveImgUrl(photo, 1200)}
                            alt={`${cast.name} ${i + 1}`}
                            className="w-full object-cover"
                            style={{ maxHeight: "520px", objectPosition: "top" }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  {allPhotos.length > 1 && (
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                      {allPhotos.map((_, i) => (
                        <button key={i} onClick={() => emblaApi?.scrollTo(i)}
                          className="w-1.5 h-1.5 rounded-full transition-all"
                          style={{ background: i === selectedIndex ? "#fff" : "rgba(255,255,255,0.4)" }}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-72 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #d4b5a8, #c5a89b)" }}>
                  <span className="text-7xl font-bold text-white/60">{cast.name.charAt(0)}</span>
                </div>
              )}
              {cast.tags && cast.tags.length > 0 && (
                <div className="absolute top-3 left-3 flex flex-col gap-1">
                  {cast.tags.map((tag, i) => (
                    <span key={i} className="text-white text-xs font-bold px-2 py-0.5 rounded shadow"
                      style={{ background: tag === "人気セラピスト" ? "#ef4444" : tag === "新人" ? "#ec4899" : "#3b82f6" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {allPhotos.length > 1 && (
              <div className="flex gap-1.5 px-3 py-2 overflow-x-auto bg-[#f9f4f2]">
                {allPhotos.map((photo, i) => (
                  <button key={i} onClick={() => emblaApi?.scrollTo(i)}
                    className="flex-shrink-0 rounded overflow-hidden border-2 transition-all"
                    style={{ width: 52, height: 52, borderColor: i === selectedIndex ? "#c49480" : "transparent", opacity: i === selectedIndex ? 1 : 0.55 }}>
                    <img src={driveImgUrl(photo, 400)} alt="" className="w-full h-full object-cover object-top" />
                  </button>
                ))}
              </div>
            )}

            {/* ── Name & status ── */}
            <div className="px-5 pt-5 pb-3 border-b border-[#f0e4df]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-2xl font-bold" style={{ color: "#1a1817" }}>{cast.name}</h1>
                  {displayAge && <p className="text-sm mt-0.5" style={{ color: "#a89586" }}>{displayAge}歳</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold px-4 py-1.5 rounded-full text-white"
                    style={{ background: cast.is_online ? "#22c55e" : "#9ca3af" }}>
                    {cast.is_online ? "オンライン" : "オフライン"}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Stats grid ── */}
            {(displayHeight || displayBust || displayWaist || displayHip || displayWeight || displayBlood) && (
              <div className="border-b border-[#f0e4df]">
                <div className={`grid divide-x divide-[#f0e4df] ${[displayHeight, displayBust, displayWaist, displayHip].filter(Boolean).length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
                  {displayHeight && (
                    <div className="py-3 text-center">
                      <p className="text-[10px] font-medium mb-0.5" style={{ color: "#b8a49a" }}>身長</p>
                      <p className="text-sm font-bold" style={{ color: "#1a1817" }}>{displayHeight}cm</p>
                    </div>
                  )}
                  {displayBust && (
                    <div className="py-3 text-center">
                      <p className="text-[10px] font-medium mb-0.5" style={{ color: "#b8a49a" }}>バスト</p>
                      <p className="text-sm font-bold" style={{ color: "#1a1817" }}>{displayBust}{cast.cup_size ? `(${cast.cup_size})` : ""}</p>
                    </div>
                  )}
                  {displayWaist && (
                    <div className="py-3 text-center">
                      <p className="text-[10px] font-medium mb-0.5" style={{ color: "#b8a49a" }}>ウエスト</p>
                      <p className="text-sm font-bold" style={{ color: "#1a1817" }}>{displayWaist}</p>
                    </div>
                  )}
                  {displayHip && (
                    <div className="py-3 text-center">
                      <p className="text-[10px] font-medium mb-0.5" style={{ color: "#b8a49a" }}>ヒップ</p>
                      <p className="text-sm font-bold" style={{ color: "#1a1817" }}>{displayHip}</p>
                    </div>
                  )}
                </div>
                {(displayWeight || displayBlood) && (
                  <div className="grid grid-cols-2 divide-x divide-[#f0e4df] border-t border-[#f0e4df]">
                    {displayWeight && (
                      <div className="py-3 text-center">
                        <p className="text-[10px] font-medium mb-0.5" style={{ color: "#b8a49a" }}>体重</p>
                        <p className="text-sm font-bold" style={{ color: "#1a1817" }}>{displayWeight}kg</p>
                      </div>
                    )}
                    {displayBlood && (
                      <div className="py-3 text-center">
                        <p className="text-[10px] font-medium mb-0.5" style={{ color: "#b8a49a" }}>血液型</p>
                        <p className="text-sm font-bold" style={{ color: "#1a1817" }}>{displayBlood}型</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── CTA buttons ── */}
            <div className="px-5 py-4 flex flex-col gap-3 border-b border-[#f0e4df]">
              <a href="tel:09081264042"
                className="flex items-center justify-center gap-2 py-3.5 rounded-lg text-white font-bold text-base transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #c49480, #a87b65)" }}>
                <Phone size={17} />電話で予約する
              </a>
              <Link to="/booking"
                className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-[#f2e4de]"
                style={{ borderColor: "#c49480", color: "#7a706c" }}>
                <Calendar size={15} />Web予約はこちら
              </Link>
              {cast.o2_url && (
                <a
                  href={cast.o2_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-[#f2e4de]"
                  style={{ borderColor: "#d1c4be", color: "#7a706c" }}>
                  <Star size={15} />セラピストの口コミを見る
                </a>
              )}
              <button
                onClick={() => { setMsgOpen(true); setMsgSent(false); }}
                className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-[#f2e4de]"
                style={{ borderColor: "#c49480", color: "#c49480" }}>
                <MessageCircle size={15} />{cast.name}にメッセージを送る
              </button>
            </div>

            {/* ── セラピストインタビュー ── */}
            {interviewItems.length > 0 && (
              <>
                <SectionHeader label="INTERVIEW" sub="セラピストインタビュー" />
                <div className="divide-y divide-[#f0e4df]">
                  {interviewItems.map(({ q, a }) => (
                    <div key={q} className="px-5 py-3 flex gap-4 text-sm">
                      <dt className="shrink-0 font-semibold w-28 text-[#a89586]">Q. {q}</dt>
                      <dd className="leading-relaxed text-[#1a1817] whitespace-pre-wrap">{a}</dd>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── セラピストコメント ── */}
            {therapistComment && (
              <>
                <SectionHeader label="THERAPIST COMMENT" sub="セラピストコメント" />
                <div className="px-5 py-4" style={{ background: "#fffaf8" }}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#1a1817" }}>
                    {therapistComment}
                  </p>
                </div>
              </>
            )}

            {/* ── ショップコメント ── */}
            {shopComment && (
              <>
                <SectionHeader label="SHOP COMMENT" sub="ショップコメント" />
                <div className="px-5 py-4" style={{ background: "#f5f0ee" }}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#1a1817" }}>
                    {shopComment}
                  </p>
                </div>
              </>
            )}

            {/* ── Profile text (legacy) ── */}
            {profileText && (
              <>
                <SectionHeader label="PROFILE" sub="プロフィール" />
                <div className="px-5 py-4">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#1a1817" }}>{profileText}</p>
                </div>
              </>
            )}

            {/* ── SNS links ── */}
            {(cast.x_account || cast.line_url || cast.litlink_url || cast.o2_url) && (
              <>
                <SectionHeader label="SNS / LINKS" sub="各種リンク" />
                <div className="px-5 py-4 flex flex-wrap gap-3">
                  {cast.x_account && (
                    <a
                      href={cast.x_account.startsWith("http") ? cast.x_account : `https://twitter.com/${cast.x_account}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-colors hover:bg-[#f2e4de]"
                      style={{ borderColor: "#d1c4be", color: "#1a1817" }}
                    >
                      <img src="https://cdn2-caskan.com/caskan/asset/sns/x.png" alt="X" className="w-4 h-4" />
                      X（Twitter）
                    </a>
                  )}
                  {cast.line_url && (
                    <a
                      href={cast.line_url}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-colors hover:bg-[#f0fff0]"
                      style={{ borderColor: "#06c755", color: "#06c755" }}
                    >
                      <img src="https://storage.googleapis.com/caskan/asset/line_icon.png" alt="LINE" className="w-4 h-4" />
                      LINE
                    </a>
                  )}
                  {cast.litlink_url && (
                    <a
                      href={cast.litlink_url}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-colors hover:bg-[#f2e4de]"
                      style={{ borderColor: "#c49480", color: "#c49480" }}
                    >
                      <span className="text-xs font-bold">lit.</span>
                      リットリンク
                    </a>
                  )}
                  {cast.o2_url && (
                    <a
                      href={cast.o2_url}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-colors hover:bg-[#fff0f0]"
                      style={{ borderColor: "#e85298", color: "#e85298" }}
                    >
                      <span className="text-xs font-bold">O2</span>
                      口コミ（O2）
                    </a>
                  )}
                </div>
              </>
            )}


          </div>

          <div className="text-center mt-6 mb-2">
            <Link to="/casts" className="text-sm hover:underline" style={{ color: "#a89586" }}>
              ← セラピスト一覧に戻る
            </Link>
          </div>
        </div>
      </main>

      <PublicFooter />
      <FixedBottomBar />

      {/* ── メッセージ送信ダイアログ ── */}
      {msgOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: "#2a2320" }}>
              <p className="text-white font-semibold text-sm">{cast.name}へメッセージ</p>
              <button onClick={() => setMsgOpen(false)} className="text-white/70 hover:text-white">
                <X size={18} />
              </button>
            </div>
            {msgSent ? (
              <div className="px-6 py-10 text-center space-y-3">
                <div className="text-4xl">💌</div>
                <p className="font-semibold text-[#7a706c]">メッセージを送りました！</p>
                <p className="text-sm text-[#a89586]">{cast.name}に届きます。お楽しみに♪</p>
                <button
                  onClick={() => setMsgOpen(false)}
                  className="mt-2 px-6 py-2 rounded-full text-sm font-semibold text-white"
                  style={{ background: "#c49480" }}>
                  閉じる
                </button>
              </div>
            ) : (
              <div className="px-5 py-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#7a706c] block mb-1">お名前（ニックネームOK）</label>
                  <input
                    type="text"
                    value={msgName}
                    onChange={e => setMsgName(e.target.value)}
                    placeholder="例：タロウ"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c49480]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#7a706c] block mb-1">メッセージ</label>
                  <textarea
                    value={msgBody}
                    onChange={e => setMsgBody(e.target.value)}
                    placeholder={`${cast.name}へのメッセージを入力...`}
                    rows={4}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c49480] resize-none"
                  />
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={msgSending || !msgName.trim() || !msgBody.trim()}
                  className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #c49480, #a87b65)" }}>
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
