const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

// Import configurations
const supabase = require('./src/config/supabase');
const corsOptions = require('./src/config/cors');

// Import middleware
const requestLogger = require('./src/middleware/requestLogger');

// Import utilities
const { cleanupExpiredOTPs } = require('./src/utils/otp');
const { migratePlainTextPasswords } = require('./src/utils/password');
const { 
    checkBucketExists, 
    checkTableStructure, 
    addMissingColumnToConsumers,
    uploadToSupabaseStorage
} = require('./src/utils/database');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const otpRoutes = require('./src/routes/otpRoutes');
const registrationRoutes = require('./src/routes/registrationRoutes');

const app = express();

// ==================== MIDDLEWARE CONFIGURATION ====================
app.use(cors(corsOptions));
app.options('*', cors());

// Increase body size limit for image uploads
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use(requestLogger);

// ==================== ROUTES ====================
app.use('/api', authRoutes);
app.use('/api', otpRoutes);
app.use('/api', registrationRoutes);

// ==================== HEALTH CHECK ====================
app.get('/health', async (req, res) => {
    try {
        const { data, error } = await supabase.from('consumers').select('count').limit(1);
        res.json({
            success: true,
            message: 'Server is healthy',
            database: error ? 'disconnected' : 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server health check failed',
            error: error.message
        });
    }
});

