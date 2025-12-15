const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.getLoginInfo);
router.post('/login', authController.login);

module.exports = router;
