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

// POST /patients - 환자 추가
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
        } = req.body;

        const patient_img = req.file ? `/uploads/${req.file.filename}` : null;

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
                bed_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patient_name,
                patient_birth ? patient_birth.split('T')[0] : null,
                patient_height,
                patient_weight,
                patient_blood,
                patient_img,
                patient_memo || null,
                patient_status || '무위험군',
                guardian_id || null,
                bed_id || null,
            ]
        );

        res.status(201).json({
            code: 0,
            message: '환자가 성공적으로 등록되었습니다.',
            data: {
                patient_id: result.insertId,
                ...req.body,
                patient_img,
            },
        });
    } catch (err) {
        console.error('Error adding patient:', err);
        res.status(500).json({ code: 1, message: '환자 등록 실패', error: err.message });
    }
});

// DELETE /api/patients/:id
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [patientResult] = await db.query('SELECT bed_id FROM patient WHERE patient_id = ?', [id]);
        const bedId = patientResult[0]?.bed_id;

        await db.query('DELETE FROM patient_med WHERE patient_id = ?', [id]);
        await db.query('DELETE FROM patient WHERE patient_id = ?', [id]);

        if (bedId) {
            await db.query('UPDATE bed SET bed_status = "empty" WHERE bed_id = ?', [bedId]);
        }

        res.status(204).send();
    } catch (err) {
        console.error('Error deleting patient:', err);
        res.status(500).json({ code: 1, message: 'Failed to delete patient', error: err.message });
    }
});

// PUT /api/patients/:id
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const {
        patient_name,
        patient_birth,
        patient_height,
        patient_weight,
        patient_blood,
        patient_img,
        patient_memo,
        patient_status,
        bed_id,
        guardian_id,
        medications,
    } = req.body;

    try {
        const [existingPatient] = await db.query('SELECT bed_id FROM patient WHERE patient_id = ?', [id]);

        if (existingPatient.length === 0) {
            return res.status(404).json({ code: 1, message: '환자 정보를 찾을 수 없습니다.' });
        }

        const oldBedId = existingPatient[0].bed_id;

        if (bed_id !== oldBedId) {
            if (oldBedId) await db.query('UPDATE bed SET bed_status = "empty" WHERE bed_id = ?', [oldBedId]);
            if (bed_id) await db.query('UPDATE bed SET bed_status = "occupied" WHERE bed_id = ?', [bed_id]);
        }

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
                patient_birth ? patient_birth.split('T')[0] : null,
                patient_height || null,
                patient_weight || null,
                patient_blood,
                patient_img || null,
                patient_memo || null,
                patient_status || '무위험군',
                guardian_id || null,
                bed_id || null,
                id,
            ]
        );

        if (medications && Array.isArray(medications)) {
            await db.query('DELETE FROM patient_med WHERE patient_id = ?', [id]);

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
                        patient_id, med_name, med_dosage, med_cycle, med_start_dt, med_end_dt, notes
                    ) VALUES ?`,
                    [medicationValues]
                );
            }
        }

        const [updatedPatient] = await db.query(
            `SELECT 
                p.*, 
                TIMESTAMPDIFF(YEAR, p.patient_birth, CURDATE()) as age, 
                b.bed_num, r.room_name, g.guardian_tel 
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
        res.status(500).json({ code: 1, message: '환자 정보 수정 중 오류가 발생했습니다.', error: err.message });
    }
});

// GET /api/patients/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [patient] = await db.query(
            `SELECT 
                p.*, 
                TIMESTAMPDIFF(YEAR, p.patient_birth, CURDATE()) as age, 
                b.bed_num, r.room_name, g.guardian_tel 
            FROM patient p
            LEFT JOIN bed b ON p.bed_id = b.bed_id
            LEFT JOIN room r ON b.room_id = r.room_id
            LEFT JOIN guardian g ON p.guardian_id = g.guardian_id
            WHERE p.patient_id = ?`,
            [id]
        );

        if (patient.length === 0) {
            return res.status(404).json({ code: 1, message: '환자 정보를 찾을 수 없습니다.' });
        }

        const [medications] = await db.query('SELECT * FROM patient_med WHERE patient_id = ?', [id]);

        res.json({
            code: 0,
            data: {
                ...patient[0],
                medications,
            },
        });
    } catch (err) {
        console.error('Error fetching patient:', err);
        res.status(500).json({ code: 1, message: '서버 오류가 발생했습니다.', error: err.message });
    }
});

module.exports = router;
