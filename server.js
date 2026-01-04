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

console.log('🔍 DEBUG: SUPABASE_URL =', supabaseUrl ? 'SET' : 'NOT SET');
console.log('🔍 DEBUG: SUPABASE_ANON_KEY =', supabaseKey ? 'SET' : 'NOT SET');

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR: Missing required environment variables!');
    console.error('Required: SUPABASE_URL and SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('🔗 Supabase connected');
// ================================================================

// ==================== CORS CONFIGURATION ====================
app.use(cors({
    origin: [
        'https://unobtrix1.netlify.app',
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
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

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

        if (!hashedPassword.startsWith('$2a$') && !hashedPassword.startsWith('$2b$') && !hashedPassword.startsWith('$2y$')) {
            console.log('❌ Stored password is not a valid bcrypt hash - possible plain text password');
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
        return false;
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
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('❌ Upload error:', error);
            if (error.message && error.message.includes('not found')) {
                console.error('❌ Bucket "profile-photos" not found!');
                console.error('\n⚠️ PLEASE CREATE BUCKET IN SUPABASE DASHBOARD:');
                console.error('1. Go to Storage → New bucket');
                console.error('2. Name: profile-photos');
                console.error('3. Public: ON');
                console.error('4. Create bucket and restart server');
            }
            return '';
        }

        const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filename);

        console.log('✅ Upload successful!');
        console.log('📸 Public URL:', publicUrl);
        
        return publicUrl;

    } catch (error) {
        console.error('❌ Unexpected upload error:', error);
        return '';
    }
}

// ==================== PRODUCT IMAGE UPLOAD ====================
async function uploadProductImage(base64Image, farmerId) {
    try {
        if (!base64Image || !base64Image.startsWith('data:image/')) {
            return '';
        }

        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const matches = base64Image.match(/^data:image\/(\w+);base64,/);
        const fileExt = matches ? matches[1] : 'jpg';
        const filename = `product_${farmerId}_${timestamp}_${randomString}.${fileExt}`;
        const bucketName = 'profile-photos';

        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const { error } = await supabase.storage
            .from(bucketName)
            .upload(filename, buffer, {
                contentType: `image/${fileExt}`,
                cacheControl: '3600',
                upsert: false
            });

        if (error) return '';

        const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filename);

        return publicUrl;
    } catch (err) {
        return '';
    }
}

// ==================== CHECK TABLE STRUCTURE ====================
async function checkTableStructure() {
    try {
        console.log('🔍 Checking table structure...');

        // Check farmers table
        const { data: farmersData, error: farmersError } = await supabase
            .from('farmers')
            .select('*')
            .limit(1);

        const farmerColumns = farmersData && farmersData.length > 0 ? Object.keys(farmersData[0]) : [];
        console.log('📊 Farmers columns:', farmerColumns);

        // Check consumers table
        const { data: consumersData, error: consumersError } = await supabase
            .from('consumers')
            .select('*')
            .limit(1);

        const consumerColumns = consumersData && consumersData.length > 0 ? Object.keys(consumersData[0]) : [];
        console.log('📊 Consumers columns:', consumerColumns);

        // Check consumers ID type
        let consumersIdType = 'unknown';
        if (consumersData && consumersData.length > 0) {
            const idValue = consumersData[0].id;
            const idType = typeof idValue;
            
            if (idType === 'number' && Number.isInteger(idValue)) {
                consumersIdType = 'bigint';
            } else if (idType === 'string' && /^\d+$/.test(idValue)) {
                consumersIdType = 'bigint_string';
            } else {
                consumersIdType = idType;
            }
            
            console.log('🆔 Consumers ID sample:', idValue, 'Type:', idType, 'Classified as:', consumersIdType);
        }

        return {
            farmers: {
                columns: farmerColumns,
                hasCreatedAt: farmerColumns.includes('created_at'),
                hasUpdatedAt: farmerColumns.includes('updated_at'),
                hasAccountVerified: farmerColumns.includes('account_verified'),
                hasProfilePhotoUrl: farmerColumns.includes('profile_photo_url'),
            },
            consumers: {
                columns: consumerColumns,
                hasCreatedAt: consumerColumns.includes('created_at'),
                hasUpdatedAt: consumerColumns.includes('updated_at'),
                hasProfilePhotoUrl: consumerColumns.includes('profile_photo_url'),
                idType: consumersIdType
            }
        };
    } catch (error) {
        console.error('❌ Error checking table structure:', error);
        return null;
    }
}

// ==================== REGISTRATION WITH IMAGE UPLOAD ====================
async function insertConsumer(userData) {
    try {
        console.log('📝 insertConsumer called with data');
        console.log('📸 Has photo data:', !!userData.profile_photo_base64 || !!userData.profile_photo_url);

        // CRITICAL FIX: Always ensure profile_photo_url has a non-null value
        let profilePhotoUrl = '';
        
        const photoData = userData.profile_photo_base64 || userData.profile_photo_url;
        
        if (photoData) {
            console.log('📸 Processing profile photo upload to storage...');
            
            if (photoData.startsWith('data:image/')) {
                console.log('📤 Uploading base64 image to Supabase Storage...');
                profilePhotoUrl = await uploadToSupabaseStorage(
                    photoData,
                    'consumer',
                    userData.id || Date.now()
                );
                console.log('📸 Upload result:', profilePhotoUrl ? 'Success' : 'Failed');
            } else if (photoData.startsWith('http://') || photoData.startsWith('https://')) {
                console.log('🔗 Using provided URL directly');
                profilePhotoUrl = photoData;
            }
        }

        console.log('📸 Final profile_photo_url value:', profilePhotoUrl || '(empty string)');

        // Hash the password
        const hashedPassword = await hashPassword(userData.password);
        console.log('🔐 Password hashed successfully');

        const consumerPayload = {
            username: userData.username || userData.name,
            email: userData.email.toLowerCase().trim(),
            mobile: userData.mobile,
            password: hashedPassword,
            status: userData.status || 'active',
            profile_photo_url: profilePhotoUrl || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        console.log('📦 Consumer payload prepared:', {
            ...consumerPayload,
            password: '[HIDDEN]',
            profile_photo_url: consumerPayload.profile_photo_url ? 'SET' : 'EMPTY'
        });

        console.log('💾 Inserting into database...');
        const { data, error } = await supabase
            .from('consumers')
            .insert([consumerPayload])
            .select()
            .single();

        if (error) {
            console.error('❌ Database insert error:', error);
            throw error;
        }

        console.log('✅ Consumer inserted successfully');
        console.log('🆔 New consumer ID:', data.id);
        console.log('📸 Stored profile_photo_url:', data.profile_photo_url || '(empty)');

        return {
            success: true,
            consumer: data,
            profile_photo_url: data.profile_photo_url || ''
        };

    } catch (error) {
        console.error('❌ Error in insertConsumer:', error);
        throw error;
    }
}

// ==================== NEW FUNCTION: ADD MISSING COLUMN TO CONSUMERS ====================
async function addMissingColumnToConsumers() {
    try {
        console.log('🔍 Checking consumers table for missing columns...');
        
        const { data, error } = await supabase
            .from('consumers')
            .select('*')
            .limit(1);

        if (error) {
            console.error('❌ Error checking consumers table:', error);
            return {
                success: false,
                error: error.message
            };
        }

        const columns = data && data.length > 0 ? Object.keys(data[0]) : [];
        const missingColumns = [];
        
        if (!columns.includes('profile_photo_url')) {
            missingColumns.push('profile_photo_url');
        }
        if (!columns.includes('created_at')) {
            missingColumns.push('created_at');
        }
        if (!columns.includes('updated_at')) {
            missingColumns.push('updated_at');
        }

        if (missingColumns.length > 0) {
            console.log('⚠️ Missing columns:', missingColumns);
            return {
                success: false,
                missingColumns: missingColumns,
                sql_fix: `ALTER TABLE consumers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT '';\nALTER TABLE consumers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();\nALTER TABLE consumers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();`
            };
        }

        console.log('✅ All required columns exist');
        return {
            success: true,
            message: 'All required columns exist'
        };

    } catch (error) {
        console.error('❌ Error in addMissingColumnToConsumers:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function insertFarmer(farmerData) {
    try {
        console.log('📝 insertFarmer called');
        console.log('📸 Has photo data:', !!farmerData.profile_photo_base64 || !!farmerData.profile_photo_url);

        let profilePhotoUrl = '';
        
        const photoData = farmerData.profile_photo_base64 || farmerData.profile_photo_url;
        
        if (photoData) {
            console.log('📸 Processing farmer photo upload...');
            
            if (photoData.startsWith('data:image/')) {
                profilePhotoUrl = await uploadToSupabaseStorage(
                    photoData,
                    'farmer',
                    farmerData.id || Date.now()
                );
            } else if (photoData.startsWith('http://') || photoData.startsWith('https://')) {
                profilePhotoUrl = photoData;
            }
        }

        // Hash the password
        const hashedPassword = await hashPassword(farmerData.password);

        const farmerPayload = {
            username: farmerData.username || farmerData.name,
            email: farmerData.email.toLowerCase().trim(),
            mobile: farmerData.mobile,
            password: hashedPassword,
            status: farmerData.status || 'pending_verification',
            profile_photo_url: profilePhotoUrl || '',
            farm_name: farmerData.farm_name || '',
            farm_size: farmerData.farm_size || '',
            specialization: farmerData.specialization || '',
            village: farmerData.village || '',
            taluka: farmerData.taluka || '',
            district: farmerData.district || '',
            state: farmerData.state || '',
            pin_code: farmerData.pin_code || '',
            account_holder_name: farmerData.account_holder_name || '',
            bank_name: farmerData.bank_name || '',
            branch_name: farmerData.branch_name || '',
            account_verified: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        console.log('💾 Inserting farmer into database...');
        const { data, error } = await supabase
            .from('farmers')
            .insert([farmerPayload])
            .select()
            .single();

        if (error) {
            console.error('❌ Farmer insert error:', error);
            throw error;
        }

        console.log('✅ Farmer inserted successfully, ID:', data.id);

        return {
            success: true,
            farmer: data,
            profile_photo_url: data.profile_photo_url || ''
        };

    } catch (error) {
        console.error('❌ Error in insertFarmer:', error);
        throw error;
    }
}

// ==================== HEALTH CHECK ====================
app.get('/health', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('farmers')
            .select('count')
            .limit(1);

        if (error) {
            return res.status(503).json({
                status: 'unhealthy',
                database: 'disconnected',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            status: 'healthy',
            database: 'connected',
            supabase: {
                url: supabaseUrl ? 'configured' : 'missing',
                key: supabaseKey ? 'configured' : 'missing'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==================== LOGIN ENDPOINTS ====================
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
            .select(userType === 'farmer' 
                ? 'id, username, email, mobile, password, status, profile_photo_url, farm_name, farm_size, specialization, village, taluka, district, state, pin_code, account_holder_name, bank_name, branch_name'
                : 'id, username, email, password, status, profile_photo_url'
            )
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
            console.log('📊 Checked table:', tableName);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                debug: `No ${tableName} account found with this email`
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
        
        // Remove password from response (define before logging)
        const { password: _, ...safeUser } = user;

        console.log('📦 User data returned:', {
            id: safeUser.id,
            username: safeUser.username,
            email: safeUser.email,
            status: safeUser.status,
            fields_count: Object.keys(safeUser).length
        });
        
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
            } else if (result.error?.includes('23502')) {
                fixHint = 'profile_photo_url NULL constraint violation. Ensure it always has a value (even empty string)';
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
            responseData.user.profile_photo_url = result.data.profile_photo_url || '';
            responseData.user.storage_note = result.data.profile_photo_url ? 
                'Profile photo stored in Supabase Storage' : 
                'No profile photo provided';
        } else {
            console.warn('⚠️ profile_photo_url not in response - column might not exist in table');
            responseData.user.profile_photo_url = '';
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
            responseData.farmer.profile_photo_url = result.data.profile_photo_url || '';
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

// ==================== PRODUCTS ENDPOINT ====================
// GET all products with filters
app.get('/api/products', async (req, res) => {
    try {
        console.log('📦 Fetching products...');
        
        const { 
            search, 
            category, 
            farmer_id, 
            limit = 50, 
            offset = 0,
            sort_by = 'created_at',
            sort_order = 'desc'
        } = req.query;

        let query = supabase
            .from('products')
            .select(`*, farmers (id, name, location, phone)`)
            .eq('is_active', true)
            .range(offset, offset + parseInt(limit) - 1);

        // Apply filters
        if (search && search.trim()) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`);
        }

        if (category && category !== 'all') {
            query = query.eq('category', category);
        }

        if (farmer_id) {
            query = query.eq('farmer_id', farmer_id);
        }

        // Apply sorting
        if (sort_by && ['name', 'price', 'created_at', 'stock_quantity'].includes(sort_by)) {
            query = query.order(sort_by, { ascending: sort_order === 'asc' });
        }

        const { data: products, error, count } = await query;
        
        if (error) {
            console.error('❌ Error fetching products:', error);
            return res.status(500).json({ 
                error: 'Failed to fetch products',
                details: error.message 
            });
        }

        console.log(`✅ Found ${products?.length || 0} products`);
        
        res.json({
            success: true,
            data: products || [],
            count: products?.length || 0,
            total: count,
            filters: {
                search: search || null,
                category: category || null,
                farmer_id: farmer_id || null,
                limit: parseInt(limit),
                offset: parseInt(offset),
                sort_by,
                sort_order
            }
        });

    } catch (error) {
        console.error('❌ Unexpected error in products endpoint:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// Get single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📦 Fetching product ${id}...`);

        const { data: product, error } = await supabase
            .from('products')
            .select(`*, farmers (id, name, location, phone, email)`)
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) {
            console.error('❌ Error fetching product:', error);
            return res.status(500).json({ 
                error: 'Failed to fetch product',
                details: error.message 
            });
        }

        if (!product) {
            return res.status(404).json({ 
                error: 'Product not found' 
            });
        }

        console.log(`✅ Found product: ${product.name}`);
        
        res.json({
            success: true,
            data: product
        });

    } catch (error) {
        console.error('❌ Unexpected error in product endpoint:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// POST new product with image upload
app.post("/api/products", async (req, res) => {
    try {
        const {
            farmer_id,
            name,
            description,
            category,
            price,
            stock,
            unit,
            is_organic = false,
            location,
            status = "active",
            fulfillment_status = "not_sent",
            images = []
        } = req.body;

        if (!farmer_id || !name || !price) {
            return res.status(400).json({
                success: false,
                message: "farmer_id, name, and price are required"
            });
        }

        // Upload images
        const uploadedImages = [];
        
        for (const img of images) {
            if (img.startsWith("data:image/")) {
                const url = await uploadProductImage(img, farmer_id);
                if (url) uploadedImages.push(url);
            } else {
                uploadedImages.push(img); // already URL
            }
        }

        const { data, error } = await supabase
            .from("products")
            .insert([{
                farmer_id,
                name,
                description,
                category,
                price,
                stock,
                unit,
                is_organic,
                location,
                status,
                fulfillment_status,
                image_url: uploadedImages, // TEXT[] or JSONB
                is_active: true,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            console.error("Insert error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to create product",
                error: error.message
            });
        }

        res.json({
            success: true,
            message: "Product created successfully",
            product: data
        });

    } catch (err) {
        console.error("POST /api/products error:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});

// PUT update product
app.put("/api/products/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const updateObj = {
            ...req.body,
            updated_at: new Date().toISOString()
        };

        delete updateObj.id;
        delete updateObj.farmer_id;

        const { data, error } = await supabase
            .from("products")
            .update(updateObj)
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: "Product updated",
            product: data
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to update product"
        });
    }
});

// DELETE product
app.delete("/api/products/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from("products")
            .delete()
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: "Product deleted",
            product: data
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to delete product"
        });
    }
});

// GET public products for consumers
app.get("/api/public/products", async (req, res) => {
    try {
        const { category, is_organic } = req.query;

        let query = supabase
            .from("products")
            .select("*")
            .eq("is_active", true)
            .eq("status", "active")
            .order("created_at", { ascending: false });

        if (category) query = query.eq("category", category);
        if (is_organic !== undefined)
            query = query.eq("is_organic", is_organic === "true");

        const { data, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            count: data.length,
            products: data
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch products"
        });
    }
});

// GET single public product
app.get("/api/public/products/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "product id is required"
            });
        }

        const { data, error } = await supabase
            .from("products")
            .select(`
                id,
                name,
                description,
                category,
                price,
                stock,
                unit,
                image_url,
                is_organic,
                location,
                status,
                fulfillment_status,
                farmer_id,
                created_at
            `)
            .eq("id", id)
            .eq("is_active", true)
            .eq("status", "active")
            .single();

        if (error || !data) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.json({
            success: true,
            product: data
        });

    } catch (err) {
        console.error("GET /api/public/products/:id error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});

// Update fulfillment status
app.put("/api/products/:id/fulfillment", async (req, res) => {
    try {
        const { id } = req.params;
        const { fulfillment_status } = req.body;

        const allowed = ["not_sent", "pending", "in_transit", "received"];

        if (!allowed.includes(fulfillment_status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid fulfillment status"
            });
        }

        const { data, error } = await supabase
            .from("products")
            .update({ fulfillment_status })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            product: data
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to update fulfillment"
        });
    }
});

// ==================== TOURS ENDPOINT ====================
app.get('/api/tours', async (req, res) => {
    try {
        console.log('🎢 Fetching tours...');
        
        const { 
            search, 
            farmer_id, 
            limit = 20, 
            offset = 0,
            sort_by = 'created_at',
            sort_order = 'desc'
        } = req.query;

        let query = supabase
            .from('tours')
            .select(`*, farmers (id, name, location, phone)`)
            .eq('is_active', true)
            .range(offset, offset + parseInt(limit) - 1);

        // Apply filters
        if (search && search.trim()) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
        }

        if (farmer_id) {
            query = query.eq('farmer_id', farmer_id);
        }

        // Apply sorting
        if (sort_by && ['name', 'price', 'created_at', 'duration'].includes(sort_by)) {
            query = query.order(sort_by, { ascending: sort_order === 'asc' });
        }

        const { data: tours, error, count } = await query;
        
        if (error) {
            console.error('❌ Error fetching tours:', error);
            return res.status(500).json({ 
                error: 'Failed to fetch tours',
                details: error.message 
            });
        }

        console.log(`✅ Found ${tours?.length || 0} tours`);
        
        res.json({
            success: true,
            data: tours || [],
            count: tours?.length || 0,
            total: count,
            filters: {
                search: search || null,
                farmer_id: farmer_id || null,
                limit: parseInt(limit),
                offset: parseInt(offset),
                sort_by,
                sort_order
            }
        });

    } catch (error) {
        console.error('❌ Unexpected error in tours endpoint:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// ==================== PROFILE ENDPOINTS ====================

// GET farmer profile by ID
app.get('/api/farmer/profile/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🌾 Fetching farmer profile for ID: ${id}`);

        const { data, error } = await supabase
            .from('farmers')
            .select('id, name, full_name, email, mobile, farm_name, location, phone, avatar_url, profile_photo_url, role, created_at, updated_at')
            .eq('id', id)
            .single();

        if (error) {
            console.error('❌ Error fetching farmer profile:', error);
            return res.status(404).json({
                success: false,
                message: 'Farmer profile not found',
                error: error.message
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Farmer profile not found'
            });
        }

        // Format the response
        const profile = {
            id: data.id,
            full_name: data.full_name || data.name,
            name: data.name || data.full_name,
            email: data.email,
            mobile: data.mobile,
            phone: data.phone,
            farm_name: data.farm_name,
            location: data.location,
            role: data.role || 'farmer',
            avatar_url: data.avatar_url || data.profile_photo_url || '',
            profile_photo_url: data.profile_photo_url || data.avatar_url || '',
            created_at: data.created_at,
            updated_at: data.updated_at
        };

        console.log('✅ Farmer profile fetched successfully');
        res.json({
            success: true,
            profile: profile
        });

    } catch (err) {
        console.error('❌ GET /api/farmer/profile/:id error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch farmer profile',
            error: err.message
        });
    }
});

// GET customer profile by ID
app.get('/api/customer/profile/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`👤 Fetching customer profile for ID: ${id}`);

        const { data, error } = await supabase
            .from('consumers')
            .select('id, name, full_name, email, mobile, phone, avatar_url, profile_photo_url, location, created_at, updated_at')
            .eq('id', id)
            .single();

        if (error) {
            console.error('❌ Error fetching customer profile:', error);
            return res.status(404).json({
                success: false,
                message: 'Customer profile not found',
                error: error.message
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Customer profile not found'
            });
        }

        // Format the response
        const profile = {
            id: data.id,
            full_name: data.full_name || data.name,
            name: data.name || data.full_name,
            email: data.email,
            mobile: data.mobile,
            phone: data.phone,
            location: data.location,
            avatar_url: data.avatar_url || data.profile_photo_url || '',
            profile_photo_url: data.profile_photo_url || data.avatar_url || '',
            created_at: data.created_at,
            updated_at: data.updated_at
        };

        console.log('✅ Customer profile fetched successfully');
        res.json({
            success: true,
            profile: profile
        });

    } catch (err) {
        console.error('❌ GET /api/customer/profile/:id error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customer profile',
            error: err.message
        });
    }
});

