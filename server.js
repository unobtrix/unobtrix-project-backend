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

// Request logging
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    if (req.method === 'POST' && req.originalUrl.includes('/api/register')) {
        console.log('Body keys:', Object.keys(req.body));
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
        const { data: consumers } = await supabase
            .from('consumers')
            .select('email, mobile')
            .or(`email.eq.${email},mobile.eq.${mobile}`)
            .limit(1);

        const { data: farmers } = await supabase
            .from('farmers')
            .select('email, mobile')
            .or(`email.eq.${email},mobile.eq.${mobile}`)
            .limit(1);

        return (consumers && consumers.length > 0) || (farmers && farmers.length > 0);
    } catch (error) {
        console.error('Error checking user existence:', error);
        return false;
    }
}

// ==================== CHECK AND CREATE STORAGE BUCKET ====================
async function checkAndCreateBucket() {
    try {
        console.log('🔍 Checking storage bucket...');
        
        // List buckets
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();
        
        if (listError) {
            console.error('❌ Error listing buckets:', listError);
            return;
        }
        
        console.log('📦 Available buckets:', buckets.map(b => b.name));
        
        const bucketName = 'profile-photos';
        const bucketExists = buckets.some(b => b.name === bucketName);
        
        if (!bucketExists) {
            console.log('🔄 Creating bucket:', bucketName);
            
            const { data: newBucket, error: createError } = await supabase.storage.createBucket(bucketName, {
                public: true,
                fileSizeLimit: 52428800, // 50MB
                allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp']
            });
            
            if (createError) {
                console.error('❌ Failed to create bucket:', createError);
            } else {
                console.log('✅ Bucket created successfully:', bucketName);
                
                // Update bucket policy to be public
                const { error: policyError } = await supabase.storage.updateBucket(bucketName, {
                    public: true
                });
                
                if (policyError) {
                    console.error('❌ Failed to update bucket policy:', policyError);
                } else {
                    console.log('✅ Bucket set to public');
                }
            }
        } else {
            console.log('✅ Bucket already exists:', bucketName);
            
            // Check bucket details
            const { data: bucketDetails, error: detailsError } = await supabase.storage.getBucket(bucketName);
            
            if (detailsError) {
                console.error('❌ Error getting bucket details:', detailsError);
            } else {
                console.log('📋 Bucket details:', {
                    name: bucketDetails.name,
                    public: bucketDetails.public,
                    fileSizeLimit: bucketDetails.file_size_limit,
                    allowedMimeTypes: bucketDetails.allowed_mime_types
                });
            }
        }
    } catch (error) {
        console.error('❌ Error in checkAndCreateBucket:', error);
    }
}

