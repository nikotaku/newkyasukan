import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";

interface NewsItem {
  id: string;
  title: string;
  content: string;
  created_at: string;
  is_pinned: boolean;
}

const News = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "お知らせ｜全力エステ 仙台店";
    (async () => {
      const { data } = await supabase
        .from("board_posts")
        .select("id,title,content,created_at,is_pinned")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (data) setNews(data as NewsItem[]);
      setLoading(false);
    })();
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PublicNavigation />
      <main className="max-w-3xl mx-auto px-4 py-10">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-widest">NEWS</h1>
          <p className="text-sm text-muted-foreground mt-2">お知らせ</p>
        </header>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">読み込み中...</p>
        ) : news.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">お知らせはまだありません</p>
        ) : (
          <ul className="space-y-4">
            {news.map((n) => (
              <li
                key={n.id}
                className="border border-border rounded-lg p-5 bg-card hover:shadow-md transition"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span>{formatDate(n.created_at)}</span>
                  {n.is_pinned && (
                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded">
                      重要
                    </span>
                  )}
                </div>
                <h2 className="font-semibold text-base mb-2">{n.title}</h2>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {n.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
};

export default News;
