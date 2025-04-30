// 유효한 FCM 토큰을 수동으로 데이터베이스에 저장하는 스크립트
require('dotenv').config();
const db = require('./database/db_connect');
const admin = require('./firebaseAdmin');

// Firebase Admin SDK를 사용하여 토큰 유효성 검증
async function validateToken(token) {
    try {
        // dryRun: true로 설정하면 실제로 메시지를 보내지 않고 유효성만 검사
        await admin.messaging().send(
            {
                token: token,
                data: { test: 'true' },
                android: { direct_boot_ok: true },
            },
            true // dryRun = true
        );
        return true;
    } catch (error) {
        console.error('토큰 유효성 검증 실패:', error.message);
        if (error.errorInfo) {
            console.error('오류 상세 정보:', error.errorInfo);
        }
        return false;
    }
}

// 토큰 저장 함수
async function saveToken(patientId, token, deviceType = 'fcm') {
    try {
        console.log(`토큰 저장 시작: ${token.substring(0, 15)}...`);

        // 토큰 유효성 검증
        const isValid = await validateToken(token);
        if (!isValid) {
            console.error('유효하지 않은 토큰입니다. 저장을 중단합니다.');
            process.exit(1);
        }

        // 기존에 같은 토큰이 있는지 확인
        const [existingTokens] = await db.query('SELECT * FROM fcm_tokens WHERE token = ?', [token]);

        if (existingTokens.length > 0) {
            console.log('이미 존재하는 토큰입니다. 업데이트를 진행합니다.');
            const [result] = await db.query(
                'UPDATE fcm_tokens SET patient_id = ?, device_type = ?, updated_at = NOW() WHERE token = ?',
                [patientId, deviceType, token]
            );
            console.log(`토큰 업데이트 완료: ${result.affectedRows}개 수정됨`);
        } else {
            console.log('새로운 토큰을 저장합니다.');
            const [result] = await db.query(
                'INSERT INTO fcm_tokens (patient_id, token, device_type) VALUES (?, ?, ?)',
                [patientId, token, deviceType]
            );
            console.log(`토큰 저장 완료: ID=${result.insertId}`);
        }

        // 테스트 알림 전송
        console.log('테스트 알림을 전송합니다...');
        const message = {
            notification: {
                title: '토큰 등록 성공',
                body: '알림 시스템이 정상적으로 설정되었습니다.',
            },
            token: token,
        };

        const response = await admin.messaging().send(message);
        console.log('테스트 알림 전송 성공:', response);

        return true;
    } catch (error) {
        console.error('토큰 저장 실패:', error);
        return false;
    } finally {
        // 프로세스 종료
        process.exit(0);
    }
}

// 커맨드 라인에서 인자 가져오기
const args = process.argv.slice(2);
const token = args[0];
const patientId = parseInt(args[1] || '1', 10); // 기본값 1
const deviceType = args[2] || 'fcm'; // 기본값 'fcm'

// 토큰 확인
if (!token) {
    console.error('사용법: node insert_valid_token.js <FCM_토큰> [환자ID] [deviceType]');
    console.error('예시: node insert_valid_token.js "fcm_token_value" 1 fcm');
    process.exit(1);
}

// 토큰 저장 실행
saveToken(patientId, token, deviceType).catch((error) => {
    console.error('오류 발생:', error);
    process.exit(1);
});
