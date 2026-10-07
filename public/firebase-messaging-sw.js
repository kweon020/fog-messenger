// 알림 클릭 → 해당 방 열기 (Firebase보다 먼저 등록)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const roomId = (e.notification.data || {}).roomId;
  const url = self.registration.scope + (roomId ? `?room=${encodeURIComponent(roomId)}` : '');
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('navigate' in c) return c.navigate(url).then(w => (w || c).focus());
    return clients.openWindow(url);
  }));
});
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
importScripts('firebase-config.js');
firebase.initializeApp(self.FIREBASE_CONFIG);
firebase.messaging().onBackgroundMessage(p => {
  const d = p.data || {};
  return self.registration.showNotification(d.title || 'fog', {
    body: d.body || '김 서린 메시지가 도착했어요', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: d.roomId, renotify: true, data: { roomId: d.roomId }
  });
});
