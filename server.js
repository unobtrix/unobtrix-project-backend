const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// ==================== CORS FIX ====================
// Enable CORS for all routes
app.use(cors({
    origin: [
        'https://unobtrix.netlify.app/',      // Your exact Netlify URL
        'https://unobtrix.netlify.app/signup',             // All Netlify subdomains
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://127.0.0.1:5500'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization', 
        'Accept',
        'Origin',
        'X-Requested-With',
        'X-CSRF-Token'
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Handle preflight requests explicitly
app.options('*', cors());  // Enable preflight for all routes
// ==================================================

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Origin:', req.headers.origin || 'No origin');
    console.log('Headers:', req.headers);
    next();
});

// Add CORS headers to every response (additional safety)
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://unobtrix.netlify.app',
        'https://*.netlify.app',
        'http://localhost:3000',
        'http://localhost:5500'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || 
        (origin && origin.includes('.netlify.app'))) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// ==================== EXISTING ROUTES ====================
// In-memory storage for OTPs
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        otpStoreSize: otpStore.size,
        server: 'Render',
        uptime: process.uptime(),
        cors: 'enabled'
    });
});

// Send OTP to mobile
app.post('/api/mobile/send-otp', (req, res) => {
    try {
        const { mobile } = req.body;
        
        console.log('OTP request for mobile:', mobile);
        
        if (!mobile) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mobile number is required' 
            });
        }
        
        const otp = generateOTP();
        const expiryTime = Date.now() + 10 * 60 * 1000;
        
        otpStore.set(mobile, { 
            otp, 
            expiry: expiryTime,
            created: new Date().toISOString()
        });
        
        console.log(`Generated OTP for ${mobile}: ${otp} (Valid for 10 minutes)`);
        
        return res.json({
            success: true,
            message: 'OTP generated successfully.',
            otp: otp,
            expiry: '10 minutes',
            timestamp: new Date().toISOString(),
            mobile: mobile
        });
        
    } catch (error) {
        console.error('Error generating OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to generate OTP',
            error: error.message 
        });
    }
});

// Verify OTP
app.post('/api/mobile/verify', (req, res) => {
    try {
        const { mobile, otp } = req.body;
        
        console.log('OTP verification request:', { mobile, otp });
        
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
                message: 'No OTP found for this number. Please generate a new OTP.' 
            });
        }
        
        if (Date.now() > storedData.expiry) {
            otpStore.delete(mobile);
            return res.status(400).json({ 
                success: false, 
                message: 'OTP has expired. Please generate a new OTP.' 
            });
        }
        
        if (storedData.otp !== otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid OTP. Please try again.' 
            });
        }
        
        otpStore.delete(mobile);
        
        res.json({
            success: true,
            message: 'Mobile number verified successfully',
            verifiedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify OTP',
            error: error.message 
        });
    }
});

// Aadhaar OTP endpoints
app.post('/api/aadhaar/send-otp', (req, res) => {
    try {
        const { aadhaar_number } = req.body;
        
        console.log('Aadhaar OTP request:', { aadhaar_number });
        
        if (!aadhaar_number) {
            return res.status(400).json({ 
                success: false, 
                message: 'Aadhaar number is required' 
            });
        }
        
        const otp = generateOTP();
        const expiryTime = Date.now() + 10 * 60 * 1000;
        
        otpStore.set(`aadhaar_${aadhaar_number}`, { 
            otp, 
            expiry: expiryTime,
            created: new Date().toISOString()
        });
        
        console.log(`Generated Aadhaar OTP for ${aadhaar_number}: ${otp}`);
        
        return res.json({
            success: true,
            message: 'Aadhaar OTP generated successfully.',
            otp: otp,
            expiry: '10 minutes',
            timestamp: new Date().toISOString(),
            aadhaar_number: aadhaar_number
        });
        
    } catch (error) {
        console.error('Error generating Aadhaar OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to generate Aadhaar OTP',
            error: error.message 
        });
    }
});

