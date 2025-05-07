const pool = require('./database/db_connect');

async function deleteTestToken() {
    try {
        // 테스트용 FCM 토큰 삭제
        const testToken = 'test_fcm_token_value';

        // 토큰 삭제 쿼리
        const query = `
        DELETE FROM fcm_tokens 
        WHERE token = ?
        `;

        const [result] = await pool.query(query, [testToken]);
        console.log('테스트 FCM 토큰이 성공적으로 삭제되었습니다:', result);
        return result;
    } catch (error) {
        console.error('테스트 FCM 토큰 삭제 중 오류 발생:', error);
        throw error;
    }
}

// 실행
deleteTestToken()
    .then(() => {
        console.log('완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('오류:', error);
        process.exit(1);
    });
