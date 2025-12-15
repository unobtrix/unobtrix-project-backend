// In-memory storage for OTPs
const otpStore = new Map();

/**
 * Generate a random OTP of specified length
 * @param {number} length - Length of OTP (default: 6)
 * @returns {string} Generated OTP
 */
function generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

/**
 * Store OTP with expiry time
 * @param {string} key - Identifier for the OTP
 * @param {string} otp - OTP value
 * @param {number} expiryMinutes - Expiry time in minutes (default: 5)
 */
function storeOTP(key, otp, expiryMinutes = 5) {
    const expiry = Date.now() + (expiryMinutes * 60 * 1000);
    otpStore.set(key, { otp, expiry });
}

/**
 * Verify OTP
 * @param {string} key - Identifier for the OTP
 * @param {string} otp - OTP to verify
 * @returns {boolean} True if OTP is valid and not expired
 */
function verifyOTP(key, otp) {
    const stored = otpStore.get(key);
    if (!stored) {
        return false;
    }
    
    if (Date.now() > stored.expiry) {
        otpStore.delete(key);
        return false;
    }
    
    return stored.otp === otp;
}

/**
 * Delete OTP after successful verification
 * @param {string} key - Identifier for the OTP
 */
function deleteOTP(key) {
    otpStore.delete(key);
}

/**
 * Clean up expired OTPs
 */
function cleanupExpiredOTPs() {
    const now = Date.now();
    for (const [key, value] of otpStore.entries()) {
        if (now > value.expiry) {
            otpStore.delete(key);
        }
    }
}

module.exports = {
    generateOTP,
    storeOTP,
    verifyOTP,
    deleteOTP,
    cleanupExpiredOTPs
};
