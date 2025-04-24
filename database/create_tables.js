const pool = require('./db_connect');
const fs = require('fs');
const path = require('path');

async function createFcmTokensTable() {
    try {
        // SQL 쿼리 직접 실행
        const query = `
        CREATE TABLE IF NOT EXISTS fcm_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            token TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;

        const [result] = await pool.query(query);
        console.log('FCM 토큰 테이블이 성공적으로 생성되었습니다.');
        return result;
    } catch (error) {
        console.error('FCM 토큰 테이블 생성 중 오류 발생:', error);
        throw error;
    }
}

// 실행
createFcmTokensTable()
    .then(() => {
        console.log('모든 테이블이 성공적으로 생성되었습니다.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('테이블 생성 중 오류 발생:', error);
        process.exit(1);
    });
