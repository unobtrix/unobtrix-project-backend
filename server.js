const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const app = express();

// ==================== SUPABASE CONFIGURATION ====================
const supabaseUrl = 'https://ribehublefecccabzwkv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpYmVodWJsZWZlY2NjYWJ6d2t2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMzg1ODksImV4cCI6MjA3NjkxNDU4OX0.4i6yQOCAisuFnElBKzCf_kdfl1SV5t6OknEVmPfySYc';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔗 Supabase connected');
// ================================================================

// ==================== CORS CONFIGURATION ====================
app.use(cors({
    origin: [
        'https://unobtrix.netlify.app',
        'https://unobtrix.netlify.app/signup',
        'https://unobtrix.netlify.app/customer.html',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length'],
    maxAge: 86400
}));

app.options('*', cors());

// Increase body size limit for image uploads
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    if (req.method === 'POST' && req.body) {
        const bodyCopy = { ...req.body };
        if (bodyCopy.profile_photo_base64) {
            bodyCopy.profile_photo_base64 = `[BASE64_IMAGE:${bodyCopy.profile_photo_base64.length} chars]`;
        }
        if (bodyCopy.profile_photo_url) {
            bodyCopy.profile_photo_url = `[URL:${bodyCopy.profile_photo_url.substring(0, 50)}...]`;
        }
        console.log('Body keys:', Object.keys(bodyCopy));
    }
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
            console.error('Error checking consumers:', consumerError);
        }

        const { data: farmers, error: farmerError } = await supabase
            .from('farmers')
            .select('email, mobile')
            .or(`email.eq.${email},mobile.eq.${mobile}`)
            .limit(1);

        if (farmerError) {
            console.error('Error checking farmers:', farmerError);
        }

        return (consumers && consumers.length > 0) || (farmers && farmers.length > 0);
    } catch (error) {
        console.error('Error checking user existence:', error);
        return false;
    }
}

// ==================== CHECK STORAGE BUCKET ====================
async function checkBucketExists() {
    try {
        console.log('🔍 Checking if storage bucket exists...');
        
        const bucketName = 'profile-photos';
        
        const { data: files, error } = await supabase.storage
            .from(bucketName)
            .list('', { limit: 1 });
        
        if (error) {
            if (error.message && error.message.includes('not found')) {
                console.error('❌ Bucket "profile-photos" does not exist!');
                console.error('\n⚠️ MANUAL ACTION REQUIRED ⚠️');
                console.error('Please create bucket manually in Supabase Dashboard:');
                console.error('1. Go to Storage → New bucket');
                console.error('2. Name: profile-photos');
                console.error('3. Public: ON');
                console.error('4. File size limit: 50MB');
                console.error('5. Create bucket');
                console.error('\nAfter creating bucket, restart the server.');
                return false;
            }
            
            console.error('❌ Error accessing bucket:', error.message);
            return false;
        }
        
        console.log('✅ Bucket "profile-photos" exists and is accessible');
        return true;
        
    } catch (error) {
        console.error('❌ Error checking bucket:', error);
        return false;
    }
}

// ==================== IMAGE UPLOAD TO SUPABASE STORAGE ====================
async function uploadToSupabaseStorage(base64Image, userType, userId) {
    try {
        console.log('📤 Starting image upload...');
        
        if (!base64Image) {
            console.error('❌ No image data provided');
            return null;
        }
        
        if (!base64Image.startsWith('data:image/')) {
            console.error('❌ Invalid image format. Must be base64 image data.');
            console.error('Received start:', base64Image.substring(0, 100));
            return null;
        }

        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const matches = base64Image.match(/^data:image\/(\w+);base64,/);
        const fileExt = matches ? matches[1] : 'jpg';
        const filename = `${userType}_${userId}_${timestamp}_${randomString}.${fileExt}`;
        const bucketName = 'profile-photos';

        console.log(`📤 Uploading to: ${bucketName}/${filename}`);
        console.log(`📊 Image size: ${base64Image.length} characters (base64)`);

        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        console.log(`📊 Buffer size: ${buffer.length} bytes`);

        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(filename, buffer, {
                contentType: `image/${fileExt}`,
                upsert: false
            });

        if (error) {
            console.error('❌ Storage upload error:', error.message);
            
            if (error.message && error.message.includes('The resource was not found')) {
                console.error('❌ Bucket "profile-photos" not found!');
                console.error('Please create it manually in Supabase Dashboard.');
            } else if (error.message && error.message.includes('row-level security')) {
                console.error('❌ RLS policy error!');
                console.error('Please check RLS policies for storage tables.');
            }
            
            return null;
        }

        console.log('✅ Upload successful!');

        const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filename);

        console.log('✅ Image uploaded successfully to Supabase Storage');
        console.log('🔗 Public URL:', urlData.publicUrl);

        return urlData.publicUrl;

    } catch (error) {
        console.error('❌ Error uploading to storage:', error);
        return null;
    }
}