// ==================== IMAGE UPLOAD TO SUPABASE STORAGE ====================
async function uploadToSupabaseStorage(base64Image, userType, userId) {
    try {
        if (!base64Image) {
            console.error('❌ No image data provided');
            return null;
        }
        
        if (!base64Image.startsWith('data:image/')) {
            console.error('❌ Invalid image format. Must be base64 image data.');
            console.error('Received:', base64Image.substring(0, 100));
            return null;
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const fileExt = base64Image.split(';')[0].split('/')[1] || 'png';
        const filename = `${userType}_${userId}_${timestamp}_${randomString}.${fileExt}`;
        const bucketName = 'profile-photos';

        console.log(`📤 Uploading to Supabase Storage: ${bucketName}/${filename}`);
        console.log(`📊 Image size: ${base64Image.length} characters (base64)`);

        // Convert base64 to buffer
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        console.log(`📊 Buffer size: ${buffer.length} bytes`);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(filename, buffer, {
                contentType: `image/${fileExt}`,
                upsert: false,
                cacheControl: '3600'
            });

        if (error) {
            console.error('❌ Storage upload error:', error);
            
            // If bucket doesn't exist, create it
            if (error.message && error.message.includes('bucket') && error.message.includes('not found')) {
                console.log('🔄 Bucket not found, creating...');
                await checkAndCreateBucket();
                
                // Retry upload after creating bucket
                console.log('🔄 Retrying upload...');
                const { data: retryData, error: retryError } = await supabase.storage
                    .from(bucketName)
                    .upload(filename, buffer, {
                        contentType: `image/${fileExt}`,
                        upsert: false,
                        cacheControl: '3600'
                    });
                
                if (retryError) {
                    console.error('❌ Retry upload failed:', retryError);
                    return null;
                }
                
                console.log('✅ Upload successful on retry');
            } else {
                return null;
            }
        } else {
            console.log('✅ Upload successful');
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filename);

        console.log('✅ Image uploaded successfully to Supabase Storage');
        console.log('🔗 Public URL:', urlData.publicUrl);

        return urlData.publicUrl;

    } catch (error) {
        console.error('❌ Error uploading to storage:', error);
        console.error('Stack trace:', error.stack);
        return null;
    }
}

// ==================== REGISTRATION WITH IMAGE UPLOAD ====================
async function insertConsumer(userData) {
    try {
        const hashedPassword = await hashPassword(userData.password);
        const now = new Date().toISOString();
        
        let profilePhotoUrl = null;
        
        // Upload image to Supabase Storage if provided
        const photoData = userData.profile_photo_base64 || userData.profile_photo_url;
        
        if (photoData && photoData.startsWith('data:image/')) {
            console.log('📸 Processing profile photo upload...');
            console.log('Base64 data length:', photoData.length);
            console.log('Base64 starts with:', photoData.substring(0, 50));
            
            // Use username as temporary ID for upload
            const tempUserId = userData.username.replace(/[^a-zA-Z0-9]/g, '_');
            profilePhotoUrl = await uploadToSupabaseStorage(
                photoData,
                'consumer',
                tempUserId
            );
            
            if (!profilePhotoUrl) {
                console.log('⚠️ Photo upload failed, continuing without photo');
            } else {
                console.log('✅ Photo uploaded to:', profilePhotoUrl);
            }
        } else if (photoData && photoData.includes('http')) {
            // If it's already a URL, use it directly
            profilePhotoUrl = photoData;
            console.log('✅ Using existing photo URL:', profilePhotoUrl);
        } else if (photoData) {
            console.log('⚠️ Invalid photo data format:', photoData.substring(0, 100));
        }
        
        console.log('💾 Inserting consumer into database...');
        const { data, error } = await supabase
            .from('consumers')
            .insert([{
                username: userData.username,
                email: userData.email,
                mobile: userData.mobile,
                password: hashedPassword,
                profile_photo_url: profilePhotoUrl,
                status: 'active',
                created_at: now,
                updated_at: now
            }])
            .select('id, username, email, mobile, profile_photo_url, created_at');

        if (error) {
            console.error('❌ Database insert error:', error);
            throw error;
        }

        console.log('✅ Consumer saved successfully! ID:', data[0].id);
        console.log('📸 Photo URL in database:', data[0].profile_photo_url);
        return { success: true, data: data[0] };
        
    } catch (error) {
        console.error('❌ Error in insertConsumer:', error);
        return { success: false, error: error.message };
    }
}

async function insertFarmer(farmerData) {
    try {
        const hashedPassword = await hashPassword(farmerData.password);
        const now = new Date().toISOString();
        
        let profilePhotoUrl = null;
        
        // Upload image to Supabase Storage if provided
        const photoData = farmerData.profile_photo_base64 || farmerData.profile_photo_url;
        
        if (photoData && photoData.startsWith('data:image/')) {
            console.log('📸 Processing farmer profile photo upload...');
            console.log('Base64 data length:', photoData.length);
            
            const tempUserId = farmerData.username.replace(/[^a-zA-Z0-9]/g, '_');
            profilePhotoUrl = await uploadToSupabaseStorage(
                photoData,
                'farmer',
                tempUserId
            );
            
            if (!profilePhotoUrl) {
                console.log('⚠️ Farmer photo upload failed, continuing without photo');
            } else {
                console.log('✅ Farmer photo uploaded to:', profilePhotoUrl);
            }
        } else if (photoData && photoData.includes('http')) {
            // If it's already a URL, use it directly
            profilePhotoUrl = photoData;
            console.log('✅ Using existing farmer photo URL:', profilePhotoUrl);
        }

        // Convert certifications to array
        let certificationsArray = [];
        if (farmerData.certifications) {
            if (Array.isArray(farmerData.certifications)) {
                certificationsArray = farmerData.certifications;
            } else if (typeof farmerData.certifications === 'string') {
                certificationsArray = farmerData.certifications.split(',').map(c => c.trim()).filter(c => c);
            }
        }

        console.log('💾 Inserting farmer into database...');
        const { data, error } = await supabase
            .from('farmers')
            .insert([{
                username: farmerData.username,
                email: farmerData.email,
                aadhaar_number: farmerData.aadhaar_number,
                mobile: farmerData.mobile,
                password: hashedPassword,
                profile_photo_url: profilePhotoUrl,
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
                created_at: now,
                updated_at: now,
                status: 'pending_verification'
            }])
            .select('id, username, email, mobile, farm_name, profile_photo_url, created_at');

        if (error) {
            console.error('❌ Farmer database insert error:', error);
            throw error;
        }

        console.log('✅ Farmer saved successfully! ID:', data[0].id);
        console.log('📸 Photo URL in database:', data[0].profile_photo_url);
        return { success: true, data: data[0] };
        
    } catch (error) {
        console.error('❌ Error in insertFarmer:', error);
        return { success: false, error: error.message };
    }
}

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        server: 'FarmTrials Registration API v2.0',
        timestamp: new Date().toISOString(),
        supabase: 'Connected',
        storage: 'Supabase Storage enabled',
        features: ['registration', 'image-upload', 'otp-verification'],
        endpoints: {
            health: 'GET /health',
            register_consumer: 'POST /api/register/consumer',
            register_farmer: 'POST /api/register/farmer',
            mobile_otp: 'POST /api/mobile/send-otp',
            verify_mobile: 'POST /api/mobile/verify',
            aadhaar_otp: 'POST /api/aadhaar/send-otp',
            verify_aadhaar: 'POST /api/aadhaar/verify',
            upload_photo: 'POST /api/upload-photo'
        }
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

// ==================== PHOTO UPLOAD ENDPOINT (STANDALONE) ====================
app.post('/api/upload-photo', async (req, res) => {
    try {
        // Accept both parameter names
        let { imageData, profile_photo_base64, userType, userId } = req.body;
        
        // Use imageData if provided, otherwise fallback to profile_photo_base64
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
        
        // Upload to Supabase Storage
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

// ==================== TEST UPLOAD ENDPOINT ====================
app.post('/api/test-upload', async (req, res) => {
    try {
        const { base64Image } = req.body;
        
        if (!base64Image) {
            return res.status(400).json({ success: false, message: 'No image provided' });
        }
        
        const url = await uploadToSupabaseStorage(base64Image, 'test', 'testuser');
        
        if (!url) {
            return res.status(500).json({ success: false, message: 'Upload failed' });
        }
        
        res.json({ success: true, url: url });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== REGISTRATION ENDPOINTS ====================
app.post('/api/register/consumer', async (req, res) => {
    try {
        const { username, email, mobile, password, profile_photo_base64, profile_photo_url } = req.body;
        
        console.log('👤 Consumer registration request:', { username, email, mobile });
        console.log('📸 Photo data present:', !!(profile_photo_base64 || profile_photo_url));
        console.log('Photo data type:', profile_photo_base64 ? 'base64' : profile_photo_url ? 'url' : 'none');
        
        if (profile_photo_base64) {
            console.log('Base64 starts with:', profile_photo_base64.substring(0, 50));
            console.log('Base64 length:', profile_photo_base64.length);
        }
        
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
        
        // Check if user exists
        const userExists = await checkUserExists(email, mobile);
        if (userExists) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email or mobile already exists' 
            });
        }
        
        // Save to database (includes photo upload to storage)
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
        
        res.json({
            success: true,
            message: 'Consumer account created successfully!',
            user: {
                id: result.data.id,
                username,
                email,
                mobile,
                profile_photo_url: result.data.profile_photo_url,
                user_type: 'consumer',
                created_at: result.data.created_at,
                storage_note: result.data.profile_photo_url ? 
                    'Profile photo stored in Supabase Storage' : 
                    'No profile photo provided'
            }
        });
        
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
        
        // Save to database (includes photo upload to storage)
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
                error: result.error 
            });
        }
        
        console.log('✅ Farmer registration completed successfully!');
        
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
                profile_photo_url: result.data.profile_photo_url,
                user_type: 'farmer',
                status: 'pending_verification',
                created_at: result.data.created_at,
                storage_note: result.data.profile_photo_url ? 
                    'Profile photo stored in Supabase Storage' : 
                    'No profile photo provided'
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

// ==================== DEBUG & TEST ENDPOINTS ====================
app.get('/api/debug/storage', async (req, res) => {
    try {
        const { data, error } = await supabase.storage
            .from('profile-photos')
            .list();
        
        if (error) {
            return res.json({
                success: false,
                message: 'Storage access error',
                error: error.message
            });
        }
        
        res.json({
            success: true,
            message: 'Storage bucket accessible',
            bucket: 'profile-photos',
            file_count: data.length,
            files: data.slice(0, 10).map(f => ({
                name: f.name,
                size: f.metadata?.size,
                type: f.metadata?.mimetype,
                created: f.created_at
            }))
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/api/debug/users', async (req, res) => {
    try {
        const { data: consumers } = await supabase
            .from('consumers')
            .select('id, username, email, mobile, profile_photo_url, created_at')
            .limit(5);
        
        const { data: farmers } = await supabase
            .from('farmers')
            .select('id, username, email, mobile, farm_name, profile_photo_url, created_at')
            .limit(5);
        
        res.json({
            success: true,
            consumers_count: consumers?.length || 0,
            farmers_count: farmers?.length || 0,
            consumers: consumers || [],
            farmers: farmers || []
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// ==================== ROOT ENDPOINT ====================
app.get('/', (req, res) => {
    res.json({ 
        server: 'FarmTrials Registration API',
        version: '3.0',
        status: 'operational',
        timestamp: new Date().toISOString(),
        features: {
            supabase: 'Connected',
            storage: 'Supabase Storage enabled',
            image_upload: 'Base64 → Storage URL',
            registration: 'Consumer & Farmer',
            otp: 'Mobile & Aadhaar verification',
            security: 'Password hashing with bcrypt'
        },
        endpoints: {
            health: 'GET /health',
            register_consumer: 'POST /api/register/consumer',
            register_farmer: 'POST /api/register/farmer',
            upload_photo: 'POST /api/upload-photo',
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
    🚀 FarmTrials Backend Server v3.0
    📍 Port: ${PORT}
    🔗 Supabase: Connected
    ⏰ Started: ${new Date().toISOString()}
    `);
    
    // Check and create storage bucket on startup
    await checkAndCreateBucket();
    
    console.log(`
    📦 Storage: Checking "profile-photos" bucket...
    📸 Images: Will be stored as URLs in cloud storage
    🔒 Security: Password hashing with bcrypt
    🌐 Frontend: https://unobtrix.netlify.app
    
    ✅ Server is running!
    
    📋 Test endpoints:
       GET  /health                    - Health check
       POST /api/register/consumer     - Register consumer
       POST /api/register/farmer       - Register farmer
       POST /api/upload-photo          - Upload photo
       POST /api/test-upload           - Test upload
       GET  /api/debug/storage         - Check storage
       GET  /api/debug/users           - Check users
    `);
});