const express = require('express');
const router = express.Router();
const db = require('../database/db_connect');
const { sendFallAlert, sendLatestAccidentToAll } = require('./notificationController');
const admin = require('firebase-admin');

// 낙상 사고 자동 알림 관리자 클래스
class AccidentManager {
    constructor() {
        this.pollingInterval = 60000; // 60초(1분)마다 확인 (10000에서 60000으로 변경)
        this.isPolling = false;
        this.lastCheckTime = new Date(new Date().getTime() - 60 * 60 * 1000); // 1시간 전부터 시작
        console.log('AccidentManager 초기화: 체크 시간 =', this.lastCheckTime);
        this.startPolling();
    }

    // 폴링 시작
    startPolling() {
        if (this.isPolling) return;

        this.isPolling = true;
        this.checkNewAccidents();
        console.log('낙상 사고 자동 알림 시스템 시작됨');
    }

    // 새로운 사고 확인
    async checkNewAccidents() {
        try {
            console.log('낙상 사고 체크 시작 - 마지막 체크 시간:', this.lastCheckTime);

            // accident_YN이 'Y'인 모든 사고를 조회합니다 (이전 시간 기준이 제거됨)
            const [activeAccidents] = await db.query(
                `
                SELECT 
                    a.accident_id,
                    a.patient_id,
                    a.accident_dt,
                    a.accident_YN,
                    p.patient_name,
                    r.room_name,
                    r.room_id
                FROM accident a
                LEFT JOIN patient p ON a.patient_id = p.patient_id
                LEFT JOIN bed b ON p.bed_id = b.bed_id
                LEFT JOIN room r ON b.room_id = r.room_id
                WHERE a.accident_YN = 'Y' 
                ORDER BY a.accident_dt DESC
            `
            );

            console.log(`낙상 사고 체크 결과: 활성화된 사고 ${activeAccidents.length}건 발견`);

            // notified 컬럼이 존재하는지 확인 (INFORMATION_SCHEMA 조회)
            const [columnInfo] = await db.query(`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'accident'
                AND COLUMN_NAME = 'notified'
            `);

            let pendingAlerts = [];
            const hasNotifiedColumn = columnInfo && columnInfo.length > 0;

            if (hasNotifiedColumn) {
                // notified 컬럼이 있는 경우: 알림 전송이 필요한 사고들 필터링 (notified가 'N'이거나 NULL인 사고)
                console.log('notified 컬럼 존재함: 알림 전송되지 않은 사고 조회');
                const [alerts] = await db.query(
                    `
                    SELECT 
                        a.accident_id,
                        a.patient_id,
                        a.accident_dt,
                        a.accident_YN,
                        a.notified,
                        p.patient_name,
                        r.room_name,
                        r.room_id
                    FROM accident a
                    LEFT JOIN patient p ON a.patient_id = p.patient_id
                    LEFT JOIN bed b ON p.bed_id = b.bed_id
                    LEFT JOIN room r ON b.room_id = r.room_id
                    WHERE a.accident_YN = 'Y' 
                    AND (a.notified = 'N' OR a.notified IS NULL)
                    ORDER BY a.accident_dt DESC
                `
                );
                pendingAlerts = alerts || [];
            } else {
                // notified 컬럼이 없는 경우: 모든 활성 사고를 대상으로 처리
                console.log('notified 컬럼 없음: 모든 활성 사고에 알림 전송');
                pendingAlerts = activeAccidents;
            }

            console.log(`알림 대기 중인 사고: ${pendingAlerts ? pendingAlerts.length : 0}건`);

            // 개발용 테스트 알림 전송 (활성화된 사고가 없을 때만)
            if (activeAccidents.length === 0) {
                console.log('활성화된 사고가 없습니다. 테스트용 알림 전송 시도...');

                // 테스트 알림 전송
                const [allTokens] = await db.query('SELECT token FROM fcm_tokens LIMIT 1');
                if (allTokens && allTokens.length > 0) {
                    const token = allTokens[0].token;
                    if (token) {
                        // 단순히 토큰이 있는지만 확인
                        console.log(`FCM 토큰 발견: ${token.substring(0, 15)}...`);

                        let roomName = '테스트 병실';
                        let patientName = '';

                        try {
                            await sendFallAlert(token, roomName + patientName);
                            console.log('테스트 알림 전송 성공');
                        } catch (error) {
                            console.error('테스트 알림 전송 실패:', error.message);
                        }
                    } else {
                        console.log('등록된 토큰이 유효하지 않습니다 (undefined or null)');
                    }
                } else {
                    console.log('등록된 토큰이 없습니다. 알림을 전송할 수 없습니다.');
                }
            }

            // 알림 대기 중인 사고가 있으면 각 건에 대해 알림 전송
            if (pendingAlerts && pendingAlerts.length > 0) {
                console.log(`알림 대기 중인 낙상 사고 ${pendingAlerts.length}건 감지됨, 자동 알림 전송`);

                for (const accident of pendingAlerts) {
                    console.log(
                        `사고 ID ${accident.accident_id} 알림 전송 시도 (환자: ${accident.patient_name}, 병실: ${accident.room_name})`
                    );
                    const notificationSent = await this.sendAccidentAlert(accident);

                    // 알림 전송 성공 시 notified 컬럼만 'Y'로 업데이트 (accident_YN은 변경하지 않음)
                    if (notificationSent && hasNotifiedColumn) {
                        try {
                            await db.query('UPDATE accident SET notified = ? WHERE accident_id = ?', [
                                'Y',
                                accident.accident_id,
                            ]);
                            console.log(`사고 ID ${accident.accident_id} 알림 전송 완료 표시 (accident_YN은 'Y' 유지)`);
                        } catch (updateError) {
                            console.error('사고 상태 업데이트 오류:', updateError);
                        }
                    } else if (notificationSent) {
                        console.log(`사고 ID ${accident.accident_id} 알림 전송 완료 (notified 컬럼 없음)`);
                    } else {
                        console.log(`사고 ID ${accident.accident_id} 알림 전송 실패`);
                    }
                }
            }

            // 마지막 확인 시간 업데이트
            this.lastCheckTime = new Date();
        } catch (error) {
            console.error('낙상 사고 자동 확인 중 오류:', error);
        } finally {
            // 다음 체크 예약
            setTimeout(() => this.checkNewAccidents(), this.pollingInterval);
        }
    }

