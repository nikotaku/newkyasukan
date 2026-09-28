// 管理画面アプリ（ホーム画面に追加したもの）のプッシュ通知を受け取る Service Worker。
// fetch は横取りしない（公開サイト・管理画面の表示やキャッシュには関わらない）。
// 通知の中身は Edge Function push-notify が送る { title, body, url, tag }。

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
      icon: "/admin-app/icon-192.png",
      badge: "/admin-app/icon-192.png",
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
