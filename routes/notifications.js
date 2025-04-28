const express = require('express');
const router = express.Router();
const notificationController = require('./notificationController');

// FCM 토큰 저장 (웹)
router.post('/save-token', async (req, res) => {
    try {
        const { token, userId, deviceType = 'fcm' } = req.body;

        if (!token || !userId) {
            return res.status(400).json({
                code: 1,
                message: '토큰과 사용자 ID가 필요합니다.',
            });
        }

        const result = await notificationController.saveToken(userId, token, deviceType);

        if (result.success) {
            res.json({
                code: 0,
                message: '토큰이 성공적으로 저장되었습니다.',
                data: { userId, tokenSaved: true, deviceType },
            });
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('토큰 저장 오류:', err);
        res.status(500).json({
            code: 1,
            message: '토큰 저장 실패',
            error: err.message,
        });
    }
});

// 모바일 앱 토큰 등록 (Expo)
router.post('/register-device', async (req, res) => {
    try {
        const { token, tokenType = 'expo', userId = 'anonymous', deviceInfo } = req.body;

        if (!token) {
            return res.status(400).json({
                code: 1,
                message: '토큰이 필요합니다.',
            });
        }

        const result = await notificationController.saveToken(userId, token, tokenType, deviceInfo);

        if (result.success) {
            res.json({
                code: 0,
                message: '디바이스 등록 성공',
                data: { userId, tokenSaved: true, deviceType: tokenType },
            });
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('디바이스 등록 오류:', err);
        res.status(500).json({
            code: 1,
            message: '디바이스 등록 실패',
            error: err.message,
        });
    }
});

// 디바이스 등록 해제
router.post('/unregister-device', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                code: 1,
                message: '토큰이 필요합니다.',
            });
        }

        const result = await notificationController.removeToken(token);

        if (result.success) {
            res.json({
                code: 0,
                message: '디바이스 등록 해제 성공',
            });
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('디바이스 등록 해제 오류:', err);
        res.status(500).json({
            code: 1,
            message: '디바이스 등록 해제 실패',
            error: err.message,
        });
    }
});

// 특정 사용자에게 최근 낙상 사고 알림 전송
router.post('/send-latest-alert', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                code: 1,
                message: 'FCM 토큰이 필요합니다.',
            });
        }

        const result = await notificationController.sendLatestAccidentAlert(token);

        if (result.success) {
            res.json({
                code: 0,
                message: '최근 낙상 사고 알림이 성공적으로 전송되었습니다.',
                data: result.data,
            });
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('알림 전송 오류:', err);
        res.status(500).json({
            code: 1,
            message: '알림 전송 실패',
            error: err.message,
        });
    }
});

// 모든 사용자에게 최근 낙상 사고 알림 전송
router.post('/broadcast-latest-alert', async (req, res) => {
    try {
        const result = await notificationController.sendLatestAccidentToAll();

        if (result.success) {
            res.json({
                code: 0,
                message: '모든 사용자에게 알림 전송 완료',
                data: result.data,
            });
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('일괄 알림 전송 오류:', err);
        res.status(500).json({
            code: 1,
            message: '일괄 알림 전송 실패',
            error: err.message,
        });
    }
});

module.exports = router;
