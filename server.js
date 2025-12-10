const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const app = express();

// ==================== SUPABASE CONFIGURATION ====================
const supabaseUrl = 'https://ribehublefecccabzwkv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpYmVodWJsZWZlY2NjYWJ6d2t2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMzg1ODksImV4cCI6MjA3NjkxNDU4OX0.4i6yQOCAisuFnElBKzCf_kdfl1SV5t6OknEVmPfySYc';

console.log('🔗 Initializing Supabase connection...');
console.log('URL:', supabaseUrl);

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Test connection on startup
async function initializeSupabase() {
    try {
        console.log('Testing Supabase connection...');
        const { data, error } = await supabase
            .from('consumers')
            .select('count', { count: 'exact', head: true });
        
        if (error) {
            console.error('❌ Supabase connection test failed:', error.message);
            return false;
        }
        
        console.log('✅ Supabase connected successfully!');
        return true;
    } catch (err) {
        console.error('❌ Error testing Supabase:', err.message);
        return false;
    }
}

initializeSupabase();
// ================================================================

// ==================== CORS CONFIGURATION ====================
const allowedOrigins = [
    'https://unobtrix.netlify.app',
    'https://unobtrix.netlify.app/signup',
    'https://unobtrix.netlify.app/customer.html',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.netlify.app')) {
            return callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            return callback(new Error('Not allowed by CORS'), false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length'],
    maxAge: 86400
}));

app.options('*', (req, res) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || (origin && origin.endsWith('.netlify.app'))) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.sendStatus(200);
});

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// ==================== IN-MEMORY STORAGE ====================
const otpStore = new Map();

function generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

// ==================== SUPABASE HELPER FUNCTIONS ====================

async function hashPassword(password) {
    try {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        console.error('Error hashing password:', error);
        throw error;
    }
}

async function checkUserExists(email, mobile) {
    try {
        const { data: consumers, error: consumerError } = await supabase
            .from('consumers')
            .select('email, mobile')
            .or(`email.eq.${email},mobile.eq.${mobile}`)
            .limit(1);

        if (consumerError) {
            console.log('Consumers check error:', consumerError.message);
        }

        const { data: farmers, error: farmerError } = await supabase
            .from('farmers')
            .select('email, mobile')
            .or(`email.eq.${email},mobile.eq.${mobile}`)
            .limit(1);

        if (farmerError) {
            console.log('Farmers check error:', farmerError.message);
        }

        return (consumers && consumers.length > 0) || (farmers && farmers.length > 0);
    } catch (error) {
        console.error('Error checking user existence:', error);
        return false;
    }
}

async function insertConsumer(userData) {
    try {
        const hashedPassword = await hashPassword(userData.password);
        
        console.log('Inserting consumer with:', {
            username: userData.username,
            email: userData.email,
            mobile: userData.mobile,
            password: '***' // Don't log actual password
        });
        
        const { data, error } = await supabase
            .from('consumers')
            .insert([{
                username: userData.username,
                email: userData.email,
                mobile: userData.mobile,
                password: hashedPassword, // Using 'password' column (not password_hash)
                profile_photo_url: userData.profile_photo_url || null,
                status: 'active'
            }])
            .select('id, username, email, mobile, created_at');

        if (error) {
            console.error('Supabase insert error:', error);
            throw error;
        }

        console.log('✅ Insert successful, user ID:', data[0].id);
        return { success: true, data: data[0] };
    } catch (error) {
        console.error('Error in insertConsumer:', error);
        return { success: false, error: error.message };
    }
}

