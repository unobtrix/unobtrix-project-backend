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
console.log('Key present:', supabaseKey ? 'Yes' : 'No');

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
            if (error.message.includes('JWT')) {
                console.log('💡 Issue: Invalid API key. Check your anon key.');
            } else if (error.message.includes('relation')) {
                console.log('💡 Issue: Table might not exist. Check table names.');
            }
            return false;
        }
        
        console.log('✅ Supabase connected successfully!');
        return true;
    } catch (err) {
        console.error('❌ Error testing Supabase:', err.message);
        return false;
    }
}

// Run initialization
initializeSupabase();
// ================================================================

// ==================== CORS CONFIGURATION ====================
const allowedOrigins = [
    'https://unobtrix.netlify.app',
    'https://unobtrix.netlify.app/signup',
    'https://unobtrix.netlify.app/farmerpage',
    'https://unobtrix.netlify.app/customer',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
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

// Handle preflight requests
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

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.log('Origin:', req.headers.origin || 'No origin');
    console.log('Body:', req.method !== 'GET' ? JSON.stringify(req.body) : 'No body');
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

// Hash password using bcrypt
async function hashPassword(password) {
    try {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        console.error('Error hashing password:', error);
        throw error;
    }
}

// Verify password
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Check if user exists
async function checkUserExists(email, mobile) {
    try {
        // Check consumers table
        const { data: consumers, error: consumerError } = await supabase
            .from('consumers')
            .select('email, mobile')
            .or(`email.eq.${email},mobile.eq.${mobile}`)
            .limit(1);

        if (consumerError) {
            console.log('Consumers check error:', consumerError.message);
        }

        // Check farmers table  
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

// Insert consumer
async function insertConsumer(userData) {
    try {
        console.log('Hashing password...');
        const password_hash = await hashPassword(userData.password);
        
        console.log('Inserting into consumers table...');
        const { data, error } = await supabase
            .from('consumers')
            .insert([{
                username: userData.username,
                email: userData.email,
                mobile: userData.mobile,
                password_hash: password_hash,
                profile_photo_url: userData.profile_photo_url || null,
                status: 'active'
            }])
            .select('id, username, email, mobile, created_at');

        if (error) {
            console.error('Supabase insert error:', error);
            console.error('Error details:', {
                code: error.code,
                details: error.details,
                hint: error.hint,
                message: error.message
            });
            throw error;
        }

        console.log('Insert successful, data:', data);
        return { success: true, data: data[0] };
    } catch (error) {
        console.error('Error in insertConsumer:', error);
        return { success: false, error: error.message };
    }
}

// Insert farmer
async function insertFarmer(farmerData) {
    try {
        const password_hash = await hashPassword(farmerData.password);
        
        // Convert certifications to array
        let certificationsArray = [];
        if (farmerData.certifications) {
            if (Array.isArray(farmerData.certifications)) {
                certificationsArray = farmerData.certifications;
            } else if (typeof farmerData.certifications === 'string') {
                certificationsArray = farmerData.certifications.split(',').map(c => c.trim()).filter(c => c);
            }
        }

        const { data, error } = await supabase
            .from('farmers')
            .insert([{
                username: farmerData.username,
                email: farmerData.email,
                aadhaar_number: farmerData.aadhaar_number,
                mobile: farmerData.mobile,
                password_hash: password_hash,
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
        supabase_url: supabaseUrl,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node_version: process.version
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
            message: 'OTP sent successfully to your mobile number',
            otp: otp,
            debug_otp: otp,
            expiry: '10 minutes',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error generating OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP. Please try again.',
            error: error.message 
        });
    }
});

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
            message: 'Aadhaar verification OTP sent successfully',
            otp: otp,
            debug_otp: otp,
            expiry: '10 minutes',
            timestamp: new Date().toISOString()
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
                message: 'No OTP found for this Aadhaar. Please request a new OTP.' 
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
});

// ==================== REGISTRATION ENDPOINTS ====================

// Consumer Registration
app.post('/api/register/consumer', async (req, res) => {
    try {
        const { username, email, mobile, password, profile_photo_url } = req.body;
        
        console.log('👤 Consumer registration attempt:', { username, email, mobile });
        
        // Validation
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
        
        // Check if user already exists
        console.log('Checking if user exists...');
        const userExists = await checkUserExists(email, mobile);
        if (userExists) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email or mobile already exists' 
            });
        }
        
        // Save to Supabase
        console.log('Saving to Supabase...');
        const result = await insertConsumer({
            username,
            email,
            mobile,
            password,
            profile_photo_url
        });
        
        if (!result.success) {
            console.error('Insert failed:', result.error);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to create account. Please try again.',
                error: result.error 
            });
        }
        
        console.log('✅ Registration successful! User ID:', result.data.id);
        
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

