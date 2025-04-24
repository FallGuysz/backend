// routes/alerts.js
const express = require('express');
const router = express.Router();
const { sendFallAlert } = require('./notificationController');

// POST /api/alerts/fall
router.post('/fall', async (req, res) => {
    const { token, roomName } = req.body;

    if (!token || !roomName) {
        return res.status(400).json({ error: 'token과 roomName은 필수입니다.' });
    }

    await sendFallAlert(token, roomName);
    res.status(200).json({ message: '알림 전송 완료' });
});

module.exports = router;
