self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "You have a new update." }; }
  event.waitUntil(self.registration.showNotification(data.title || "Recall Quiz", {
    body: data.body || "You have a new update.", icon: "/favicon.svg", badge: "/favicon.svg",
    tag: data.tag || "recall-quiz-update", data: { url: data.url || "/messages" }, renotify: false
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/messages", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.focus(); if ("navigate" in client) await client.navigate(target); return;
      }
    }
    await self.clients.openWindow(target);
  })());
});