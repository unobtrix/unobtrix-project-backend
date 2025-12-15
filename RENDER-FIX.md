# 🚨 URGENT: Fix "Invalid Compact JWS" Error on Render

## Your Current Error

You're seeing:
```
❌ Error accessing bucket: Invalid Compact JWS
❌ Missing columns in consumers table: ['profile_photo_url', 'created_at', 'updated_at']
🆔 Consumers ID: ❌ unknown
```

## ⚠️ IMPORTANT: DO NOT Commit Credentials!

**NEVER** commit your Supabase credentials (SUPABASE_URL, SUPABASE_ANON_KEY) to Git!
- ❌ Do NOT create a .env file in the repository
- ❌ Do NOT hardcode credentials in any JavaScript files
- ✅ ONLY use environment variables on Render

## Root Cause

The "Invalid Compact JWS" error means your **SUPABASE_ANON_KEY** in Render is:
1. Not set correctly
2. Truncated (incomplete)
3. Contains extra spaces or quotes
4. Is the wrong key (service_role instead of anon)

## 🔧 Step-by-Step Fix

### Step 1: Get Your Correct Supabase Credentials

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **Settings → API**
4. You'll see two keys:
   - `anon public` - **This is the one you need!** ✅
   - `service_role` - **Do NOT use this one!** ❌

5. Click "Copy" on the **anon public** key
6. The key should:
   - Start with `eyJ`
   - Be 200+ characters long
   - Look like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...` (very long)

### Step 2: Verify Credentials Locally (Recommended)

Before updating Render, test your credentials locally:

1. Create a `.env` file in the project root (it won't be committed - it's in .gitignore):
   ```bash
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-very-long-key...
   ```

2. Run the validation script:
   ```bash
   node validate-credentials.js
   ```

3. If all tests pass ✅, your credentials are correct!
4. If tests fail ❌, the script will tell you exactly what's wrong

### Step 3: Update Render Environment Variables

1. Go to https://dashboard.render.com
2. Select your backend service
3. Click **Environment** tab
4. Update/add these variables:

   **SUPABASE_URL:**
   - Click Edit or Add Environment Variable
   - Key: `SUPABASE_URL`
   - Value: `https://your-project-id.supabase.co` (no quotes)
   - Click Save

   **SUPABASE_ANON_KEY:**
   - Click Edit or Add Environment Variable
   - Key: `SUPABASE_ANON_KEY`
   - Value: Paste the ENTIRE anon public key (no quotes, no spaces)
   - Click Save

### Step 4: Create Storage Bucket (If Not Created)

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **Storage → Buckets**
4. Click **New bucket**
5. Settings:
   - Name: `profile-photos` (exactly this, no spaces)
   - Public: ✅ ON (checked)
   - File size limit: 50 MB
   - Allowed MIME types: `image/*` or leave default
6. Click **Create bucket**

### Step 5: Fix Database Columns

Run this SQL in your Supabase SQL Editor:

```sql
-- Add missing columns to consumers table
ALTER TABLE consumers 
ADD COLUMN IF NOT EXISTS profile_photo_url TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'consumers'
ORDER BY ordinal_position;
```

### Step 6: Redeploy on Render

1. Go back to Render Dashboard
2. Click **Manual Deploy → Deploy latest commit**
3. Wait for deployment to complete
4. Check the logs - you should now see:
   ```
   ✅ Supabase client created successfully
   ✅ Bucket "profile-photos" exists and is accessible
   ✅ All required columns exist in consumers table
   ✅ Server is running with modular architecture!
   ```

## 🧪 Testing After Deployment

Test your deployed API:

```bash
# Replace YOUR-SERVICE-NAME with your actual Render service name
# Health check
curl https://YOUR-SERVICE-NAME.onrender.com/health

# Storage check
curl https://YOUR-SERVICE-NAME.onrender.com/api/check-bucket

# Structure check
curl https://YOUR-SERVICE-NAME.onrender.com/api/check-structure
```

All should return success responses.

## ❓ Still Getting Errors?

### Error: "Invalid Compact JWS" persists

**Problem:** Your SUPABASE_ANON_KEY is still invalid

**Solution:**
1. Double-check you copied the **anon public** key (NOT service_role)
2. Make sure the entire key was copied (check length - should be 200+ chars)
3. No quotes, no spaces, no line breaks
4. Try copying again and pasting directly in Render

### Error: "Bucket not found" but you created it

**Problem:** Bucket name doesn't match or is not public

**Solution:**
1. Check bucket name is exactly `profile-photos` (lowercase, hyphen)
2. Make sure "Public" is ON in bucket settings
3. Try deleting and recreating the bucket

### Error: "Missing columns" but you ran the SQL

**Problem:** SQL didn't execute successfully or on wrong database

**Solution:**
1. Make sure you're in the correct Supabase project
2. Check SQL Editor for any error messages
3. Run a SELECT query to verify columns exist:
   ```sql
   SELECT * FROM consumers LIMIT 1;
   ```

## 📞 Need More Help?

1. Run `node validate-credentials.js` locally to verify your setup
2. Check the full logs on Render (Logs tab)
3. Compare your .env.example with your Render environment variables
4. Read TROUBLESHOOTING.md for more common issues

## 🔒 Security Reminder

- ✅ Keep credentials in Render environment variables
- ✅ Keep credentials in local .env file (gitignored)
- ❌ NEVER commit .env file to Git
- ❌ NEVER hardcode credentials in JavaScript files
- ❌ NEVER share your service_role key publicly

---

**Last Updated:** December 2024
