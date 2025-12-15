const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otpController');

router.post('/mobile/send-otp', otpController.sendMobileOTP);
router.post('/mobile/verify', otpController.verifyMobileOTP);
router.post('/aadhaar/send-otp', otpController.sendAadhaarOTP);
router.post('/aadhaar/verify', otpController.verifyAadhaarOTP);

module.exports = router;
