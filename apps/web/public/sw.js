/* Web push service worker: shows Tier-3 operator events and opens the app on click. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "ZIBBY", body: event.data.text() };
  }
  const { title = "ZIBBY", body, url, tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, { body, tag, icon: "/icon.png", data: { url } }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open
        ? open
            .focus()
            .then((w) => w.navigate(url))
            .catch(() => self.clients.openWindow(url))
        : self.clients.openWindow(url);
    }),
  );
});
