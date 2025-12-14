const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

// ==================== SUPABASE CONFIGURATION ====================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

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
        'http://127.0.0.1:5500',
        'http://localhost:5000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length'],
    maxAge: 86400
}));

app.options('*', cors());

// Increase body size limit for image uploads
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Enhanced Request logging middleware
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.log('Origin:', req.headers.origin);
    if (req.method === 'POST' && req.body) {
        const bodyCopy = { ...req.body };
        if (bodyCopy.profile_photo_base64) {
            bodyCopy.profile_photo_base64 = `[BASE64_IMAGE:${bodyCopy.profile_photo_base64.length} chars]`;
        }
        if (bodyCopy.profile_photo_url) {
            bodyCopy.profile_photo_url = `[URL:${bodyCopy.profile_photo_url.substring(0, 50)}...]`;
        }
        if (bodyCopy.password) {
            bodyCopy.password = `[PASSWORD_HIDDEN]`;
        }
        if (bodyCopy.imageData) {
            bodyCopy.imageData = `[IMAGE_DATA:${bodyCopy.imageData.length} chars]`;
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

// ==================== PASSWORD MIGRATION HELPER ====================
async function migratePlainTextPasswords() {
    try {
        console.log('🔄 Checking for plain text passwords that need migration...');

        // Check consumers table
        const { data: consumers, error: cError } = await supabase
            .from('consumers')
            .select('id, email, password');

        if (!cError && consumers) {
            let migratedCount = 0;
            for (const user of consumers) {
                if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$') && !user.password.startsWith('$2y$')) {
                    console.log(`🔄 Migrating consumer ${user.email} from plain text to hash`);
                    const hashedPassword = await hashPassword(user.password);
                    await supabase
                        .from('consumers')
                        .update({ password: hashedPassword })
                        .eq('id', user.id);
                    migratedCount++;
                }
            }
            if (migratedCount > 0) {
                console.log(`✅ Migrated ${migratedCount} consumer passwords`);
            }
        }

        // Check farmers table
        const { data: farmers, error: fError } = await supabase
            .from('farmers')
            .select('id, email, password');

        if (!fError && farmers) {
            let migratedCount = 0;
            for (const user of farmers) {
                if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$') && !user.password.startsWith('$2y$')) {
                    console.log(`🔄 Migrating farmer ${user.email} from plain text to hash`);
                    const hashedPassword = await hashPassword(user.password);
                    await supabase
                        .from('farmers')
                        .update({ password: hashedPassword })
                        .eq('id', user.id);
                    migratedCount++;
                }
            }
            if (migratedCount > 0) {
                console.log(`✅ Migrated ${migratedCount} farmer passwords`);
            }
        }

        console.log('✅ Password migration check completed');
    } catch (error) {
        console.error('❌ Error during password migration:', error);
    }
}
async function hashPassword(password) {
    try {
        if (!password || typeof password !== 'string') {
            throw new Error('Invalid password provided for hashing');
        }

        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }

        console.log('🔐 Hashing password for user registration...');
        const salt = await bcrypt.genSalt(12); // Increased from 10 to 12 for better security
        const hashedPassword = await bcrypt.hash(password, salt);

        // Verify the hash was created properly
        if (!hashedPassword || !hashedPassword.startsWith('$2a$')) {
            throw new Error('Failed to generate valid bcrypt hash');
        }

        console.log('✅ Password hashed successfully (length:', hashedPassword.length, ')');
        return hashedPassword;
    } catch (error) {
        console.error('❌ Error hashing password:', error);
        throw new Error(`Password hashing failed: ${error.message}`);
    }
}

