const express = require('express');
const router = express.Router();
const db = require('../database/db_connect');
const { sendFallAlert } = require('./notificationController');

// GET /accidents - 낙상 사고 목록 조회
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                a.accident_id,
                a.patient_id,
                p.patient_name,
                a.accident_dt as accident_date,
                a.accident_YN,
                b.bed_num,
                r.room_name
            FROM accident a
            LEFT JOIN patient p ON a.patient_id = p.patient_id
            LEFT JOIN bed b ON p.bed_id = b.bed_id
            LEFT JOIN room r ON b.room_id = r.room_id
            ORDER BY a.accident_dt DESC
        `;

        const [rows] = await db.query(query);
        res.json({
            code: 0,
            message: '낙상 사고 목록을 성공적으로 조회했습니다.',
            data: rows,
        });
    } catch (error) {
        console.error('Error fetching fall incidents:', error);
        res.status(500).json({
            code: 1,
            message: '낙상 사고 데이터를 불러오는데 실패했습니다.',
        });
    }
});

// GET /fall-incidents/stats - 시간대별 낙상 사고 통계
router.get('/stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                FLOOR(HOUR(accident_dt) / 3) * 3 as hour_start,
                COUNT(*) as count
            FROM accident
            WHERE accident_YN = 'Y'
            GROUP BY FLOOR(HOUR(accident_dt) / 3)
            ORDER BY hour_start
        `;

        const [rows] = await db.query(query);

        // 3시간 간격으로 8개 구간 데이터 생성 (없는 시간대는 0으로 채움)
        const hourlyStats = Array(8)
            .fill(0)
            .map((_, index) => {
                const hourStart = index * 3;
                const found = rows.find((row) => row.hour_start === hourStart);
                return {
                    hour: `${hourStart}시-${hourStart + 2}시`,
                    count: found ? found.count : 0,
                };
            });

        res.json({
            code: 0,
            data: hourlyStats,
        });
    } catch (error) {
        console.error('Error fetching fall incident stats:', error);
        res.status(500).json({
            code: 1,
            message: '낙상 사고 통계를 불러오는데 실패했습니다.',
        });
    }
});

// POST /fall-incidents - 낙상 사고 생성 및 알림 전송
router.post('/', async (req, res) => {
    try {
        const { patient_id, accident_YN = 'Y' } = req.body;

        if (!patient_id) {
            return res.status(400).json({
                code: 1,
                message: '환자 ID는 필수입니다.',
            });
        }

        // 1. 환자 정보 조회 (병실 이름 포함)
        const [patientInfo] = await db.query(
            `SELECT 
                p.patient_id,
                p.patient_name, 
                r.room_name,
                r.room_id
            FROM 
                patient p
            LEFT JOIN 
                bed b ON p.bed_id = b.bed_id
            LEFT JOIN 
                room r ON b.room_id = r.room_id
            WHERE 
                p.patient_id = ?`,
            [patient_id]
        );

        if (!patientInfo || patientInfo.length === 0) {
            return res.status(404).json({
                code: 1,
                message: '해당 환자를 찾을 수 없습니다.',
            });
        }

        // 2. 낙상 사고 기록
        const [result] = await db.query(
            'INSERT INTO accident (patient_id, accident_YN, accident_dt) VALUES (?, ?, NOW())',
            [patient_id, accident_YN]
        );

        const roomName = patientInfo[0].room_name;
        const patientName = patientInfo[0].patient_name;
        const roomId = patientInfo[0].room_id;

        // 3. 해당 병실 담당 간병인/의료진 FCM 토큰 조회
        const [tokens] = await db.query(
            `SELECT 
                ft.token 
            FROM 
                fcm_tokens ft
            JOIN 
                users u ON ft.user_id = u.user_id
            WHERE 
                u.assigned_room_id = ? OR u.role = 'admin'`,
            [roomId]
        );

        // 4. 각 토큰에 알림 전송
        const notificationPromises = tokens.map((tokenObj) => sendFallAlert(tokenObj.token, roomName));

        await Promise.all(notificationPromises);

        res.status(201).json({
            code: 0,
            message: '낙상 사고가 기록되었으며 알림이 전송되었습니다.',
            data: {
                accident_id: result.insertId,
                patient_id,
                patient_name: patientName,
                room_name: roomName,
                notification_sent: tokens.length > 0,
                notifications_count: tokens.length,
            },
        });
    } catch (error) {
        console.error('낙상 사고 기록 오류:', error);
        res.status(500).json({
            code: 1,
            message: '낙상 사고 기록 중 오류가 발생했습니다.',
            error: error.message,
        });
    }
});

module.exports = router;