app.post('/api/aadhaar/verify', (req, res) => {
    try {
        const { aadhaar_number, otp } = req.body;
        
        console.log('Aadhaar verification request:', { aadhaar_number, otp });
        
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
                message: 'No OTP found for this Aadhaar. Please generate a new OTP.' 
            });
        }
        
        if (Date.now() > storedData.expiry) {
            otpStore.delete(`aadhaar_${aadhaar_number}`);
            return res.status(400).json({ 
                success: false, 
                message: 'OTP has expired. Please generate a new OTP.' 
            });
        }
        
        if (storedData.otp !== otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid OTP. Please try again.' 
            });
        }
        
        otpStore.delete(`aadhaar_${aadhaar_number}`);
        
        res.json({
            success: true,
            message: 'Aadhaar verified successfully',
            verifiedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error verifying Aadhaar OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify Aadhaar OTP',
            error: error.message 
        });
    }
});

// User registration endpoints
app.post('/api/register/consumer', (req, res) => {
    try {
        const { username, email, mobile, password } = req.body;
        
        console.log('Consumer registration:', { username, email, mobile });
        
        if (!username || !email || !mobile || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        
        res.json({
            success: true,
            message: 'Consumer account created successfully!',
            user: { 
                username, 
                email, 
                mobile,
                id: 'user_' + Date.now().toString(),
                created: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error registering consumer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed.',
            error: error.message 
        });
    }
});

app.post('/api/register/farmer', (req, res) => {
    try {
        const { 
            username, email, aadhaar_number, mobile, password,
            farm_name, farm_size, specialization
        } = req.body;
        
        console.log('Farmer registration:', { 
            username, email, aadhaar_number, mobile, farm_name 
        });
        
        if (!username || !email || !aadhaar_number || !mobile || !password || !farm_name) {
            return res.status(400).json({ 
                success: false, 
                message: 'All required fields must be filled' 
            });
        }
        
        res.json({
            success: true,
            message: 'Farmer account created successfully!',
            user: { 
                username, 
                email, 
                mobile, 
                farm_name,
                aadhaar_number,
                id: 'farmer_' + Date.now().toString(),
                created: new Date().toISOString(),
                status: 'pending_verification'
            }
        });
        
    } catch (error) {
        console.error('Error registering farmer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed.',
            error: error.message 
        });
    }
});

// Upload photo endpoint
app.post('/api/upload-photo', (req, res) => {
    try {
        const { imageData, userType } = req.body;
        
        console.log('Photo upload request for:', userType);
        
        if (!imageData) {
            return res.status(400).json({ 
                success: false, 
                message: 'No image data provided' 
            });
        }
        
        const mockPhotoUrl = `https://api.dicebear.com/7.x/avatars/svg?seed=${userType}_${Date.now()}`;
        
        res.json({
            success: true,
            photoUrl: mockPhotoUrl,
            uploadedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error handling photo upload:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to process photo',
            error: error.message 
        });
    }
});

// Test endpoint
app.post('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API is working!',
        timestamp: new Date().toISOString(),
        data: req.body,
        server: 'Render',
        cors: 'enabled'
    });
});

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
        console.log(`Cleaned up ${cleanedCount} expired OTPs`);
    }
}, 60 * 60 * 1000);

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'FarmTrails OTP Server', 
        status: 'OK',
        cors: 'enabled',
        endpoints: [
            'GET /health',
            'POST /api/mobile/send-otp',
            'POST /api/mobile/verify',
            'POST /api/aadhaar/send-otp',
            'POST /api/aadhaar/verify',
            'POST /api/register/consumer',
            'POST /api/register/farmer',
            'POST /api/upload-photo',
            'POST /api/test'
        ]
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
✅ FarmTrails OTP Server
🌐 Port: ${PORT}
🚀 Deployed on: Render
🔗 CORS: Enabled
📝 Mode: ${process.env.NODE_ENV || 'development'}
✅ Ready for frontend: https://unobtrix.netlify.app
    `);
});