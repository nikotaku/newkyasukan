import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * セラピストの称号バッジ（写真右上に表示）。
 * デザインは style_key ごとにWEBマーケ観点（視認性・緊急性・特別感）で作り分ける。
 * マスタは cast_title_badges、紐付けは casts.title_badge_id。
 */

export interface TitleBadge {
  id: string;
  label: string;
  style_key: string;
}

// style_key → デザイン定義
const BADGE_STYLES: Record<string, { style: React.CSSProperties; className?: string }> = {
  // 電撃入店：稲妻イエロー×黒。瞬発的な緊急感
  lightning: {
    style: {
      background: "linear-gradient(135deg, #ffe259 0%, #ffa751 100%)",
      color: "#1a1a1a",
      boxShadow: "0 2px 8px rgba(255,167,81,.6)",
    },
    className: "animate-pulse",
  },
  // WEB予約人気：ゴールドの信頼感・実績感
  star: {
    style: {
      background: "linear-gradient(135deg, #f7d774 0%, #c6a15b 55%, #a87c2a 100%)",
      color: "#fff",
      textShadow: "0 1px 2px rgba(0,0,0,.35)",
      boxShadow: "0 2px 8px rgba(198,161,91,.55)",
    },
  },
  // 完全未経験：フレッシュグリーンの初々しさ
  fresh: {
    style: {
      background: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
      color: "#fff",
      textShadow: "0 1px 2px rgba(0,0,0,.3)",
      boxShadow: "0 2px 8px rgba(16,185,129,.5)",
    },
  },
  // 本日デビュー：ピンク×白のときめき感
  debut: {
    style: {
      background: "linear-gradient(135deg, #f9a8d4 0%, #ec4899 100%)",
      color: "#fff",
      textShadow: "0 1px 2px rgba(0,0,0,.3)",
      boxShadow: "0 2px 8px rgba(236,72,153,.55)",
    },
    className: "animate-pulse",
  },
  // 予約殺到：レッド×オレンジの緊急性・FOMO
  fire: {
    style: {
      background: "linear-gradient(135deg, #f97316 0%, #dc2626 100%)",
      color: "#fff",
      textShadow: "0 1px 2px rgba(0,0,0,.35)",
      boxShadow: "0 2px 10px rgba(220,38,38,.6)",
    },
    className: "animate-pulse",
  },
  // リピート率No.1：パープル×ゴールドの王者感
  crown: {
    style: {
      background: "linear-gradient(135deg, #7c3aed 0%, #4c1d95 70%)",
      color: "#fde68a",
      textShadow: "0 1px 2px rgba(0,0,0,.45)",
      boxShadow: "0 2px 8px rgba(124,58,237,.55)",
      border: "1px solid rgba(253,230,138,.7)",
    },
  },
  // SNSで話題：シアン×ブルーのトレンド感
  gem: {
    style: {
      background: "linear-gradient(135deg, #22d3ee 0%, #2563eb 100%)",
      color: "#fff",
      textShadow: "0 1px 2px rgba(0,0,0,.35)",
      boxShadow: "0 2px 8px rgba(37,99,235,.55)",
    },
  },
  // 期間限定在籍：黒×赤の希少性・締切感
  limited: {
    style: {
      background: "#111111",
      color: "#fca5a5",
      border: "1px solid #ef4444",
      boxShadow: "0 2px 8px rgba(239,68,68,.5)",
    },
  },
  // 既定：ゴールド
  gold: {
    style: {
      background: "linear-gradient(135deg, #c6a15b 0%, #a87c2a 100%)",
      color: "#fff",
      textShadow: "0 1px 2px rgba(0,0,0,.3)",
      boxShadow: "0 2px 6px rgba(0,0,0,.35)",
    },
  },
};

export const CastTitleBadge = ({ badge, className = "" }: { badge?: TitleBadge | null; className?: string }) => {
  if (!badge) return null;
  const design = BADGE_STYLES[badge.style_key] ?? BADGE_STYLES.gold;
  return (
    <span
      className={`inline-block text-[10px] md:text-[11px] font-bold px-2 py-1 rounded-md leading-none whitespace-nowrap ${design.className ?? ""} ${className}`}
      style={design.style}
    >
      {badge.label}
    </span>
  );
};

// バッジマスタ取得フック（モジュールキャッシュ付き）
let cachedBadges: TitleBadge[] | null = null;

export const useTitleBadges = (): Map<string, TitleBadge> => {
  const [badges, setBadges] = useState<TitleBadge[]>(cachedBadges ?? []);

  useEffect(() => {
    if (cachedBadges) return;
    supabase
      .from("cast_title_badges" as any)
      .select("id, label, style_key")
      .eq("is_active", true)
      .then(({ data }) => {
        cachedBadges = (data || []) as unknown as TitleBadge[];
        setBadges(cachedBadges);
      });
  }, []);

  return new Map(badges.map((b) => [b.id, b]));
};
