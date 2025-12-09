const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// ==================== CORS CONFIGURATION ====================
app.use(cors({
    origin: [
        'https://unobtrix.netlify.app',
        'https://unobtrix.netlify.app/',
        'https://unobtrix.netlify.app/signup',
        'https://unobtrix.netlify.app/farmerpage',
        'https://unobtrix.netlify.app/customer',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length'],
    maxAge: 86400 // 24 hours
}));

// Handle preflight requests
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.status(204).end();
});

// Additional CORS headers middleware
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://unobtrix.netlify.app',
        'http://localhost:3000',
        'http://localhost:5500'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || 
        (origin && origin.includes('.netlify.app'))) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});
// ============================================================

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.log('Origin:', req.headers.origin || 'No origin');
    console.log('User-Agent:', req.headers['user-agent']);
    next();
});

// ==================== IN-MEMORY STORAGE ====================
const otpStore = new Map();

// Generate random OTP
function generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        server: 'FarmTrials Registration API',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        cors: 'enabled',
        endpoints: {
            health: 'GET /health',
            mobileOTP: 'POST /api/mobile/send-otp',
            verifyMobile: 'POST /api/mobile/verify',
            aadhaarOTP: 'POST /api/aadhaar/send-otp',
            verifyAadhaar: 'POST /api/aadhaar/verify',
            registerConsumer: 'POST /api/register/consumer',
            registerFarmer: 'POST /api/register/farmer',
            uploadPhoto: 'POST /api/upload-photo'
        }
    });
});

// ==================== MOBILE OTP ENDPOINTS ====================

// Send OTP to mobile
app.post('/api/mobile/send-otp', (req, res) => {
    try {
        const { mobile } = req.body;
        
        console.log('📱 Mobile OTP request for:', mobile);
        
        if (!mobile || mobile.length !== 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 10-digit mobile number is required' 
            });
        }
        
        const otp = generateOTP();
        const expiryTime = Date.now() + 10 * 60 * 1000; // 10 minutes
        
        otpStore.set(mobile, { 
            otp, 
            expiry: expiryTime,
            created: new Date().toISOString(),
            type: 'mobile'
        });
        
        console.log(`✅ OTP ${otp} generated for ${mobile} (expires in 10 minutes)`);
        
        return res.json({
            success: true,
            message: 'OTP sent successfully to your mobile number.',
            otp: otp, // For testing/debugging
            debug_otp: otp, // For frontend auto-fill
            expiry: '10 minutes',
            timestamp: new Date().toISOString(),
            mobile: mobile
        });
        
    } catch (error) {
        console.error('❌ Error generating mobile OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP. Please try again.',
            error: error.message 
        });
    }
});

// Verify Mobile OTP
app.post('/api/mobile/verify', (req, res) => {
    try {
        const { mobile, otp } = req.body;
        
        console.log('📱 Mobile OTP verification for:', mobile);
        
        if (!mobile || !otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mobile number and OTP are required' 
            });
        }
        
        const storedData = otpStore.get(mobile);
        
        if (!storedData) {
            return res.status(404).json({ 
                success: false, 
                message: 'No OTP found for this number. Please request a new OTP.' 
            });
        }
        
        if (Date.now() > storedData.expiry) {
            otpStore.delete(mobile);
            return res.status(400).json({ 
                success: false, 
                message: 'OTP has expired. Please request a new OTP.' 
            });
        }
        
        if (storedData.otp !== otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid OTP. Please check and try again.' 
            });
        }
        
        otpStore.delete(mobile);
        
        console.log(`✅ Mobile ${mobile} verified successfully`);
        
        res.json({
            success: true,
            message: 'Mobile number verified successfully!',
            verifiedAt: new Date().toISOString(),
            mobile: mobile
        });
        
    } catch (error) {
        console.error('❌ Error verifying mobile OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify OTP. Please try again.',
            error: error.message 
        });
    }
});

// ==================== AADHAAR OTP ENDPOINTS ====================

// Send Aadhaar OTP
app.post('/api/aadhaar/send-otp', (req, res) => {
    try {
        const { aadhaar_number, mobile } = req.body;
        
        console.log('🆔 Aadhaar OTP request for:', aadhaar_number);
        
        if (!aadhaar_number || aadhaar_number.length !== 12) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 12-digit Aadhaar number is required' 
            });
        }
        
        const otp = generateOTP();
        const expiryTime = Date.now() + 10 * 60 * 1000;
        
        otpStore.set(`aadhaar_${aadhaar_number}`, { 
            otp, 
            expiry: expiryTime,
            created: new Date().toISOString(),
            type: 'aadhaar',
            mobile: mobile
        });
        
        console.log(`✅ Aadhaar OTP ${otp} generated for ${aadhaar_number}`);
        
        return res.json({
            success: true,
            message: 'Aadhaar verification OTP sent successfully.',
            otp: otp,
            debug_otp: otp,
            expiry: '10 minutes',
            timestamp: new Date().toISOString(),
            aadhaar_number: aadhaar_number
        });
        
    } catch (error) {
        console.error('❌ Error generating Aadhaar OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send Aadhaar OTP. Please try again.',
            error: error.message 
        });
    }
});