// ==================== CHECK TABLE STRUCTURE ====================
async function checkTableStructure() {
    try {
        console.log('🔍 Checking table structure...');
        
        // Get one farmer to see columns
        const { data: farmerData, error: farmerError } = await supabase
            .from('farmers')
            .select('*')
            .limit(1);
        
        let farmerColumns = [];
        if (!farmerError && farmerData && farmerData.length > 0) {
            farmerColumns = Object.keys(farmerData[0]);
        }
        
        // Get one consumer to see columns
        const { data: consumerData, error: consumerError } = await supabase
            .from('consumers')
            .select('*')
            .limit(1);
        
        let consumerColumns = [];
        if (!consumerError && consumerData && consumerData.length > 0) {
            consumerColumns = Object.keys(consumerData[0]);
        }
        
        return {
            farmers: {
                columns: farmerColumns,
                hasUpdatedAt: farmerColumns.includes('updated_at'),
                hasCreatedAt: farmerColumns.includes('created_at'),
                hasAccountVerified: farmerColumns.includes('account_verified'),
                hasProfilePhotoUrl: farmerColumns.includes('profile_photo_url')
            },
            consumers: {
                columns: consumerColumns,
                hasUpdatedAt: consumerColumns.includes('updated_at'),
                hasCreatedAt: consumerColumns.includes('created_at')
            }
        };
        
    } catch (error) {
        console.error('Error checking table structure:', error);
        return null;
    }
}

