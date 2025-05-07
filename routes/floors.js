const express = require('express');
const router = express.Router();
const db = require('../database/db_connect');

/**
 * @api {get} /api/floors 모든 층 정보 가져오기
 * @apiDescription 병원의 모든 층 정보를 가져옵니다.
 * @apiSuccess {Array} floors 층 정보 배열
 */
router.get('/', async (req, res) => {
    try {
        // 실제 DB에서 층 정보를 가져오는 로직 구현
        // 현재는 고정된 데이터 반환
        const floors = [
            { id: 1, name: '1층' },
            { id: 2, name: '2층' },
            { id: 3, name: '3층' },
            { id: 4, name: '4층' },
            { id: 5, name: '5층' },
        ];

        res.json(floors);
    } catch (error) {
        console.error('층 정보 가져오기 오류:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * @api {get} /api/floors/:floor 특정 층 정보 가져오기
 * @apiDescription 특정 층의 병실 정보를 가져옵니다.
 * @apiParam {String} floor 층 이름 (예: '1층')
 * @apiSuccess {Object} data 층 및 병실 정보
 */
router.get('/:floor', async (req, res) => {
    try {
        const { floor } = req.params;

        // 층 번호 추출 (예: '1층' -> 1)
        const floorNumber = parseInt(floor.replace(/[^0-9]/g, ''));

        if (isNaN(floorNumber) || floorNumber < 1 || floorNumber > 5) {
            return res.status(404).json({ message: '해당 층이 존재하지 않습니다.' });
        }

        // 실제 DB에서 특정 층의 병실 정보 조회
        const [rooms] = await db.query(
            `
            SELECT 
                r.room_id as id,
                r.room_name as name,
                r.room_temp as temperature,
                r.room_humi as humidity,
                CASE 
                    WHEN r.room_temp > 27 OR r.room_temp < 18 OR r.room_humi > 70 OR r.room_humi < 40 THEN '경고'
                    WHEN r.room_temp > 25 OR r.room_temp < 20 OR r.room_humi > 65 OR r.room_humi < 45 THEN '주의'
                    ELSE '정상'
                END as status,
                COUNT(CASE WHEN b.bed_status = 'occupied' THEN 1 END) as patient_count
            FROM room r
            LEFT JOIN bed b ON r.room_id = b.room_id
            WHERE SUBSTRING(r.room_name, 1, 1) = ?
            GROUP BY r.room_id
        `,
            [floorNumber]
        );

        // 각 병실의 환자 정보 추가 조회
        for (const room of rooms) {
            const [patients] = await db.query(
                `
                SELECT 
                    p.patient_id as id,
                    p.patient_name as name,
                    p.patient_birth as birth,
                    p.patient_sex as gender,
                    p.patient_status as status,
                    p.patient_blood as blood_type,
                    p.patient_height as height,
                    p.patient_weight as weight,
                    p.patient_in as admission_date,
                    p.patient_out as discharge_date,
                    p.patient_tel as phone,
                    b.bed_num as bed_number
                FROM patient p
                JOIN bed b ON p.bed_id = b.bed_id
                JOIN room r ON b.room_id = r.room_id
                WHERE r.room_id = ? AND b.bed_status = 'occupied'
                ORDER BY b.bed_num
            `,
                [room.id]
            );

            room.patients = patients;
        }

        res.json({
            floor: `${floorNumber}층`,
            rooms: rooms,
        });
    } catch (error) {
        console.error('특정 층 정보 가져오기 오류:', error);
        console.error('오류 상세:', error.message);
        // 오류 시 기본 더미 데이터 제공
        const rooms = [];
        for (let i = 1; i <= 10; i++) {
            const roomNumber = floorNumber * 100 + i;
            rooms.push({
                id: roomNumber,
                name: `${roomNumber}호`,
                patients: [
                    {
                        id: roomNumber * 10 + 1,
                        name: `환자${i}`,
                        age: Math.floor(Math.random() * 60) + 20,
                        gender: i % 2 === 0 ? '남성' : '여성',
                        condition: ['안정', '관찰 필요', '위험'][Math.floor(Math.random() * 3)],
                    },
                ],
                status: ['정상', '주의', '경고'][Math.floor(Math.random() * 3)],
                temperature: (Math.random() * 5 + 20).toFixed(1),
                humidity: (Math.random() * 30 + 40).toFixed(1),
            });
        }

        res.json({
            floor: `${floorNumber}층`,
            rooms: rooms,
            is_dummy: true, // 더미 데이터 표시
        });
    }
});

module.exports = router;