async function verifyPassword(password, hashedPassword) {
    try {
        if (!password || !hashedPassword) {
            console.log('❌ Missing password or hash for verification');
            return false;
        }

        if (typeof password !== 'string' || typeof hashedPassword !== 'string') {
            console.log('❌ Invalid password or hash type for verification');
            return false;
        }

        // Check if the stored password is actually a bcrypt hash
        if (!hashedPassword.startsWith('$2a$') && !hashedPassword.startsWith('$2b$') && !hashedPassword.startsWith('$2y$')) {
            console.log('❌ Stored password is not a valid bcrypt hash - possible plain text password');
            // For backward compatibility, try direct string comparison (but log as security issue)
            const isPlainTextMatch = password === hashedPassword;
            if (isPlainTextMatch) {
                console.error('🚨 SECURITY ISSUE: Plain text password found in database! User:', hashedPassword);
            }
            return isPlainTextMatch;
        }

        console.log('🔐 Verifying password against stored hash...');
        const isValid = await bcrypt.compare(password, hashedPassword);

        if (isValid) {
            console.log('✅ Password verification successful');
        } else {
            console.log('❌ Password verification failed');
        }

        return isValid;
    } catch (error) {
        console.error('❌ Error verifying password:', error);
        return false; // Return false on error to prevent login
    }
}

