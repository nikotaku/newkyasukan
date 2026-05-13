import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { ExternalLink, Clock, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { driveImgUrl } from "@/lib/drive";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface TodayShift {
  id: string;
  cast_id: string;
  start_time: string;
  end_time: string;
  casts: {
    id: string;
    name: string;
    photo: string | null;
    age: number | null;
    height: number | null;
    cup_size: string | null;
    message: string | null;
    tags: string[] | null;
    x_account: string | null;
  };
}

interface News {
  id: string;
  title: string;
  content: string;
  created_at: string;
  is_pinned: boolean;
}

const BANNER_SLIDES = [
  "https://cdn2-caskan.com/caskan/img/shop_top_banner/1401_banner_1750253573.png",
  "https://cdn2-caskan.com/caskan/img/shop_top_banner/1401_banner_1750762260.png",
];

const Top = () => {
  const [todayShifts, setTodayShifts] = useState<TodayShift[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "全力エステ 仙台店｜仙台のメンズエステ";
    fetchAll();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % BANNER_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const fetchAll = async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const [s, n] = await Promise.all([
      supabase
        .from("shifts")
        .select("id,cast_id,start_time,end_time,casts(id,name,photo,age,height,cup_size,message,tags,x_account)")
        .eq("shift_date", today)
        .order("start_time", { ascending: true }),
      supabase
        .from("board_posts")
        .select("id,title,content,created_at,is_pinned")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

    if (s.data) {
      const seen = new Set<string>();
      const unique = (s.data as any[]).filter(sh => {
        if (seen.has(sh.cast_id)) return false;
        seen.add(sh.cast_id);
        return sh.casts?.is_visible !== false;
      });
      setTodayShifts(unique as TodayShift[]);
    }
    if (n.data) setNews(n.data as News[]);
    setLoading(false);
  };

  const todayLabel = format(new Date(), "M月d日(E)", { locale: ja });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "#f8f6f3" }}>
      <PublicNavigation />

      {/* ===== Banner Slider ===== */}
      <div className="relative overflow-hidden">
        <AspectRatio ratio={16 / 9}>
          <img
            src={BANNER_SLIDES[currentSlide]}
            alt="トップバナー | 全力エステ 仙台"
            className="w-full h-full object-cover transition-opacity duration-500"
          />
        </AspectRatio>
        <button
          onClick={() => setCurrentSlide((prev) => (prev - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length)}
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 p-2 rounded-full text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => setCurrentSlide((prev) => (prev + 1) % BANNER_SLIDES.length)}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 p-2 rounded-full text-white"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
          {BANNER_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentSlide ? "bg-white" : "bg-white/50"}`}
            />
          ))}
        </div>
      </div>

      {/* ===== 本日の出勤 HERO ===== */}
      <section className="py-5 md:py-10" style={{ background: "linear-gradient(180deg, #2e2b29 0%, #3a3330 100%)" }}>
        <div className="container mx-auto max-w-6xl px-3 md:px-6">
          {/* header */}
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div>
              <div className="flex items-center gap-2 text-[#c49480] text-xs tracking-widest mb-0.5">
                <Calendar size={13} />
                <span>{todayLabel} 本日の出勤</span>
              </div>
              <h2 className="text-lg md:text-2xl font-bold tracking-wider text-white">TODAY'S SCHEDULE</h2>
            </div>
            <Link
              to="/schedule"
              className="text-xs md:text-sm text-[#c49480] border border-[#c49480]/50 px-3 py-1.5 rounded hover:bg-[#c49480]/10 transition"
            >
              全員を見る →
            </Link>
          </div>

          {loading ? (
            <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide">
              {[1,2,3].map(i => (
                <div key={i} className="shrink-0 w-[130px] md:w-[160px] h-[200px] md:h-[240px] bg-white/10 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : todayShifts.length === 0 ? (
            <div className="text-center py-10 text-[#9a8c88]">
              <p className="text-sm">本日の出勤情報はまだありません</p>
              <Link to="/schedule" className="mt-3 inline-block text-[#c49480] text-xs underline">出勤スケジュールを確認する</Link>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory">
              {todayShifts.map((shift) => {
                const c = shift.casts;
                return (
                  <Link
                    to={`/casts/${c.id}`}
                    key={shift.id}
                    className="shrink-0 w-[130px] md:w-[160px] snap-start group"
                  >
                    <div className="relative rounded-lg overflow-hidden bg-[#2a2320] shadow-lg">
                      <div className="aspect-[3/4] bg-gradient-to-br from-[#3a3634] to-[#2a2320]">
                        {c.photo ? (
                          <img
                            src={driveImgUrl(c.photo, 400)}
                            alt={c.name}
                            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl text-[#c49480]/50">
                            {c.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      {/* time badge */}
                      <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-1">
                        <Clock size={9} className="text-[#c49480]" />
                        <span className="text-[10px] text-white font-medium">
                          {shift.start_time.slice(0,5)}〜{shift.end_time.slice(0,5)}
                        </span>
                      </div>
                    </div>
                    <div className="pt-1.5 pb-1 px-0.5">
                      <p className="text-sm font-bold text-white truncate">{c.name}</p>
                      <p className="text-[10px] text-[#9a8c88]">
                        {c.age && `${c.age}歳`}{c.height && ` ${c.height}㎝`}
                        {c.cup_size && ` (${c.cup_size})`}
                      </p>
                    </div>
                  </Link>
                );
              })}
              {/* more card */}
              <Link
                to="/schedule"
                className="shrink-0 w-[100px] md:w-[120px] snap-start flex flex-col items-center justify-center text-center text-[#c49480] border border-[#c49480]/30 rounded-lg hover:bg-[#c49480]/10 transition-colors gap-2 py-6"
              >
                <span className="text-2xl font-light">+</span>
                <span className="text-xs">全員</span>
              </Link>
            </div>
          )}

          {/* quick book CTA */}
          <div className="mt-4 md:mt-6 flex gap-2 justify-center flex-wrap">
            <Link
              to="/booking"
              className="inline-block bg-[#c49480] hover:bg-[#b08370] text-white font-bold text-sm px-6 py-2.5 rounded shadow transition"
            >
              Web予約はこちら
            </Link>
            <Link
              to="/schedule"
              className="inline-block border border-[#c49480] text-[#c49480] hover:bg-[#c49480]/10 font-semibold text-sm px-6 py-2.5 rounded transition"
            >
              出勤カレンダー
            </Link>
          </div>
        </div>
      </section>

      {/* ===== NEWS ===== */}
      <section className="py-8 md:py-12 bg-white/40">
        <div className="container mx-auto max-w-4xl px-3 md:px-6">
          <SectionTitle en="NEWS" jp="お知らせ" />
          {news.length === 0 ? (
            <p className="text-center text-[#a89586] text-sm mt-4">お知らせはまだありません</p>
          ) : (
            <ul className="mt-5 md:mt-8 space-y-2 md:space-y-4">
              {news.map((n) => (
                <li
                  key={n.id}
                  className="bg-white rounded-lg p-3 md:p-5 shadow-sm hover:shadow-md transition-shadow border border-[#e5d5cc]"
                >
                  <p className="text-[10px] md:text-xs text-[#a89586] mb-0.5">{formatDate(n.created_at)}</p>
                  <h3 className="text-sm md:text-base font-bold mb-1" style={{ color: "#7a706c" }}>
                    {n.title}
                  </h3>
                  <p className="text-xs text-[#5c4a3a] whitespace-pre-wrap line-clamp-2">{n.content}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="text-center mt-5 md:mt-8">
            <Link to="/news" className="text-sm text-[#7a706c] hover:text-[#c49480] transition-colors font-semibold tracking-wider">
              その他のお知らせ →
            </Link>
          </div>
        </div>
      </section>

      {/* ===== CONCEPT ===== */}
      <section
        className="py-10 md:py-20"
        style={{ background: "linear-gradient(135deg, #efd0c2 0%, #f5e1d8 50%, #efd0c2 100%)" }}
      >
        <div className="container mx-auto max-w-3xl px-3 md:px-6 text-center">
          <SectionTitle en="CONCEPT" jp="コンセプト" />
          <div className="space-y-3 mt-6 md:mt-10 leading-loose tracking-wider text-sm md:text-base" style={{ color: "#5c4a3a" }}>
            <p>素直で愛嬌があり不器用でも全力心でサービス</p>
            <p>選び抜かれたビジュアル</p>
            <p>洗練された施術</p>
            <p>妥協のない接客</p>
            <p className="pt-3 text-base md:text-xl font-bold tracking-widest">"全力エステ"は</p>
            <p>仙台のメンズエステ界における</p>
            <p className="text-base md:text-lg">「<span className="font-bold text-[#7a706c]">頂点</span>」を本気で狙う</p>
            <p>ハイレベルサロンです。</p>
            <p className="pt-3">ただ癒すだけじゃない。</p>
            <p>あなたの五感すべてを圧倒する</p>
            <p className="text-xl md:text-3xl font-bold tracking-widest pt-2 text-[#7a706c]">「全力の一撃」</p>
            <p>をご堪能ください。</p>
          </div>
        </div>
      </section>

      {/* ===== SNS / 外部リンク ===== */}
      <section className="py-8 md:py-12 bg-white/60">
        <div className="container mx-auto max-w-3xl px-3 md:px-6 text-center">
          <SectionTitle en="LINKS" jp="公式リンク" />
          <div className="flex flex-wrap justify-center gap-3 mt-5 md:mt-8">
            <a
              href="https://r.caskan.jp/zenryoku1209"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#c49480] hover:bg-[#b08370] text-white text-sm font-semibold rounded shadow transition"
            >
              Web予約 <ExternalLink size={14} />
            </a>
            <a
              href="https://twitter.com/zenryoku_esthe"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-[#c49480] text-[#7a706c] hover:bg-[#f8f6f3] text-sm font-semibold rounded transition"
            >
              X (Twitter) <ExternalLink size={14} />
            </a>
            <a
              href="https://bsky.app/profile/zenryoku-esthe.bsky.social"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-[#c49480] text-[#7a706c] hover:bg-[#f8f6f3] text-sm font-semibold rounded transition"
            >
              Bluesky <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
};

const SectionTitle = ({ en, jp }: { en: string; jp: string }) => (
  <div className="text-center">
    <h2 className="text-2xl md:text-4xl font-bold tracking-[0.3em]" style={{ color: "#7a706c" }}>
      {en}
    </h2>
    <p className="text-xs md:text-sm mt-1 tracking-widest text-[#a89586]">{jp}</p>
    <div className="mx-auto mt-2 h-px w-12 bg-[#c49480]" />
  </div>
);

export default Top;
