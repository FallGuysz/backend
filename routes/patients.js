const express = require('express');
const router = express.Router();
const db = require('../database/db_connect');

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

// POST /patients - 환자 추가
router.post('/', async (req, res) => {
    try {
        const {
            patient_name,
            patient_birth,
            patient_height,
            patient_weight,
            patient_blood,
            patient_img,
            patient_memo,
            patient_medic,
            guardian_id,
            bed_id,
        } = req.body;

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
                patient_medic,
                patient_status,
                guardian_id,
                bed_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,

            [
                patient_name,
                patient_birth,
                patient_height,
                patient_weight,
                patient_blood,
                patient_img || null,
                patient_memo || null,
                patient_medic || null,
                guardian_id,
                bed_id,
            ]
        );

        const patientId = result.insertId;

        // 약물 정보가 제공된 경우 처리
        if (req.body.medications && Array.isArray(req.body.medications)) {
            const medicationPromises = req.body.medications.map((med) => {
                return db.query(
                    `INSERT INTO patient_med (
                        patient_id, 
                        med_name, 
                        med_dosage, 
                        med_cycle, 
                        med_start_dt, 
                        med_end_dt, 
                        notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,

                    [
                        patientId,
                        med.med_name,
                        med.med_dosage,
                        med.med_cycle,
                        med.med_start_dt,
                        med.med_end_dt,
                        med.notes || null,
                    ]
                );
            });

            await Promise.all(medicationPromises);
        }

        res.status(201).json({
            code: 0,
            message: '환자가 성공적으로 등록되었습니다.',
            data: {
                patient_id: patientId,
                ...req.body,
            },
        });
    } catch (err) {
        console.error('Error adding patient:', err);
        res.status(500).json({ code: 1, message: 'Failed to add patient', error: err.message });
    }
});

// DELETE /api/patients/:id - 환자 삭제
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 환자의 침대 ID 가져오기
        const [patientResult] = await db.query('SELECT bed_id FROM patient WHERE patient_id = ?', [id]);
        const bedId = patientResult[0]?.bed_id;

        // 환자 삭제 전에 약물 정보 삭제
        await db.query('DELETE FROM patient_med WHERE patient_id = ?', [id]);

        // 환자 정보 삭제
        await db.query('DELETE FROM patient WHERE patient_id = ?', [id]);

        // 침대 상태 업데이트
        if (bedId) {
            await db.query('UPDATE bed SET bed_status = "empty" WHERE bed_id = ?', [bedId]);
        }

        res.status(204).send();
    } catch (err) {
        console.error('Error deleting patient:', err);
        res.status(500).json({ code: 1, message: 'Failed to delete patient', error: err.message });
    }
});

// PUT /api/patients/:id - 환자 정보 수정
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
        // 먼저 환자가 존재하는지 확인
        const [existingPatient] = await db.query('SELECT bed_id FROM patient WHERE patient_id = ?', [id]);

        if (existingPatient.length === 0) {
            return res.status(404).json({
                code: 1,
                message: '환자 정보를 찾을 수 없습니다.',
            });
        }

        const oldBedId = existingPatient[0].bed_id;

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
                patient_img || null,
                patient_memo || null,
                patient_status || 'active',
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

// GET /api/patients/:id - 특정 환자 상세 정보 조회
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 환자 정보 조회 (관련 테이블 조인)
        const [patient] = await db.query(
            `
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
            WHERE p.patient_id = ?
        `,
            [id]
        );

        if (patient.length === 0) {
            return res.status(404).json({
                code: 1,
                message: '환자 정보를 찾을 수 없습니다.',
            });
        }

        // 환자의 약물 정보 조회
        const [medications] = await db.query(
            `
            SELECT * FROM patient_med WHERE patient_id = ?
        `,
            [id]
        );

        res.json({
            code: 0,
            data: {
                ...patient[0],
                medications,
            },
        });
    } catch (err) {
        console.error('Error fetching patient:', err);
        res.status(500).json({
            code: 1,
            message: '서버 오류가 발생했습니다.',
            error: err.message,
        });
    }
});

module.exports = router;
