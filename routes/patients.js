const express = require('express');
const router = express.Router();
const db = require('../database/db_connect');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 이미지 저장 경로 설정
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 파일 저장 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, 'patient-' + uniqueSuffix + ext);
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
});

// GET /api/patients - 환자 목록 조회
router.get('/', async (req, res) => {
    try {
        // 환자 목록과 전체 수를 함께 조회 - 침대와 보호자 정보도 함께 조회
        const [rows, countResult] = await Promise.all([
            db.query(`
                SELECT 
                    p.*,
                    TIMESTAMPDIFF(YEAR, p.patient_birth, CURDATE()) as age,
                    b.bed_num,
                    r.room_name,
                    g.guardian_tel
                FROM patient p
                LEFT JOIN bed b ON p.bed_id = b.bed_id
                LEFT JOIN room r ON b.room_id = r.room_id
                LEFT JOIN guardian g ON p.guardian_id = g.guardian_id
                WHERE p.patient_status != 'deceased'
                
            `),
            db.query('SELECT COUNT(*) as total FROM patient WHERE patient_status != "deceased"'),
        ]);

        res.json({
            code: 0,
            data: rows[0],
            totalCount: countResult[0][0].total,
        });
    } catch (err) {
        console.error('Error fetching patients:', err);
        res.status(500).json({ code: 1, message: '환자 정보 조회 실패', error: err });
    }
});

