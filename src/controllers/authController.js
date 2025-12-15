const supabase = require('../config/supabase');
const { verifyPassword } = require('../utils/password');

/**
 * GET /api/login - Login endpoint information
 */
async function getLoginInfo(req, res) {
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
}

/**
 * POST /api/login - User login
 */
async function login(req, res) {
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
        
        // Generate a cryptographically secure token
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        
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
}

module.exports = {
    getLoginInfo,
    login
};
