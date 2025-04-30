const db = require('./db_connect');

async function modifyFcmTokensTable() {
    try {
        // 1. 기존 테이블 이름 변경 (백업)
        await db.query('RENAME TABLE fcm_tokens TO fcm_tokens_backup');
        console.log('기존 테이블 백업 완료');

        // 2. 새 테이블 생성
        await db.query(`
            CREATE TABLE fcm_tokens (
                id INT NOT NULL AUTO_INCREMENT,
                patient_id INT NOT NULL,
                token TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                device_type VARCHAR(20),
                PRIMARY KEY (id),
                FOREIGN KEY (patient_id) REFERENCES patient(patient_id)
            )
        `);
        console.log('새 테이블 생성 완료');

        // 3. 환자 ID 가져오기 (첫 번째 환자)
        const [patients] = await db.query('SELECT patient_id FROM patient LIMIT 1');
        if (patients.length === 0) {
            throw new Error('환자 정보가 없습니다.');
        }
        const patientId = patients[0].patient_id;
        console.log('사용할 환자 ID:', patientId);

        // 4. 필요한 데이터만 새 테이블로 이전
        await db.query(
            `
            INSERT INTO fcm_tokens (patient_id, token, device_type, created_at, updated_at)
            SELECT ?, token, device_type, created_at, updated_at
            FROM fcm_tokens_backup
            ORDER BY updated_at DESC
            LIMIT 1
        `,
            [patientId]
        );
        console.log('데이터 이전 완료');

        // 5. 백업 테이블 삭제 (선택사항)
        await db.query('DROP TABLE fcm_tokens_backup');
        console.log('백업 테이블 삭제 완료');

        console.log('테이블 수정 완료');
    } catch (error) {
        // 오류 발생 시 롤백
        console.error('테이블 수정 중 오류 발생:', error);
        try {
            // 새 테이블이 있으면 삭제
            await db.query('DROP TABLE IF EXISTS fcm_tokens');
            // 백업 테이블을 원래 이름으로 복구
            await db.query('RENAME TABLE fcm_tokens_backup TO fcm_tokens');
            console.log('롤백 완료');
        } catch (rollbackError) {
            console.error('롤백 중 오류 발생:', rollbackError);
        }
    } finally {
        process.exit();
    }
}

modifyFcmTokensTable();
