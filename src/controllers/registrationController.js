const { checkUserExists, checkBucketExists, addMissingColumnToConsumers, insertConsumer, insertFarmer } = require('../utils/database');

/**
 * POST /api/register/consumer - Register a new consumer
 */
async function registerConsumer(req, res) {
    try {
        const { username, email, mobile, password, profile_photo_base64, profile_photo_url } = req.body;
        
        console.log('👤 Consumer registration request:', { username, email, mobile });
        console.log('📸 Photo data present:', !!(profile_photo_base64 || profile_photo_url));
        
        if (!username || username.length < 3) {
            return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
        }
        
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Valid email address is required' });
        }
        
        if (!mobile || !/^\d{10}$/.test(mobile)) {
            return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' });
        }
        
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        
        const userExists = await checkUserExists(email, mobile);
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User with this email or mobile already exists' });
        }
        
        const consumersFix = await addMissingColumnToConsumers();
        if (!consumersFix.success && consumersFix.missingColumns?.includes('profile_photo_url')) {
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
        
        const result = await insertConsumer({ username, email, mobile, password, profile_photo_base64, profile_photo_url });
        
        if (!result.success) {
            let fixHint = '';
            if (result.error?.includes('profile_photo_url') || result.error?.includes('42703')) {
                fixHint = 'profile_photo_url column might be missing. Check /api/fix-consumers-columns';
            } else if (result.error?.includes('23502')) {
                fixHint = 'profile_photo_url NULL constraint violation. Ensure it always has a value (even empty string)';
            } else if (result.error?.includes('id')) {
                fixHint = 'Check if consumers.id column is BIGINT in database. Check /api/fix-consumers-id';
            }
            
            return res.status(500).json({ success: false, message: 'Failed to create account. Please try again.', error: result.error, fix_hint: fixHint });
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
            responseData.user.profile_photo_url = result.data.profile_photo_url || '';
            responseData.user.storage_note = result.data.profile_photo_url ? 'Profile photo stored in Supabase Storage' : 'No profile photo provided';
        } else {
            console.warn('⚠️ profile_photo_url not in response - column might not exist in table');
            responseData.user.profile_photo_url = '';
            responseData.user.note = 'profile_photo_url column might be missing in database';
        }
        
        if (result.data.created_at) responseData.user.created_at = result.data.created_at;
        if (result.data.updated_at) responseData.user.updated_at = result.data.updated_at;
        
        res.json(responseData);
        
    } catch (error) {
        console.error('❌ Consumer registration error:', error);
        res.status(500).json({ success: false, message: 'Registration failed. Please try again.', error: error.message });
    }
}

/**
 * POST /api/register/farmer - Register a new farmer
 */
async function registerFarmer(req, res) {
    try {
        const requiredFields = ['username', 'email', 'mobile', 'password', 'aadhaar_number', 'farm_name'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({ success: false, message: `Missing required fields: ${missingFields.join(', ')}` });
        }
        
        const { username, email, mobile, password, aadhaar_number } = req.body;
        
        if (username.length < 3) {
            return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
        }
        
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Valid email address is required' });
        }
        
        if (!/^\d{10}$/.test(mobile)) {
            return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        
        if (!/^\d{12}$/.test(aadhaar_number)) {
            return res.status(400).json({ success: false, message: 'Valid 12-digit Aadhaar number is required' });
        }
        
        const userExists = await checkUserExists(email, mobile);
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User with this email or mobile already exists' });
        }
        
        const bucketExists = await checkBucketExists();
        if (!bucketExists) {
            console.log('⚠️ Bucket not found - continuing registration without photo upload');
        }
        
        const result = await insertFarmer(req.body);
        
        if (!result.success) {
            return res.status(500).json({ success: false, message: 'Failed to create farmer account. Please try again.', error: result.error });
        }
        
        console.log('✅ Farmer registration completed successfully!');
        
        res.json({
            success: true,
            message: 'Farmer account created successfully!',
            user: {
                id: result.data.id,
                username: result.data.username,
                email: result.data.email,
                mobile: result.data.mobile,
                farm_name: result.data.farm_name,
                user_type: 'farmer',
                status: result.data.status,
                profile_photo_url: result.data.profile_photo_url || '',
                created_at: result.data.created_at
            }
        });
        
    } catch (error) {
        console.error('❌ Farmer registration error:', error);
        res.status(500).json({ success: false, message: 'Registration failed. Please try again.', error: error.message });
    }
}

module.exports = {
    registerConsumer,
    registerFarmer
};
