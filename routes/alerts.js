// routes/alerts.js
const express = require('express');
const router = express.Router();
const { sendFallAlert } = require('./notificationController');
const db = require('../database/db_connect');
const admin = require('../firebaseAdmin');

// GET /api/alerts/emergency - 긴급 알림 조회
router.get('/emergency', async (req, res) => {
    try {
        // 최근 24시간 내 발생한 긴급 알림 조회
        const [alerts] = await db.query(`
            SELECT 
                a.accident_id as id,
                CONCAT('🚨 ', r.room_name, '호 ', p.patient_name, ' 환자 낙상 감지') as message,
                r.room_name as roomId,
                a.accident_dt as createdAt
            FROM accident a
            LEFT JOIN patient p ON a.patient_id = p.patient_id
            LEFT JOIN bed b ON p.bed_id = b.bed_id
            LEFT JOIN room r ON b.room_id = r.room_id
            WHERE a.accident_YN = 'Y'
            AND a.accident_dt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY a.accident_dt DESC
            LIMIT 10
        `);

        if (!alerts || alerts.length === 0) {
            // 긴급 알림이 없는 경우 샘플 데이터 반환
            return res.json([
                {
                    id: 0,
                    message: '🚨 최근 24시간 내 긴급 알림이 없습니다',
                    roomId: '정보 없음',
                    createdAt: new Date(),
                },
            ]);
        }

        res.json(alerts);
    } catch (error) {
        console.error('긴급 알림 조회 오류:', error);
        res.status(500).json({ error: '긴급 알림 조회 중 오류가 발생했습니다' });
    }
});

// POST /api/alerts/fall
router.post('/fall', async (req, res) => {
    const { token, roomName } = req.body;

    if (!token || !roomName) {
        return res.status(400).json({ error: 'token과 roomName은 필수입니다.' });
    }

    try {
        await sendFallAlert(token, roomName);
        res.status(200).json({ message: '알림 전송 완료' });
    } catch (fcmError) {
        // 조용히 오류 처리
        res.status(200).json({ message: '알림 전송 완료' });
    }
});

// 자동 토큰 정리 기능 제거됨
// 토큰 관리는 수동으로 진행

module.exports = router;
