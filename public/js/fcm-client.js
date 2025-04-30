// FCM 클라이언트 초기화 및 토큰 자동 등록

// Firebase SDK 로드
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js';

// Firebase 설정
let firebaseConfig;

// 현재 로그인한 사용자 정보
let currentUserType = 'caregiver'; // 'patient' 또는 'caregiver'
let currentUserId = ''; // 환자 ID

// Firebase 설정 로드
async function loadFirebaseConfig() {
    try {
        const response = await fetch('/firebase/config');
        firebaseConfig = await response.json();
        console.log('Firebase 설정 로드 성공');
        initializeFCM();
    } catch (error) {
        console.error('Firebase 설정 로드 실패:', error);
    }
}

// FCM 초기화 및 토큰 등록
async function initializeFCM() {
    try {
        // Firebase 설정 확인
        if (!firebaseConfig) {
            console.error('Firebase 설정이 로드되지 않았습니다.');
            return;
        }

        // Firebase 초기화
        const app = initializeApp(firebaseConfig);
        const messaging = getMessaging(app);

        // 알림 권한 요청
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('알림 권한이 거부되었습니다.');
            return;
        }

        // FCM 토큰 가져오기
        const currentToken = await getToken(messaging, {
            vapidKey: firebaseConfig.vapidKey, // 웹 푸시 인증서의 공개 키
        });

        if (currentToken) {
            console.log('FCM 토큰 발급 성공:', currentToken.substring(0, 15) + '...');

            // 토큰을 서버에 저장
            await saveTokenToServer(currentToken);

            // 메시지 처리
            onMessage(messaging, (payload) => {
                console.log('메시지 수신:', payload);
                displayNotification(payload);
            });

            return currentToken;
        } else {
            console.log('FCM 토큰을 가져올 수 없습니다.');
            return null;
        }
    } catch (error) {
        console.error('FCM 초기화 오류:', error);
        return null;
    }
}

// 토큰을 서버에 저장
async function saveTokenToServer(token) {
    try {
        const response = await fetch('/api/notifications/save-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: token,
                userType: currentUserType,
                // 환자인 경우에만 patientId 포함
                ...(currentUserType === 'patient' && { patientId: currentUserId }),
                deviceType: 'fcm',
            }),
        });

        const data = await response.json();
        if (data.code === 0) {
            console.log('토큰이 서버에 성공적으로 저장되었습니다.');
            return true;
        } else {
            console.error('토큰 저장 실패:', data.message);
            return false;
        }
    } catch (error) {
        console.error('토큰 저장 중 오류 발생:', error);
        return false;
    }
}

// 알림 표시
function displayNotification(payload) {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/images/notification-icon.png',
    };

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(notificationTitle, notificationOptions);
        });
    } else {
        new Notification(notificationTitle, notificationOptions);
    }
}

// 사용자 정보 설정 함수
function setUserInfo(userType, userId = '') {
    currentUserType = userType;
    currentUserId = userId;
    console.log(`사용자 정보 설정: ${userType}${userId ? ', ID: ' + userId : ''}`);
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    // Firebase 설정 로드
    loadFirebaseConfig();

    // 사용자 정보를 페이지에서 가져와서 설정
    const userInfoElement = document.getElementById('user-info');
    if (userInfoElement) {
        const userType = userInfoElement.dataset.userType;
        const userId = userInfoElement.dataset.userId;
        setUserInfo(userType, userId);
    }
});

// 전역으로 노출
window.fcmClient = {
    initialize: loadFirebaseConfig,
    setUserInfo,
};
