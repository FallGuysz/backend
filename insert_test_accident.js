const pool = require('./database/db_connect');

async function insertTestAccident() {
    try {
        // 환자 정보 확인 - 첫번째 환자 데이터 가져오기
        const [patients] = await pool.query(`SELECT patient_id FROM patient LIMIT 1`);

        if (!patients || patients.length === 0) {
            console.log('환자 데이터가 없습니다. 테스트를 위해 임의의 환자 ID 사용');
            var patientId = 1; // 임의의 환자 ID
        } else {
            var patientId = patients[0].patient_id;
            console.log(`환자 ID ${patientId}를 사용합니다.`);
        }

        // 낙상 사고 데이터 삽입
        const query = `
        INSERT INTO accident (patient_id, accident_YN, accident_dt) 
        VALUES (?, 'Y', NOW())
        `;

        const [result] = await pool.query(query, [patientId]);
        console.log('테스트 낙상 사고 데이터가 성공적으로 추가되었습니다:', result);

        return result;
    } catch (error) {
        console.error('테스트 데이터 추가 중 오류 발생:', error);
        throw error;
    }
}

insertTestAccident()
    .then(() => {
        console.log('완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('오류:', error);
        process.exit(1);
    });
