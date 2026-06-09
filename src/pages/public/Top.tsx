import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { WeeklyScheduleWidget } from "@/components/public/WeeklyScheduleWidget";
import { ExternalLink, ChevronLeft, ChevronRight, Newspaper } from "lucide-react";
import { format } from "date-fns";
import { AspectRatio } from "@/components/ui/aspect-ratio";

const STORE_SNS_DEFS = [
  { key: "store_sns_x", label: "店舗公式 X (旧Twitter)", short: "X", color: "#000000" },
  { key: "store_sns_line", label: "店舗公式 LINE", short: "L", color: "#06c755" },
  { key: "store_sns_o2", label: "店舗公式 O2 (ゼロツー)", short: "O2", color: "#e85298" },
  { key: "store_sns_instagram", label: "店舗公式 Instagram", short: "IG", color: "#d62976" },
  { key: "store_sns_bluesky", label: "店舗公式 Bluesky", short: "B", color: "#1185fe" },
];

const FALLBACK_BANNERS = [
  "https://cdn2-caskan.com/caskan/img/shop_top_banner/1401_banner_1750253573.png",
  "https://cdn2-caskan.com/caskan/img/shop_top_banner/1401_banner_1750762260.png",
];

interface HpArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  created_at: string;
  image_urls: string[] | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  news: "ニュース", coupon: "クーポン", schedule: "出勤情報",
  newstaff: "新人入店", campaign: "キャンペーン", tips: "ノウハウ", other: "お知らせ",
};

const Top = () => {
  const [bannerSlides, setBannerSlides] = useState<string[]>(FALLBACK_BANNERS);
  const [snsContent, setSnsContent] = useState<Record<string, string>>({});
  const [currentSlide, setCurrentSlide] = useState(0);
  const [articles, setArticles] = useState<HpArticle[]>([]);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const navigate = useNavigate();

  const storeSns = STORE_SNS_DEFS
    .map((d) => ({ ...d, url: snsContent[d.key] || "" }))
    .filter((d) => d.url);

  useEffect(() => {
    document.title = "全力エステ 仙台店｜仙台のメンズエステ";
    fetchAll();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 9000);
    return () => clearInterval(timer);
  }, []);

  const fetchAll = async () => {
    const [b, content, arts] = await Promise.all([
      supabase
        .from("banners")
        .select("image_url")
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
      supabase.from("site_content").select("key, value").like("key", "store_sns_%"),
      supabase
        .from("hp_articles")
        .select("id, title, slug, content, category, created_at, image_urls")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (content.data) {
      const map: Record<string, string> = {};
      content.data.forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
      setSnsContent(map);
    }
    if (b.data && b.data.length > 0) {
      setBannerSlides(b.data.map((r: any) => r.image_url));
    }
    if (arts.data) {
      setArticles(arts.data as HpArticle[]);
    }
  };

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "#f8f6f3" }}>
      <PublicNavigation />

      {/* ===== Banner Slider ===== */}
      <div className="relative overflow-hidden">
        <AspectRatio ratio={16 / 9}>
          <div className="relative w-full h-full bg-black">
            {bannerSlides.map((src, i) => (
              <img
                key={i}
                src={src}
                alt="トップバナー | 全力エステ 仙台"
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-[1200ms] ease-out ${
                  i === currentSlide
                    ? "opacity-100 scale-105 z-10"
                    : "opacity-0 scale-100 z-0"
                }`}
              />
            ))}
          </div>
        </AspectRatio>
        <button
          onClick={() => setCurrentSlide((prev) => (prev - 1 + bannerSlides.length) % bannerSlides.length)}
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 p-2 rounded-full text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => setCurrentSlide((prev) => (prev + 1) % bannerSlides.length)}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 p-2 rounded-full text-white"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
          {bannerSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentSlide ? "bg-white" : "bg-white/50"}`}
            />
          ))}
        </div>
      </div>

      {/* ===== 週間出勤スケジュール ===== */}
      <WeeklyScheduleWidget />

      {/* ===== Web予約 CTA ===== */}
      <div className="py-4 flex gap-2 justify-center flex-wrap" style={{ background: "#2e2b29" }}>
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

      {/* ===== ニュース ===== */}
      {articles.length > 0 && (
        <section className="py-10 md:py-16" style={{ background: "#fdf8f5" }}>
          <div className="container mx-auto max-w-3xl px-3 md:px-6">
            <SectionTitle en="NEWS" jp="新着情報" />
            <div className="mt-6 space-y-0 divide-y divide-[#e5d5cc]">
              {articles.map((a) => (
                <div key={a.id} className="py-4">
                  <button
                    className="w-full text-left group"
                    onClick={() => setExpandedArticle(expandedArticle === a.id ? null : a.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-[#a89586] whitespace-nowrap mt-0.5">
                        {format(new Date(a.created_at), "MM/dd")}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: "#f5e1d8", color: "#c49480" }}>
                        {CATEGORY_LABEL[a.category] ?? a.category}
                      </span>
                      <span className="text-sm font-medium group-hover:text-[#c49480] transition-colors flex-1" style={{ color: "#5a5550" }}>
                        {a.title}
                      </span>
                    </div>
                  </button>
                  {expandedArticle === a.id && (
                    <div className="mt-3 ml-[60px]">
                      {a.image_urls && a.image_urls.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                          {a.image_urls.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt={`${a.title} 画像${i + 1}`}
                              loading="lazy"
                              className="h-32 w-auto rounded-md object-cover shrink-0 border border-[#e5d5cc]"
                            />
                          ))}
                        </div>
                      )}
                      {a.content && (
                        <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#7a706c" }}>
                          {a.content}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== 店舗公式SNS ===== */}
      <section
        className="py-10 md:py-16"
        style={{ background: "linear-gradient(135deg, #efd0c2 0%, #f5e1d8 50%, #efd0c2 100%)" }}
      >
        <div className="container mx-auto max-w-3xl px-3 md:px-6 text-center">
          <SectionTitle en="OFFICIAL SNS" jp="店舗公式SNS" />
          <p className="text-sm mt-2" style={{ color: "#7a706c" }}>
            最短のご案内情報はこちらからご確認いただけます。
          </p>
          <div className="grid gap-3 sm:grid-cols-2 mt-6 md:mt-8">
            {storeSns.map((s) => (
              <a
                key={s.label}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition border border-[#e5d5cc]"
              >
                <span className="flex items-center justify-center w-11 h-11 rounded-full shrink-0 text-white font-bold" style={{ backgroundColor: s.color }}>
                  {s.short}
                </span>
                <span className="flex-1 text-left">
                  <span className="block font-bold text-sm" style={{ color: "#7a706c" }}>{s.label}</span>
                  <span className="text-xs text-[#a89586]">最新情報はこちら</span>
                </span>
                <ExternalLink size={16} className="text-[#c49480] shrink-0" />
              </a>
            ))}
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