async function insertFarmer(farmerData) {
    try {
        const hashedPassword = await hashPassword(farmerData.password);
        
        let certificationsArray = [];
        if (farmerData.certifications) {
            if (Array.isArray(farmerData.certifications)) {
                certificationsArray = farmerData.certifications;
            } else if (typeof farmerData.certifications === 'string') {
                certificationsArray = farmerData.certifications.split(',').map(c => c.trim()).filter(c => c);
            }
        }

        console.log('Inserting farmer with farm:', farmerData.farm_name);
        
        const { data, error } = await supabase
            .from('farmers')
            .insert([{
                username: farmerData.username,
                email: farmerData.email,
                aadhaar_number: farmerData.aadhaar_number,
                mobile: farmerData.mobile,
                password: hashedPassword, // Using 'password' column
                profile_photo_url: farmerData.profile_photo_url || null,
                farm_name: farmerData.farm_name,
                farm_size: parseFloat(farmerData.farm_size) || 0,
                specialization: farmerData.specialization || 'Not specified',
                certifications: certificationsArray,
                village: farmerData.village || '',
                taluka: farmerData.taluka || '',
                district: farmerData.district || '',
                state: farmerData.state || '',
                pin_code: farmerData.pin_code || '',
                account_holder_name: farmerData.account_holder_name || '',
                account_number: farmerData.account_number || '',
                bank_name: farmerData.bank_name || '',
                ifsc_code: farmerData.ifsc_code || '',
                branch_name: farmerData.branch_name || '',
                aadhaar_verified: farmerData.aadhaar_verified || false,
                mobile_verified: farmerData.mobile_verified || false,
                account_verified: 'pending',
                status: 'pending_verification'
            }])
            .select('id, username, email, mobile, farm_name, created_at');

        if (error) {
            console.error('Supabase insert error:', error);
            throw error;
        }

        console.log('✅ Farmer insert successful, ID:', data[0].id);
        return { success: true, data: data[0] };
    } catch (error) {
        console.error('Error inserting farmer:', error);
        return { success: false, error: error.message };
    }
}

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        server: 'FarmTrials Registration API',
        timestamp: new Date().toISOString(),
        supabase: 'Connected',
        uptime: process.uptime()
    });
});

// ==================== MOBILE OTP ENDPOINTS ====================
app.post('/api/mobile/send-otp', (req, res) => {
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
        const expiryTime = Date.now() + 10 * 60 * 1000;
        
        otpStore.set(mobile, { 
            otp, 
            expiry: expiryTime,
            created: new Date().toISOString()
        });
        
        console.log(`✅ OTP ${otp} generated for ${mobile}`);
        
        return res.json({
            success: true,
            message: 'OTP sent successfully',
            otp: otp,
            debug_otp: otp,
            expiry: '10 minutes'
        });
        
    } catch (error) {
        console.error('❌ Error generating OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP',
            error: error.message 
        });
    }
});

app.post('/api/mobile/verify', (req, res) => {
    try {
        const { mobile, otp } = req.body;
        
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
                message: 'No OTP found. Please request a new OTP.' 
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
                message: 'Invalid OTP. Please try again.' 
            });
        }
        
        otpStore.delete(mobile);
        
        res.json({
            success: true,
            message: 'Mobile number verified successfully!'
        });
        
    } catch (error) {
        console.error('❌ Error verifying OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify OTP',
            error: error.message 
        });
    }
});

// ==================== AADHAAR OTP ENDPOINTS ====================
app.post('/api/aadhaar/send-otp', (req, res) => {
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
        const expiryTime = Date.now() + 10 * 60 * 1000;
        
        otpStore.set(`aadhaar_${aadhaar_number}`, { 
            otp, 
            expiry: expiryTime,
            created: new Date().toISOString()
        });
        
        console.log(`✅ Aadhaar OTP ${otp} generated for ${aadhaar_number}`);
        
        return res.json({
            success: true,
            message: 'Aadhaar OTP sent successfully',
            otp: otp,
            debug_otp: otp,
            expiry: '10 minutes'
        });
        
    } catch (error) {
        console.error('❌ Error generating Aadhaar OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send Aadhaar OTP',
            error: error.message 
        });
    }
});