// ==================== UTILITY ENDPOINTS ====================
app.get('/api/check-structure', async (req, res) => {
    try {
        const structure = await checkTableStructure();
        res.json({ success: true, structure });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/fix-consumers-id', async (req, res) => {
    try {
        const structure = await checkTableStructure();
        const consumersIdType = structure?.consumers?.idType || 'unknown';
        
        if (consumersIdType === 'bigint' || consumersIdType === 'bigint_string') {
            return res.json({
                success: true,
                message: 'Consumers table ID is already BIGINT',
                current_type: consumersIdType
            });
        }
        
        res.json({
            success: false,
            message: 'Consumers table ID needs to be changed to BIGINT',
            current_type: consumersIdType,
            sql_fix: `-- Run this SQL in Supabase SQL Editor
ALTER TABLE consumers ALTER COLUMN id TYPE BIGINT;`,
            instructions: 'Copy and run the SQL above in Supabase Dashboard → SQL Editor'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/fix-consumers-columns', async (req, res) => {
    try {
        const result = await addMissingColumnToConsumers();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/check-bucket', async (req, res) => {
    try {
        const exists = await checkBucketExists();
        res.json({
            success: exists,
            message: exists ? 'Bucket exists and is accessible' : 'Bucket not found',
            bucket_name: 'profile-photos'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/upload-photo', async (req, res) => {
    try {
        const { imageData, userType, userId } = req.body;
        
        if (!imageData || !userType || !userId) {
            return res.status(400).json({
                success: false,
                message: 'imageData, userType, and userId are required'
            });
        }
        
        const url = await uploadToSupabaseStorage(imageData, userType, userId);
        
        if (url) {
            res.json({ success: true, url });
        } else {
            res.status(500).json({ success: false, message: 'Upload failed' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/test-upload', async (req, res) => {
    try {
        const { imageData } = req.body;
        
        if (!imageData) {
            return res.status(400).json({ success: false, message: 'imageData is required' });
        }
        
        const testUserId = `test_${Date.now()}`;
        const url = await uploadToSupabaseStorage(imageData, 'test', testUserId);
        
        if (url) {
            res.json({ success: true, message: 'Test upload successful', url });
        } else {
            res.status(500).json({ success: false, message: 'Test upload failed' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== DEBUG ENDPOINTS ====================
app.get('/api/debug/storage', async (req, res) => {
    try {
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        
        if (bucketsError) {
            return res.status(500).json({ success: false, error: bucketsError.message });
        }
        
        const { data: files, error: filesError } = await supabase.storage
            .from('profile-photos')
            .list('', { limit: 10 });
        
        res.json({
            success: true,
            buckets: buckets || [],
            recent_files: files || [],
            files_error: filesError ? filesError.message : null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/debug/users', async (req, res) => {
    try {
        const { data: consumers, error: cError } = await supabase
            .from('consumers')
            .select('id, username, email, mobile, status, created_at')
            .limit(5);
        
        const { data: farmers, error: fError } = await supabase
            .from('farmers')
            .select('id, username, email, mobile, status, created_at')
            .limit(5);
        
        res.json({
            success: true,
            consumers: consumers || [],
            farmers: farmers || [],
            errors: {
                consumers: cError ? cError.message : null,
                farmers: fError ? fError.message : null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== PRODUCTS ENDPOINT ====================
app.get('/api/products', async (req, res) => {
    try {
        const { category, min_price, max_price, farmer_id } = req.query;
        
        let query = supabase.from('products').select('*');
        
        if (category) query = query.eq('category', category);
        if (min_price) query = query.gte('price', parseFloat(min_price));
        if (max_price) query = query.lte('price', parseFloat(max_price));
        if (farmer_id) query = query.eq('farmer_id', farmer_id);
        
        const { data, error } = await query;
        
        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
        
        res.json({
            success: true,
            count: data.length,
            products: data
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        res.json({ success: true, product: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== TOURS ENDPOINT ====================
app.get('/api/tours', async (req, res) => {
    try {
        const { farmer_id, min_price, max_price } = req.query;
        
        let query = supabase.from('tours').select('*');
        
        if (farmer_id) query = query.eq('farmer_id', farmer_id);
        if (min_price) query = query.gte('price_per_person', parseFloat(min_price));
        if (max_price) query = query.lte('price_per_person', parseFloat(max_price));
        
        const { data, error } = await query;
        
        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
        
        res.json({
            success: true,
            count: data.length,
            tours: data
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== PASSWORD MIGRATION ENDPOINT ====================
app.post('/api/migrate-passwords', async (req, res) => {
    try {
        await migratePlainTextPasswords();
        res.json({
            success: true,
            message: 'Password migration completed. Check server logs for details.'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ROOT ENDPOINT ====================
app.get('/', async (req, res) => {
    try {
        const structure = await checkTableStructure();
        const bucketExists = await checkBucketExists();
        
        res.json({
            success: true,
            message: 'FarmTrails OTP Server API',
            version: '2.0.0',
            status: 'operational',
            features: {
                authentication: 'bcrypt hashing',
                storage: bucketExists ? 'configured' : 'needs setup',
                otp: 'mobile and aadhaar verification',
                registration: 'consumer and farmer'
            },
            endpoints: {
                health: 'GET /health',
                login: 'POST /api/login',
                register_consumer: 'POST /api/register/consumer',
                register_farmer: 'POST /api/register/farmer',
                products: 'GET /api/products',
                tours: 'GET /api/tours',
                otp_mobile: 'POST /api/mobile/send-otp',
                otp_aadhaar: 'POST /api/aadhaar/send-otp'
            },
            database: {
                consumers_id_type: structure?.consumers?.idType || 'unknown',
                consumers_has_photo_column: structure?.consumers?.hasProfilePhotoUrl || false,
                farmers_id_type: structure?.farmers?.idType || 'unknown'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        requested: req.originalUrl,
        method: req.method,
        available_endpoints: [
            'GET /',
            'GET /health',
            'POST /api/login',
            'POST /api/register/consumer',
            'POST /api/register/farmer',
            'GET /api/products',
            'GET /api/tours'
        ]
    });
});

app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
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
    cleanupExpiredOTPs();
}, 5 * 60 * 1000); // Clean up every 5 minutes

// ==================== SERVER START ====================
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    console.log(`
    🚀 FarmTrails Complete Backend Server (Refactored)
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
        console.log('Photo uploads will fail but registration will still work.');
    }
    
    console.log('\n🔍 Checking table structure...');
    const structure = await checkTableStructure();
    const consumersFix = await addMissingColumnToConsumers();
    
    const consumersIdOk = structure?.consumers?.idType === 'bigint' || structure?.consumers?.idType === 'bigint_string';
    const consumersHasPhotoColumn = structure?.consumers?.hasProfilePhotoUrl;
    
    console.log(`
    📦 Storage: ${bucketExists ? '✅ Ready' : '❌ Manual setup required'}
    🆔 Consumers ID: ${consumersIdOk ? '✅ BIGINT' : `❌ ${structure?.consumers?.idType || 'Unknown'}`}
    📸 Profile Photo Column: ${consumersHasPhotoColumn ? '✅ Exists' : '❌ MISSING'}
    🔐 Security: ✅ Password hashing with bcrypt
    🌐 CORS: ✅ Configured
    
    ✅ Server is running with modular architecture!
    `);
});

module.exports = app;
