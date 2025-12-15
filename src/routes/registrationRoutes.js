const express = require('express');
const router = express.Router();
const registrationController = require('../controllers/registrationController');

router.post('/register/consumer', registrationController.registerConsumer);
router.post('/register/farmer', registrationController.registerFarmer);

module.exports = router;
