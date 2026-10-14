import type { CastHeroBanner } from "@/lib/castHeroBanners";

// セラピストのトップバナー（2:1）。素材の写真・名前・キャッチコピー・本日の出勤・最短の空きを、その場で組み立てる。
// 公開HPのトップ（EnkaHome）と、スタッフ画面の素材登録のプレビューで同じものを使う。

interface Props {
  banner: CastHeroBanner;
  nextAvailable?: string | null; // 「15:00」なら「最短 15:00〜」。null なら出さない
  storeName?: string;
  eager?: boolean;
}

export function CastHeroBannerSlide({ banner, nextAvailable, storeName = "艶華", eager = false }: Props) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: "var(--pub-bg,#150a11)" }}>
      {/* 背景：同じ写真をぼかして敷く */}
      <img
        src={banner.image}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl"
        loading={eager ? "eager" : "lazy"}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(10,4,8,.15) 0%, rgba(10,4,8,.55) 42%, rgba(10,4,8,.9) 100%)" }} />

      {/* 写真 */}
      <div className="absolute inset-y-0 left-0 w-[46%] overflow-hidden">
        <img
          src={banner.image}
          alt={`${banner.name}`}
          className="h-full w-full object-cover object-top"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
        />
        <div className="absolute inset-y-0 right-0 w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgba(10,4,8,.85))" }} />
      </div>

      {/* 文字 */}
      <div className="absolute inset-y-0 right-0 flex w-[58%] flex-col justify-center gap-[1.6%] px-[4%] text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em] sm:text-xs"
            style={{ backgroundColor: "var(--pub-accent,#d4547a)", color: "#fff" }}
          >
            {banner.isNewcomer ? "NEW FACE" : "TODAY"}
          </span>
          <span className="text-[9px] tracking-[0.2em] sm:text-xs" style={{ color: "var(--pub-text-muted,#cdb3c1)" }}>
            本日出勤 {banner.start}〜{banner.end}
          </span>
        </div>
        <p
          className="truncate text-[22px] font-bold leading-tight sm:text-4xl md:text-5xl"
          style={{ color: "var(--pub-text,#f7e9f0)", fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.08em" }}
        >
          {banner.name}
          {banner.age ? <span className="ml-1.5 text-[11px] font-normal sm:text-lg">（{banner.age}）</span> : null}
        </p>
        {banner.copy && (
          <p className="line-clamp-2 text-[11px] leading-snug sm:text-base md:text-lg" style={{ color: "var(--pub-text,#f7e9f0)" }}>
            {banner.copy}
          </p>
        )}
        <div className="mt-[2%] flex flex-wrap items-center gap-2">
          {nextAvailable !== undefined && (
            <span className="text-[10px] font-semibold sm:text-sm" style={{ color: "var(--pub-accent,#f08db0)" }}>
              {nextAvailable ? `最短 ${nextAvailable}〜 ご案内できます` : "本日の受付は終了しました"}
            </span>
          )}
          <span
            className="rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:px-4 sm:py-1.5 sm:text-sm"
            style={{ borderColor: "var(--pub-accent,#d4547a)", color: "var(--pub-text,#f7e9f0)" }}
          >
            {banner.name}さんを予約する
          </span>
        </div>
        <p className="absolute bottom-[5%] right-[4%] text-[8px] tracking-[0.3em] opacity-60 sm:text-[10px]" style={{ color: "var(--pub-text-muted,#cdb3c1)" }}>
          {storeName}
        </p>
      </div>
    </div>
  );
}
