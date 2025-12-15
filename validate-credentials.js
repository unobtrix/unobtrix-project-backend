#!/usr/bin/env node
/**
 * Supabase Credentials Validator
 * 
 * This script helps you validate your Supabase credentials locally
 * before deploying to Render.
 * 
 * Usage:
 *   node validate-credentials.js
 * 
 * Make sure to set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file first.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Constants for Supabase JWT key validation
// Supabase anon keys are JWT tokens that typically:
// - Start with "eyJ" (base64 encoded JWT header)
// - Are at least 100 characters (minimum valid JWT length)
// - Are typically 200+ characters for Supabase anon keys
const MIN_KEY_LENGTH = 100;  // Minimum length for a valid JWT key
const EXPECTED_KEY_LENGTH = 200;  // Typical length for Supabase anon key

console.log('\n🔍 Supabase Credentials Validator\n');
console.log('='.repeat(60));

// Step 1: Check if environment variables are set
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

console.log('\n📋 Step 1: Checking environment variables...\n');

if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL is not set!');
    console.error('   Add it to your .env file or set it in Render environment variables');
    process.exit(1);
} else {
    console.log('✅ SUPABASE_URL is set');
    console.log('   Value:', supabaseUrl);
}

if (!supabaseKey) {
    console.error('❌ SUPABASE_ANON_KEY is not set!');
    console.error('   Add it to your .env file or set it in Render environment variables');
    process.exit(1);
} else {
    console.log('✅ SUPABASE_ANON_KEY is set');
    console.log('   Length:', supabaseKey.length, 'characters');
    console.log('   First 10 chars:', supabaseKey.substring(0, 10));
    console.log('   Last 10 chars:', supabaseKey.substring(supabaseKey.length - 10));
}

// Step 2: Validate URL format
console.log('\n📋 Step 2: Validating URL format...\n');

if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    console.error('❌ SUPABASE_URL must start with http:// or https://');
    process.exit(1);
}

if (!supabaseUrl.includes('supabase')) {
    console.warn('⚠️  WARNING: URL does not contain "supabase" - is this correct?');
}

console.log('✅ URL format looks valid');

// Step 3: Validate key format
console.log('\n📋 Step 3: Validating key format...\n');

if (!supabaseKey.startsWith('eyJ')) {
    console.error('❌ SUPABASE_ANON_KEY should start with "eyJ" (JWT format)');
    console.error('   Current start:', supabaseKey.substring(0, 10));
    console.error('\n💡 Make sure you copied the "anon public" key from Supabase dashboard');
    console.error('   NOT the "service_role" key!');
    process.exit(1);
}

if (supabaseKey.length < MIN_KEY_LENGTH) {
    console.error(`❌ SUPABASE_ANON_KEY is too short (expected ${EXPECTED_KEY_LENGTH}+ characters)`);
    console.error('   Current length:', supabaseKey.length);
    console.error('\n💡 The key might have been truncated during copy/paste');
    process.exit(1);
}

console.log('✅ Key format looks valid (starts with eyJ, good length)');

// Step 4: Test Supabase connection
console.log('\n📋 Step 4: Testing Supabase connection...\n');

let supabase;
try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client created successfully');
} catch (error) {
    console.error('❌ Failed to create Supabase client:', error.message);
    process.exit(1);
}

// Step 5: Test database query
console.log('\n📋 Step 5: Testing database access...\n');

(async () => {
    try {
        const { data, error } = await supabase
            .from('consumers')
            .select('id')
            .limit(1);
        
        if (error) {
            if (error.message.includes('Invalid Compact JWS')) {
                console.error('❌ AUTHENTICATION ERROR: Invalid Compact JWS');
                console.error('\n🔍 This means your SUPABASE_ANON_KEY is invalid!');
                console.error('\n📋 To fix:');
                console.error('1. Go to: https://app.supabase.com/project/_/settings/api');
                console.error('2. Find "Project API keys" section');
                console.error('3. Copy the "anon public" key (the LONG one)');
                console.error('4. Make sure to copy the ENTIRE key (no spaces, no truncation)');
                console.error('5. Update your .env file or Render environment variable');
                console.error('\n⚠️  Common mistakes:');
                console.error('   - Copying the service_role key instead of anon key');
                console.error('   - Truncating the key during copy/paste');
                console.error('   - Adding quotes around the key');
                console.error('   - Having spaces or line breaks in the key');
                process.exit(1);
            }
            
            console.error('❌ Database query failed:', error.message);
            console.error('\n💡 This might be:');
            console.error('   - Table "consumers" does not exist');
            console.error('   - Row Level Security (RLS) is blocking access');
            console.error('   - Network connectivity issue');
            process.exit(1);
        }
        
        console.log('✅ Database query successful!');
        console.log('   Can access "consumers" table');
        
    } catch (error) {
        console.error('❌ Unexpected error:', error.message);
        process.exit(1);
    }
    
    // Step 6: Test storage bucket access
    console.log('\n📋 Step 6: Testing storage bucket access...\n');
    
    try {
        const { data: files, error } = await supabase.storage
            .from('profile-photos')
            .list('', { limit: 1 });
        
        if (error) {
            if (error.message.includes('Invalid Compact JWS')) {
                console.error('❌ AUTHENTICATION ERROR when accessing storage!');
                console.error('   Same issue as above - invalid SUPABASE_ANON_KEY');
                process.exit(1);
            }
            
            if (error.message.includes('not found')) {
                console.error('⚠️  Storage bucket "profile-photos" not found!');
                console.error('\n📋 To fix:');
                console.error('1. Go to: https://app.supabase.com/project/_/storage/buckets');
                console.error('2. Click "New bucket"');
                console.error('3. Name: profile-photos');
                console.error('4. Public: ON (checked)');
                console.error('5. Click "Create bucket"');
                console.log('\n✅ Your credentials are VALID, just create the bucket!');
                process.exit(0);
            }
            
            console.error('❌ Storage access failed:', error.message);
            process.exit(1);
        }
        
        console.log('✅ Storage bucket access successful!');
        console.log('   Bucket "profile-photos" exists and is accessible');
        
    } catch (error) {
        console.error('❌ Unexpected error accessing storage:', error.message);
        process.exit(1);
    }
    
    // Step 7: Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('\nYour Supabase credentials are valid and working correctly!');
    console.log('\n📋 Next steps for Render deployment:');
    console.log('1. Go to Render Dashboard → Your Service → Environment');
    console.log('2. Make sure these variables are set EXACTLY as in your .env:');
    console.log('   - SUPABASE_URL');
    console.log('   - SUPABASE_ANON_KEY');
    console.log('3. Copy the entire value (no quotes, no spaces)');
    console.log('4. Save and redeploy');
    console.log('\n🎉 Your deployment should work now!\n');
    
    process.exit(0);
})();
