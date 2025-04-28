const pool = require('./database/db_connect');

async function insertValidToken() {
    try {
        // 브라우저에서 가져온 실제 FCM 토큰
        const validToken =
            'ccOFvf0EuDMcjhAtx-KqDd:APA91bHBwSZyCW60Emky7TFfj9HzUDX2gdjkgWHHT7gOw4ca5gev7yV_s2szOyodPJ-soMncfDiadA_lXoWKRVmIzzfJIWW_ETH8VhNhcT9DkCd2gaB5n90';

        const userId = '실제_사용자';

        const query = `
        INSERT INTO fcm_tokens (user_id, token) 
        VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE token = ?
        `;

        const [result] = await pool.query(query, [userId, validToken, validToken]);
        console.log('실제 FCM 토큰이 저장되었습니다:', result);
        return result;
    } catch (error) {
        console.error('토큰 저장 오류:', error);
        throw error;
    }
}

insertValidToken()
    .then(() => {
        console.log('완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('오류:', error);
        process.exit(1);
    });
