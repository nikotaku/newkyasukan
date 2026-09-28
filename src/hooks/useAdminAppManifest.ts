import { useEffect } from "react";

// 管理画面を開いている間だけ「艶華 管理」アプリの manifest とアイコンを head に入れる。
// ホーム画面に追加すると管理画面（/admin-schedule）が開くアプリになる。公開サイトには影響しない。
const TAGS: Array<{ tag: "link" | "meta"; attrs: Record<string, string> }> = [
  { tag: "link", attrs: { rel: "manifest", href: "/admin-app/manifest.webmanifest" } },
  { tag: "link", attrs: { rel: "apple-touch-icon", href: "/admin-app/apple-touch-icon.png" } },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" } },
  { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" } },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "艶華 管理" } },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" } },
];

export function useAdminAppManifest() {
  useEffect(() => {
    const added = TAGS.map(({ tag, attrs }) => {
      const element = document.createElement(tag);
      Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
      element.setAttribute("data-admin-app", "");
      document.head.appendChild(element);
      return element;
    });
    return () => added.forEach((element) => element.remove());
  }, []);
}
