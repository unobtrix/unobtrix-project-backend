const { generateOTP, storeOTP, verifyOTP, deleteOTP } = require('../utils/otp');

/**
 * POST /api/mobile/send-otp - Send OTP to mobile number
 */
async function sendMobileOTP(req, res) {
    try {
        const { mobile } = req.body;
        
        console.log('📱 Mobile OTP request for:', mobile);
        
        if (!mobile || !/^\d{10}$/.test(mobile)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 10-digit mobile number is required' 
            });
        }
        
        const otp = generateOTP();
        storeOTP(mobile, otp, 10); // 10 minutes expiry
        
        console.log(`✅ OTP ${otp} generated for ${mobile}`);
        
        // Only include OTP in response for development/testing
        const responseData = {
            success: true,
            message: 'OTP sent successfully to your mobile number',
            expiry: '10 minutes',
            timestamp: new Date().toISOString()
        };
        
        // Include OTP only in development mode
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            responseData.debug_otp = otp;
        }
        
        return res.json(responseData);
        
    } catch (error) {
        console.error('❌ Error generating OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP. Please try again.',
            error: error.message 
        });
    }
}

/**
 * POST /api/mobile/verify - Verify mobile OTP
 */
async function verifyMobileOTP(req, res) {
    try {
        const { mobile, otp } = req.body;
        
        console.log('📱 Mobile OTP verification for:', mobile);
        
        if (!mobile || !otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mobile number and OTP are required' 
            });
        }
        
        const isValid = verifyOTP(mobile, otp);
        
        if (!isValid) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired OTP. Please request a new OTP.'
            });
        }
        
        deleteOTP(mobile);
        
        res.json({
            success: true,
            message: 'Mobile number verified successfully!',
            verifiedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error verifying OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify OTP. Please try again.',
            error: error.message 
        });
    }
}

/**
 * POST /api/aadhaar/send-otp - Send OTP for Aadhaar verification
 */
async function sendAadhaarOTP(req, res) {
    try {
        const { aadhaar_number } = req.body;
        
        console.log('🆔 Aadhaar OTP request for:', aadhaar_number);
        
        if (!aadhaar_number || !/^\d{12}$/.test(aadhaar_number)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 12-digit Aadhaar number is required' 
            });
        }
        
        const otp = generateOTP();
        const key = `aadhaar_${aadhaar_number}`;
        storeOTP(key, otp, 10); // 10 minutes expiry
        
        console.log(`✅ Aadhaar OTP ${otp} generated for ${aadhaar_number}`);
        
        // Only include OTP in response for development/testing
        const responseData = {
            success: true,
            message: 'Aadhaar verification OTP sent successfully',
            expiry: '10 minutes',
            timestamp: new Date().toISOString()
        };
        
        // Include OTP only in development mode
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            responseData.debug_otp = otp;
        }
        
        return res.json(responseData);
        
    } catch (error) {
        console.error('❌ Error generating Aadhaar OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send Aadhaar OTP. Please try again.',
            error: error.message
        });
    }
}

/**
 * POST /api/aadhaar/verify - Verify Aadhaar OTP
 */
async function verifyAadhaarOTP(req, res) {
    try {
        const { aadhaar_number, otp } = req.body;
        
        console.log('🆔 Aadhaar verification for:', aadhaar_number);
        
        if (!aadhaar_number || !otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Aadhaar number and OTP are required' 
            });
        }
        
        const key = `aadhaar_${aadhaar_number}`;
        const isValid = verifyOTP(key, otp);
        
        if (!isValid) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired OTP. Please request a new OTP.' 
            });
        }
        
        deleteOTP(key);
        
        res.json({
            success: true,
            message: 'Aadhaar verified successfully!',
            verifiedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error verifying Aadhaar OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify Aadhaar OTP. Please try again.',
            error: error.message 
        });
    }
}

module.exports = {
    sendMobileOTP,
    verifyMobileOTP,
    sendAadhaarOTP,
    verifyAadhaarOTP
};
