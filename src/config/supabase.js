const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

console.log('🔍 DEBUG: SUPABASE_URL =', supabaseUrl ? 'SET' : 'NOT SET');
console.log('🔍 DEBUG: SUPABASE_ANON_KEY =', supabaseKey ? 'SET' : 'NOT SET');

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR: Missing required environment variables!');
    console.error('Required: SUPABASE_URL and SUPABASE_ANON_KEY');
    
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

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔗 Supabase connected');

module.exports = supabase;
