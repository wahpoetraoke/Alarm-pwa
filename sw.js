self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});
self.addEventListener('message', event => {
  if (event.data.type === 'ALARM_TRIGGER') {
    self.registration.showNotification('⏰ ' + event.data.label, {
      body: `Alarm jam ${event.data.time}`,
      icon: 'icon-512.png',
      badge: 'icon-192.png',
      vibrate: [500,200,500],
      tag: 'alarm-notif'
    });
    setTimeout(() => {
      self.registration.getNotifications({tag:'alarm-notif'}).then(n=>n.forEach(x=>x.close()));
    }, 5000);
  }
});