// ==================== REGISTRATION WITH IMAGE UPLOAD ====================
async function insertConsumer(userData) {
    try {
        console.log('💾 Starting consumer registration...');
        
        const hashedPassword = await hashPassword(userData.password);
        
        let profilePhotoUrl = '';
        
        const photoData = userData.profile_photo_base64 || userData.profile_photo_url;
        
        if (photoData && photoData.startsWith('data:image/')) {
            console.log('📸 Processing profile photo upload...');
            
            const tempUserId = userData.username.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
            const uploadedUrl = await uploadToSupabaseStorage(
                photoData,
                'consumer',
                tempUserId
            );
            
            if (uploadedUrl) {
                profilePhotoUrl = uploadedUrl;
                console.log('✅ Photo uploaded to:', profilePhotoUrl);
            } else {
                console.log('⚠️ Photo upload failed, using empty string');
            }
        } else if (photoData && photoData.includes('http')) {
            profilePhotoUrl = photoData;
            console.log('✅ Using existing photo URL:', profilePhotoUrl);
        } else {
            console.log('⚠️ No valid photo data provided, using empty string');
        }
        
        console.log('💾 Inserting consumer into database...');
        
        // Check table structure first
        const tableStructure = await checkTableStructure();
        const selectFields = ['id', 'username', 'email', 'mobile', 'status'];
        
        if (tableStructure?.consumers?.hasProfilePhotoUrl) {
            selectFields.push('profile_photo_url');
        }
        
        if (tableStructure?.consumers?.hasCreatedAt) {
            selectFields.push('created_at');
        }
        
        if (tableStructure?.consumers?.hasUpdatedAt) {
            selectFields.push('updated_at');
        }
        
        const consumerData = {
            username: userData.username,
            email: userData.email,
            mobile: userData.mobile,
            password: hashedPassword,
            status: 'active'
        };
        
        // Always add profile_photo_url, even if empty string
        if (tableStructure?.consumers?.hasProfilePhotoUrl) {
            consumerData.profile_photo_url = profilePhotoUrl;
        }
        
        console.log('📝 Consumer data to insert:', Object.keys(consumerData));
        console.log('📋 Will select:', selectFields);
        
        const { data, error } = await supabase
            .from('consumers')
            .insert([consumerData])
            .select(selectFields.join(', '));

        if (error) {
            console.error('❌ Database insert error:', error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            
            if (error.code === '42703') {
                console.error('\n🔧 MISSING COLUMN DETECTED!');
                console.error('The error indicates a column does not exist.');
                console.error('Check your table structure and add missing columns.');
            }
            
            throw error;
        }

        console.log('✅ Consumer saved successfully! ID:', data[0].id);
        if (data[0].profile_photo_url !== undefined) {
            console.log('📸 Photo URL in database:', data[0].profile_photo_url || '(empty string)');
        }
        if (data[0].created_at) {
            console.log('🕒 Created at:', data[0].created_at);
        }
        if (data[0].updated_at) {
            console.log('🕒 Updated at:', data[0].updated_at);
        }
        return { success: true, data: data[0] };
        
    } catch (error) {
        console.error('❌ Error in insertConsumer:', error);
        console.error('Full error object:', error);
        return { success: false, error: error.message };
    }
}

async function insertFarmer(farmerData) {
    try {
        console.log('💾 Starting farmer registration...');
        
        const hashedPassword = await hashPassword(farmerData.password);
        
        // Initialize with empty string to satisfy NOT NULL constraint
        let profilePhotoUrl = '';
        
        const photoData = farmerData.profile_photo_base64 || farmerData.profile_photo_url;
        
        if (photoData && photoData.startsWith('data:image/')) {
            console.log('📸 Processing farmer profile photo upload...');
            
            const tempUserId = farmerData.username.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
            const uploadedUrl = await uploadToSupabaseStorage(
                photoData,
                'farmer',
                tempUserId
            );
            
            if (uploadedUrl) {
                profilePhotoUrl = uploadedUrl;
                console.log('✅ Farmer photo uploaded to:', profilePhotoUrl);
            } else {
                console.log('⚠️ Farmer photo upload failed, using empty string');
                // profilePhotoUrl remains empty string
            }
        } else if (photoData && photoData.includes('http')) {
            profilePhotoUrl = photoData;
            console.log('✅ Using existing farmer photo URL:', profilePhotoUrl);
        } else {
            console.log('⚠️ No valid photo data provided, using empty string');
            // profilePhotoUrl remains empty string
        }

        let certificationsArray = [];
        if (farmerData.certifications) {
            if (Array.isArray(farmerData.certifications)) {
                certificationsArray = farmerData.certifications;
            } else if (typeof farmerData.certifications === 'string') {
                certificationsArray = farmerData.certifications.split(',').map(c => c.trim()).filter(c => c);
            }
        }

        console.log('💾 Inserting farmer into database...');
        
        // Check table structure first
        const tableStructure = await checkTableStructure();
        console.log('🔍 Table structure:', tableStructure?.farmers);
        
        // Build SELECT fields based on what exists
        const selectFields = ['id', 'username', 'email', 'mobile', 'farm_name', 'status'];
        
        if (tableStructure?.farmers?.hasAccountVerified) {
            selectFields.push('account_verified');
        }
        
        if (tableStructure?.farmers?.hasCreatedAt) {
            selectFields.push('created_at');
        }
        
        if (tableStructure?.farmers?.hasProfilePhotoUrl) {
            selectFields.push('profile_photo_url');
        }
        
        const farmerInsertData = {
            username: farmerData.username,
            email: farmerData.email,
            aadhaar_number: farmerData.aadhaar_number,
            mobile: farmerData.mobile,
            password: hashedPassword,
            profile_photo_url: profilePhotoUrl, // ALWAYS set this, even if empty string
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
            status: 'pending_verification'
        };
        
        // Add account_verified only if column exists
        if (tableStructure?.farmers?.hasAccountVerified) {
            farmerInsertData.account_verified = false;
            console.log('✅ Setting account_verified: false');
        }
        
        console.log('📝 Farmer data to insert:', Object.keys(farmerInsertData));
        console.log('📝 profile_photo_url value:', profilePhotoUrl || '(empty string)');
        console.log('📋 Will select:', selectFields);
        
        const { data, error } = await supabase
            .from('farmers')
            .insert([farmerInsertData])
            .select(selectFields.join(', '));

        if (error) {
            console.error('❌ Farmer database insert error:', error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            
            if (error.code === '42703') {
                console.error('\n🔧 MISSING COLUMN DETECTED!');
                console.error('=============================================');
                console.error('Your farmers table is missing columns.');
                console.error('\n📋 CURRENT COLUMNS:', tableStructure?.farmers?.columns || []);
                console.error('\n🛠️ FIX REQUIRED:');
                console.error('1. Check your farmers table in Supabase');
                console.error('2. Add missing columns:');
                console.error('   - account_verified (BOOLEAN DEFAULT false)');
                console.error('   - created_at (TIMESTAMP DEFAULT now())');
                console.error('   - profile_photo_url (TEXT NOT NULL DEFAULT "")');
                console.error('\n💡 QUICK FIX: Run this SQL in Supabase SQL Editor:');
                console.error(`
                    -- Add account_verified if missing
                    ALTER TABLE farmers ADD COLUMN IF NOT EXISTS account_verified BOOLEAN DEFAULT false;
                    
                    -- Add created_at if missing  
                    ALTER TABLE farmers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();
                    
                    -- Add profile_photo_url if missing (with NOT NULL constraint)
                    ALTER TABLE farmers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT '';
                    
                    -- Verify columns exist
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'farmers' AND table_schema = 'public';
                `);
            } else if (error.code === '23502') {
                console.error('\n🔧 NULL CONSTRAINT VIOLATION!');
                console.error('The profile_photo_url column has a NOT NULL constraint.');
                console.error('Make sure you are always providing a value for this column.');
                console.error('Current value being sent:', profilePhotoUrl);
            }
            
            throw error;
        }

        console.log('✅ Farmer saved successfully! ID:', data[0].id);
        console.log('✅ Farm name:', data[0].farm_name);
        console.log('✅ Status:', data[0].status);
        
        if (data[0].account_verified !== undefined) {
            console.log('✅ Account verified:', data[0].account_verified);
        }
        
        if (data[0].profile_photo_url !== undefined) {
            console.log('✅ Profile photo URL:', data[0].profile_photo_url || '(empty string)');
        }
        
        if (data[0].created_at) {
            console.log('🕒 Created at:', data[0].created_at);
        }
        
        return { success: true, data: data[0] };
        
    } catch (error) {
        console.error('❌ Error in insertFarmer:', error);
        console.error('Full error object:', error);
        return { success: false, error: error.message };
    }
}

// ==================== HEALTH CHECK ====================
app.get('/health', async (req, res) => {
    try {
        const tableStructure = await checkTableStructure();
        
        res.json({ 
            status: 'healthy',
            server: 'FarmTrials Registration API v7.0',
            timestamp: new Date().toISOString(),
            supabase: 'Connected',
            storage: 'Supabase Storage ready',
            table_structure: tableStructure,
            note: 'Adapting to actual table structure',
            features: ['registration', 'image-upload', 'otp-verification'],
            endpoints: {
                health: 'GET /health',
                check_structure: 'GET /api/check-structure',
                register_consumer: 'POST /api/register/consumer',
                register_farmer: 'POST /api/register/farmer',
                mobile_otp: 'POST /api/mobile/send-otp',
                verify_mobile: 'POST /api/mobile/verify',
                aadhaar_otp: 'POST /api/aadhaar/send-otp',
                verify_aadhaar: 'POST /api/aadhaar/verify',
                upload_photo: 'POST /api/upload-photo',
                check_bucket: 'GET /api/check-bucket'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: error.message
        });
    }
});

// ==================== CHECK STRUCTURE ENDPOINT ====================
app.get('/api/check-structure', async (req, res) => {
    try {
        const structure = await checkTableStructure();
        
        res.json({
            success: true,
            message: 'Table structure check completed',
            timestamp: new Date().toISOString(),
            structure: structure,
            sql_fixes: !structure?.farmers?.hasAccountVerified || !structure?.farmers?.hasCreatedAt ? `
                -- Run this SQL in Supabase SQL Editor to fix missing columns:
                
                -- Add account_verified if missing
                ALTER TABLE farmers ADD COLUMN IF NOT EXISTS account_verified BOOLEAN DEFAULT false;
                
                -- Add created_at if missing  
                ALTER TABLE farmers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();
                
                -- Add profile_photo_url if missing (with NOT NULL constraint)
                ALTER TABLE farmers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT '';
                
                -- Add to consumers table if needed
                ALTER TABLE consumers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();
                ALTER TABLE consumers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
            ` : 'All required columns exist'
        });
    } catch (error) {
        console.error('Structure check error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
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

// ==================== PHOTO UPLOAD ENDPOINT ====================
app.post('/api/upload-photo', async (req, res) => {
    try {
        let { imageData, profile_photo_base64, userType, userId } = req.body;
        
        const photoData = imageData || profile_photo_base64;
        
        console.log('📸 Photo upload request for:', userType, 'User ID:', userId || 'temp');
        
        if (!photoData) {
            return res.status(400).json({ 
                success: false, 
                message: 'No image data provided' 
            });
        }
        
        if (!photoData.startsWith('data:image/')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid image format. Must be base64 image data.' 
            });
        }
        
        const bucketExists = await checkBucketExists();
        if (!bucketExists) {
            return res.status(500).json({ 
                success: false, 
                message: 'Storage bucket not configured',
                instructions: 'Please create bucket "profile-photos" manually in Supabase Dashboard'
            });
        }
        
        const photoUrl = await uploadToSupabaseStorage(
            photoData, 
            userType, 
            userId || 'temp_' + Date.now()
        );
        
        if (!photoUrl) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to upload image to storage' 
            });
        }
        
        res.json({
            success: true,
            message: 'Profile photo uploaded successfully to Supabase Storage!',
            photoUrl: photoUrl,
            storage: 'Supabase Storage',
            note: 'Image stored in cloud storage, URL returned for database storage'
        });
        
    } catch (error) {
        console.error('❌ Photo upload endpoint error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to process photo upload',
            error: error.message 
        });
    }
});

// ==================== CHECK BUCKET ENDPOINT ====================
app.get('/api/check-bucket', async (req, res) => {
    try {
        console.log('🔍 Checking storage bucket status...');
        
        const bucketExists = await checkBucketExists();
        
        if (!bucketExists) {
            return res.json({
                success: false,
                message: 'Bucket "profile-photos" does not exist',
                instructions: [
                    '1. Go to Supabase Dashboard → Storage',
                    '2. Click "New bucket"',
                    '3. Name: profile-photos',
                    '4. Public: ON',
                    '5. File size limit: 50MB',
                    '6. Create bucket'
                ]
            });
        }
        
        const { data: files, error: listError } = await supabase.storage
            .from('profile-photos')
            .list();
        
        if (listError) {
            return res.json({
                success: false,
                message: 'Bucket exists but cannot list files',
                error: listError.message
            });
        }
        
        res.json({
            success: true,
            message: 'Bucket "profile-photos" exists and is accessible',
            fileCount: files.length,
            files: files.slice(0, 10).map(f => f.name)
        });
        
    } catch (error) {
        console.error('❌ Check bucket error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ==================== TEST UPLOAD ENDPOINT ====================
app.post('/api/test-upload', async (req, res) => {
    try {
        console.log('🔍 Received test upload request');
        
        const { testImage } = req.body;
        
        if (!testImage) {
            return res.status(400).json({ 
                success: false, 
                message: 'No test image provided'
            });
        }
        
        if (!testImage.startsWith('data:image/')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Not a valid base64 image'
            });
        }
        
        const bucketExists = await checkBucketExists();
        if (!bucketExists) {
            return res.status(500).json({ 
                success: false, 
                message: 'Bucket not configured'
            });
        }
        
        const bucketName = 'profile-photos';
        const timestamp = Date.now();
        const filename = `test_${timestamp}.jpg`;
        
        console.log(`📤 Uploading test file: ${filename}`);
        
        const base64Data = testImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        console.log(`📊 Buffer size: ${buffer.length} bytes`);
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(filename, buffer, {
                contentType: 'image/jpeg',
                upsert: true
            });
        
        if (uploadError) {
            console.error('❌ Upload error:', uploadError);
            return res.status(500).json({ 
                success: false, 
                message: 'Upload failed',
                error: uploadError.message 
            });
        }
        
        const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filename);
        
        console.log('✅ Test upload successful!');
        
        res.json({
            success: true,
            message: 'Test upload successful!',
            url: urlData.publicUrl,
            bucket: bucketName,
            filename: filename
        });
        
    } catch (error) {
        console.error('❌ Test upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message
        });
    }
});

// ==================== REGISTRATION ENDPOINTS ====================
app.post('/api/register/consumer', async (req, res) => {
    try {
        const { username, email, mobile, password, profile_photo_base64, profile_photo_url } = req.body;
        
        console.log('👤 Consumer registration request:', { username, email, mobile });
        console.log('📸 Photo data present:', !!(profile_photo_base64 || profile_photo_url));
        
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
        
        const bucketExists = await checkBucketExists();
        if (!bucketExists) {
            console.log('⚠️ Bucket not found - continuing registration without photo upload');
        }
        
        const result = await insertConsumer({
            username,
            email,
            mobile,
            password,
            profile_photo_base64,
            profile_photo_url
        });
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to create account. Please try again.',
                error: result.error 
            });
        }
        
        console.log('✅ Consumer registration completed successfully!');
        
        const responseData = {
            success: true,
            message: 'Consumer account created successfully!',
            user: {
                id: result.data.id,
                username,
                email,
                mobile,
                user_type: 'consumer',
                status: result.data.status
            }
        };
        
        if (result.data.profile_photo_url !== undefined) {
            responseData.user.profile_photo_url = result.data.profile_photo_url;
            responseData.user.storage_note = 'Profile photo stored in Supabase Storage';
        }
        
        if (result.data.created_at) {
            responseData.user.created_at = result.data.created_at;
        }
        
        if (result.data.updated_at) {
            responseData.user.updated_at = result.data.updated_at;
        }
        
        res.json(responseData);
        
    } catch (error) {
        console.error('❌ Consumer registration error:', error);
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
            profile_photo_base64, profile_photo_url, farm_name, farm_size, specialization,
            certifications, village, taluka, district, state, pin_code,
            account_holder_name, account_number, bank_name, ifsc_code,
            branch_name, aadhaar_verified, mobile_verified
        } = req.body;
        
        console.log('👨‍🌾 Farmer registration request:', { username, email, farm_name });
        console.log('📸 Photo data present:', !!(profile_photo_base64 || profile_photo_url));
        
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
        
        const bucketExists = await checkBucketExists();
        if (!bucketExists) {
            console.log('⚠️ Bucket not found - continuing registration without photo upload');
        }
        
        const result = await insertFarmer({
            username,
            email,
            aadhaar_number,
            mobile,
            password,
            profile_photo_base64,
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
                error: result.error,
                note: 'Check /api/check-structure endpoint to see missing columns'
            });
        }
        
        console.log('✅ Farmer registration completed successfully!');
        
        const responseData = {
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
                status: result.data.status
            }
        };
        
        if (result.data.account_verified !== undefined) {
            responseData.farmer.account_verified = result.data.account_verified;
        }
        
        if (result.data.profile_photo_url !== undefined) {
            responseData.farmer.profile_photo_url = result.data.profile_photo_url;
        }
        
        if (result.data.created_at) {
            responseData.farmer.created_at = result.data.created_at;
        }
        
        res.json(responseData);
        
    } catch (error) {
        console.error('❌ Farmer registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed. Please try again.',
            error: error.message,
            note: 'Check table structure and add missing columns'
        });
    }
});

