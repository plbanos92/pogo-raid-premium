// RaidSync Service Worker v1
// Handles background push notifications

self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = {};
  try { data = event.data.json(); } catch(e) { return; }
  // Skip OS notification if any app window is currently focused —
  // the foreground polling/realtime path already shows an in-app toast.
  var notifPromise = clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
    for (var i = 0; i < clientList.length; i++) {
      if (clientList[i].focused) return;
    }
    var title = data.title || 'RaidSync';
    var options = {
      body: data.body || '',
      tag: data.tag || 'raidSync',
      data: { click_url: (data.data && data.data.click_url) || '/?notify=queues' },
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png'
    };
    return self.registration.showNotification(title, options);
  });
  event.waitUntil(notifPromise);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var clickUrl = (event.notification.data && event.notification.data.click_url) || '/?notify=queues';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          // Tell the existing window to navigate to the click target, then focus it
          client.postMessage({ type: 'NOTIF_CLICK', click_url: clickUrl });
          return client.focus();
        }
      }
      // No existing app window — open a new one at the click URL
      return clients.openWindow(clickUrl);
    })
  );
});
