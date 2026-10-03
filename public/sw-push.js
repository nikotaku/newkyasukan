// ホーム画面に追加したアプリ（管理画面・セラピストのマイページ）のプッシュ通知を受け取る Service Worker。
// fetch は横取りしない（公開サイト・管理画面の表示やキャッシュには関わらない）。
// 通知の中身は Edge Function push-notify（管理画面）・notify-therapist（マイページ）が送る { title, body, url, tag, icon }。

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "艶華 管理";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: data.icon || "/admin-app/icon-192.png",
      badge: data.icon || "/admin-app/icon-192.png",
      data: { url: data.url || "/admin-schedule" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/admin-schedule", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const opened = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (opened) {
      await opened.focus();
      if ("navigate" in opened) {
        const navigated = await opened.navigate(url).catch(() => null);
        if (navigated) return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
