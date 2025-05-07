const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: '203.231.146.220',
    port: 3306,
    user: '202506_cu',
    password: '202506_cu',
    database: '202506_cu',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

module.exports = pool;
