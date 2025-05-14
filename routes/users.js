var express = require('express');
var router = express.Router();
const db = require('../database/db_connect');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/* GET users listing. */
router.get('/', function (req, res, next) {
    res.send('respond with a resource');
});

// 이메일 중복 확인 엔드포인트
router.post('/check-email', async (req, res) => {
    console.log('이메일 중복 확인 요청 받음:', req.body);
    try {
        const { user_email } = req.body;

        if (!user_email) {
            return res.status(400).json({ message: '이메일이 필요합니다.' });
        }

        // 이메일로 사용자 찾기
        const [existingUser] = await db.query('SELECT * FROM users WHERE user_email = ?', [user_email]);
        console.log('이메일 중복 확인 결과:', existingUser && existingUser.length > 0 ? '중복됨' : '사용 가능');

        if (existingUser && existingUser.length > 0) {
            return res.status(400).json({ message: '이미 존재하는 이메일입니다.' });
        }

        // 사용 가능한 이메일
        return res.status(200).json({ message: '사용 가능한 이메일입니다.' });
    } catch (error) {
        console.error('이메일 중복 확인 오류:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

// 로그인 엔드포인트
router.post('/login', async (req, res) => {
    console.log('로그인 요청 받음:', req.body);
    try {
        const { user_email, user_pw } = req.body;

        console.log('이메일:', user_email, '비밀번호:', user_pw ? '(입력됨)' : '(입력안됨)');

        // 이메일로 사용자 찾기
        const [user] = await db.query('SELECT * FROM users WHERE user_email = ?', [user_email]);
        console.log('데이터베이스 조회 결과:', user && user.length > 0 ? '사용자 찾음' : '사용자 없음');

        if (!user || user.length === 0) {
            console.log('사용자를 찾을 수 없음:', user_email);
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }

        // 비밀번호 확인
        const isValidPassword = await bcrypt.compare(user_pw, user[0].user_pw);
        console.log('비밀번호 확인 결과:', isValidPassword ? '일치' : '불일치');

        if (!isValidPassword) {
            console.log('비밀번호 불일치');
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

        console.log('로그인 성공, 토큰 생성:', user[0].user_email);

        res.json({
            token,
            user_id: user[0].user_id,
            user_email: user[0].user_email,
            user_role: user[0].user_role,
            user_name: user[0].user_name,
        });
    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

// 회원가입 엔드포인트
router.post('/signup', async (req, res) => {
    console.log('회원가입 요청 받음:', req.body);
    try {
        const { user_email, user_pw, user_name, user_role } = req.body;

        // 이메일 중복 확인
        const [existingUser] = await db.query('SELECT * FROM users WHERE user_email = ?', [user_email]);
        if (existingUser && existingUser.length > 0) {
            console.log('이미 존재하는 이메일:', user_email);
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

        console.log('회원가입 성공:', user_email);
        res.status(201).json({ message: '회원가입이 완료되었습니다.' });
    } catch (error) {
        console.error('회원가입 오류:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
