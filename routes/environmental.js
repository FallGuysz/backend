const express = require('express');
const router = express.Router();
const db = require('../database/db_connect');

// GET /environmental-data - 모든 병실의 현재 온습도 정보만 조회
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                r.room_id,
                r.room_name,
                r.room_temp,
                r.room_humi as humidity,
                COUNT(b.bed_id) as total_beds,
                SUM(CASE WHEN b.bed_status = 'occupied' THEN 1 ELSE 0 END) as occupied_beds,
                CASE 
                    WHEN r.room_temp > 26 OR r.room_temp < 20 OR r.room_humi > 60 OR r.room_humi < 40 
                    THEN '경고' 
                    ELSE '정상' 
                END AS status
            FROM room r
            LEFT JOIN bed b ON r.room_id = b.room_id
            GROUP BY r.room_id
        `);

        res.json({
            code: 0,
            data: rows,
        });
    } catch (err) {
        console.error('Error fetching room environmental data:', err);
        res.status(500).json({
            code: 1,
            message: '환경 데이터 조회 실패',
            error: err.message,
        });
    }
});

// GET /environmental-data/:roomId - 특정 병실의 온습도 정보 조회
router.get('/:roomId', async (req, res) => {
    const { roomId } = req.params;

    try {
        const [rows] = await db.query(
            `
            SELECT 
                r.room_id,
                r.room_name,
                r.room_temp,
                r.room_humi as humidity,
                r.room_capacity,
                COUNT(b.bed_id) as total_beds,
                SUM(CASE WHEN b.bed_status = 'occupied' THEN 1 ELSE 0 END) as occupied_beds,
                GROUP_CONCAT(
                    DISTINCT
                    CASE WHEN p.patient_id IS NOT NULL 
                    THEN JSON_OBJECT(
                        'patient_id', p.patient_id,
                        'patient_name', p.patient_name,
                        'bed_num', b.bed_num,
                        'bed_id', b.bed_id
                    )
                    ELSE NULL END
                ) as patients,
                CASE 
                    WHEN r.room_temp > 26 OR r.room_temp < 20 OR r.room_humi > 60 OR r.room_humi < 40 
                    THEN '경고' 
                    ELSE '정상' 
                END AS status
            FROM room r
            LEFT JOIN bed b ON r.room_id = b.room_id
            LEFT JOIN patient p ON b.bed_id = p.bed_id AND p.patient_status = 'active'
            WHERE r.room_id = ?
            GROUP BY r.room_id
            `,
            [roomId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                code: 1,
                message: '해당 병실을 찾을 수 없습니다.',
            });
        }

        // patients 문자열을 JSON 배열로 파싱
        const room = rows[0];
        room.patients = room.patients ? JSON.parse(`[${room.patients}]`) : [];

        res.json({
            code: 0,
            data: room,
        });
    } catch (err) {
        console.error('Error fetching room environmental data:', err);
        res.status(500).json({
            code: 1,
            message: '환경 데이터 조회 실패',
            error: err.message,
        });
    }
});

module.exports = router;