// UPDATE farmer profile
app.put('/api/farmer/profile/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        console.log(`🌾 Updating farmer profile for ID: ${id}`);

        // Remove sensitive fields that shouldn't be updated directly
        delete updateData.id;
        delete updateData.password;
        delete updateData.created_at;

        // Set updated_at timestamp
        updateData.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('farmers')
            .update(updateData)
            .eq('id', id)
            .select('id, name, full_name, email, mobile, farm_name, location, phone, avatar_url, profile_photo_url, role, created_at, updated_at')
            .single();

        if (error) {
            console.error('❌ Error updating farmer profile:', error);
            return res.status(400).json({
                success: false,
                message: 'Failed to update farmer profile',
                error: error.message
            });
        }

        console.log('✅ Farmer profile updated successfully');
        res.json({
            success: true,
            message: 'Farmer profile updated successfully',
            profile: data
        });

    } catch (err) {
        console.error('❌ PUT /api/farmer/profile/:id error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to update farmer profile',
            error: err.message
        });
    }
});

// UPDATE customer profile
app.put('/api/customer/profile/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        console.log(`👤 Updating customer profile for ID: ${id}`);

        // Remove sensitive fields that shouldn't be updated directly
        delete updateData.id;
        delete updateData.password;
        delete updateData.created_at;

        // Set updated_at timestamp
        updateData.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('consumers')
            .update(updateData)
            .eq('id', id)
            .select('id, name, full_name, email, mobile, phone, avatar_url, profile_photo_url, location, created_at, updated_at')
            .single();

        if (error) {
            console.error('❌ Error updating customer profile:', error);
            return res.status(400).json({
                success: false,
                message: 'Failed to update customer profile',
                error: error.message
            });
        }

        console.log('✅ Customer profile updated successfully');
        res.json({
            success: true,
            message: 'Customer profile updated successfully',
            profile: data
        });

    } catch (err) {
        console.error('❌ PUT /api/customer/profile/:id error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to update customer profile',
            error: err.message
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
                photo_saving: 'Fixed profile_photo_url NOT NULL handling',
                login: 'Email/password authentication (GET & POST)',
                cors: 'Configured for Netlify and localhost',
                products: 'Product catalog with filters and CRUD',
                tours: 'Tour listings with filters'
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
                },
                products: {
                    get_all: 'GET /api/products',
                    get_single: 'GET /api/products/:id',
                    create: 'POST /api/products',
                    update: 'PUT /api/products/:id',
                    delete: 'DELETE /api/products/:id',
                    public_all: 'GET /api/public/products',
                    public_single: 'GET /api/public/products/:id',
                    fulfillment: 'PUT /api/products/:id/fulfillment'
                },
                tours: 'GET /api/tours',
                migrate_passwords: 'POST /api/migrate-passwords',
                profiles: {
                    get_farmer: 'GET /api/farmer/profile/:id',
                    update_farmer: 'PUT /api/farmer/profile/:id',
                    get_customer: 'GET /api/customer/profile/:id',
                    update_customer: 'PUT /api/customer/profile/:id'
                }
            },
            critical_check: structure?.consumers?.hasProfilePhotoUrl ? 
                '✅ profile_photo_url column exists with NOT NULL constraint' : 
                '❌ profile_photo_url column missing - run /api/fix-consumers-columns'
        });
    } catch (error) {
        res.json({
            server: 'FarmTrials Registration API',
            status: 'operational',
            error: error.message
        });
    }
});

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
            'GET /api/debug/users',
            'GET /api/products',
            'GET /api/tours',
            'GET /api/farmer/profile/:id',
            'PUT /api/farmer/profile/:id',
            'GET /api/customer/profile/:id',
            'PUT /api/customer/profile/:id'
        ],
        timestamp: new Date().toISOString()
    });
});

