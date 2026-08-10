// ============================================================
// SERVICE WORKER — Nous Complex Orbit
// Handles push notifications so alerts can ring/vibrate even
// when the phone is asleep or the browser tab is closed.
// ============================================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fired when a push message arrives from the server (send-push
// edge function), including while the phone is locked.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Nous Complex Orbit', body: event.data ? event.data.text() : 'New message' };
  }

  const title = payload.title || 'Nous Complex Orbit';
  const options = {
    body: payload.body || 'You have a new message',
    icon: payload.icon || 'nouscomplex.png',
    badge: payload.badge || 'nouscomplex.png',
    tag: payload.tag || 'orbit-message',
    renotify: true,
    vibrate: [200, 100, 200],
    // BUGFIX: app.js sends the click-through URL nested under
    // payload.data.url (alongside type/channel_id/sender), not as a
    // top-level payload.url. Reading payload.url here always came back
    // undefined, so every notification silently fell back to '/' instead
    // of deep-linking to the actual chat.
    data: { url: (payload.data && payload.data.url) || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus (or open) the app when the notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
