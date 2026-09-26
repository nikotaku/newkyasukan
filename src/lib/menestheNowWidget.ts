// メンエスなう（men-esthe.co.jp）の埋め込みウィジェット設定。
// 店舗ごとに stores.settings.menesthe_now_widget に { store, type, theme } を持たせる。
//
// 公式の script タグ版は設置先ページで他社のJSを動かすことになり、同じドメインで動く管理画面の
// ログイン情報（localStorage）に触れられてしまう。公式の iframe 版ラッパー（/widget/embed/）で埋め込み、
// 表示はそのままに、ウィジェット側からこちらのページへ手が届かないようにする。

const WIDGET_ORIGIN = "https://men-esthe.co.jp";
const WIDGET_TYPES = ["timeline", "attendance", "staff", "media"] as const;

export type MenestheNowWidgetType = (typeof WIDGET_TYPES)[number];

export interface MenestheNowWidgetConfig {
  store: string;
  type: MenestheNowWidgetType;
  theme: "dark" | "light";
}

export function parseMenestheNowWidget(value: unknown): MenestheNowWidgetConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.enabled === false) return null;
  const store = typeof raw.store === "string" ? raw.store.trim() : "";
  // URLのパスに入れるので、公式のPUID形式（英数字）以外は受け付けない
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(store)) return null;
  const type = WIDGET_TYPES.find((t) => t === raw.type) ?? "timeline";
  const theme = raw.theme === "light" ? "light" : "dark";
  return { store, type, theme };
}

export function menestheNowEmbedUrl(config: MenestheNowWidgetConfig) {
  const params = new URLSearchParams({ type: config.type, theme: config.theme, fill: "1" });
  return `${WIDGET_ORIGIN}/widget/embed/shop/${encodeURIComponent(config.store)}/?${params.toString()}`;
}
