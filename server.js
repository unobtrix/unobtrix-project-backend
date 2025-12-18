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

// Increase body size limit for image uploads
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Simple logging middleware
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.log('Origin:', req.headers.origin);
    next();
});

// ==================== SIMPLE TEST ENDPOINTS ====================
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        endpoints: [
            'GET /health',
            'GET /test-db',
            'POST /api/register/test'
        ]
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        server: 'FarmTrials Test Server',
        timestamp: new Date().toISOString()
    });
});

// Simple test registration endpoint
app.post('/api/register/test', (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        console.log('Test registration:', { username, email });
        
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username, email, and password are required'
            });
        }
        
        // Simulate database insert
        const mockUser = {
            id: Math.floor(Math.random() * 1000),
            username,
            email,
            created_at: new Date().toISOString()
        };
        
        res.json({
            success: true,
            message: 'Test registration successful!',
            user: mockUser,
            note: 'This is a mock response. Database not connected.'
        });
        
    } catch (error) {
        console.error('Test registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Test failed',
            error: error.message
        });
    }
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    🚀 FarmTrials Test Server
    📍 Port: ${PORT}
    ⏰ Started: ${new Date().toISOString()}
    
    ✅ Server is running WITHOUT database
    📋 Endpoints:
       GET  /              - Server info
       GET  /health        - Health check
       POST /api/register/test - Test registration
    `);
});