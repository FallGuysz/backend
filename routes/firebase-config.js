// Firebase 설정을 클라이언트에 제공하는 라우터
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Firebase 설정 엔드포인트
router.get('/config', (req, res) => {
    try {
        // Firebase 설정 파일 가져오기
        const configPath = path.join(__dirname, '..', 'firebase', 'config.js');

        // 파일이 존재하는지 확인
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({
                error: 'Firebase 설정 파일을 찾을 수 없습니다.',
            });
        }

        // 설정 파일 가져오기
        const configFile = require(configPath);

        // 클라이언트에 필요한 정보만 추출
        const clientConfig = {
            apiKey: configFile.apiKey,
            authDomain: configFile.authDomain,
            projectId: configFile.projectId,
            storageBucket: configFile.storageBucket,
            messagingSenderId: configFile.messagingSenderId,
            appId: configFile.appId,
            // 웹 푸시를 위한 VAPID 키 (설정 파일에 있는 경우)
            vapidKey: configFile.vapidKey || '',
        };

        // 클라이언트에 설정 정보 전송
        res.json(clientConfig);
    } catch (error) {
        console.error('Firebase 설정 로드 오류:', error);
        res.status(500).json({
            error: 'Firebase 설정을 로드하는 중 오류가 발생했습니다.',
        });
    }
});

// Service Worker 파일 서빙
router.get('/messaging-sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'firebase-messaging-sw.js'));
});

module.exports = router;
