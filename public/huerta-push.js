// Huerta's morning alerts, in the service worker (vite.config.ts imports it).
// The Huerta Worker's cron sends {title, body, url}; a tap opens that garden.
const scoped = path =>
  new URL(path.replace(/^\//, ''), self.registration.scope).href;

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Funges', {
      body: data.body,
      icon: scoped('icons/logo_app.png'),
      // A newer morning replaces an unread one.
      tag: 'huerta-morning',
      data: { url: scoped(data.url || 'huerta') },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data.url;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(open => {
        const tab = open.find(client =>
          client.url.startsWith(self.registration.scope)
        );
        if (!tab) return self.clients.openWindow(url);
        return tab.navigate(url).then(client => (client || tab).focus());
      })
  );
});
