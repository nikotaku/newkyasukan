import { useMemo, useState } from "react";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { useStore } from "@/hooks/useStore";
import { copyText } from "@/lib/copyText";
import { ownLinkBannerHtml, safeHttpUrl, visibleLinkBanners } from "@/lib/linkBanners";

const DEFAULT_SITE = "https://enka-salon.jp";

/**
 * 公開HPの「リンク一覧」（/links）：他社のリンクバナーと、相互リンク用の当店のバナー。
 * 中身は管理画面のホームページダッシュボード「リンク」タブ（stores.settings.link_banners / link_own_banner）。
 * 相手のサイトが送客数を数えられるように、リンクは rel="noopener" だけ（noreferrer・nofollow は付けない）。
 */
export default function Links() {
  const { store, loading } = useStore();
  const [copied, setCopied] = useState(false);
  const settings = (store?.settings ?? {}) as Record<string, unknown>;
  const banners = visibleLinkBanners(settings.link_banners);
  const ownBanner = safeHttpUrl(settings.link_own_banner);
  const storeName = store?.name ?? "艶華";

  const siteUrl = useMemo(() => {
    const domain = (store?.custom_domain ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (domain) return `https://${domain}/`;
    if (store?.is_default ?? true) return `${DEFAULT_SITE}/`;
    return `${window.location.origin}/`;
  }, [store]);
  const ownHtml = ownLinkBannerHtml({ siteUrl, imageUrl: ownBanner, name: storeName });

  const imageBanners = banners.filter((b) => b.image_url);
  const textBanners = banners.filter((b) => !b.image_url);

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "var(--pub-bg,#0f0c09)" }}>
      <PublicNavigation />

      <main className="container mx-auto px-4 py-6 md:py-10">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-1 text-center text-2xl font-bold tracking-[0.2em] md:text-4xl" style={{ color: "var(--pub-text,#f0e6d2)" }}>LINK</h1>
          <p className="mb-6 text-center text-sm text-[var(--pub-text-muted,#a3987f)] md:mb-10">リンク</p>

          {loading ? (
            <div className="py-16 text-center text-sm text-[var(--pub-text-muted,#a3987f)]">読み込み中…</div>
          ) : banners.length === 0 ? (
            <p className="rounded-lg border border-[var(--pub-border,#3a2f1c)] py-12 text-center text-sm text-[var(--pub-text-muted,#a3987f)]">
              ただいま掲載しているリンクはありません。
            </p>
          ) : (
            <section aria-label="リンク一覧" className="rounded-lg border border-[var(--pub-border,#3a2f1c)] bg-[var(--pub-card,#1a150f)] p-4 md:p-6">
              {imageBanners.length > 0 && (
                <ul className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
                  {imageBanners.map((banner) => (
                    <li key={banner.id} className="max-w-full">
                      <a href={banner.url} target="_blank" rel="noopener" title={banner.name} className="block transition-opacity hover:opacity-80">
                        <img src={banner.image_url} alt={banner.name} loading="lazy" className="block h-auto max-w-full" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {textBanners.length > 0 && (
                <ul className={`flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm ${imageBanners.length > 0 ? "mt-5 border-t border-[var(--pub-border,#3a2f1c)] pt-5" : ""}`}>
                  {textBanners.map((banner) => (
                    <li key={banner.id}>
                      <a href={banner.url} target="_blank" rel="noopener" className="text-[var(--pub-accent,#c6a15b)] underline-offset-4 hover:underline">
                        {banner.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {ownBanner && (
            <section aria-label="当店へのリンク" className="mt-8 rounded-lg border border-[var(--pub-border,#3a2f1c)] bg-[var(--pub-card,#1a150f)] p-4 md:p-6">
              <h2 className="mb-1 text-base font-bold" style={{ color: "var(--pub-text,#f0e6d2)" }}>当店へのリンクについて</h2>
              <p className="mb-4 text-xs text-[var(--pub-text-muted,#a3987f)]">相互リンクをご希望のサイト様は、こちらのバナーをお使いください。</p>
              <div className="mb-4 flex justify-center">
                <a href={siteUrl} target="_blank" rel="noopener">
                  <img src={ownBanner} alt={storeName} loading="lazy" className="block h-auto max-w-full" />
                </a>
              </div>
              <textarea
                readOnly
                value={ownHtml}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded border border-[var(--pub-border,#3a2f1c)] bg-black/30 p-2 font-mono text-[var(--pub-text,#f0e6d2)]"
                style={{ fontSize: 16 }}
                aria-label="バナーのHTML"
              />
              <button
                type="button"
                onClick={async () => setCopied(await copyText(ownHtml))}
                className="mt-2 rounded border border-[var(--pub-accent,#c6a15b)] px-3 py-1.5 text-xs text-[var(--pub-accent,#c6a15b)] hover:bg-[var(--pub-accent-a10,#c6a15b1a)]"
              >
                {copied ? "コピーしました" : "HTMLをコピー"}
              </button>
            </section>
          )}
        </div>
      </main>

      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
}