    // 사고별 알림 전송
    async sendAccidentAlert(accident) {
        try {
            // 사고 발생 정보를 가져옵니다
            const patientId = accident.patient_id;
            const roomId = accident.room_id;
            const roomName = accident.room_name;
            const patientName = accident.patient_name;
            const accidentId = accident.accident_id;
            const accidentTime = accident.accident_dt;

            console.log(`사고 알림 전송 시도 - 환자: ${patientName}, 병실: ${roomName}, 시간: ${accidentTime}`);

            // 해당 환자에 등록된 FCM 토큰을 조회합니다
            const [tokens] = await db.query(`SELECT token FROM fcm_tokens WHERE patient_id = ?`, [patientId]);

            if (!tokens || tokens.length === 0) {
                console.log(`환자 ID ${patientId}에 등록된 FCM 토큰이 없습니다.`);
                return false;
            }

            console.log(`${tokens.length}개의 토큰을 찾았습니다. 알림을 전송합니다.`);

            // 각 토큰에 알림을 전송합니다
            let sentCount = 0;
            for (const tokenData of tokens) {
                const token = tokenData.token;

                if (!token) {
                    console.log(`유효하지 않은 토큰 형식: undefined 또는 null`);
                    continue;
                }

                console.log(`FCM 토큰으로 알림 전송: ${token.substring(0, 15)}...`);

                try {
                    // 알림 전송 시도 - 실패해도 계속 진행
                    await sendFallAlert(token, roomName || '알 수 없는 병실', patientId, patientName);
                    sentCount++;
                } catch (error) {
                    console.error(`토큰 ${token.substring(0, 15)}... 전송 실패: ${error.message}`);
                }
            }

            console.log(`자동 알림 전송 완료: ${sentCount}/${tokens.length}개 성공`);

            // 하나라도 전송 성공했으면 true 반환
            return sentCount > 0;
        } catch (error) {
            console.error('자동 알림 전송 중 오류:', error);
            return false;
        }
    }
}

