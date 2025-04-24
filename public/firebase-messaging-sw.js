// This is a basic Firebase Cloud Messaging service worker for web apps
// Used to receive push notifications

// Basic service worker setup for FCM
self.addEventListener('push', function (event) {
    const data = event.data.json();

    const options = {
        body: data.notification.body,
        icon: '/images/notification-icon.png',
        badge: '/images/badge-icon.png',
    };

    event.waitUntil(self.registration.showNotification(data.notification.title, options));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    event.waitUntil(clients.openWindow('/'));
});
