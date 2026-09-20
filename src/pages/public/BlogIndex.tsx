import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, ChevronRight, Search } from "lucide-react";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import {
  BLOG_CATEGORY_OPTIONS,
  PublicBlogArticle,
  blogCategoryLabel,
  blogExcerpt,
  formatBlogDate,
  isVideoUrl,
} from "@/lib/publicBlog";

const PAGE_SIZE = 12;

const BlogThumbnail = ({ url }: { url?: string }) => {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center" style={{ backgroundColor: "var(--pub-card2,#2b1a28)", color: "var(--pub-accent-light,#f2a0bc)" }}>
        <BookOpen size={30} aria-hidden="true" />
      </div>
    );
  }
  return <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className="aspect-[16/10] w-full object-cover" />;
};

export default function BlogIndex() {
  const { store, storeId, loading: storeLoading } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState<PublicBlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const category = searchParams.get("category") || "all";
  const search = searchParams.get("q") || "";
  const storeName = store?.name ?? "艶華";

  useEffect(() => {
    if (storeLoading) return;
    let active = true;
    setLoading(true);
    supabase
      .from("manager_blog_posts")
      .select("id,store_id,title,slug,content,category,excerpt,seo_title,seo_description,image_urls,is_published,created_at,updated_at,published_at")
      .eq("store_id", storeId)
      .eq("is_published", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error("blog list load failed", error);
        setArticles((data || []) as PublicBlogArticle[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [storeId, storeLoading]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ja-JP");
    return articles.filter((article) => {
      if (category !== "all" && article.category !== category) return false;
      if (!normalized) return true;
      return [article.title, article.excerpt, article.content, blogCategoryLabel(article.category)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ja-JP")
        .includes(normalized);
    });
  }, [articles, category, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleArticles = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [category, search]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const setCategory = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("category"); else next.set("category", value);
    setSearchParams(next, { replace: true });
  };
  const setSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("q", value); else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "var(--pub-bg,#150a11)", color: "var(--pub-text,#f7e9f0)" }}>
      <PublicNavigation />
      <header className="border-b px-4 py-10 text-center" style={{ borderColor: "var(--pub-border,#4a2740)", background: "linear-gradient(180deg, var(--pub-card,#211320), var(--pub-bg,#150a11))" }}>
        <p className="text-xs tracking-[0.35em]" style={{ color: "var(--pub-accent-light,#f2a0bc)" }}>MANAGER'S BLOG</p>
        <h1 className="mt-2 text-2xl font-bold md:text-4xl" style={{ fontFamily: "'Noto Serif JP', serif" }}>店長ブログ</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>
          {storeName}の店長から、店舗のことやご利用にまつわる読みものをお届けします。
        </p>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
        <section aria-label="ブログ記事を絞り込む" className="mb-8 rounded-2xl border p-4 md:p-5" style={{ borderColor: "var(--pub-border,#4a2740)", backgroundColor: "var(--pub-card,#211320)" }}>
          <label className="flex items-center gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--pub-border,#4a2740)", backgroundColor: "var(--pub-bg,#150a11)" }}>
            <Search size={17} style={{ color: "var(--pub-text-muted,#a98496)" }} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="キーワードで記事を探す"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--pub-text-muted,#a98496)]"
              aria-label="キーワードで記事を探す"
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="記事カテゴリー">
            <button type="button" onClick={() => setCategory("all")} className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors" style={{ borderColor: category === "all" ? "var(--pub-accent,#d4547a)" : "var(--pub-border,#4a2740)", backgroundColor: category === "all" ? "var(--pub-accent-a10,#d4547a1a)" : "transparent", color: category === "all" ? "var(--pub-accent-light,#f2a0bc)" : "var(--pub-text-mid,#dfc0cf)" }}>すべて</button>
            {BLOG_CATEGORY_OPTIONS.map((item) => (
              <button key={item.value} type="button" onClick={() => setCategory(item.value)} className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors" style={{ borderColor: category === item.value ? "var(--pub-accent,#d4547a)" : "var(--pub-border,#4a2740)", backgroundColor: category === item.value ? "var(--pub-accent-a10,#d4547a1a)" : "transparent", color: category === item.value ? "var(--pub-accent-light,#f2a0bc)" : "var(--pub-text-mid,#dfc0cf)" }}>{item.label}</button>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="py-20 text-center text-sm" style={{ color: "var(--pub-text-muted,#a98496)" }}>記事を読み込んでいます…</div>
        ) : visibleArticles.length === 0 ? (
          <section className="rounded-2xl border border-dashed px-5 py-16 text-center" style={{ borderColor: "var(--pub-border,#4a2740)", color: "var(--pub-text-muted,#a98496)" }}>
            <BookOpen className="mx-auto mb-3" size={28} aria-hidden="true" />
            <h2 className="font-bold" style={{ color: "var(--pub-text,#f7e9f0)" }}>該当する記事がありません</h2>
            <p className="mt-2 text-sm">別のキーワードやカテゴリーでお探しください。</p>
          </section>
        ) : (
          <>
            <p className="mb-4 text-xs" style={{ color: "var(--pub-text-muted,#a98496)" }}>{filtered.length}件の記事</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleArticles.map((article) => {
                const imageUrl = (article.image_urls || []).find((url) => !isVideoUrl(url));
                const articlePath = article.slug ? `/blog/${encodeURIComponent(article.slug)}` : "/blog";
                return (
                  <article key={article.id} className="group overflow-hidden rounded-2xl border transition-transform hover:-translate-y-0.5" style={{ borderColor: "var(--pub-border,#4a2740)", backgroundColor: "var(--pub-card,#211320)" }}>
                    <Link to={articlePath} className="block h-full" aria-label={`${article.title}を読む`}>
                      <BlogThumbnail url={imageUrl} />
                      <div className="p-4">
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--pub-text-muted,#a98496)" }}>
                          <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "var(--pub-accent-a10,#d4547a1a)", color: "var(--pub-accent-light,#f2a0bc)" }}>{blogCategoryLabel(article.category)}</span>
                          <time dateTime={article.published_at || article.created_at}>{formatBlogDate(article.published_at || article.created_at)}</time>
                        </div>
                        <h2 className="mt-3 line-clamp-2 text-base font-bold leading-snug group-hover:underline">{article.title}</h2>
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>{blogExcerpt(article.content, article.excerpt, 92)}</p>
                        <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold" style={{ color: "var(--pub-accent-light,#f2a0bc)" }}>続きを読む <ChevronRight size={16} aria-hidden="true" /></span>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <nav aria-label="ブログ記事のページ移動" className="mt-10 flex items-center justify-center gap-3">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: "var(--pub-border,#4a2740)" }}>前へ</button>
            <span className="text-sm" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-lg border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: "var(--pub-border,#4a2740)" }}>次へ</button>
          </nav>
        )}
      </main>
      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
}
