var express = require('express');
var router = express.Router();
const db = require('../database/db_connect');

/* GET home page. */
router.get('/', function (req, res, next) {
    res.send({ message: 'Welcome to FallGuardian API' });
});

module.exports = router;
