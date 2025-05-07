const admin = require('../firebaseAdmin');
const db = require('../database/db_connect');
const axios = require('axios');
const pool = require('../database/db_connect');

// FCM 토큰 저장 함수
const saveToken = async (patientId, token, deviceType = 'expo', deviceInfo = null) => {
    try {
        // 토큰 유효성 검증 제거 - 모든 토큰을 유효하다고 가정
        console.log('FCM 토큰 저장 시작:', token.substring(0, 15) + '...');

        const connection = await pool.getConnection();

        try {
            // 기존 토큰이 있는지 확인
            const [existingTokens] = await connection.query(
                'SELECT * FROM fcm_tokens WHERE patient_id = ? AND token = ?',
                [patientId, token]
            );

            if (existingTokens.length > 0) {
                // 토큰이 이미 존재하면 device_type만 업데이트
                await connection.query(
                    'UPDATE fcm_tokens SET device_type = ?, updated_at = NOW() WHERE patient_id = ? AND token = ?',
                    [deviceType, patientId, token]
                );
                console.log('기존 토큰 업데이트 완료');
            } else {
                // 새로운 토큰 저장
                await connection.query('INSERT INTO fcm_tokens (patient_id, token, device_type) VALUES (?, ?, ?)', [
                    patientId,
                    token,
                    deviceType,
                ]);
                console.log('새 토큰 저장 완료');
            }

            return { success: true };
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('토큰 저장 중 오류:', error);
        return { success: false, error: error.message };
    }
};

// 오래된 토큰 정리 함수 제거됨

// 토큰 삭제 함수
const removeToken = async (token) => {
    try {
        // 토큰 삭제 로직 제거됨
        console.log('토큰 삭제 요청이 무시됨:', token.substring(0, 15) + '...');
        return { success: true, message: '토큰 삭제 기능이 비활성화되었습니다.' };
    } catch (error) {
        console.error('토큰 삭제 오류:', error);
        return { success: false, error };
    }
};

// 디바이스 유형에 따라 알림 전송
const sendNotification = async (token, deviceType, title, body, data = {}) => {
    if (deviceType === 'expo') {
        return sendExpoNotification(token, title, body, data);
    } else {
        return sendFCMNotification(token, title, body, data);
    }
};

// FCM 알림 전송 함수
const sendFCMNotification = async (fcmToken, title, body, data = {}) => {
    console.log(`FCM 알림 준비: 토큰=${fcmToken.substring(0, 15)}..., 제목=${title}`);

    const message = {
        notification: {
            title,
            body,
        },
        android: {
            notification: {
                sound: 'default',
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                },
            },
        },
        data,
        token: fcmToken,
    };

    try {
        console.log('Firebase 메시지 전송 시도');
        const response = await admin.messaging().send(message);
        console.log('FCM 알림 전송 성공:', response);
        return { success: true, response };
    } catch (error) {
        console.error('FCM 알림 전송 실패:', error);

        // 오류 내용 상세 로깅 (로그만 남기고 특별한 처리는 하지 않음)
        if (error.errorInfo) {
            console.error('FCM 오류 정보:', error.errorInfo.code, error.errorInfo.message);
        }

        return { success: false, error };
    }
};

// Expo 알림 전송 함수
const sendExpoNotification = async (expoToken, title, body, data = {}) => {
    const message = {
        to: expoToken,
        sound: 'default',
        title,
        body,
        data,
    };

    try {
        const response = await axios.post('https://exp.host/--/api/v2/push/send', message, {
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
        });

        console.log('Expo 알림 전송 성공:', response.data);
        return { success: true, response: response.data };
    } catch (error) {
        console.error('Expo 알림 전송 실패:', error);
        return { success: false, error };
    }
};