// ==================== DEBUG ENDPOINTS ====================
app.get('/api/debug/storage', async (req, res) => {
    try {
        console.log('🔍 Checking storage...');
        
        const bucketName = 'profile-photos';
        const { data, error } = await supabase.storage
            .from(bucketName)
            .list();
        
        if (error) {
            console.error('Storage list error:', error);
            return res.json({
                success: false,
                message: 'Storage access error',
                error: error.message,
                instructions: 'Please create bucket manually in Supabase Dashboard'
            });
        }
        
        console.log(`📁 Found ${data.length} files in bucket`);
        
        res.json({
            success: true,
            message: 'Storage bucket accessible',
            bucket: bucketName,
            file_count: data.length,
            files: data.slice(0, 20).map(f => ({
                name: f.name,
                size: f.metadata?.size,
                type: f.metadata?.mimetype,
                created: f.created_at
            }))
        });
    } catch (error) {
        console.error('Debug storage error:', error);
        res.json({ 
            success: false,
            error: error.message 
        });
    }
});

app.get('/api/debug/users', async (req, res) => {
    try {
        const { data: consumers } = await supabase
            .from('consumers')
            .select('id, username, email, mobile, status')
            .limit(5);
        
        const { data: farmers } = await supabase
            .from('farmers')
            .select('id, username, email, mobile, farm_name, status')
            .limit(5);
        
        res.json({
            success: true,
            consumers_count: consumers?.length || 0,
            farmers_count: farmers?.length || 0,
            consumers: consumers || [],
            farmers: farmers || []
        });
    } catch (error) {
        console.error('Debug users error:', error);
        res.json({ 
            success: false,
            error: error.message 
        });
    }
});

