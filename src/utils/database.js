const supabase = require('../config/supabase');
const { hashPassword } = require('./password');

/**
 * Check if a user exists with given email or mobile
 * @param {string} email - User email
 * @param {string} mobile - User mobile number
 * @returns {Promise<boolean>} True if user exists
 */
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

/**
 * Check table structure for consumers and farmers tables
 * @returns {Promise<Object>} Table structure information
 */
async function checkTableStructure() {
    try {
        console.log('🔍 Checking table structure...');
        
        // Get one farmer to see columns
        const { data: farmerData, error: farmerError } = await supabase
            .from('farmers')
            .select('*')
            .limit(1);
        
        if (farmerError) {
            // Check for authentication errors
            if (farmerError.message && (farmerError.message.includes('Invalid Compact JWS') || 
                                        farmerError.message.includes('JWT') || 
                                        farmerError.message.includes('token'))) {
                console.error('❌ Error checking farmers table: Invalid Compact JWS');
                console.error('🔐 Authentication error - check SUPABASE_ANON_KEY');
                return null;
            }
            console.warn('⚠️ Could not check farmers table:', farmerError.message);
        }
        
        let farmerColumns = [];
        if (!farmerError && farmerData && farmerData.length > 0) {
            farmerColumns = Object.keys(farmerData[0]);
        }
        
        // Get one consumer to see columns
        const { data: consumerData, error: consumerError } = await supabase
            .from('consumers')
            .select('*')
            .limit(1);
        
        if (consumerError) {
            // Check for authentication errors
            if (consumerError.message && (consumerError.message.includes('Invalid Compact JWS') || 
                                          consumerError.message.includes('JWT') || 
                                          consumerError.message.includes('token'))) {
                console.error('❌ Error checking consumers table: Invalid Compact JWS');
                console.error('🔐 Authentication error - check SUPABASE_ANON_KEY');
                return null;
            }
            console.warn('⚠️ Could not check consumers table:', consumerError.message);
        }
        
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
        console.error('Error checking table structure:', error.message || error);
        
        // Check for authentication errors
        if (error && error.message && error.message.includes('Invalid Compact JWS')) {
            console.error('🔐 Authentication error - check your SUPABASE_ANON_KEY');
        }
        
        return null;
    }
}

/**
 * Check if storage bucket exists and is accessible
 * @returns {Promise<boolean>} True if bucket exists
 */
async function checkBucketExists() {
    try {
        console.log('🔍 Checking if storage bucket exists...');
        
        const bucketName = 'profile-photos';
        
        const { data: files, error } = await supabase.storage
            .from(bucketName)
            .list('', { limit: 1 });
        
        if (error) {
            // Check for authentication/credential errors
            if (error.message && (error.message.includes('Invalid Compact JWS') || 
                                  error.message.includes('JWT') || 
                                  error.message.includes('token'))) {
                console.error('❌ Error accessing bucket: Invalid Compact JWS');
                console.error('\n🔐 AUTHENTICATION ERROR!');
                console.error('This error means your SUPABASE_ANON_KEY is invalid or malformed.');
                console.error('\n📋 How to fix:');
                console.error('1. Go to: https://app.supabase.com/project/_/settings/api');
                console.error('2. Copy the "anon" or "public" key (NOT the service_role key)');
                console.error('3. The key should start with "eyJ" and be very long');
                console.error('4. Set it as SUPABASE_ANON_KEY in your environment');
                console.error('\n🔧 On Render.com:');
                console.error('   Dashboard → Environment → Edit SUPABASE_ANON_KEY');
                console.error('   Paste the entire key without any spaces or quotes');
                return false;
            }
            
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
        console.error('❌ Error checking bucket:', error.message || error);
        
        // Check if it's an authentication error
        if (error && error.message && error.message.includes('Invalid Compact JWS')) {
            console.error('\n🔐 This is an authentication error - check your SUPABASE_ANON_KEY');
        }
        
        return false;
    }
}

/**
 * Upload image to Supabase storage
 * @param {string} base64Image - Base64 encoded image
 * @param {string} userType - Type of user (consumer/farmer)
 * @param {string} userId - User ID
 * @returns {Promise<string>} Public URL of uploaded image
 */
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
        
        // Validate buffer size (max 50MB as configured in body-parser)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (buffer.length > maxSize) {
            console.error(`❌ Image too large: ${buffer.length} bytes (max: ${maxSize} bytes)`);
            return '';
        }
        
        // Validate it's actually an image by checking magic bytes
        const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
        const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
        const isGIF = buffer[0] === 0x47 && buffer[1] === 0x49;
        const isWebP = buffer[8] === 0x57 && buffer[9] === 0x45;
        
        if (!isPNG && !isJPEG && !isGIF && !isWebP) {
            console.error('❌ Invalid image file - magic bytes check failed');
            return '';
        }

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

