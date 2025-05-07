const pool = require('./database/db_connect');

async function insertTestToken() {
    try {
        // 테스트용 FCM 토큰 (임시 값)
        const testToken = 'test_fcm_token_value';
        const userId = '테스트_사용자';

        // 토큰 삽입 쿼리
        const query = `
        INSERT INTO fcm_tokens (user_id, token) 
        VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE token = ?
        `;

        const [result] = await pool.query(query, [userId, testToken, testToken]);
        console.log('테스트 FCM 토큰이 성공적으로 삽입되었습니다:', result);
        return result;
    } catch (error) {
        console.error('테스트 FCM 토큰 삽입 중 오류 발생:', error);
        throw error;
    }
}

// 실행
insertTestToken()
    .then(() => {
        console.log('완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('오류:', error);
        process.exit(1);
    });
