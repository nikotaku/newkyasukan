import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { ChatBot } from "@/components/ChatBot";
import { ArrowLeft, Phone, Calendar } from "lucide-react";
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
  tags: string[] | null;
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  working: { text: "接客中", color: "#ef4444" },
  waiting: { text: "待機中", color: "#22c55e" },
  offline: { text: "退勤", color: "#9ca3af" },
};

const CastDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cast, setCast] = useState<Cast | null>(null);
  const [loading, setLoading] = useState(true);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (id) fetchCastDetail();
  }, [id]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  const fetchCastDetail = async () => {
    try {
      const { data, error } = await supabase.from("casts").select("*").eq("id", id).single();
      if (error) throw error;
      setCast(data);
      document.title = `${data.name} | 全力エステ`;
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

  // Parse profile JSON if it exists (old data stored stats as JSON in profile field)
  let profileJson: Record<string, any> | null = null;
  let profileText: string | null = cast.profile;
  if (cast.profile && cast.profile.trimStart().startsWith("{")) {
    try {
      profileJson = JSON.parse(cast.profile);
      profileText = null;
    } catch { /* keep as text */ }
  }

  const displayAge    = cast.age    ?? profileJson?.age    ?? null;
  const displayHeight = cast.height ?? profileJson?.height ?? null;
  const displayBust   = cast.bust   ?? profileJson?.bust   ?? null;
  const displayWaist  = cast.waist  ?? profileJson?.waist  ?? null;
  const displayHip    = cast.hip    ?? profileJson?.hip    ?? null;
  const displayWeight = profileJson?.weight ?? null;
  const displayBlood  = cast.blood_type ?? profileJson?.blood_type ?? null;

  // Use photos array directly (already includes main photo); fall back to [photo]
  const allPhotos = (cast.photos && cast.photos.length > 0
    ? cast.photos
    : cast.photo ? [cast.photo] : []
  ).filter(Boolean);

  const status = STATUS_LABEL[cast.status] ?? { text: cast.status, color: "#9ca3af" };

  const interview: { label: string; value: string | null | undefined }[] = [
    { label: "セラピスト歴", value: cast.therapist_years != null ? `${cast.therapist_years}年` : null },
    { label: "得意な施術", value: cast.favorite_techniques },
    { label: "好きな食べ物", value: cast.favorite_food },
    { label: "似ている芸能人", value: cast.celebrity_lookalike },
    { label: "趣味・特技", value: cast.hobbies },
    { label: "休日の過ごし方", value: cast.day_off_activities },
    { label: "好みのタイプ", value: cast.ideal_type },
    { label: "血液型", value: displayBlood ? null : cast.blood_type },
  ].filter((i) => i.value);

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "#f8f6f3" }}>
      <PublicNavigation />

      <main className="container py-6 px-4">
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
            {/* Photo carousel */}
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
                        <button
                          key={i}
                          onClick={() => emblaApi?.scrollTo(i)}
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
                    <span
                      key={i}
                      className="text-white text-xs font-bold px-2 py-0.5 rounded shadow"
                      style={{ background: tag === "人気セラピスト" ? "#ef4444" : tag === "新人" ? "#ec4899" : "#3b82f6" }}
                    >
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
                  <button
                    key={i}
                    onClick={() => emblaApi?.scrollTo(i)}
                    className="flex-shrink-0 rounded overflow-hidden border-2 transition-all"
                    style={{
                      width: 52, height: 52,
                      borderColor: i === selectedIndex ? "#c49480" : "transparent",
                      opacity: i === selectedIndex ? 1 : 0.55,
                    }}
                  >
                    <img src={driveImgUrl(photo, 400)} alt="" className="w-full h-full object-cover object-top" />
                  </button>
                ))}
              </div>
            )}

            {/* Name & status */}
            <div className="px-5 pt-5 pb-3 border-b border-[#f0e4df]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-2xl font-bold" style={{ color: "#1a1817" }}>{cast.name}</h1>
                  {displayAge && <p className="text-sm mt-0.5" style={{ color: "#a89586" }}>{displayAge}歳</p>}
                </div>
                <span
                  className="text-sm font-bold px-4 py-1.5 rounded-full text-white"
                  style={{ background: status.color }}
                >
                  {status.text}
                </span>
              </div>
            </div>

            {/* Stats grid */}
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

            {/* Shop comment */}
            {cast.message && (
              <div className="px-5 py-4 border-b border-[#f0e4df]" style={{ background: "#fffaf8" }}>
                <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#b8a49a" }}>COMMENT</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#1a1817" }}>
                  {cast.message}
                </p>
              </div>
            )}

            {/* Profile text */}
            {profileText && (
              <div className="px-5 py-4 border-b border-[#f0e4df]">
                <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#b8a49a" }}>PROFILE</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#1a1817" }}>
                  {profileText}
                </p>
              </div>
            )}

            {/* Interview Q&A */}
            {interview.length > 0 && (
              <div className="px-5 py-4 border-b border-[#f0e4df]">
                <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#b8a49a" }}>INTERVIEW</h3>
                <dl className="space-y-2.5">
                  {interview.map(({ label, value }) => (
                    <div key={label} className="flex gap-3 text-sm">
                      <dt className="shrink-0 font-semibold w-28" style={{ color: "#a89586" }}>Q. {label}</dt>
                      <dd className="leading-relaxed" style={{ color: "#1a1817" }}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* X account */}
            {cast.x_account && (
              <div className="px-5 py-3 border-b border-[#f0e4df] flex items-center gap-3">
                <img src="https://cdn2-caskan.com/caskan/asset/sns/x.png" alt="X" className="w-5 h-5" />
                <a
                  href={cast.x_account.startsWith("http") ? cast.x_account : `https://twitter.com/${cast.x_account}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:underline"
                  style={{ color: "#c49480" }}
                >
                  {cast.x_account}
                </a>
              </div>
            )}

            {/* CTA buttons */}
            <div className="px-5 py-5 flex flex-col gap-3">
              <a
                href="tel:09081264042"
                className="flex items-center justify-center gap-2 py-3.5 rounded-lg text-white font-bold text-base transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #c49480, #a87b65)" }}
              >
                <Phone size={17} />
                電話で予約する
              </a>
              <Link
                to="/schedule"
                className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-[#f2e4de]"
                style={{ borderColor: "#c49480", color: "#7a706c" }}
              >
                <Calendar size={15} />
                出勤スケジュールを見る
              </Link>
            </div>
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
      <ChatBot />
    </div>
  );
};

export default CastDetail;
