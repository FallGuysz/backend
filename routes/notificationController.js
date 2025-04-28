const admin = require('../firebaseAdmin');
const db = require('../database/db_connect');
const axios = require('axios');

// FCM 토큰 저장 함수
const saveToken = async (userId, token, deviceType = 'fcm', deviceInfo = null) => {
    try {
        // 테이블에 device_type과 device_info 컬럼이 없으므로 간소화된 쿼리 사용
        const [result] = await db.query(
            'INSERT INTO fcm_tokens (user_id, token) VALUES (?, ?) ON DUPLICATE KEY UPDATE token = ?',
            [userId, token, token]
        );
        return { success: true, result };
    } catch (error) {
        console.error('토큰 저장 오류:', error);
        return { success: false, error };
    }
};

// 토큰 삭제 함수
const removeToken = async (token) => {
    try {
        const [result] = await db.query('DELETE FROM fcm_tokens WHERE token = ?', [token]);
        return { success: true, result };
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
        const response = await admin.messaging().send(message);
        console.log('FCM 알림 전송 성공:', response);
        return { success: true, response };
    } catch (error) {
        console.error('FCM 알림 전송 실패:', error);
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

// 가장 최근 낙상 사고 알림 전송
const sendLatestAccidentAlert = async (token, deviceType = 'fcm') => {
    try {
        // 가장 최근 낙상 사고 정보 조회
        const [latestAccidents] = await db.query(`
            SELECT 
                a.accident_id,
                a.patient_id,
                p.patient_name,
                a.accident_dt as accident_date,
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

        const latestAccident = latestAccidents[0];
        const roomName = latestAccident.room_name || '알 수 없음';
        const patientName = latestAccident.patient_name || '알 수 없음';
        const bedNum = latestAccident.bed_num || '알 수 없음';
        const accidentDate = new Date(latestAccident.accident_date).toLocaleString('ko-KR');

        const title = '⚠️ 최근 낙상 사고 알림';
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

        // 최근 사고 정보 가져오기
        const [latestAccidents] = await db.query(`
            SELECT 
                a.accident_id,
                a.patient_id,
                p.patient_name,
                a.accident_dt as accident_date,
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
};
