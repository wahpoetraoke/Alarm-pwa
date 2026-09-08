self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type: 'window'}).then(clientList => {
      for (let client of clientList) {
        if (client.url.includes('/') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

self.addEventListener('message', event => {
  if (event.data.type === 'ALARM_TRIGGER') {
    self.registration.showNotification('⏰ WAKTUNYA BANGUN!', {
      body: event.data.label || `Alarm jam ${event.data.time} berbunyi`,
      icon: 'icon-512.png',
      badge: 'icon-512.png',
      vibrate: [500, 300, 500, 300, 1000],
      requireInteraction: true,
      tag: 'alarm-notif',
      renotify: true
    });
  }
});