// ==================== SUPABASE HELPER FUNCTIONS ====================
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
            return '';
        }
        
        if (!base64Image.startsWith('data:image/')) {
            console.error('❌ Invalid image format. Must be base64 image data.');
            console.error('Received start:', base64Image.substring(0, 100));
            return '';
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
            
            return '';
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
        return '';
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
        
        // Determine ID type
        let consumerIdType = 'unknown';
        if (consumerData && consumerData.length > 0 && consumerData[0].id !== undefined) {
            const idValue = consumerData[0].id;
            if (typeof idValue === 'string' && idValue.includes('-')) {
                consumerIdType = 'uuid';
            } else if (typeof idValue === 'number' || typeof idValue === 'bigint') {
                consumerIdType = 'bigint';
            } else if (typeof idValue === 'string' && /^\d+$/.test(idValue)) {
                consumerIdType = 'bigint_string';
            }
        }
        
        let farmerIdType = 'unknown';
        if (farmerData && farmerData.length > 0 && farmerData[0].id !== undefined) {
            const idValue = farmerData[0].id;
            if (typeof idValue === 'string' && idValue.includes('-')) {
                farmerIdType = 'uuid';
            } else if (typeof idValue === 'number' || typeof idValue === 'bigint') {
                farmerIdType = 'bigint';
            } else if (typeof idValue === 'string' && /^\d+$/.test(idValue)) {
                farmerIdType = 'bigint_string';
            }
        }
        
        return {
            farmers: {
                columns: farmerColumns,
                hasUpdatedAt: farmerColumns.includes('updated_at'),
                hasCreatedAt: farmerColumns.includes('created_at'),
                hasAccountVerified: farmerColumns.includes('account_verified'),
                hasProfilePhotoUrl: farmerColumns.includes('profile_photo_url'),
                idType: farmerIdType
            },
            consumers: {
                columns: consumerColumns,
                hasUpdatedAt: consumerColumns.includes('updated_at'),
                hasCreatedAt: consumerColumns.includes('created_at'),
                hasProfilePhotoUrl: consumerColumns.includes('profile_photo_url'),
                idType: consumerIdType
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
        console.log('📊 Received user data keys:', Object.keys(userData));
        
        const hashedPassword = await hashPassword(userData.password);
        
        // Initialize with empty string to satisfy NOT NULL constraint
        let profilePhotoUrl = '';
        
        const photoData = userData.profile_photo_base64 || userData.profile_photo_url;
        console.log('📸 Photo data present:', !!photoData);
        
        if (photoData && photoData.startsWith('data:image/')) {
            console.log('📸 Processing profile photo upload to storage...');
            
            const tempUserId = userData.username.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
            console.log('📤 Uploading to storage with temp ID:', tempUserId);
            
            const uploadedUrl = await uploadToSupabaseStorage(
                photoData,
                'consumer',
                tempUserId
            );
            
            if (uploadedUrl) {
                profilePhotoUrl = uploadedUrl;
                console.log('✅ Photo uploaded to storage URL:', profilePhotoUrl);
            } else {
                console.log('⚠️ Photo upload failed, using empty string');
                profilePhotoUrl = ''; // Explicitly set empty string
            }
        } else if (photoData && photoData.includes('http')) {
            profilePhotoUrl = photoData;
            console.log('✅ Using existing photo URL:', profilePhotoUrl);
        } else {
            console.log('⚠️ No valid photo data provided, using empty string');
            profilePhotoUrl = ''; // Explicitly set empty string
        }
        
        console.log('💾 Inserting consumer into database...');
        
        // Check table structure first
        const tableStructure = await checkTableStructure();
        console.log('🔍 Consumers table structure:', tableStructure?.consumers);
        
        // Always include profile_photo_url in select and insert
        const selectFields = ['id', 'username', 'email', 'mobile', 'status'];
        
        // CRITICAL: Always include profile_photo_url if column exists
        if (tableStructure?.consumers?.hasProfilePhotoUrl) {
            selectFields.push('profile_photo_url');
            console.log('✅ profile_photo_url column exists in consumers table');
        } else {
            console.log('❌ profile_photo_url column does NOT exist in consumers table - NEEDS TO BE ADDED');
        }
        
        if (tableStructure?.consumers?.hasCreatedAt) {
            selectFields.push('created_at');
        }
        
        if (tableStructure?.consumers?.hasUpdatedAt) {
            selectFields.push('updated_at');
        }
        
        // Build consumer data object
        const consumerData = {
            username: userData.username,
            email: userData.email,
            mobile: userData.mobile,
            password: hashedPassword,
            status: 'active'
        };
        
        // CRITICAL: Always add profile_photo_url to the insert data
        // Check if column exists in table
        if (tableStructure?.consumers?.columns?.includes('profile_photo_url')) {
            consumerData.profile_photo_url = profilePhotoUrl;
            console.log('✅ Adding profile_photo_url to insert data:', profilePhotoUrl || '(empty string)');
        } else {
            console.log('❌ WARNING: profile_photo_url column not found in consumers table');
            console.log('📋 Available columns:', tableStructure?.consumers?.columns || []);
            
            // Try to add it anyway in case the check failed
            consumerData.profile_photo_url = profilePhotoUrl;
            console.log('⚠️ Attempting to add profile_photo_url anyway:', profilePhotoUrl || '(empty string)');
        }
        
        console.log('📝 Final consumer data to insert:', Object.keys(consumerData));
        console.log('📋 Will select:', selectFields);
        console.log('ℹ️  ID will be auto-generated as bigint (int8)');
        
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
                console.error('The profile_photo_url column might not exist in the consumers table.');
                console.error('\n🛠️ FIX: Run this SQL in Supabase SQL Editor:');
                console.error(`
                    -- Add profile_photo_url column to consumers table
                    ALTER TABLE consumers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT '';
                    
                    -- Verify the column was added
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'consumers' AND table_schema = 'public';
                `);
            } else if (error.code === '23502') {
                console.error('\n🔧 NULL CONSTRAINT VIOLATION!');
                console.error('The profile_photo_url column has a NOT NULL constraint but no default value.');
                console.error('Current value being sent:', profilePhotoUrl);
                console.error('\n🛠️ FIX: Ensure you always send a value (even empty string)');
            } else if (error.code === '22P02') {
                console.error('\n🔧 INVALID TEXT REPRESENTATION!');
                console.error('This might be due to ID column type mismatch.');
                console.error('Ensure consumers.id column is BIGINT (int8) in database.');
            }
            
            throw error;
        }

        console.log('✅ Consumer saved successfully!');
        console.log(`✅ ID (bigint): ${data[0].id}`);
        console.log(`✅ Username: ${data[0].username}`);
        console.log(`✅ Email: ${data[0].email}`);
        
        // Check if profile_photo_url was returned
        if (data[0].profile_photo_url !== undefined) {
            console.log('📸 Photo URL saved in database:', data[0].profile_photo_url || '(empty string)');
        } else {
            console.log('❌ profile_photo_url not returned in response - column might not exist');
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

// ==================== NEW FUNCTION: ADD MISSING COLUMN TO CONSUMERS ====================
async function addMissingColumnToConsumers() {
    try {
        console.log('🔍 Checking and fixing consumers table columns...');
        
        // First, check current structure
        const tableStructure = await checkTableStructure();
        const missingColumns = [];
        
        if (!tableStructure?.consumers?.hasProfilePhotoUrl) {
            missingColumns.push('profile_photo_url');
        }
        
        if (!tableStructure?.consumers?.hasCreatedAt) {
            missingColumns.push('created_at');
        }
        
        if (!tableStructure?.consumers?.hasUpdatedAt) {
            missingColumns.push('updated_at');
        }
        
        if (missingColumns.length === 0) {
            console.log('✅ All required columns exist in consumers table');
            return { success: true, message: 'All columns exist' };
        }
        
        console.log('❌ Missing columns in consumers table:', missingColumns);
        
        // Provide SQL to fix
        const sqlCommands = [];
        
        if (missingColumns.includes('profile_photo_url')) {
            sqlCommands.push('ALTER TABLE consumers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT \'\';');
        }
        
        if (missingColumns.includes('created_at')) {
            sqlCommands.push('ALTER TABLE consumers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();');
        }
        
        if (missingColumns.includes('updated_at')) {
            sqlCommands.push('ALTER TABLE consumers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();');
        }
        
        const sql = sqlCommands.join('\n');
        
        return {
            success: false,
            message: 'Missing columns detected',
            missingColumns,
            sql_fix: sql,
            instructions: 'Run the above SQL in Supabase SQL Editor to fix the consumers table'
        };
        
    } catch (error) {
        console.error('Error checking consumers table:', error);
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
            server: 'FarmTrials Registration API',
            timestamp: new Date().toISOString(),
            supabase: 'Connected',
            storage: 'Supabase Storage ready',
            table_structure: tableStructure,
            note: 'Complete registration system with image upload',
            endpoints: {
                health: 'GET /health',
                check_structure: 'GET /api/check-structure',
                login: {
                    get: 'GET /api/login (for testing)',
                    post: 'POST /api/login (for actual login)'
                },
                register_consumer: 'POST /api/register/consumer',
                register_farmer: 'POST /api/register/farmer',
                mobile_otp: 'POST /api/mobile/send-otp',
                verify_mobile: 'POST /api/mobile/verify',
                aadhaar_otp: 'POST /api/aadhaar/send-otp',
                verify_aadhaar: 'POST /api/aadhaar/verify',
                upload_photo: 'POST /api/upload-photo',
                check_bucket: 'GET /api/check-bucket',
                fix_consumers_id: 'GET /api/fix-consumers-id'
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

// ==================== LOGIN ENDPOINTS ====================
// GET endpoint for testing login
app.get('/api/login', (req, res) => {
    res.json({
        success: true,
        message: 'Login endpoint is available',
        instructions: {
            method: 'POST',
            required_fields: ['email', 'password'],
            optional_field: 'userType (default: "consumer")',
            example_request: {
                email: 'user@example.com',
                password: 'password123',
                userType: 'consumer'
            },
            example_response: {
                success: true,
                message: 'Login successful',
                user: {
                    id: 1,
                    username: 'john_doe',
                    email: 'user@example.com',
                    status: 'active',
                    profile_photo_url: 'https://...',
                    user_type: 'consumer'
                }
            }
        },
        note: 'Use POST method for actual login'
    });
});

// POST endpoint for actual login
app.post('/api/login', async (req, res) => {
    try {
        console.log('🔐 LOGIN REQUEST RECEIVED');
        console.log('Request origin:', req.headers.origin);
        console.log('Request body keys:', Object.keys(req.body));
        
        const { email, password, userType = 'consumer' } = req.body;
        
        console.log('🔐 Login attempt for:', email, 'Type:', userType);
        
        if (!email || !password) {
            console.log('❌ Missing email or password');
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
        
        // Determine which table to query
        const tableName = userType === 'farmer' ? 'farmers' : 'consumers';
        console.log('📊 Querying table:', tableName);
        
        // Find user by email
        const { data: users, error: findError } = await supabase
            .from(tableName)
            .select('id, username, email, password, status, profile_photo_url')
            .eq('email', email.toLowerCase().trim())
            .limit(1);
        
        if (findError) {
            console.error('❌ Database error:', findError);
            return res.status(500).json({
                success: false,
                message: 'Login failed due to database error',
                error: findError.message
            });
        }
        
        console.log('📊 Found users:', users ? users.length : 0);
        
        if (!users || users.length === 0) {
            console.log('❌ User not found:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        const user = users[0];
        console.log('👤 User found:', user.username, 'ID:', user.id);
        
        // Verify password using your password hashing utility
        console.log('🔐 Verifying password...');
        const isValid = await verifyPassword(password, user.password);
        
        if (!isValid) {
            console.log('❌ Invalid password for:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Check account status
        if (user.status !== 'active' && user.status !== 'pending_verification') {
            console.log('⚠️ Account not active:', user.status);
            return res.status(403).json({
                success: false,
                message: `Account is ${user.status}. Please contact support.`
            });
        }
        
        console.log('✅ Login successful for:', email);
        
        // Remove password from response
        const { password: _, ...safeUser } = user;
        
        // Generate a simple token
        const token = Buffer.from(`${Date.now()}:${user.id}`).toString('base64');
        
        const responseData = {
            success: true,
            message: 'Login successful',
            user: {
                ...safeUser,
                user_type: userType
            },
            token: token,
            timestamp: new Date().toISOString()
        };
        
        console.log('✅ Sending response for user:', safeUser.username);
        res.json(responseData);
        
    } catch (error) {
        console.error('❌ Login error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.',
            error: error.message
        });
    }
});

// ==================== UPDATED CHECK STRUCTURE ENDPOINT ====================
app.get('/api/check-structure', async (req, res) => {
    try {
        const structure = await checkTableStructure();
        const consumersFix = await addMissingColumnToConsumers();
        
        let sqlFix = '';
        let criticalIssues = [];
        
        // Check ID type
        if (structure?.consumers?.idType !== 'bigint' && structure?.consumers?.idType !== 'bigint_string') {
            sqlFix += `
                -- ===== FIX CONSUMERS ID (MUST BE BIGINT) =====
                -- WARNING: This will delete all existing consumer data!
                DROP TABLE IF EXISTS consumers CASCADE;
                
                CREATE TABLE consumers (
                    id BIGSERIAL PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    mobile VARCHAR(20) NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    status VARCHAR(50) DEFAULT 'active',
                    profile_photo_url TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
                \n\n`;
            criticalIssues.push('❌ Consumers ID is not BIGINT - registration will fail!');
        }
        
        // Check missing columns
        if (!consumersFix.success && consumersFix.missingColumns) {
            sqlFix += `-- ===== ADD MISSING COLUMNS TO CONSUMERS =====\n`;
            sqlFix += consumersFix.sql_fix;
            sqlFix += '\n\n';
            
            if (consumersFix.missingColumns.includes('profile_photo_url')) {
                criticalIssues.push('❌ Consumers table missing profile_photo_url column - photos won\'t be saved!');
            }
        }
        
        // Check farmers table
        if (!structure?.farmers?.hasAccountVerified || !structure?.farmers?.hasCreatedAt || !structure?.farmers?.hasProfilePhotoUrl) {
            sqlFix += `-- ===== ADD MISSING COLUMNS TO FARMERS =====\n`;
            sqlFix += `ALTER TABLE farmers ADD COLUMN IF NOT EXISTS account_verified BOOLEAN DEFAULT false;\n`;
            sqlFix += `ALTER TABLE farmers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();\n`;
            sqlFix += `ALTER TABLE farmers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT '';\n`;
        }
        
        if (sqlFix === '') {
            sqlFix = 'All required columns exist and consumers.id is BIGINT';
        }
        
        res.json({
            success: true,
            message: 'Table structure check completed',
            timestamp: new Date().toISOString(),
            structure: structure,
            consumers_status: consumersFix,
            critical_issues: criticalIssues.length > 0 ? criticalIssues : ['✅ All critical checks passed'],
            sql_fixes: sqlFix
        });
    } catch (error) {
        console.error('Structure check error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== NEW ENDPOINT: FIX CONSUMERS ID ====================
app.get('/api/fix-consumers-id', async (req, res) => {
    try {
        const structure = await checkTableStructure();
        
        if (structure?.consumers?.idType === 'bigint' || structure?.consumers?.idType === 'bigint_string') {
            return res.json({
                success: true,
                message: 'Consumers ID is already BIGINT',
                current_type: structure.consumers.idType,
                action_required: 'No action needed'
            });
        }
        
        res.json({
            success: true,
            message: 'Consumers ID needs to be converted to BIGINT',
            current_type: structure?.consumers?.idType || 'unknown',
            instructions: 'Run the following SQL in Supabase SQL Editor:',
            sql_commands: [
                '-- ===== OPTION 1: DROP AND RECREATE (EMPTY TABLE) =====',
                '-- WARNING: This will delete all existing consumer data!',
                'DROP TABLE IF EXISTS consumers CASCADE;',
                '',
                'CREATE TABLE consumers (',
                '    id BIGSERIAL PRIMARY KEY,',
                '    username VARCHAR(255) NOT NULL,',
                '    email VARCHAR(255) UNIQUE NOT NULL,',
                '    mobile VARCHAR(20) NOT NULL,',
                '    password VARCHAR(255) NOT NULL,',
                '    status VARCHAR(50) DEFAULT \'active\',',
                '    profile_photo_url TEXT NOT NULL DEFAULT \'\',',
                '    created_at TIMESTAMP DEFAULT NOW(),',
                '    updated_at TIMESTAMP DEFAULT NOW()',
                ');',
                '',
                '-- ===== OPTION 2: MIGRATION WITH DATA (COMPLEX) =====',
                '-- Contact for assistance if you need to preserve data',
                '',
                '-- ===== ALSO FIX FARMERS TABLE IF NEEDED =====',
                'ALTER TABLE farmers ADD COLUMN IF NOT EXISTS account_verified BOOLEAN DEFAULT false;',
                'ALTER TABLE farmers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();',
                'ALTER TABLE farmers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT \'\';'
            ].join('\n'),
            warning: 'Backup your data before running these commands!'
        });
        
    } catch (error) {
        console.error('Fix consumers ID error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== NEW ENDPOINT: FIX CONSUMERS COLUMNS ====================
app.get('/api/fix-consumers-columns', async (req, res) => {
    try {
        console.log('🔧 Checking consumers table columns...');
        
        const result = await addMissingColumnToConsumers();
        
        if (result.success) {
            return res.json({
                success: true,
                message: 'All required columns exist in consumers table',
                timestamp: new Date().toISOString()
            });
        }
        
        res.json({
            success: false,
            message: 'Missing columns in consumers table',
            timestamp: new Date().toISOString(),
            missingColumns: result.missingColumns,
            sql_fix: result.sql_fix,
            instructions: [
                '1. Go to Supabase Dashboard → SQL Editor',
                '2. Copy and paste the SQL commands above',
                '3. Click "Run"',
                '4. Wait for execution to complete',
                '5. Restart your server if needed'
            ]
        });
        
    } catch (error) {
        console.error('Fix consumers columns error:', error);
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
        
        // Check table structure before proceeding
        const consumersFix = await addMissingColumnToConsumers();
        if (!consumersFix.success && consumersFix.missingColumns.includes('profile_photo_url')) {
            return res.status(500).json({
                success: false,
                message: 'Database configuration issue',
                error: 'profile_photo_url column missing in consumers table',
                fix_instructions: 'Visit /api/fix-consumers-columns endpoint for SQL to fix this'
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
            // Check if it's a column missing error
            let fixHint = '';
            if (result.error?.includes('profile_photo_url') || result.error?.includes('42703')) {
                fixHint = 'profile_photo_url column might be missing. Check /api/fix-consumers-columns';
            } else if (result.error?.includes('id')) {
                fixHint = 'Check if consumers.id column is BIGINT in database. Check /api/fix-consumers-id';
            }
            
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to create account. Please try again.',
                error: result.error,
                fix_hint: fixHint
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
        
        // CRITICAL: Check if profile_photo_url exists in response
        if (result.data.profile_photo_url !== undefined) {
            responseData.user.profile_photo_url = result.data.profile_photo_url;
            responseData.user.storage_note = result.data.profile_photo_url ? 
                'Profile photo stored in Supabase Storage' : 
                'No profile photo provided';
        } else {
            console.warn('⚠️ profile_photo_url not in response - column might not exist in table');
            responseData.user.profile_photo_url = null;
            responseData.user.note = 'profile_photo_url column might be missing in database';
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
            error: error.message,
            fix_hints: [
                'Check /api/check-structure for table issues',
                'Check /api/fix-consumers-columns for missing columns',
                'Check /api/fix-consumers-id for ID type issues'
            ]
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
            .select('id, username, email, mobile, status, profile_photo_url, created_at')
            .limit(5);
        
        const { data: farmers } = await supabase
            .from('farmers')
            .select('id, username, email, mobile, farm_name, status, account_verified, created_at')
            .limit(5);
        
        // Check ID types
        let consumerIdType = 'unknown';
        if (consumers && consumers.length > 0) {
            const id = consumers[0].id;
            if (typeof id === 'string' && id.includes('-')) consumerIdType = 'uuid';
            else if (typeof id === 'number') consumerIdType = 'bigint';
            else if (typeof id === 'string' && /^\d+$/.test(id)) consumerIdType = 'bigint_string';
        }
        
        res.json({
            success: true,
            consumers_count: consumers?.length || 0,
            farmers_count: farmers?.length || 0,
            consumers_id_type: consumerIdType,
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
            server: 'FarmTrials Complete Registration API',
            version: '1.0.0',
            status: 'operational',
            timestamp: new Date().toISOString(),
            note: 'Complete registration system with image upload and login',
            table_issues: {
                consumers_id_type: structure?.consumers?.idType || 'unknown',
                consumers_id_is_bigint: structure?.consumers?.idType === 'bigint' || structure?.consumers?.idType === 'bigint_string',
                consumers_has_profile_photo_url: structure?.consumers?.hasProfilePhotoUrl || false,
                farmers_missing_updated_at: !structure?.farmers?.hasUpdatedAt,
                farmers_missing_account_verified: !structure?.farmers?.hasAccountVerified,
                farmers_missing_created_at: !structure?.farmers?.hasCreatedAt
            },
            features: {
                supabase: 'Connected',
                storage: 'Supabase Storage ready',
                image_upload: 'Base64 → Storage URL → Database',
                registration: 'Consumer & Farmer',
                otp: 'Mobile & Aadhaar verification',
                security: 'Password hashing with bcrypt',
                consumer_ids: 'BIGINT (auto-incrementing)',
                photo_saving: 'Fixed profile_photo_url saving',
                login: 'Email/password authentication (GET & POST)',
                cors: 'Configured for Netlify and localhost'
            },
            endpoints: {
                health: 'GET /health',
                check_structure: 'GET /api/check-structure',
                fix_consumers_id: 'GET /api/fix-consumers-id',
                fix_consumers_columns: 'GET /api/fix-consumers-columns',
                check_bucket: 'GET /api/check-bucket',
                login: {
                    get: 'GET /api/login (for testing)',
                    post: 'POST /api/login (for actual login)'
                },
                register_consumer: 'POST /api/register/consumer',
                register_farmer: 'POST /api/register/farmer',
                test_upload: 'POST /api/test-upload',
                upload_photo: 'POST /api/upload-photo',
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
            },
            critical_check: !structure?.consumers?.hasProfilePhotoUrl ? 
                '❌ profile_photo_url column missing - run /api/fix-consumers-columns' : 
                '✅ profile_photo_url column exists'
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
        available_endpoints: [
            'GET /',
            'GET /health',
            'GET /api/login',
            'POST /api/login',
            'POST /api/register/consumer',
            'POST /api/register/farmer',
            'POST /api/migrate-passwords',
            'GET /api/check-structure',
            'GET /api/check-bucket',
            'GET /api/debug/users'
        ],
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

// ==================== PASSWORD MIGRATION ENDPOINT ====================
app.post('/api/migrate-passwords', async (req, res) => {
    try {
        console.log('🔄 Starting password migration...');
        await migratePlainTextPasswords();
        res.json({
            success: true,
            message: 'Password migration completed. Check server logs for details.'
        });
    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({
            success: false,
            message: 'Password migration failed',
            error: error.message
        });
    }
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    console.log(`
    🚀 FarmTrials Complete Backend Server
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
    const consumersFix = await addMissingColumnToConsumers();
    
    const consumersIdOk = structure?.consumers?.idType === 'bigint' || structure?.consumers?.idType === 'bigint_string';
    const consumersHasPhotoColumn = structure?.consumers?.hasProfilePhotoUrl;
    
    console.log(`
    📦 Storage: ${bucketExists ? '✅ Ready' : '❌ Manual setup required'}
    🆔 Consumers ID: ${consumersIdOk ? '✅ BIGINT (int8)' : `❌ ${structure?.consumers?.idType || 'Unknown'} - FIX REQUIRED!`}
    📸 Profile Photo Column: ${consumersHasPhotoColumn ? '✅ Exists' : '❌ MISSING - photos won\'t save!'}
    🕒 Timestamps: ${structure?.farmers?.hasCreatedAt ? '✅ created_at exists' : '❌ created_at missing'}
    ✅ Account Verified: ${structure?.farmers?.hasAccountVerified ? '✅ Column exists' : '❌ Column missing'}
    🔐 Login System: ✅ Email/password authentication ready (GET & POST)
    🔒 Security: Password hashing with bcrypt
    🌐 CORS: Configured for Netlify and localhost
    
    ${!consumersIdOk ? `
    ⚠️ CRITICAL: Consumers table id must be BIGINT (int8)
    Visit: GET /api/fix-consumers-id for SQL commands
    ` : ''}
    
    ${!consumersHasPhotoColumn ? `
    ⚠️ CRITICAL: Consumers table missing profile_photo_url column
    Visit: GET /api/fix-consumers-columns for SQL commands
    ` : ''}
    
    ✅ Server is running with all functionality!
    
    📋 Available endpoints:
       GET  /                          - Server info
       GET  /health                    - Health check
       GET  /api/login                 - Login endpoint info (GET)
       POST /api/login                 - User login (POST)
       POST /api/register/consumer     - Register consumer
       POST /api/register/farmer       - Register farmer
       POST /api/migrate-passwords     - Migrate plain text passwords to hashes
       GET  /api/check-structure       - Check table structure
       GET  /api/fix-consumers-id      - Fix consumers ID type
       GET  /api/fix-consumers-columns - Add missing columns
       GET  /api/check-bucket          - Check bucket status
       GET  /api/debug/users           - Check existing users
       POST /api/mobile/send-otp       - Send mobile OTP
       POST /api/mobile/verify         - Verify mobile OTP
       POST /api/aadhaar/send-otp      - Send Aadhaar OTP
       POST /api/aadhaar/verify        - Verify Aadhaar OTP
    `);
});