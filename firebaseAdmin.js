const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 싱글톤 패턴으로 Firebase Admin 관리
let firebaseApp = null;

function initializeFirebaseAdmin() {
    if (!firebaseApp) {
        try {
            console.log('Firebase Admin SDK 초기화 시작...');

            // 서비스 계정 키 파일 경로
            const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

            // 파일 존재 여부 확인
            if (!fs.existsSync(serviceAccountPath)) {
                console.error('Firebase 서비스 계정 키 파일을 찾을 수 없음:', serviceAccountPath);
                throw new Error('서비스 계정 키 파일이 없습니다');
            }

            const serviceAccount = require(serviceAccountPath);

            // 앱이 이미 초기화되었는지 확인
            try {
                firebaseApp = admin.app();
                console.log('기존 Firebase 앱이 이미 초기화됨');
            } catch (e) {
                // 앱이 아직 초기화되지 않음 - 새로 초기화
                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
                console.log('Firebase Admin SDK가 성공적으로 초기화됨');
            }
        } catch (error) {
            console.error('Firebase Admin SDK 초기화 오류:', error);
            throw error;
        }
    }

    return admin;
}

// 초기화 실행
initializeFirebaseAdmin();

module.exports = admin;