app.post('/api/aadhaar/verify', (req, res) => {
    try {
        const { aadhaar_number, otp } = req.body;
        
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
                message: 'No OTP found. Please request a new OTP.' 
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
                message: 'Invalid OTP. Please try again.' 
            });
        }
        
        otpStore.delete(`aadhaar_${aadhaar_number}`);
        
        res.json({
            success: true,
            message: 'Aadhaar verified successfully!'
        });
        
    } catch (error) {
        console.error('❌ Error verifying Aadhaar OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify Aadhaar OTP',
            error: error.message 
        });
    }
});

// ==================== REGISTRATION ENDPOINTS ====================

app.post('/api/register/consumer', async (req, res) => {
    try {
        const { username, email, mobile, password, profile_photo_url } = req.body;
        
        console.log('👤 Consumer registration:', { username, email, mobile });
        
        if (!username || username.length < 3) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username must be at least 3 characters' 
            });
        }
        
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid email address is required' 
            });
        }
        
        if (!mobile || !/^\d{10}$/.test(mobile)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 10-digit mobile number is required' 
            });
        }
        
        if (!password || password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters' 
            });
        }
        
        const userExists = await checkUserExists(email, mobile);
        if (userExists) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email or mobile already exists' 
            });
        }
        
        const result = await insertConsumer({
            username,
            email,
            mobile,
            password,
            profile_photo_url
        });
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to create account. Please try again.',
                error: result.error 
            });
        }
        
        console.log('✅ Consumer registration successful!');
        
        res.json({
            success: true,
            message: 'Consumer account created successfully!',
            user: {
                id: result.data.id,
                username,
                email,
                mobile,
                user_type: 'consumer',
                created_at: result.data.created_at
            }
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed. Please try again.',
            error: error.message 
        });
    }
});

app.post('/api/register/farmer', async (req, res) => {
    try {
        const { 
            username, email, aadhaar_number, mobile, password,
            profile_photo_url, farm_name, farm_size, specialization,
            certifications, village, taluka, district, state, pin_code,
            account_holder_name, account_number, bank_name, ifsc_code,
            branch_name, aadhaar_verified, mobile_verified
        } = req.body;
        
        console.log('👨‍🌾 Farmer registration:', { username, email, farm_name });
        
        if (!username || username.length < 3) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username must be at least 3 characters' 
            });
        }
        
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid email address is required' 
            });
        }
        
        if (!aadhaar_number || !/^\d{12}$/.test(aadhaar_number)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 12-digit Aadhaar number is required' 
            });
        }
        
        if (!mobile || !/^\d{10}$/.test(mobile)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid 10-digit mobile number is required' 
            });
        }
        
        if (!password || password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters' 
            });
        }
        
        if (!farm_name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Farm name is required' 
            });
        }
        
        const userExists = await checkUserExists(email, mobile);
        if (userExists) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email or mobile already exists' 
            });
        }
        
        const result = await insertFarmer({
            username,
            email,
            aadhaar_number,
            mobile,
            password,
            profile_photo_url,
            farm_name,
            farm_size,
            specialization,
            certifications,
            village,
            taluka,
            district,
            state,
            pin_code,
            account_holder_name,
            account_number,
            bank_name,
            ifsc_code,
            branch_name,
            aadhaar_verified: aadhaar_verified || false,
            mobile_verified: mobile_verified || false
        });
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to create farmer account. Please try again.',
                error: result.error 
            });
        }
        
        console.log('✅ Farmer registration successful!');
        
        res.json({
            success: true,
            message: 'Farmer account created successfully! Your account will be verified within 24-48 hours.',
            farmer: {
                id: result.data.id,
                username,
                email,
                mobile,
                aadhaar_number,
                farm_name,
                user_type: 'farmer',
                status: 'pending_verification',
                created_at: result.data.created_at
            }
        });
        
    } catch (error) {
        console.error('❌ Farmer registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed. Please try again.',
            error: error.message 
        });
    }
});