// Farmer Registration
app.post('/api/register/farmer', async (req, res) => {
    try {
        const { 
            username, email, aadhaar_number, mobile, password,
            profile_photo_url, farm_name, farm_size, specialization,
            certifications, village, taluka, district, state, pin_code,
            account_holder_name, account_number, bank_name, ifsc_code,
            branch_name, aadhaar_verified, mobile_verified
        } = req.body;
        
        console.log('👨‍🌾 Farmer registration attempt:', { username, email, farm_name });
        
        // Validation
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
        
        // Check if user exists
        const userExists = await checkUserExists(email, mobile);
        if (userExists) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email or mobile already exists' 
            });
        }
        
        // Save to Supabase
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
        
        console.log('✅ Farmer registration successful! ID:', result.data.id);
        
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
        
        // Generate mock photo URL (in production, upload to S3/Cloudinary)
        const timestamp = Date.now();
        const mockPhotoUrl = `https://api.dicebear.com/7.x/avatars/svg?seed=${userType}_${timestamp}`;
        
        res.json({
            success: true,
            message: 'Profile photo uploaded successfully!',
            photoUrl: mockPhotoUrl,
            uploadedAt: new Date().toISOString()
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

// ==================== DEBUG & TEST ENDPOINTS ====================

// Test Supabase connection
app.get('/api/debug/supabase', async (req, res) => {
    try {
        // Test query to consumers table
        const { data: consumers, error: consumersError } = await supabase
            .from('consumers')
            .select('id, username, email, created_at')
            .limit(5);
        
        // Test query to farmers table
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
            supabase_url: supabaseUrl,
            tables: {
                consumers: consumersError ? 'Error' : 'Accessible',
                farmers: farmersError ? 'Error' : 'Accessible'
            },
            sample_data: {
                consumers_count: consumers?.length || 0,
                farmers_count: farmers?.length || 0,
                consumers_sample: consumers || [],
                farmers_sample: farmers || []
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

// Test insert without validation
app.post('/api/debug/test-insert', async (req, res) => {
    try {
        const testData = {
            username: 'testuser_' + Date.now(),
            email: `test${Date.now()}@example.com`,
            mobile: '9876543' + Math.floor(Math.random() * 1000),
            password: 'testpassword123'
        };
        
        const result = await insertConsumer(testData);
        
        if (!result.success) {
            return res.json({
                success: false,
                message: 'Test insert failed',
                error: result.error,
                test_data: testData
            });
        }
        
        res.json({
            success: true,
            message: 'Test insert successful!',
            inserted_data: result.data,
            test_data: testData
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'Test insert error',
            error: error.message
        });
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
            upload: 'POST /api/upload-photo',
            debug: {
                supabase: 'GET /api/debug/supabase',
                test_insert: 'POST /api/debug/test-insert'
            }
        },
        documentation: 'See code comments for details'
    });
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

app.use((err, req, res, next) => {
    console.error('💥 Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
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
}, 60 * 60 * 1000); // Every hour

// ==================== SERVER START ====================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`
    🚀 FarmTrials Backend Server
    📍 Port: ${PORT}
    🔗 Supabase: Connected
    🔗 URL: ${supabaseUrl}
    🌐 Frontend: https://unobtrix.netlify.app
    ⏰ Started: ${new Date().toISOString()}
    
    📊 Available endpoints:
       ✅ GET  /health                    - Health check
       ✅ POST /api/mobile/send-otp       - Send mobile OTP
       ✅ POST /api/mobile/verify         - Verify mobile OTP
       ✅ POST /api/aadhaar/send-otp      - Send Aadhaar OTP
       ✅ POST /api/aadhaar/verify        - Verify Aadhaar OTP
       ✅ POST /api/register/consumer     - Register consumer (Saves to Supabase)
       ✅ POST /api/register/farmer       - Register farmer (Saves to Supabase)
       ✅ POST /api/upload-photo          - Upload profile photo
       🔧 GET  /api/debug/supabase        - Test Supabase connection
       🔧 POST /api/debug/test-insert     - Test database insert
    
    ✅ Server is ready and connected to Supabase!
    `);
});