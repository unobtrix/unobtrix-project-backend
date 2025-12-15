const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

console.log('🔍 DEBUG: SUPABASE_URL =', supabaseUrl ? 'SET' : 'NOT SET');
console.log('🔍 DEBUG: SUPABASE_ANON_KEY =', supabaseKey ? 'SET (length: ' + (supabaseKey ? supabaseKey.length : 0) + ')' : 'NOT SET');

// Validate environment variables
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR: Missing required environment variables!');
    console.error('Required: SUPABASE_URL and SUPABASE_ANON_KEY');
    console.error('\n📋 Setup Instructions:');
    console.error('1. Get your Supabase credentials from: https://app.supabase.com/project/_/settings/api');
    console.error('2. Set SUPABASE_URL to your project URL (e.g., https://xxxxx.supabase.co)');
    console.error('3. Set SUPABASE_ANON_KEY to your anon/public key');
    console.error('\n🔧 On Render.com:');
    console.error('   Go to Dashboard → Environment → Add Environment Variable');
    
    // Only exit if not in test mode
    if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
    } else {
        // Return a mock client for testing
        console.warn('⚠️ Running in test mode with mock Supabase client');
        module.exports = null;
        return;
    }
}

// Validate URL format
if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    console.error('❌ ERROR: SUPABASE_URL must be a valid URL starting with http:// or https://');
    console.error('Current value:', supabaseUrl);
    process.exit(1);
}

// Validate key format (basic check - should be a long string)
if (supabaseKey.length < 20) {
    console.error('❌ ERROR: SUPABASE_ANON_KEY appears to be invalid (too short)');
    console.error('Expected: A long JWT-like string from Supabase dashboard');
    console.error('Current length:', supabaseKey.length);
    console.error('\n🔍 Check your Supabase dashboard:');
    console.error('   Settings → API → Project API keys → anon/public key');
    process.exit(1);
}

// Validate key format - should look like a JWT (eyJ...)
if (!supabaseKey.startsWith('eyJ')) {
    console.warn('⚠️ WARNING: SUPABASE_ANON_KEY does not look like a valid JWT token');
    console.warn('Expected format: eyJ... (should start with "eyJ")');
    console.warn('Current start:', supabaseKey.substring(0, 10));
    console.warn('This will likely cause "Invalid Compact JWS" errors');
}

let supabase;
try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client created successfully');
} catch (error) {
    console.error('❌ ERROR: Failed to create Supabase client');
    console.error('Error:', error.message);
    console.error('\n🔧 Possible issues:');
    console.error('1. Invalid SUPABASE_ANON_KEY format');
    console.error('2. Incorrect SUPABASE_URL');
    console.error('3. Network connectivity issues');
    process.exit(1);
}

module.exports = supabase;