/**
 * Check and report missing columns in consumers table
 * @returns {Promise<Object>} Status and SQL fix if needed
 */
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

/**
 * Insert a new consumer into the database
 * @param {Object} userData - Consumer data
 * @returns {Promise<Object>} Result with success status and data
 */
async function insertConsumer(userData) {
    try {
        console.log('💾 Starting consumer registration...');
        console.log('📊 Received user data keys:', Object.keys(userData));
        
        const hashedPassword = await hashPassword(userData.password);
        
        // CRITICAL FIX: Always ensure profile_photo_url has a non-null value
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
                profilePhotoUrl = '';
            }
        } else if (photoData && photoData.includes('http')) {
            profilePhotoUrl = photoData;
            console.log('✅ Using existing photo URL:', profilePhotoUrl);
        } else {
            console.log('⚠️ No valid photo data provided, using empty string');
            profilePhotoUrl = '';
        }
        
        console.log('💾 Inserting consumer into database...');
        
        // Check table structure first
        const tableStructure = await checkTableStructure();
        console.log('🔍 Consumers table structure:', tableStructure?.consumers);
        
        // Build select fields based on what actually exists in the database
        const selectFields = ['id', 'username', 'email', 'mobile', 'status'];

        // Only select profile_photo_url if it exists
        if (tableStructure?.consumers?.columns?.includes('profile_photo_url')) {
            selectFields.push('profile_photo_url');
            console.log('✅ profile_photo_url column exists - will select it');
        } else {
            console.log('ℹ️ profile_photo_url column not found - will not select it');
        }

        // Only select timestamps if they exist
        if (tableStructure?.consumers?.columns?.includes('created_at')) {
            selectFields.push('created_at');
        }
        if (tableStructure?.consumers?.columns?.includes('updated_at')) {
            selectFields.push('updated_at');
        }
        
        // CRITICAL FIX: Build consumer data with profile_photo_url ALWAYS included
        const consumerData = {
            username: userData.username,
            email: userData.email,
            mobile: userData.mobile,
            password: hashedPassword,
            status: 'active',
            profile_photo_url: profilePhotoUrl // ALWAYS included with value
        };

        // Only add timestamps if they exist (let DB handle defaults)
        if (tableStructure?.consumers?.columns?.includes('created_at')) {
            // Will use DB default
        }
        if (tableStructure?.consumers?.columns?.includes('updated_at')) {
            // Will use DB default
        }
        
        console.log('📝 Final consumer data to insert:', consumerData);
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
                console.error('The profile_photo_url column might not exist in the consumers table.');
                console.error('\n🛠️ FIX: Run this SQL in Supabase SQL Editor:');
                console.error(`ALTER TABLE consumers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT '';`);
            } else if (error.code === '23502') {
                console.error('\n🔧 NULL CONSTRAINT VIOLATION!');
                console.error('The profile_photo_url column has a NOT NULL constraint.');
                console.error('Current value being sent:', profilePhotoUrl);
                console.error('\n🛠️ FIX: Ensure profile_photo_url is always provided (even empty string)');
            } else if (error.code === '22P02') {
                console.error('\n🔧 INVALID TEXT REPRESENTATION!');
                console.error('This might be due to ID column type mismatch.');
                console.error('Ensure consumers.id column is BIGINT (int8) in database.');
            }
            
            throw error;
        }

        console.log('✅ Consumer saved successfully!');
        console.log(`✅ ID: ${data[0].id}`);
        console.log(`✅ Username: ${data[0].username}`);
        console.log(`✅ Email: ${data[0].email}`);
        
        // Check if profile_photo_url was returned
        if (data[0].profile_photo_url !== undefined) {
            const hasPhoto = !!data[0].profile_photo_url;
            console.log('📸 Photo URL saved in database:', hasPhoto ? 'Yes' : 'No (empty)');
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
        return { success: false, error: error.message };
    }
}

