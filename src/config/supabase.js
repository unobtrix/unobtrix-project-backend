const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

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

module.exports = supabase;