// ==================== PHOTO UPLOAD ====================
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
        
        const timestamp = Date.now();
        const mockPhotoUrl = `https://api.dicebear.com/7.x/avatars/svg?seed=${userType}_${timestamp}`;
        
        res.json({
            success: true,
            message: 'Profile photo uploaded successfully!',
            photoUrl: mockPhotoUrl
        });
        
    } catch (error) {
        console.error('❌ Error handling photo upload:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to upload photo',
            error: error.message 
        });
    }
});

// ==================== DEBUG ENDPOINTS ====================
app.get('/api/debug/supabase', async (req, res) => {
    try {
        const { data: consumers, error: consumersError } = await supabase
            .from('consumers')
            .select('id, username, email, created_at')
            .limit(5);
        
        const { data: farmers, error: farmersError } = await supabase
            .from('farmers')
            .select('id, username, email, farm_name, created_at')
            .limit(5);
        
        const errors = [];
        if (consumersError) errors.push(`Consumers: ${consumersError.message}`);
        if (farmersError) errors.push(`Farmers: ${farmersError.message}`);
        
        res.json({
            success: errors.length === 0,
            message: errors.length === 0 ? 'Supabase is working!' : 'Supabase has issues',
            tables: {
                consumers: consumersError ? 'Error' : 'Accessible',
                farmers: farmersError ? 'Error' : 'Accessible'
            },
            data: {
                consumers_count: consumers?.length || 0,
                farmers_count: farmers?.length || 0
            },
            errors: errors.length > 0 ? errors : null
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'Supabase test failed',
            error: error.message
        });
    }
});

app.get('/api/debug/table-structure', async (req, res) => {
    try {
        const { data: consumerRow } = await supabase
            .from('consumers')
            .select('*')
            .limit(1);
            
        const { data: farmerRow } = await supabase
            .from('farmers')
            .select('*')
            .limit(1);
        
        res.json({
            consumers: {
                columns: consumerRow?.[0] ? Object.keys(consumerRow[0]) : [],
                sample: consumerRow?.[0] || null
            },
            farmers: {
                columns: farmerRow?.[0] ? Object.keys(farmerRow[0]) : [],
                sample: farmerRow?.[0] || null
            }
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// ==================== ROOT ENDPOINT ====================
app.get('/', (req, res) => {
    res.json({ 
        server: 'FarmTrials Registration API',
        version: '1.0.0',
        status: 'operational',
        supabase: 'Connected',
        endpoints: {
            health: 'GET /health',
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
            upload: 'POST /api/upload-photo'
        }
    });
});

// Add helpful GET endpoints
app.get('/api/register/consumer', (req, res) => {
    res.status(405).json({
        success: false,
        message: 'Method not allowed. Use POST instead of GET.',
        example: 'curl -X POST "https://unobtrix-project-backend.onrender.com/api/register/consumer" -H "Content-Type: application/json" -d "{\\"username\\":\\"test\\",\\"email\\":\\"test@example.com\\",\\"mobile\\":\\"9876543210\\",\\"password\\":\\"test123\\"}"'
    });
});

app.get('/api/register/farmer', (req, res) => {
    res.status(405).json({
        success: false,
        message: 'Method not allowed. Use POST instead of GET.'
    });
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

app.use((err, req, res, next) => {
    console.error('💥 Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: err.message
    });
});

// ==================== OTP CLEANUP ====================
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
}, 60 * 60 * 1000);

// ==================== SERVER START ====================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`
    🚀 FarmTrials Backend Server
    📍 Port: ${PORT}
    🔗 Supabase: Connected
    🌐 Frontend: https://unobtrix.netlify.app
    ⏰ Started: ${new Date().toISOString()}
    
    ✅ Registration endpoints ready!
    ✅ Using 'password' column (not 'password_hash')
    ✅ Data will save to your Supabase tables
    `);
    
    console.log('\n📋 Test commands:');
    console.log('   curl -X POST "https://unobtrix-project-backend.onrender.com/api/register/consumer" \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d "{\\"username\\":\\"test\\",\\"email\\":\\"test@example.com\\",\\"mobile\\":\\"9876543210\\",\\"password\\":\\"test123\\"}"');
});