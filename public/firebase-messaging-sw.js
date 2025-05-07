// This is a basic Firebase Cloud Messaging service worker for web apps
// Used to receive push notifications

// 참고: Service Worker는 import/export를 사용할 수 없으므로
// 여기에 직접 설정 값을 복사해야 합니다
// Firebase 프로젝트 설정에서 가져온 값으로 수정하세요
const firebaseConfig = {
    apiKey: 'AIzaSyCFuHAlMLW11naTr7MwH14E_W3K11cIeA8',
    authDomain: 'hamburger-9d630.firebaseapp.com',
    projectId: 'hamburger-9d630',
    storageBucket: 'hamburger-9d630.firebasestorage.app',
    messagingSenderId: '527168226905',
    appId: '1:527168226905:web:f7cb7d34231a19eabc5348',
    measurementId: 'G-3MME825YX7',
};

// Firebase SDK 로드
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 백그라운드 메시지 처리
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] 백그라운드 메시지 수신:', payload);

    const notificationTitle = payload.notification.title || '새 알림';
    const notificationOptions = {
        body: payload.notification.body || '',
        icon: '/images/notification-icon.png',
        badge: '/images/badge-icon.png',
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// 알림 클릭 이벤트
self.addEventListener('notificationclick', function (event) {
    console.log('알림 클릭됨:', event);
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
