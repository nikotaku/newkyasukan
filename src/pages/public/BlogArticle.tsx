import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Clock3, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { useStoreContact } from "@/hooks/useStoreContact";
import { trackPublicEvent } from "@/lib/publicAnalytics";
import {
  PublicBlogArticle,
  blogCategoryLabel,
  blogContentBlocks,
  blogExcerpt,
  formatBlogDate,
  isVideoUrl,
} from "@/lib/publicBlog";

const linkedText = (text: string) => text.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
  /^https?:\/\//.test(part) ? (
    <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4" style={{ color: "var(--pub-accent,#d4547a)" }}>
      {part}
      <ExternalLink className="ml-1 inline" size={13} aria-label="外部リンク" />
    </a>
  ) : part,
);

const upsertMeta = (selector: string, attributes: Record<string, string>) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element!.setAttribute(name, value));
};

const upsertCanonical = (href: string) => {
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = href;
};

const ArticleImage = ({ url, alt, className }: { url: string; alt: string; className: string }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`flex min-h-[180px] items-center justify-center bg-[var(--pub-card2,#2b1a28)] text-[var(--pub-accent-light,#f2a0bc)] ${className}`}>
        <ImageIcon size={30} aria-hidden="true" />
      </div>
    );
  }
  return <img src={url} alt={alt} onError={() => setFailed(true)} className={className} />;
};