// Verify Aadhaar OTP
app.post('/api/aadhaar/verify', (req, res) => {
    try {
        const { aadhaar_number, otp } = req.body;
        
        console.log('🆔 Aadhaar verification for:', aadhaar_number);
        
        if (!aadhaar_number || !otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Aadhaar number and OTP are required' 
            });
        }
        
        const storedData = otpStore.get(`aadhaar_${aadhaar_number}`);
        
        if (!storedData) {
            return res.status(404).json({ 
                success: false, 
                message: 'No OTP found for this Aadhaar number. Please request a new OTP.' 
            });
        }
        
        if (Date.now() > storedData.expiry) {
            otpStore.delete(`aadhaar_${aadhaar_number}`);
            return res.status(400).json({ 
                success: false, 
                message: 'OTP has expired. Please request a new OTP.' 
            });
        }
        
        if (storedData.otp !== otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid OTP. Please check and try again.' 
            });
        }
        
        otpStore.delete(`aadhaar_${aadhaar_number}`);
        
        console.log(`✅ Aadhaar ${aadhaar_number} verified successfully`);
        
        res.json({
            success: true,
            message: 'Aadhaar verified successfully!',
            verifiedAt: new Date().toISOString(),
            aadhaar_number: aadhaar_number
        });
        
    } catch (error) {
        console.error('❌ Error verifying Aadhaar OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify Aadhaar OTP. Please try again.',
            error: error.message 
        });
    }
});

// ==================== USER REGISTRATION ENDPOINTS ====================

// Consumer Registration
app.post('/api/register/consumer', (req, res) => {
    try {
        const { username, email, mobile, password, profile_photo_url } = req.body;
        
        console.log('👤 Consumer registration for:', username, email);
        
        // Validation
        if (!username || username.length < 3) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username must be at least 3 characters long' 
            });
        }
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid email address is required' 
            });
        }
        
        if (!mobile || mobile.length !== 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 10-digit mobile number is required' 
            });
        }
        
        if (!password || password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters long' 
            });
        }
        
        // Simulate successful registration
        const userId = 'CONS_' + Date.now().toString(36).toUpperCase();
        
        console.log(`✅ Consumer account created: ${userId} for ${username}`);
        
        res.json({
            success: true,
            message: 'Consumer account created successfully!',
            user: { 
                id: userId,
                username: username, 
                email: email, 
                mobile: mobile,
                profile_photo_url: profile_photo_url || null,
                user_type: 'consumer',
                created_at: new Date().toISOString(),
                status: 'active'
            }
        });
        
    } catch (error) {
        console.error('❌ Error registering consumer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed. Please try again.',
            error: error.message 
        });
    }
});

// Farmer Registration
app.post('/api/register/farmer', (req, res) => {
    try {
        const { 
            username, email, aadhaar_number, mobile, password,
            profile_photo_url, farm_name, farm_size, specialization,
            certifications, village, taluka, district, state, pin_code,
            account_holder_name, account_number, bank_name, ifsc_code,
            branch_name, aadhaar_verified, mobile_verified
        } = req.body;
        
        console.log('👨‍🌾 Farmer registration for:', username, farm_name);
        
        // Basic validation
        if (!username || username.length < 3) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username must be at least 3 characters long' 
            });
        }
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid email address is required' 
            });
        }
        
        if (!aadhaar_number || aadhaar_number.length !== 12) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 12-digit Aadhaar number is required' 
            });
        }
        
        if (!mobile || mobile.length !== 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 10-digit mobile number is required' 
            });
        }
        
        if (!password || password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters long' 
            });
        }
        
        if (!farm_name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Farm name is required' 
            });
        }
        
        // Simulate successful registration
        const farmerId = 'FARM_' + Date.now().toString(36).toUpperCase();
        
        console.log(`✅ Farmer account created: ${farmerId} for ${username}`);
        
        res.json({
            success: true,
            message: 'Farmer account created successfully! Your account will be verified within 24-48 hours.',
            farmer: { 
                id: farmerId,
                username: username, 
                email: email, 
                mobile: mobile,
                aadhaar_number: aadhaar_number,
                profile_photo_url: profile_photo_url || null,
                farm_details: {
                    farm_name: farm_name,
                    farm_size: farm_size || 0,
                    specialization: specialization || 'Not specified',
                    certifications: certifications || [],
                    location: {
                        village: village || '',
                        taluka: taluka || '',
                        district: district || '',
                        state: state || '',
                        pin_code: pin_code || ''
                    }
                },
                bank_details: {
                    account_holder_name: account_holder_name || '',
                    account_number: account_number || '',
                    bank_name: bank_name || '',
                    ifsc_code: ifsc_code || '',
                    branch_name: branch_name || ''
                },
                verification_status: {
                    aadhaar_verified: aadhaar_verified || false,
                    mobile_verified: mobile_verified || false,
                    account_verified: 'pending'
                },
                user_type: 'farmer',
                created_at: new Date().toISOString(),
                status: 'pending_verification'
            }
        });
        
    } catch (error) {
        console.error('❌ Error registering farmer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed. Please try again.',
            error: error.message 
        });
    }
});

