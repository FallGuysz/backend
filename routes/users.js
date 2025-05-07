var express = require('express');
var router = express.Router();
const db = require('../database/db_connect');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/* GET users listing. */
router.get('/', function (req, res, next) {
    res.send('respond with a resource');
});

// 로그인 엔드포인트
router.post('/login', async (req, res) => {
    try {
        const { user_email, user_pw } = req.body;

        // 이메일로 사용자 찾기
        const [user] = await db.query('SELECT * FROM users WHERE user_email = ?', [user_email]);

        if (!user || user.length === 0) {
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }

        // 비밀번호 확인
        const isValidPassword = await bcrypt.compare(user_pw, user[0].user_pw);
        if (!isValidPassword) {
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }

        // JWT 토큰 생성
        const token = jwt.sign(
            {
                user_id: user[0].user_id,
                user_email: user[0].user_email,
                user_role: user[0].user_role,
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user_id: user[0].user_id,
            user_email: user[0].user_email,
            user_role: user[0].user_role,
        });
    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

// 회원가입 엔드포인트
router.post('/signup', async (req, res) => {
    try {
        const { user_email, user_pw, user_name, user_role } = req.body;

        // 이메일 중복 확인
        const [existingUser] = await db.query('SELECT * FROM users WHERE user_email = ?', [user_email]);
        if (existingUser && existingUser.length > 0) {
            return res.status(400).json({ message: '이미 존재하는 이메일입니다.' });
        }

        // 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(user_pw, 10);

        // 사용자 생성
        await db.query('INSERT INTO users (user_email, user_pw, user_name, user_role) VALUES (?, ?, ?, ?)', [
            user_email,
            hashedPassword,
            user_name,
            user_role || 'user',
        ]);

        res.status(201).json({ message: '회원가입이 완료되었습니다.' });
    } catch (error) {
        console.error('회원가입 오류:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
