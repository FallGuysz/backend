require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const cors = require('cors');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var patientsRouter = require('./routes/patients');
var roomsRouter = require('./routes/rooms'); // 병실 관련 API 라우터 추가
var fallRouter = require('./routes/fall-incidents'); // 낙상 관련 API 라우터 추가
const environmentalRouter = require('./routes/environmental'); // 환경 관련 API 라우터 추가
const weatherRouter = require('./routes/weather'); // 날씨 관련 API 라우터 추가
const alertsRouter = require('./routes/alerts'); // 알림 관련 API 라우터 추가
const notificationsRouter = require('./routes/notifications'); // 추가
const firebaseConfigRouter = require('./routes/firebase-config');
const floorsRouter = require('./routes/floors'); // 층 정보 관련 API 라우터 추가

var app = express();

// CORS 설정 업데이트
app.use(
    cors({
        origin: ['http://localhost:5000', 'http://localhost:3000', '*'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    })
);

// 디버깅을 위한 미들웨어
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

//db connect
const db = require('./database/db_connect');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/patients', patientsRouter);
app.use('/rooms', roomsRouter); // 병실 관련 API 라우터 추가
app.use('/fall-incidents', fallRouter); // 낙상 관련 API 라우터 추가
app.use('/environmental', environmentalRouter); // 환경 관련 API 라우터 추가
app.use('/weather', weatherRouter); // 날씨 관련 API 라우터 추가
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // 정적 파일 서빙 설정 추가
app.use('/alerts', alertsRouter); // 알림 관련 API 라우터 추가
app.use('/notifications', notificationsRouter); // 알림 관련 API 라우터 추가
app.use('/firebase', firebaseConfigRouter);
app.use('/floors', floorsRouter); // 층 정보 관련 API 라우터 추가

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