// POST /patients - 환자 추가 (파일 업로드 지원)
router.post('/', upload.single('patient_img'), async (req, res) => {
    try {
        const {
            patient_name,
            patient_birth,
            patient_height,
            patient_weight,
            patient_blood,
            patient_memo,
            patient_status,
            guardian_id,
            bed_id,
            patient_sex,
            patient_in,
            patient_out,
        } = req.body;

        // 업로드된 파일이 있으면 파일 경로 저장, 없으면 null
        const patient_img = req.file ? `/uploads/${req.file.filename}` : null;

        // 침대 상태 업데이트
        if (bed_id) {
            await db.query('UPDATE bed SET bed_status = "occupied" WHERE bed_id = ?', [bed_id]);
        }

        const [result] = await db.query(
            `INSERT INTO patient (
                patient_name,
                patient_birth,
                patient_height,
                patient_weight,
                patient_blood,
                patient_img,
                patient_memo,
                patient_status,
                guardian_id,
                bed_id,
                patient_sex,
                patient_in,
                patient_out
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patient_name,
                patient_birth,
                patient_height,
                patient_weight,
                patient_blood,
                patient_img,
                patient_memo || null,
                patient_status || '무위험군',
                guardian_id || null,
                bed_id || null,
                patient_sex || null,
                patient_in || null,
                patient_out || null,
            ]
        );

        const patientId = result.insertId;

        res.status(201).json({
            code: 0,
            message: '환자가 성공적으로 등록되었습니다.',
            data: {
                patient_id: patientId,
                ...req.body,
                patient_img,
            },
        });
    } catch (err) {
        console.error('Error adding patient:', err);
        res.status(500).json({
            code: 1,
            message: '환자 등록 실패',
            error: err.message,
        });
    }
});
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    let connection;
    try {
        // 개별 연결 가져오기
        connection = await db.getConnection();

        // 트랜잭션 시작
        await connection.beginTransaction();

        // 삭제할 환자의 bed_id 조회
        const [patient] = await connection.query('SELECT bed_id FROM patient WHERE patient_id = ?', [id]);

        if (patient.length === 0) {
            await connection.rollback(); // 트랜잭션 롤백
            return res.status(404).json({ message: '환자를 찾을 수 없습니다.' });
        }

        const bedId = patient[0].bed_id;

        // fcm_tokens 테이블에서 참조된 데이터 삭제
        await connection.query('DELETE FROM fcm_tokens WHERE patient_id = ?', [id]);

        // patient 테이블에서 데이터 삭제
        const [result] = await connection.query('DELETE FROM patient WHERE patient_id = ?', [id]);

        if (result.affectedRows === 0) {
            await connection.rollback(); // 트랜잭션 롤백
            return res.status(404).json({ message: '환자를 찾을 수 없습니다.' });
        }

        // bed_id가 존재하면 bed 테이블의 상태를 empty로 업데이트
        if (bedId) {
            await connection.query('UPDATE bed SET bed_status = "empty" WHERE bed_id = ?', [bedId]);
        }

        // 트랜잭션 커밋
        await connection.commit();

        res.json({ message: '환자가 성공적으로 삭제되었습니다.' });
    } catch (error) {
        if (connection) {
            await connection.rollback(); // 트랜잭션 롤백
        }
        console.error('Error deleting patient:', error);
        res.status(500).json({ message: '환자 삭제 중 오류가 발생했습니다.', error: error.message });
    } finally {
        if (connection) {
            connection.release(); // 연결 반환
        }
    }
});
// PUT /api/patients/:id - 환자 정보 수정
router.put('/:id', upload.single('profile_image'), async (req, res) => {
    const { id } = req.params;
    const {
        patient_name,
        patient_birth,
        patient_height,
        patient_weight,
        patient_blood,
        patient_img, // JSON 요청에서 받은 이미지 경로
        patient_memo,
        patient_status,
        bed_id,
        guardian_id,
        medications,
    } = req.body;

    try {
        // 먼저 환자가 존재하는지 확인
        const [existingPatient] = await db.query('SELECT bed_id, patient_img FROM patient WHERE patient_id = ?', [id]);

        if (existingPatient.length === 0) {
            return res.status(404).json({
                code: 1,
                message: '환자 정보를 찾을 수 없습니다.',
            });
        }

        const oldBedId = existingPatient[0].bed_id;

        // 이미지 경로 결정 (우선순위: 업로드된 파일 > JSON 요청의 경로 > 기존 경로)
        let finalImagePath;
        if (req.file) {
            // 새 파일이 업로드된 경우
            finalImagePath = `/uploads/${req.file.filename}`;
        } else if (patient_img) {
            // JSON 요청에 이미지 경로가 포함된 경우
            finalImagePath = patient_img;
        } else {
            // 변경 사항 없음
            finalImagePath = existingPatient[0].patient_img;
        }

        console.log('Image path in DB will be:', finalImagePath);

        // 침대 변경된 경우 침대 상태 업데이트
        if (bed_id !== oldBedId) {
            if (oldBedId) {
                await db.query('UPDATE bed SET bed_status = "empty" WHERE bed_id = ?', [oldBedId]);
            }
            if (bed_id) {
                await db.query('UPDATE bed SET bed_status = "occupied" WHERE bed_id = ?', [bed_id]);
            }
        }

        // 환자 정보 업데이트 (patient_medic 필드 제거)
        await db.query(
            `UPDATE patient SET 
                patient_name = ?,
                patient_birth = ?,
                patient_height = ?,
                patient_weight = ?,
                patient_blood = ?,
                patient_img = ?,
                patient_memo = ?,
                patient_status = ?,
                guardian_id = ?,
                bed_id = ?
            WHERE patient_id = ?`,
            [
                patient_name,
                patient_birth,
                patient_height || null,
                patient_weight || null,
                patient_blood,
                finalImagePath,
                patient_memo || null,
                patient_status || '무위험군', // 기본값을 '무위험군'으로 변경
                guardian_id || null,
                bed_id || null,
                id,
            ]
        );

        // 약물 정보 업데이트
        if (medications && Array.isArray(medications)) {
            // 기존 약물 정보 삭제
            await db.query('DELETE FROM patient_med WHERE patient_id = ?', [id]);

            // 새 약물 정보가 있는 경우에만 추가
            if (medications.length > 0) {
                const medicationValues = medications.map((med) => [
                    id,
                    med.med_name,
                    med.med_dosage || null,
                    med.med_cycle || null,
                    med.med_start_dt || null,
                    med.med_end_dt || null,
                    med.notes || null,
                ]);

                await db.query(
                    `INSERT INTO patient_med (
                        patient_id, 
                        med_name, 
                        med_dosage, 
                        med_cycle, 
                        med_start_dt, 
                        med_end_dt, 
                        notes
                    ) VALUES ?`,
                    [medicationValues]
                );
            }
        }

        // 업데이트된 정보 조회
        const [updatedPatient] = await db.query(
            `SELECT 
                p.*,
                TIMESTAMPDIFF(YEAR, p.patient_birth, CURDATE()) as age,
                b.bed_num,
                r.room_name,
                g.guardian_tel
            FROM patient p
            LEFT JOIN bed b ON p.bed_id = b.bed_id
            LEFT JOIN room r ON b.room_id = r.room_id
            LEFT JOIN guardian g ON p.guardian_id = g.guardian_id
            WHERE p.patient_id = ?`,
            [id]
        );

        const [updatedMedications] = await db.query('SELECT * FROM patient_med WHERE patient_id = ?', [id]);

        res.json({
            code: 0,
            message: '환자 정보가 성공적으로 수정되었습니다.',
            data: {
                ...updatedPatient[0],
                medications: updatedMedications,
            },
        });
    } catch (err) {
        console.error('Error updating patient:', err);
        res.status(500).json({
            code: 1,
            message: '환자 정보 수정 중 오류가 발생했습니다.',
            error: err.message,
        });
    }
});

// GET /patients/:id/profile-image - 환자 프로필 이미지 조회
router.get('/:id/profile-image', async (req, res) => {
    const { id } = req.params;

    try {
        // 환자 정보 조회
        const [patient] = await db.query('SELECT patient_img FROM patient WHERE patient_id = ?', [id]);

        if (patient.length === 0) {
            return res.status(404).json({
                code: 1,
                message: '환자 정보를 찾을 수 없습니다.',
            });
        }

        // 이미지 경로가 없는 경우
        if (!patient[0].patient_img) {
            return res.status(404).json({
                code: 1,
                message: '이미지가 없습니다.',
            });
        }

        // 이미지 파일 경로 처리
        // DB에 /uploads/... 형태로 저장되어 있으므로 앞의 /를 제거하고 절대 경로 구성
        const imgPath = patient[0].patient_img.startsWith('/')
            ? patient[0].patient_img.substring(1)
            : patient[0].patient_img;

        const imagePath = path.join(__dirname, '..', imgPath);
        console.log('Image path:', imagePath);

        // 파일 존재 여부 확인
        if (!fs.existsSync(imagePath)) {
            return res.status(404).json({
                code: 1,
                message: '이미지 파일이 존재하지 않습니다.',
                path: imagePath,
            });
        }

        // 이미지 전송
        res.sendFile(imagePath);
    } catch (err) {
        console.error('Error fetching patient image:', err);
        res.status(500).json({
            code: 1,
            message: '이미지 조회 중 오류가 발생했습니다.',
            error: err.message,
        });
    }
});

// GET /patients/:id - 환자 상세 정보 조회
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // 환자 기본 정보 조회
        const [result] = await db.query(
            `SELECT 
                p.*,
                p.patient_img as profile_image, 
                TIMESTAMPDIFF(YEAR, p.patient_birth, CURDATE()) as age,
                b.bed_num,
                r.room_name,
                g.guardian_tel
            FROM patient p
            LEFT JOIN bed b ON p.bed_id = b.bed_id
            LEFT JOIN room r ON b.room_id = r.room_id
            LEFT JOIN guardian g ON p.guardian_id = g.guardian_id
            WHERE p.patient_id = ?`,
            [id]
        );

        if (result.length === 0) {
            return res.status(404).json({
                code: 1,
                message: '환자 정보를 찾을 수 없습니다.',
            });
        }

        // 약물 정보와 증상 정보는 테이블이 없을 수 있으므로 별도 처리
        let medications = [];
        let symptoms = [];

        try {
            // 약물 정보 조회
            const [medicationResults] = await db.query('SELECT * FROM patient_med WHERE patient_id = ?', [id]);
            medications = medicationResults;
        } catch (medError) {
            console.warn('Medication table may not exist:', medError.message);
        }

        try {
            // 증상 정보 조회
            const [symptomResults] = await db.query('SELECT * FROM patient_symptom WHERE patient_id = ?', [id]);
            symptoms = symptomResults;
        } catch (symptomError) {
            console.warn('Symptom table may not exist:', symptomError.message);
        }

        // 모든 정보를 합쳐서 반환
        res.json({
            code: 0,
            message: '환자 정보 조회 성공',
            data: {
                ...result[0],
                symptoms,
                medications,
            },
        });
    } catch (err) {
        console.error('Error fetching patient details:', err);
        res.status(500).json({
            code: 1,
            message: '환자 정보 조회 중 오류가 발생했습니다.',
            error: err.message,
        });
    }
});

module.exports = router;
