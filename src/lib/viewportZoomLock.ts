// 画面の拡大を止め、入力欄をタップしたときにiPhoneが自動で拡大して
// 横幅がずれるのを防ぐ。写真を指で拡大して見る画面だけ allowPageZoom(true) で一時的に許可する。

const LOCKED_VIEWPORT = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
const ZOOMABLE_VIEWPORT = "width=device-width, initial-scale=1.0";

let pageZoomAllowed = false;
let installed = false;

export function allowPageZoom(allowed: boolean) {
  pageZoomAllowed = allowed;
  document
    .querySelector<HTMLMetaElement>('meta[name="viewport"]')
    ?.setAttribute("content", allowed ? ZOOMABLE_VIEWPORT : LOCKED_VIEWPORT);
}

export function installViewportZoomLock() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  allowPageZoom(false);

  // iPhoneのSafariは user-scalable=no を無視するため、ピンチ操作そのものを止める。
  const blockGesture = (event: Event) => {
    if (!pageZoomAllowed) event.preventDefault();
  };
  document.addEventListener("gesturestart", blockGesture, { passive: false });
  document.addEventListener("gesturechange", blockGesture, { passive: false });
  document.addEventListener("touchmove", (event) => {
    if (!pageZoomAllowed && event.touches.length > 1) event.preventDefault();
  }, { passive: false });
}
