require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// 라우터 설정
const patientsRouter = require('./routes/patients');
const roomsRouter = require('./routes/rooms');
const floorsRouter = require('./routes/floors');
const fallIncidentsRouter = require('./routes/fall-incidents');
const environmentalRouter = require('./routes/environmental');
const notificationsRouter = require('./routes/notifications');

// API 라우트 - /api 프리픽스 제거
app.use('/patients', patientsRouter);
app.use('/rooms', roomsRouter);
app.use('/floors', floorsRouter);
app.use('/fall-incidents', fallIncidentsRouter);
app.use('/environmental', environmentalRouter);
app.use('/notifications', notificationsRouter);

// Production mode: Serve static files and handle SPA routing
if (process.env.NODE_ENV === 'production') {
    // Serve static files from the frontend build directory
    app.use(express.static(path.join(__dirname, '../front/dist')));

    // Handle SPA routing - send all requests to index.html
    app.get('*', (req, res) => {
        // Only handle non-API routes for SPA - API 프리픽스 제거
        if (
            !req.path.startsWith('/patients') &&
            !req.path.startsWith('/rooms') &&
            !req.path.startsWith('/floors') &&
            !req.path.startsWith('/fall-incidents') &&
            !req.path.startsWith('/environmental') &&
            !req.path.startsWith('/notifications')
        ) {
            res.sendFile(path.join(__dirname, '../front/dist/index.html'));
        }
    });
} else {
    // Development mode: Handle SPA routing by forwarding to the frontend dev server
    app.get('*', (req, res, next) => {
        // API 프리픽스 제거로 인한 조건문 변경
        if (
            !req.path.startsWith('/patients') &&
            !req.path.startsWith('/rooms') &&
            !req.path.startsWith('/floors') &&
            !req.path.startsWith('/fall-incidents') &&
            !req.path.startsWith('/environmental') &&
            !req.path.startsWith('/notifications')
        ) {
            // Forward to frontend dev server
            res.redirect(`http://localhost:5000${req.originalUrl}`);
        } else {
            next();
        }
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
