const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

// ==================== CORS CONFIGURATION ====================
app.use(cors({
    origin: '*', // Allow all origins for testing
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.options('*', cors());

// Body parser
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Simple logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// ==================== TEST ENDPOINTS ====================
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'FarmTrials Test Server is running!',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: [
            'GET /health - Server health check',
            'GET /test-supabase - Test Supabase connection',
            'POST /api/register/test - Test registration',
            'POST /api/login/test - Test login',
            'GET /api/check-env - Check environment variables'
        ]
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        success: true,
        status: 'healthy',
        server: 'FarmTrials Test Server',
        timestamp: new Date().toISOString()
    });
});

// Check environment variables (safely)
app.get('/api/check-env', (req, res) => {
    res.json({
        success: true,
        env_check: {
            PORT: process.env.PORT || 'Not set (default: 5000)',
            NODE_ENV: process.env.NODE_ENV || 'Not set',
            SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'SET (first 10 chars): ' + process.env.SUPABASE_ANON_KEY.substring(0, 10) + '...' : 'NOT SET'
        }
    });
});

// Test Supabase connection endpoint
app.get('/test-supabase', async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        console.log('Testing Supabase connection...');
        console.log('URL:', supabaseUrl ? 'Present' : 'Missing');
        console.log('Key:', supabaseKey ? 'Present' : 'Missing');
        
        if (!supabaseUrl || !supabaseKey) {
            return res.json({
                success: false,
                message: 'Missing Supabase environment variables',
                env_vars: {
                    SUPABASE_URL: supabaseUrl ? '✓ SET' : '✗ MISSING',
                    SUPABASE_ANON_KEY: supabaseKey ? '✓ SET' : '✗ MISSING'
                },
                fix: 'Add SUPABASE_URL and SUPABASE_ANON_KEY to your Render environment variables'
            });
        }
        
        // Create Supabase client
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Test with a simple query
        const { data, error } = await supabase
            .from('test_consumers')
            .select('count')
            .limit(1);
        
        if (error) {
            // Try to create test table if it doesn't exist
            console.log('Error:', error.message);
            
            if (error.message.includes('does not exist')) {
                return res.json({
                    success: false,
                    message: 'Table test_consumers does not exist',
                    error: error.message,
                    instructions: 'Run the SQL in the next response to create the table'
                });
            }
            
            return res.json({
                success: false,
                message: 'Supabase connection error',
                error: error.message,
                error_code: error.code,
                details: 'Check your Supabase credentials and project settings'
            });
        }
        
        res.json({
            success: true,
            message: '✅ Supabase connected successfully!',
            test_query_result: data || [],
            supabase_info: {
                url: supabaseUrl,
                key_length: supabaseKey.length
            }
        });
        
    } catch (error) {
        console.error('Supabase test error:', error);
        res.status(500).json({
            success: false,
            message: 'Supabase test failed',
            error: error.message,
            stack: error.stack
        });
    }
});

// Create test table endpoint
app.get('/api/create-test-table', async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Run this SQL in Supabase SQL Editor:',
            sql: `
-- Create test table
CREATE TABLE IF NOT EXISTS test_consumers (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert test data
INSERT INTO test_consumers (username, email, password) 
VALUES ('testuser', 'test@example.com', 'password123')
ON CONFLICT (email) DO NOTHING;

-- Disable RLS for testing
ALTER TABLE test_consumers DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON test_consumers TO anon, authenticated;
GRANT USAGE ON SEQUENCE test_consumers_id_seq TO anon, authenticated;

-- Verify
SELECT * FROM test_consumers;
            `
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Test registration
app.post('/api/register/test', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        console.log('Test registration request:', { username, email });
        
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username, email, and password are required'
            });
        }
        
        // Test Supabase if credentials exist
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            try {
                const { data, error } = await supabase
                    .from('test_consumers')
                    .insert([{ username, email, password }])
                    .select();
                
                if (error) {
                    console.error('Supabase insert error:', error);
                    throw error;
                }
                
                return res.json({
                    success: true,
                    message: '✅ User registered in database!',
                    user: data[0],
                    database: 'Supabase',
                    timestamp: new Date().toISOString()
                });
                
            } catch (dbError) {
                console.log('Falling back to mock registration due to DB error:', dbError.message);
            }
        }
        
        // Fallback mock response
        const mockUser = {
            id: Math.floor(Math.random() * 1000),
            username,
            email,
            created_at: new Date().toISOString()
        };
        
        res.json({
            success: true,
            message: '✅ Test registration successful!',
            user: mockUser,
            database: 'Mock (no database connection)',
            note: 'To enable real database, set SUPABASE_URL and SUPABASE_ANON_KEY environment variables',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

// Test login
app.post('/api/login/test', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('Test login request:', { email });
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
        
        res.json({
            success: true,
            message: '✅ Test login successful!',
            user: {
                id: 1,
                username: 'testuser',
                email: email,
                token: 'test_token_' + Date.now()
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
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
            'GET /test-supabase',
            'GET /api/check-env',
            'GET /api/create-test-table',
            'POST /api/register/test',
            'POST /api/login/test'
        ]
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: err.message
    });
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`
    🚀 FarmTrials Test Server
    📍 Port: ${PORT}
    ⏰ Started: ${new Date().toISOString()}
    
    📋 Endpoints:
       GET  /                      - Server info
       GET  /health                - Health check
       GET  /test-supabase         - Test Supabase connection
       GET  /api/check-env         - Check environment variables
       GET  /api/create-test-table - Get SQL to create test table
       POST /api/register/test     - Test registration
       POST /api/login/test        - Test login
    `);
    
    // Log environment check
    console.log('\n🔍 Environment check:');
    console.log('PORT:', process.env.PORT || 'Not set (using 5000)');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ SET' : '✗ NOT SET');
    console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✓ SET' : '✗ NOT SET');
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.log('\n⚠️  WARNING: Supabase credentials not set!');
        console.log('To enable database features, add these to Render environment variables:');
        console.log('1. SUPABASE_URL - Your Supabase project URL');
        console.log('2. SUPABASE_ANON_KEY - Your Supabase anon key');
        console.log('\nYou can still test registration without database.');
    }
});