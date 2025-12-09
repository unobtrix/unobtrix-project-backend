const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const app = express();

// ==================== SUPABASE CONFIGURATION ====================
// Get Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL || 'https://ribehublefecccabzwkv.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpYmVodWJsZWZlY2NjYWJ6d2t2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMzg1ODksImV4cCI6MjA3NjkxNDU4OX0.4i6yQOCAisuFnElBKzCf_kdfl1SV5t6OknEVmPfySYc';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔗 Supabase Status:', supabaseUrl.includes('your-project') ? '⚠️ Configure SUPABASE_URL env var' : '✅ Connected');
// ================================================================

// ==================== CORS CONFIGURATION ====================
app.use(cors({
    origin: [
        'https://unobtrix.netlify.app',
        'https://unobtrix.netlify.app/signup',
        'https://unobtrix.netlify.app/customer',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length']
}));

// Handle preflight requests
app.options('*', cors());

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.log('Origin:', req.headers.origin || 'No origin');
    console.log('User-Agent:', req.headers['user-agent']);
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
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

// Check if user already exists
async function checkUserExists(email, mobile) {
    try {
        // Check in consumers table
        const { data: consumerData, error: consumerError } = await supabase
            .from('consumers')
            .select('id')
            .or(`email.eq.${email},mobile.eq.${mobile}`)
            .limit(1);

        if (consumerError) {
            console.log('Consumers table check error:', consumerError.message);
        }

        // Check in farmers table
        const { data: farmerData, error: farmerError } = await supabase
            .from('farmers')
            .select('id')
            .or(`email.eq.${email},mobile.eq.${mobile}`)
            .limit(1);

        if (farmerError) {
            console.log('Farmers table check error:', farmerError.message);
        }

        return (consumerData && consumerData.length > 0) || (farmerData && farmerData.length > 0);
    } catch (error) {
        console.error('Error checking user existence:', error);
        return false;
    }
}

// Insert consumer into Supabase
async function insertConsumer(userData) {
    try {
        const password_hash = await hashPassword(userData.password);
        
        const { data, error } = await supabase
            .from('consumers')
            .insert([{
                username: userData.username,
                email: userData.email,
                mobile: userData.mobile,
                password_hash: password_hash,
                profile_photo_url: userData.profile_photo_url || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'active'
            }])
            .select('id, username, email, mobile, created_at');

        if (error) {
            console.error('Supabase insert error:', error);
            throw error;
        }

        return { success: true, data: data[0] };
    } catch (error) {
        console.error('Error inserting consumer:', error);
        return { success: false, error: error.message };
    }
}

// Insert farmer into Supabase
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
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
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
        supabase: supabaseUrl.includes('your-project') ? 'Not configured' : 'Connected',
        uptime: process.uptime(),
        cors: 'enabled'
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
            debug_otp: otp, // For frontend auto-fill
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

// ==================== REGISTRATION ENDPOINTS (WITH SUPABASE) ====================

// Consumer Registration
app.post('/api/register/consumer', async (req, res) => {
    try {
        const { username, email, mobile, password, profile_photo_url } = req.body;
        
        console.log('👤 Consumer registration request:', { username, email, mobile });
        
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
        
        if (!mobile || !/^\d{10}$/.test(mobile)) {
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
        
        // Check if user already exists
        const userExists = await checkUserExists(email, mobile);
        if (userExists) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email or mobile already exists' 
            });
        }
        
        // Save to Supabase
        const result = await insertConsumer({
            username,
            email,
            mobile,
            password,
            profile_photo_url
        });
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to save consumer data to database');
        }
        
        console.log('✅ Consumer saved to Supabase:', result.data.id);
        
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
        console.error('❌ Error registering consumer:', error);
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
        
        console.log('👨‍🌾 Farmer registration request:', { username, email, farm_name });
        
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
                message: 'Password must be at least 6 characters long' 
            });
        }
        
        if (!farm_name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Farm name is required' 
            });
        }
        
        // Check if user already exists
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
            throw new Error(result.error || 'Failed to save farmer data to database');
        }
        
        console.log('✅ Farmer saved to Supabase:', result.data.id);
        
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
        
        // Simulate photo upload (in production, upload to S3/Cloudinary)
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

// ==================== SUPABASE TEST ENDPOINT ====================
app.get('/api/test-supabase', async (req, res) => {
    try {
        // Test Supabase connection
        const { data: consumers, error: consumersError } = await supabase
            .from('consumers')
            .select('count')
            .limit(1);
        
        const { data: farmers, error: farmersError } = await supabase
            .from('farmers')
            .select('count')
            .limit(1);
        
        const errors = [];
        if (consumersError) errors.push(`Consumers: ${consumersError.message}`);
        if (farmersError) errors.push(`Farmers: ${farmersError.message}`);
        
        if (errors.length > 0) {
            return res.json({
                success: false,
                message: 'Supabase connection test failed',
                errors: errors,
                hint: 'Check if tables exist and RLS policies allow access'
            });
        }
        
        res.json({
            success: true,
            message: 'Supabase connected successfully!',
            supabase_url: supabaseUrl,
            tables: {
                consumers: 'accessible',
                farmers: 'accessible'
            },
            status: 'ready'
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'Supabase test failed',
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
        supabase: supabaseUrl.includes('your-project') ? 'Not configured' : 'Connected',
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
            supabase_test: 'GET /api/test-supabase'
        }
    });
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path
    });
});

app.use((err, req, res, next) => {
    console.error('💥 Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
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
    🔗 Supabase: ${supabaseUrl.includes('your-project') ? '⚠️ NOT CONFIGURED' : '✅ Connected'}
    📍 Frontend: https://unobtrix.netlify.app
    ⏰ Started: ${new Date().toISOString()}
    📦 Dependencies: Supabase, bcryptjs, express, cors
    `);
    
    if (supabaseUrl.includes('your-project')) {
        console.log('\n⚠️  WARNING: Supabase not configured!');
        console.log('   Set these environment variables on Render:');
        console.log('   SUPABASE_URL=https://your-project.supabase.co');
        console.log('   SUPABASE_ANON_KEY=your-anon-key-here\n');
    }
});