// 싱글톤 인스턴스 생성
const accidentManager = new AccidentManager();

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

        // 환자의 이전 상태 확인 (N에서 Y로 변경되는지 확인)
        const [previousStatus] = await db.query(
            `SELECT accident_YN 
             FROM accident 
             WHERE patient_id = ? 
             ORDER BY accident_dt DESC 
             LIMIT 1`,
            [patient_id]
        );

        const previousYN = previousStatus && previousStatus.length > 0 ? previousStatus[0].accident_YN : 'N';
        const statusChanged = previousYN === 'N' && accident_YN === 'Y';

        console.log('이전 상태:', previousYN, '현재 상태:', accident_YN, '상태 변경됨:', statusChanged);

        // 2. 낙상 사고 기록
        let result;
        try {
            // notified 컬럼이 있는 경우
            [result] = await db.query(
                'INSERT INTO accident (patient_id, accident_YN, notified, accident_dt) VALUES (?, ?, ?, NOW())',
                [patient_id, accident_YN, 'N']
            );
        } catch (insertError) {
            // notified 컬럼이 없는 경우 fallback
            if (insertError.code === 'ER_BAD_FIELD_ERROR') {
                console.log('notified 컬럼이 없습니다. 기본 쿼리 사용.');
                [result] = await db.query(
                    'INSERT INTO accident (patient_id, accident_YN, accident_dt) VALUES (?, ?, NOW())',
                    [patient_id, accident_YN]
                );
            } else {
                throw insertError; // 다른 오류는 상위로 전파
            }
        }

        const roomName = patientInfo[0].room_name;
        const patientName = patientInfo[0].patient_name;
        const roomId = patientInfo[0].room_id;

        // 알림은 N에서 Y로 변경될 때만 전송
        let notificationSent = false;
        let notificationsCount = 0;

        // 자동 알림 기능이 있으므로 여기서는 필요한 경우만 즉시 전송
        // if (statusChanged || accident_YN === 'Y') { // 상태 변경 또는 Y인 경우 알림 전송
        //     console.log('알림 전송 조건 충족: 상태 변경 또는 Y 상태');
        //     // 알림 전송 로직 생략 - 자동으로 처리됨
        // }

        // 마지막 확인 시간을 업데이트하여 중복 알림 방지
        accidentManager.lastCheckTime = new Date();

        res.status(201).json({
            code: 0,
            message:
                accident_YN === 'Y'
                    ? '낙상 사고가 기록되었으며 자동으로 알림이 전송됩니다.'
                    : '낙상 사고가 기록되었습니다.',
            data: {
                accident_id: result.insertId,
                patient_id,
                patient_name: patientName,
                room_name: roomName,
                notification_auto: accident_YN === 'Y',
                notification_note: '알림은 자동으로 전송됩니다',
                status_changed: statusChanged,
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

// 사고 상태 확인 엔드포인트 추가
router.put('/:accidentId/acknowledge', async (req, res) => {
    try {
        const { accidentId } = req.params;

        if (!accidentId) {
            return res.status(400).json({
                code: 1,
                message: '사고 ID는 필수입니다.',
            });
        }

        // 사고 정보 조회
        const [accidentInfo] = await db.query(
            `SELECT 
                a.accident_id, 
                a.accident_YN, 
                a.patient_id,
                p.patient_name,
                r.room_name
            FROM accident a
            LEFT JOIN patient p ON a.patient_id = p.patient_id
            LEFT JOIN bed b ON p.bed_id = b.bed_id
            LEFT JOIN room r ON b.room_id = r.room_id
            WHERE a.accident_id = ?`,
            [accidentId]
        );

        if (!accidentInfo || accidentInfo.length === 0) {
            return res.status(404).json({
                code: 1,
                message: '해당 사고를 찾을 수 없습니다.',
            });
        }

        const currentStatus = accidentInfo[0].accident_YN;
        console.log(
            `사고 ID ${accidentId} 확인 처리 시작 - 현재 상태: ${currentStatus}, 환자: ${accidentInfo[0].patient_name}, 병실: ${accidentInfo[0].room_name}`
        );

        // notified 컬럼이 존재하는지 확인
        const [columnInfo] = await db.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'accident'
            AND COLUMN_NAME = 'notified'
        `);

        const hasNotifiedColumn = columnInfo && columnInfo.length > 0;

        // 사고 상태를 N으로 변경 (알림 처리 완료)
        if (hasNotifiedColumn) {
            // notified 컬럼이 있는 경우
            console.log('notified 컬럼이 존재함: accident_YN과 notified 모두 업데이트');
            const [result] = await db.query('UPDATE accident SET accident_YN = ?, notified = ? WHERE accident_id = ?', [
                'N',
                'Y',
                accidentId,
            ]);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    code: 1,
                    message: '사고 상태 업데이트에 실패했습니다.',
                });
            }
            console.log(`사고 ID ${accidentId} 확인 처리 완료 - 상태 'Y'에서 'N'으로 변경됨 (notified = 'Y')`);
        } else {
            // notified 컬럼이 없는 경우
            console.log('notified 컬럼이 없음: accident_YN만 업데이트');
            const [result] = await db.query('UPDATE accident SET accident_YN = ? WHERE accident_id = ?', [
                'N',
                accidentId,
            ]);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    code: 1,
                    message: '사고 상태 업데이트에 실패했습니다.',
                });
            }
            console.log(`사고 ID ${accidentId} 확인 처리 완료 - 상태 'Y'에서 'N'으로 변경됨`);
        }

        res.json({
            code: 0,
            message: '사고가 확인 처리되었습니다.',
            data: {
                accident_id: accidentId,
                previous_status: currentStatus,
                current_status: 'N',
                acknowledged: true,
            },
        });
    } catch (error) {
        console.error('사고 확인 처리 오류:', error);
        res.status(500).json({
            code: 1,
            message: '사고 확인 처리 중 오류가 발생했습니다.',
            error: error.message,
        });
    }
});

// 테스트 알림
router.get('/test-notification', async (req, res) => {
    try {
        // DB에서 토큰 조회
        const [tokenResult] = await db.query(`SELECT token FROM fcm_tokens LIMIT 1`);

        if (!tokenResult || tokenResult.length === 0 || !tokenResult[0].token) {
            console.log('FCM 토큰이 DB에 없습니다.');
            return res.status(404).json({
                success: false,
                message: '등록된 FCM 토큰이 없습니다. 앱을 먼저 실행하세요.',
            });
        }

        const token = tokenResult[0].token;
        console.log(`DB에서 찾은 FCM 토큰: ${token.substring(0, 15)}...`);

        // 알림 메시지 구성
        const message = {
            notification: {
                title: '[테스트] 낙상 알림',
                body: '낙상 감지 테스트 알림입니다.',
            },
            data: {
                incidentId: 'test-123',
                time: new Date().toISOString(),
                status: 'detected',
                patientRoom: '101호',
                patientName: '홍길동',
            },
            token: token,
        };

        // FCM으로 메시지 전송
        const response = await admin.messaging().send(message);
        console.log('테스트 알림 전송 성공:', response);
        res.json({ success: true, message: '테스트 알림이 전송되었습니다.' });
    } catch (error) {
        console.error('테스트 알림 전송 실패:', error);
        res.status(500).json({
            success: false,
            message: '알림 전송 실패',
            error: error.message,
            errorCode: error.code || 'UNKNOWN',
        });
    }
});

module.exports = router;