// ==================== ROOT ENDPOINT ====================
app.get('/', async (req, res) => {
    try {
        const structure = await checkTableStructure();
        
        res.json({ 
            server: 'FarmTrials Registration API',
            version: '7.0',
            status: 'operational',
            timestamp: new Date().toISOString(),
            note: 'Adapting to actual table structure',
            table_issues: {
                farmers_missing_updated_at: !structure?.farmers?.hasUpdatedAt,
                farmers_missing_account_verified: !structure?.farmers?.hasAccountVerified,
                farmers_missing_created_at: !structure?.farmers?.hasCreatedAt
            },
            features: {
                supabase: 'Connected',
                storage: 'Supabase Storage ready',
                image_upload: 'Base64 → Storage URL',
                registration: 'Consumer & Farmer',
                otp: 'Mobile & Aadhaar verification',
                security: 'Password hashing with bcrypt',
                account_verification: 'Farmer account verification (if column exists)'
            },
            endpoints: {
                health: 'GET /health',
                check_structure: 'GET /api/check-structure',
                check_bucket: 'GET /api/check-bucket',
                register_consumer: 'POST /api/register/consumer',
                register_farmer: 'POST /api/register/farmer',
                test_upload: 'POST /api/test-upload',
                mobile_otp: {
                    send: 'POST /api/mobile/send-otp',
                    verify: 'POST /api/mobile/verify'
                },
                aadhaar_otp: {
                    send: 'POST /api/aadhaar/send-otp',
                    verify: 'POST /api/aadhaar/verify'
                },
                debug: {
                    storage: 'GET /api/debug/storage',
                    users: 'GET /api/debug/users'
                }
            }
        });
    } catch (error) {
        res.json({
            server: 'FarmTrials Registration API',
            status: 'operational',
            error: error.message
        });
    }
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
        error: err.message,
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
}, 60 * 60 * 1000);