/**
 * Insert a new farmer into the database
 * @param {Object} farmerData - Farmer data
 * @returns {Promise<Object>} Result with success status and data
 */
async function insertFarmer(farmerData) {
    try {
        console.log('💾 Starting farmer registration...');
        
        const hashedPassword = await hashPassword(farmerData.password);
        
        // CRITICAL FIX: Always ensure profile_photo_url has a non-null value
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
                profilePhotoUrl = '';
            }
        } else if (photoData && photoData.includes('http')) {
            profilePhotoUrl = photoData;
            console.log('✅ Using existing farmer photo URL:', profilePhotoUrl);
        } else {
            console.log('⚠️ No valid photo data provided, using empty string');
            profilePhotoUrl = '';
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
        
        // Build SELECT fields based on what actually exists in the database
        const selectFields = ['id', 'username', 'email', 'mobile', 'farm_name', 'status'];

        // Only select columns if they exist
        if (tableStructure?.farmers?.columns?.includes('account_verified')) {
            selectFields.push('account_verified');
        }
        if (tableStructure?.farmers?.columns?.includes('created_at')) {
            selectFields.push('created_at');
        }
        if (tableStructure?.farmers?.columns?.includes('profile_photo_url')) {
            selectFields.push('profile_photo_url');
        }
        if (tableStructure?.farmers?.columns?.includes('updated_at')) {
            selectFields.push('updated_at');
        }
        
        // CRITICAL FIX: ALWAYS include profile_photo_url with value
        const farmerInsertData = {
            username: farmerData.username,
            email: farmerData.email,
            aadhaar_number: farmerData.aadhaar_number,
            mobile: farmerData.mobile,
            password: hashedPassword,
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
            status: 'active',
            profile_photo_url: profilePhotoUrl // ALWAYS included
        };

        // Only add account_verified if column exists
        if (tableStructure?.farmers?.columns?.includes('account_verified')) {
            farmerInsertData.account_verified = false;
        }
        
        console.log('📝 Final farmer data to insert:', Object.keys(farmerInsertData));
        console.log('📸 Profile photo URL:', farmerInsertData.profile_photo_url || '(empty string)');
        
        const { data, error } = await supabase
            .from('farmers')
            .insert([farmerInsertData])
            .select(selectFields.join(', '));

        if (error) {
            console.error('❌ Database insert error:', error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            
            if (error.code === '23502' && error.message.includes('profile_photo_url')) {
                console.error('\n❌ NULL constraint violation on profile_photo_url!');
                console.error('Value being sent:', farmerInsertData.profile_photo_url);
            }
            
            throw error;
        }

        console.log('✅ Farmer saved successfully!');
        console.log(`✅ ID: ${data[0].id}`);
        console.log(`✅ Profile Photo URL: ${data[0].profile_photo_url ? 'Provided' : 'Not provided'}`);
        
        return { success: true, data: data[0] };
        
    } catch (error) {
        console.error('❌ Error in insertFarmer:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    checkUserExists,
    checkTableStructure,
    checkBucketExists,
    uploadToSupabaseStorage,
    addMissingColumnToConsumers,
    insertConsumer,
    insertFarmer
};
