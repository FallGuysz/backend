// 모든 유효한 토큰에 테스트 알림 전송 스크립트
require('dotenv').config();
const db = require('./database/db_connect');
const admin = require('./firebaseAdmin');
const controller = require('./routes/notificationController');

async function sendTestAlertsToAllTokens() {
    console.log('테스트 알림 전송 스크립트 시작...');

    try {
        // 1. 모든 토큰 가져오기
        const [tokens] = await db.query('SELECT id, patient_id, token, device_type FROM fcm_tokens');

        if (tokens.length === 0) {
            console.log('등록된 토큰이 없습니다.');
            process.exit(0);
        }

        console.log(`총 ${tokens.length}개의 토큰을 발견했습니다.`);

        // 2. 각 토큰에 테스트 메시지 전송
        const results = { success: 0, failed: 0, tokens: [] };

        for (const token of tokens) {
            console.log(`\n🔔 토큰 ID ${token.id} (환자 ID: ${token.patient_id})로 테스트 알림 전송 중...`);

            try {
                // 테스트 메시지 생성
                const message = {
                    notification: {
                        title: '테스트 알림',
                        body: `이 메시지는 테스트입니다. (토큰 ID: ${token.id})`,
                    },
                    data: {
                        type: 'test',
                        timestamp: new Date().toISOString(),
                    },
                    token: token.token,
                };

                // 메시지 전송
                const response = await admin.messaging().send(message);
                console.log(`✅ 알림 전송 성공: ${response}`);

                results.success++;
                results.tokens.push({
                    id: token.id,
                    status: 'success',
                    message: response,
                });
            } catch (error) {
                console.error(`❌ 알림 전송 실패:`, error.message);

                if (error.errorInfo?.code === 'messaging/registration-token-not-registered') {
                    console.log(`⚠️ 이 토큰은 더 이상 유효하지 않습니다. ID: ${token.id}`);
                }

                results.failed++;
                results.tokens.push({
                    id: token.id,
                    status: 'failed',
                    error: error.message,
                    code: error.errorInfo?.code,
                });
            }
        }

        // 3. 결과 요약
        console.log('\n=== 알림 전송 결과 ===');
        console.log(`성공: ${results.success}개`);
        console.log(`실패: ${results.failed}개`);
        console.log('=======================');

        // 4. 실패한 토큰 상세 정보
        if (results.failed > 0) {
            console.log('\n유효하지 않은 토큰 목록:');
            const invalidTokens = results.tokens.filter((t) => t.status === 'failed');
            invalidTokens.forEach((t) => {
                console.log(`- 토큰 ID: ${t.id}, 오류: ${t.code}`);
            });

            console.log('\n이 토큰들은 수동으로 제거하거나 갱신하세요.');
        }
    } catch (error) {
        console.error('스크립트 실행 중 오류 발생:', error);
    } finally {
        process.exit(0);
    }
}

// 스크립트 실행
sendTestAlertsToAllTokens().catch((err) => {
    console.error('오류 발생:', err);
    process.exit(1);
});