// ==================== SERVER START ====================
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    console.log(`
    🚀 FarmTrials Backend Server v7.0
    📍 Port: ${PORT}
    🔗 Supabase: Connected
    ⏰ Started: ${new Date().toISOString()}
    `);
    
    console.log('🔍 Checking storage bucket...');
    const bucketExists = await checkBucketExists();
    
    if (bucketExists) {
        console.log('✅ Storage bucket "profile-photos" is ready!');
    } else {
        console.log('⚠️ IMPORTANT: Storage bucket "profile-photos" not found!');
        console.log('\n📋 MANUAL SETUP REQUIRED:');
        console.log('1. Go to Supabase Dashboard → Storage');
        console.log('2. Click "New bucket"');
        console.log('3. Name: profile-photos');
        console.log('4. Public: ON');
        console.log('5. File size limit: 50MB');
        console.log('6. Create bucket');
        console.log('\n⚠️ Without bucket, photo uploads will fail but registration will still work.');
    }
    
    console.log('\n🔍 Checking table structure...');
    const structure = await checkTableStructure();
    
    console.log(`
    📦 Storage: ${bucketExists ? '✅ Ready' : '❌ Manual setup required'}
    🕒 Timestamps: ${structure?.farmers?.hasCreatedAt ? '✅ created_at exists' : '❌ created_at missing'}
    ✅ Account Verified: ${structure?.farmers?.hasAccountVerified ? '✅ Column exists' : '❌ Column missing'}
    📸 Profile Photo URL: ${structure?.farmers?.hasProfilePhotoUrl ? '✅ Column exists' : '❌ Column missing'}
    🔒 Security: Password hashing with bcrypt
    🌐 Frontend: https://unobtrix.netlify.app
    
    ⚠️ CRITICAL: Farmers table must have profile_photo_url column with NOT NULL constraint
    If missing, run this SQL:
    
    ALTER TABLE farmers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT '';
    
    ✅ Server is running with adaptive structure!
    
    📋 Test endpoints:
       GET  /health                    - Health check
       GET  /api/check-structure       - Check table structure
       GET  /api/check-bucket          - Check bucket status
       POST /api/register/farmer       - Register farmer
       GET  /api/debug/users           - Check existing users
    `);
});