// ==================== PHOTO UPLOAD ENDPOINT ====================

app.post('/api/upload-photo', (req, res) => {
    try {
        const { imageData, userType } = req.body;
        
        console.log('📸 Photo upload for:', userType);
        
        if (!imageData) {
            return res.status(400).json({ 
                success: false, 
                message: 'No image data provided' 
            });
        }
        
        // Simulate photo upload and return a mock URL
        // In production, you would upload to cloud storage like S3, Cloudinary, etc.
        const timestamp = Date.now();
        const mockPhotoUrl = `https://api.dicebear.com/7.x/avatars/svg?seed=${userType}_${timestamp}`;
        
        console.log(`✅ Photo uploaded successfully for ${userType}`);
        
        res.json({
            success: true,
            message: 'Profile photo uploaded successfully!',
            photoUrl: mockPhotoUrl,
            uploadedAt: new Date().toISOString(),
            userType: userType
        });
        
    } catch (error) {
        console.error('❌ Error handling photo upload:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to upload photo. Please try again.',
            error: error.message 
        });
    }
});

// ==================== TEST ENDPOINTS ====================

// Simple test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'FarmTrials API is working! 🚀',
        server: 'Render',
        timestamp: new Date().toISOString(),
        cors: 'enabled',
        client_ip: req.ip,
        user_agent: req.headers['user-agent']
    });
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
    res.json({
        success: true,
        message: 'CORS is working correctly! ✅',
        origin: req.headers.origin || 'No origin header',
        allowed: true,
        timestamp: new Date().toISOString()
    });
});

// ==================== ROOT ENDPOINT ====================

app.get('/', (req, res) => {
    res.json({ 
        server: 'FarmTrials Registration API',
        version: '1.0.0',
        status: 'operational',
        documentation: {
            health_check: 'GET /health',
            mobile_otp: {
                send: 'POST /api/mobile/send-otp',
                verify: 'POST /api/mobile/verify'
            },
            aadhaar_otp: {
                send: 'POST /api/aadhaar/send-otp',
                verify: 'POST /api/aadhaar/verify'
            },
            registration: {
                consumer: 'POST /api/register/consumer',
                farmer: 'POST /api/register/farmer'
            },
            upload: 'POST /api/upload-photo',
            test: 'GET /api/test',
            cors_test: 'GET /api/cors-test'
        },
        cors: {
            enabled: true,
            allowed_origins: [
                'https://unobtrix.netlify.app',
                'http://localhost:3000',
                'http://localhost:5500'
            ]
        }
    });
});

// ==================== ERROR HANDLING ====================

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path,
        method: req.method,
        available_endpoints: [
            '/health',
            '/api/mobile/send-otp',
            '/api/mobile/verify',
            '/api/aadhaar/send-otp',
            '/api/aadhaar/verify',
            '/api/register/consumer',
            '/api/register/farmer',
            '/api/upload-photo',
            '/api/test',
            '/api/cors-test'
        ]
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('💥 Server error:', err);
    
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!',
        timestamp: new Date().toISOString()
    });
});

// ==================== OTP CLEANUP ====================

// Clean up expired OTPs every hour
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, data] of otpStore.entries()) {
        if (now > data.expiry) {
            otpStore.delete(key);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired OTPs`);
    }
}, 60 * 60 * 1000); // Every hour

// ==================== SERVER START ====================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`
    🚀 FarmTrials Registration Server
    📍 Port: ${PORT}
    🌐 Environment: ${process.env.NODE_ENV || 'development'}
    ✅ CORS: Enabled
    🔗 Frontend: https://unobtrix.netlify.app
    ⏰ Started: ${new Date().toISOString()}
    📊 OTP Store: ${otpStore.size} entries
    `);
    
    console.log('\n📋 Available endpoints:');
    console.log('   GET  /health            - Health check');
    console.log('   POST /api/mobile/send-otp - Send mobile OTP');
    console.log('   POST /api/mobile/verify   - Verify mobile OTP');
    console.log('   POST /api/aadhaar/send-otp - Send Aadhaar OTP');
    console.log('   POST /api/aadhaar/verify   - Verify Aadhaar OTP');
    console.log('   POST /api/register/consumer - Register consumer');
    console.log('   POST /api/register/farmer   - Register farmer');
    console.log('   POST /api/upload-photo     - Upload profile photo');
    console.log('   GET  /api/test           - API test endpoint');
    console.log('   GET  /api/cors-test      - CORS test endpoint');
    console.log('\n✅ Server ready to accept connections!\n');
});