export default function BlogArticle() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { store, storeId, loading: storeLoading } = useStore();
  const { lineUrl } = useStoreContact();
  const [article, setArticle] = useState<PublicBlogArticle | null>(null);
  const [related, setRelated] = useState<PublicBlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const storeName = store?.name ?? "艶華";

  useEffect(() => {
    if (storeLoading || !slug) return;
    let active = true;
    setLoading(true);
    supabase
      .from("hp_articles")
      .select("id,store_id,title,slug,content,category,excerpt,seo_title,seo_description,image_urls,is_published,created_at,updated_at,published_at")
      .eq("store_id", storeId)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) console.error("blog article load failed", error);
        const found = data as PublicBlogArticle | null;
        setArticle(found);
        if (found) {
          const { data: relatedRows } = await supabase
            .from("hp_articles")
            .select("id,store_id,title,slug,content,category,excerpt,seo_title,seo_description,image_urls,is_published,created_at,updated_at,published_at")
            .eq("store_id", storeId)
            .eq("is_published", true)
            .neq("id", found.id)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(3);
          if (active) setRelated((relatedRows || []) as PublicBlogArticle[]);
        }
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [slug, storeId, storeLoading]);

  const blocks = useMemo(() => blogContentBlocks(article?.content), [article?.content]);
  const mediaUrls = article?.image_urls || [];
  const images = mediaUrls.filter((url) => !isVideoUrl(url));
  const videos = mediaUrls.filter(isVideoUrl);
  const publishedAt = article?.published_at || article?.created_at;
  const updated = article?.updated_at && article.updated_at !== article.created_at ? article.updated_at : null;

  useEffect(() => {
    if (!article?.slug) return;
    const origin = store?.custom_domain
      ? `https://${store.custom_domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
      : "https://enka-salon.jp";
    const canonicalUrl = `${origin}/blog/${encodeURIComponent(article.slug)}`;
    const title = article.seo_title?.trim() || `${article.title}｜${storeName}｜読みもの`;
    const description = article.seo_description?.trim() || blogExcerpt(article.content, article.excerpt, 155);
    const image = images[0];
    document.title = title;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: "index,follow,max-image-preview:large" });
    upsertMeta('meta[name="googlebot"]', { name: "googlebot", content: "index,follow,max-image-preview:large" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "article" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    if (image) {
      upsertMeta('meta[property="og:image"]', { property: "og:image", content: image });
      upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: image });
    }
    upsertCanonical(canonicalUrl);

    document.getElementById("blog-article-jsonld")?.remove();
    const schema = document.createElement("script");
    schema.id = "blog-article-jsonld";
    schema.type = "application/ld+json";
    schema.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: article.title,
      description,
      datePublished: article.published_at || article.created_at,
      dateModified: article.updated_at || article.published_at || article.created_at,
      mainEntityOfPage: canonicalUrl,
      url: canonicalUrl,
      ...(image ? { image: [image] } : {}),
      author: { "@type": "Organization", name: storeName },
      publisher: { "@type": "Organization", name: storeName },
      inLanguage: "ja-JP",
    });
    document.head.appendChild(schema);
    return () => { document.getElementById("blog-article-jsonld")?.remove(); };
  }, [article, images, store?.custom_domain, storeName]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--pub-bg,#150a11)", color: "var(--pub-text,#f7e9f0)" }}>
        <PublicNavigation />
        <main className="mx-auto max-w-3xl px-4 py-24 text-center text-sm" style={{ color: "var(--pub-text-muted,#a98496)" }}>記事を読み込んでいます…</main>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "var(--pub-bg,#150a11)", color: "var(--pub-text,#f7e9f0)" }}>
        <PublicNavigation />
        <main className="mx-auto max-w-3xl px-4 py-24 text-center">
          <p className="text-sm" style={{ color: "var(--pub-text-muted,#a98496)" }}>お探しの記事は見つかりませんでした。</p>
          <Link to="/blog" className="mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ backgroundColor: "var(--pub-accent,#d4547a)" }}>ブログ一覧へ戻る</Link>
        </main>
        <PublicFooter />
        <FixedBottomBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "var(--pub-bg,#150a11)", color: "var(--pub-text,#f7e9f0)" }}>
      <PublicNavigation />
      <main className="container mx-auto max-w-3xl px-4 py-7 md:py-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)} className="px-0 hover:bg-transparent" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>
            <ArrowLeft size={17} className="mr-1" />戻る
          </Button>
          <Link to="/blog" className="text-sm underline underline-offset-4" style={{ color: "var(--pub-accent-light,#f2a0bc)" }}>ブログ一覧</Link>
        </div>

        <article className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--pub-border,#4a2740)", backgroundColor: "var(--pub-card,#211320)" }}>
          <header className="border-b px-5 py-6 md:px-9 md:py-9" style={{ borderColor: "var(--pub-border,#4a2740)" }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" style={{ color: "var(--pub-text-muted,#a98496)" }}>
              <span className="rounded-full px-2.5 py-1 font-semibold" style={{ backgroundColor: "var(--pub-accent-a10,#d4547a1a)", color: "var(--pub-accent-light,#f2a0bc)" }}>{blogCategoryLabel(article.category)}</span>
              <span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden="true" />公開日 <time dateTime={publishedAt}>{formatBlogDate(publishedAt)}</time></span>
              {updated && <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden="true" />更新日 <time dateTime={updated}>{formatBlogDate(updated)}</time></span>}
            </div>
            <h1 className="mt-4 text-2xl font-bold leading-snug md:text-4xl" style={{ fontFamily: "'Noto Serif JP', serif" }}>{article.title}</h1>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>{blogExcerpt(article.content, article.excerpt, 180)}</p>
          </header>

          {images.length > 0 && (
            <div className="px-5 pt-6 md:px-9">
              <ArticleImage url={images[0]} alt={article.title} className="max-h-[520px] w-full rounded-xl object-cover" />
            </div>
          )}

          <div className="px-5 py-7 md:px-9 md:py-10">
            <div className="space-y-5 text-[15px] leading-8 md:text-base" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>
              {blocks.map((block, index) => {
                if (block.type === "h2") return <h2 key={index} className="mt-10 border-l-4 pl-3 text-xl font-bold leading-snug md:text-2xl" style={{ borderColor: "var(--pub-accent,#d4547a)", color: "var(--pub-text,#f7e9f0)" }}>{linkedText(block.text)}</h2>;
                if (block.type === "h3") return <h3 key={index} className="mt-8 text-lg font-bold" style={{ color: "var(--pub-text,#f7e9f0)" }}>{linkedText(block.text)}</h3>;
                if (block.type === "list") return <ul key={index} className="space-y-2 pl-5">{(block.items || []).map((item, itemIndex) => <li key={itemIndex} className="list-disc pl-1">{linkedText(item)}</li>)}</ul>;
                return <p key={index}>{linkedText(block.text)}</p>;
              })}
            </div>

            {images.length > 1 && (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {images.slice(1).map((url, index) => <ArticleImage key={url} url={url} alt={`${article.title} ${index + 2}`} className="rounded-xl object-cover" />)}
              </div>
            )}
            {videos.length > 0 && (
              <div className="mt-8 space-y-4">
                {videos.map((url) => <video key={url} src={url} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl border bg-black" style={{ borderColor: "var(--pub-border,#4a2740)" }}>お使いのブラウザは動画再生に対応していません。</video>)}
              </div>
            )}

            <aside className="mt-10 rounded-xl border p-5 text-center" style={{ borderColor: "var(--pub-accent,#d4547a)", backgroundColor: "var(--pub-accent-a10,#d4547a1a)" }}>
              <h2 className="text-lg font-bold" style={{ color: "var(--pub-text,#f7e9f0)" }}>ご予約・空き状況の確認はこちら</h2>
              <p className="mt-2 text-sm" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>{storeName}の出勤情報と空き状況を確認して、Webからご予約いただけます。</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link to="/schedule" className="rounded-lg border px-4 py-3 text-sm font-bold" style={{ borderColor: "var(--pub-accent,#d4547a)", color: "var(--pub-text,#f7e9f0)" }}>出勤・空き状況を見る</Link>
                <Link to="/booking" onClick={() => trackPublicEvent("booking_cta_click", { placement: "blog_article", method: "web", article_id: article.id })} className="rounded-lg px-4 py-3 text-sm font-bold text-white" style={{ backgroundColor: "var(--pub-accent,#d4547a)" }}>Web予約へ進む</Link>
              </div>
              {lineUrl && <a href={lineUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline underline-offset-4" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>LINEで相談・予約する</a>}
            </aside>
          </div>
        </article>

        {related.length > 0 && (
          <section className="mt-10" aria-labelledby="related-articles-heading">
            <h2 id="related-articles-heading" className="mb-4 text-xl font-bold">関連記事</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {related.map((item) => <Link key={item.id} to={item.slug ? `/blog/${encodeURIComponent(item.slug)}` : "/blog"} className="rounded-xl border p-4 transition-colors hover:bg-[var(--pub-card2,#2b1a28)]" style={{ borderColor: "var(--pub-border,#4a2740)", backgroundColor: "var(--pub-card,#211320)" }}><p className="text-[11px]" style={{ color: "var(--pub-accent-light,#f2a0bc)" }}>{blogCategoryLabel(item.category)} ・ {formatBlogDate(item.published_at || item.created_at)}</p><h3 className="mt-2 line-clamp-3 text-sm font-bold leading-relaxed">{item.title}</h3></Link>)}
            </div>
          </section>
        )}
      </main>
      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
}
