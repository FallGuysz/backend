const db = require('./db_connect');

async function checkFcmTokensTable() {
    try {
        // 테이블 구조 확인
        const [columns] = await db.query('DESCRIBE fcm_tokens');
        console.log('테이블 구조:', columns);

        // 데이터 확인
        const [rows] = await db.query('SELECT * FROM fcm_tokens');
        console.log('\n현재 데이터:', rows);
    } catch (error) {
        console.error('테이블 확인 중 오류 발생:', error);
    } finally {
        process.exit();
    }
}

checkFcmTokensTable();
