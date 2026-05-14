import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface NewsItem {
  id: string;
  title: string;
  content: string;
  created_at: string;
  is_pinned: boolean;
}

const PAGE_SIZE = 10;

const News = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    document.title = "お知らせ｜全力エステ 仙台店";
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("board_posts")
        .select("id,title,content,created_at,is_pinned", { count: "exact" })
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (data) setNews(data as NewsItem[]);
      if (count != null) setTotal(count);
      setLoading(false);
    })();
  }, [page]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#f8f6f3" }}>
      <PublicNavigation />
      <main className="max-w-3xl mx-auto px-4 py-8 md:py-10">
        <header className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-bold tracking-widest" style={{ color: "#7a706c", fontFamily: "'Noto Serif JP', serif" }}>NEWS</h1>
          <p className="text-sm mt-1" style={{ color: "#a89586" }}>お知らせ</p>
        </header>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">読み込み中...</p>
        ) : news.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">お知らせはまだありません</p>
        ) : (
          <ul className="space-y-4 mb-8">
            {news.map((n) => (
              <li key={n.id} className="bg-white rounded-lg shadow-sm border-l-4 border-[#c49480] p-4 md:p-5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span>{formatDate(n.created_at)}</span>
                  {n.is_pinned && (
                    <span className="px-2 py-0.5 bg-[#c49480]/20 text-[#c49480] rounded text-[10px] font-bold">
                      重要
                    </span>
                  )}
                </div>
                <h2 className="font-semibold text-sm md:text-base mb-2" style={{ color: "#7a706c" }}>{n.title}</h2>
                <p className="text-xs md:text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {n.content}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mb-10">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={p === page ? "default" : "outline"}
                className={p === page ? "bg-[#c49480] hover:bg-[#a87b65]" : ""}
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </Button>
          </div>
        )}

        {/* SHOP Section */}
        <div className="mt-8">
          <div className="text-center mb-4">
            <h3 className="text-xl font-bold" style={{ color: "#7a706c", fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.2em" }}>SHOP</h3>
            <p className="text-xs mt-1" style={{ color: "#a89586" }}>店舗情報</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-bold text-[#7a706c] w-1/3 bg-[#faf5f2]">店舗名</td>
                  <td className="py-3 px-4 text-gray-700">全力エステ 仙台</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-bold text-[#7a706c] bg-[#faf5f2]">URL</td>
                  <td className="py-3 px-4">
                    <a href="https://zenryoku-esthe.com" className="text-blue-600 hover:underline">https://zenryoku-esthe.com</a>
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-bold text-[#7a706c] bg-[#faf5f2]">営業時間</td>
                  <td className="py-3 px-4 text-gray-700">12:00〜26:00(24:40最終受付)</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-bold text-[#7a706c] bg-[#faf5f2]">TEL</td>
                  <td className="py-3 px-4">
                    <a href="tel:09081264042" className="text-gray-700 hover:underline">090-8126-4042</a>
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-bold text-[#7a706c] bg-[#faf5f2]">最寄り駅</td>
                  <td className="py-3 px-4 text-gray-700">北四番丁駅｜勾当台公園駅｜仙台駅</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-[#7a706c] bg-[#faf5f2]">エリア</td>
                  <td className="py-3 px-4 text-gray-700">出張専門</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
};

export default News;