// 낙상 알림 전송
const sendFallAlert = async (token, roomName = '', patientId = '', patientName = '') => {
    try {
        // 토큰 검사
        if (!token) {
            console.log('토큰이 제공되지 않았습니다.');
            return { success: false, error: '토큰이 제공되지 않았습니다.' };
        }

        // 토큰 유효성 기본 검사 (길이 100 이상 확인)
        if (token.length < 100) {
            console.log(`토큰이 너무 짧습니다: ${token.substring(0, 15)}... (${token.length}자)`);
            return { success: false, error: '유효하지 않은 토큰 형식' };
        }

        // 알림 데이터 준비
        const message = {
            notification: {
                title: '🚨 낙상 사고 감지!',
                body: `${roomName}호 병실에서 낙상 사고가 감지되었습니다.`,
            },
            data: {
                roomName: roomName,
                patientId: patientId.toString(),
                patientName: patientName,
                accidentType: 'fall',
                time: new Date().toISOString(),
            },
            token: token,
        };

        // FCM을 통한 알림 전송
        console.log(`낙상 알림 전송 시도 - 토큰: ${token.substring(0, 15)}...`);
        const response = await admin.messaging().send(message);
        console.log('낙상 알림 전송 성공, 응답:', response);

        return { success: true, messageId: response };
    } catch (error) {
        console.error('낙상 알림 전송 실패:', error);
        return { success: false, error: error.message };
    }
};

// 가장 최근 낙상 사고 알림 전송
const sendLatestAccidentAlert = async (token, deviceType = 'fcm') => {
    try {
        // 가장 최근 낙상 사고 정보 조회 (상태가 Y인 것만)
        const [latestAccidents] = await db.query(`
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
            WHERE a.accident_YN = 'Y'
            ORDER BY a.accident_dt DESC
            LIMIT 1
        `);

        if (!latestAccidents || latestAccidents.length === 0) {
            console.log('최근 낙상 사고 정보가 없습니다.');
            return { success: false, error: '최근 낙상 사고 정보가 없습니다.' };
        }

        console.log('최근 낙상 사고 정보 찾음:', latestAccidents[0]);

        const latestAccident = latestAccidents[0];
        const roomName = latestAccident.room_name || '알 수 없음';
        const patientName = latestAccident.patient_name || '알 수 없음';
        const bedNum = latestAccident.bed_num || '알 수 없음';
        const accidentDate = new Date(latestAccident.accident_date).toLocaleString('ko-KR');

        const title = '최근 낙상 사고 알림';
        const body = `${roomName}호 병실 ${bedNum}번 침대 (${patientName}) - ${accidentDate}`;
        const data = {
            accidentId: latestAccident.accident_id?.toString() || '0',
            roomName: roomName,
            patientName: patientName,
            bedNum: bedNum,
            time: accidentDate,
            type: 'latest_accident',
        };

        // 디바이스 유형에 따라 알림 전송
        const result = await sendNotification(token, deviceType, title, body, data);

        return {
            success: result.success,
            response: result.response,
            error: result.error,
            data: latestAccident,
        };
    } catch (error) {
        console.error('최근 사고 알림 전송 실패:', error);
        return { success: false, error };
    }
};

// 모든 사용자에게 최근 사고 알림 전송
const sendLatestAccidentToAll = async () => {
    try {
        // 모든 FCM 토큰 조회
        const [tokens] = await db.query('SELECT token, device_type FROM fcm_tokens');

        if (!tokens || tokens.length === 0) {
            return { success: false, error: '등록된 토큰이 없습니다.' };
        }

        console.log('FCM 토큰 조회:', tokens.length, '개');

        // 최근 사고 정보 가져오기 (Y인 것만)
        const [latestAccidents] = await db.query(`
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
            WHERE a.accident_YN = 'Y'
            ORDER BY a.accident_dt DESC
            LIMIT 1
        `);

        if (!latestAccidents || latestAccidents.length === 0) {
            return { success: false, error: '최근 낙상 사고 정보가 없습니다.' };
        }

        console.log('알림 전송할 최근 사고 정보:', latestAccidents[0]);

        const latestAccident = latestAccidents[0];

        // 일부 토큰에서 오류가 발생해도 전체 프로세스는 계속 진행
        const results = [];
        for (const tokenObj of tokens) {
            try {
                const deviceType = tokenObj.device_type || 'fcm';
                const result = await sendLatestAccidentAlert(tokenObj.token, deviceType);
                results.push(result);
            } catch (error) {
                console.error(`토큰 ${tokenObj.token}에 알림 전송 실패:`, error);
                results.push({ success: false, error: error.message, token: tokenObj.token });
            }
        }

        return {
            success: true,
            message: `${tokens.length}명의 사용자에게 알림 전송 시도 완료`,
            results: results,
            data: latestAccident,
        };
    } catch (error) {
        console.error('일괄 알림 전송 실패:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    saveToken,
    removeToken,
    sendNotification,
    sendFCMNotification,
    sendExpoNotification,
    sendLatestAccidentAlert,
    sendLatestAccidentToAll,
    sendFallAlert,
};
