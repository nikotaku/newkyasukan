import { useEffect } from "react";

// セラピストのマイページを開いている間だけ「艶華 マイページ」アプリの manifest とアイコンを head に入れる。
// manifest に start_url を書いていないので、ホーム画面に追加すると開いていたURL（本人のマイページ）が開く。
// iPhoneはホーム画面から開いたときだけ予約のプッシュ通知を受け取れる（iOS 16.4以降）。
const TAGS: Array<{ tag: "link" | "meta"; attrs: Record<string, string> }> = [
  { tag: "link", attrs: { rel: "manifest", href: "/therapist-app/manifest.webmanifest" } },
  { tag: "link", attrs: { rel: "apple-touch-icon", href: "/therapist-app/apple-touch-icon.png" } },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" } },
  { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" } },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "艶華 マイページ" } },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" } },
];

export function useTherapistAppManifest() {
  useEffect(() => {
    const added = TAGS.map(({ tag, attrs }) => {
      const element = document.createElement(tag);
      Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
      element.setAttribute("data-therapist-app", "");
      document.head.appendChild(element);
      return element;
    });
    return () => added.forEach((element) => element.remove());
  }, []);
}
