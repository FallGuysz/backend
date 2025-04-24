const admin = require('firebase-admin');
require('dotenv').config(); // 혹시 이 파일 단독 실행 시 필요

const serviceAccount = require(process.env.FIREBASE_KEY_PATH); // 🔐 경로 가져오기

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