app.use((err, req, res, next) => {
    console.error('💥 Server error:', err);
    console.error('Error stack:', err.stack);
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
}, 60 * 60 * 1000); // Clean up every hour

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
    📸 Profile Photo Column: ${consumersHasPhotoColumn ? '✅ Exists with NOT NULL' : '❌ MISSING - photos won\'t save!'}
    🕒 Timestamps: ${structure?.farmers?.hasCreatedAt ? '✅ created_at exists' : '❌ created_at missing'}
    ✅ Account Verified: ${structure?.farmers?.hasAccountVerified ? '✅ Column exists' : '❌ Column missing'}
    🔐 Login System: ✅ Email/password authentication ready (GET & POST)
    🔒 Security: Password hashing with bcrypt
    🌐 CORS: Configured for Netlify and localhost
    📦 Products: ✅ Full CRUD with image upload
    🎢 Tours: ✅ Listings with filters
    👤 Profiles: ✅ Farmer & Customer profile management
    
    ${!consumersIdOk ? `
    ⚠️ CRITICAL: Consumers table id must be BIGINT (int8)
    Visit: GET /api/fix-consumers-id for SQL commands
    ` : ''}
    
    ${!consumersHasPhotoColumn ? `
    ⚠️ CRITICAL: Consumers table missing profile_photo_url column
    Visit: GET /api/fix-consumers-columns for SQL commands
    ` : ''}
    
    ✅ Server is running with ALL functionality!
    
    📋 Available endpoints:
       GET  /                          - Server info
       GET  /health                    - Health check
       GET  /api/login                 - Login endpoint info (GET)
       POST /api/login                 - User login (POST)
       GET  /api/products              - Get all products (with filters)
       POST /api/products              - Create new product with images
       GET  /api/products/:id          - Get single product by ID
       PUT  /api/products/:id          - Update product
       DELETE /api/products/:id        - Delete product
       GET  /api/public/products       - Public products for consumers
       GET  /api/public/products/:id   - Public single product
       PUT  /api/products/:id/fulfillment - Update fulfillment status
       GET  /api/tours                 - Get all tours (with filters)
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
       POST /api/test-upload           - Test image upload
       POST /api/upload-photo          - Upload profile photo
       GET  /api/farmer/profile/:id    - Get farmer profile
       PUT  /api/farmer/profile/:id    - Update farmer profile
       GET  /api/customer/profile/:id  - Get customer profile
       PUT  /api/customer/profile/:id  - Update customer profile
    `);
});

module.exports = app;
