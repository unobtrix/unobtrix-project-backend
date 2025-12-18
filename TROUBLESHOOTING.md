# 🔧 Troubleshooting Guide - Render Deployment Issues

## Error: "Invalid Compact JWS"

This is the most common error and means your Supabase authentication key is invalid or malformed.

### Why This Happens:
- ❌ `SUPABASE_ANON_KEY` is not set
- ❌ `SUPABASE_ANON_KEY` is incomplete (copy/paste was cut off)
- ❌ `SUPABASE_ANON_KEY` has extra spaces or quotes
- ❌ Wrong key was copied (service_role instead of anon)
- ❌ Old/revoked key is being used

### How to Fix:

#### Step 1: Get the Correct Key
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings → API**
4. Find "Project API keys" section
5. Copy the **"anon public"** key (NOT the service_role key)

**Important:** The key should:
- Start with `eyJ`
- Be very long (200+ characters)
- Have no spaces or line breaks

#### Step 2: Update Render Environment Variables
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your backend service
3. Click **Environment** tab
4. Find `SUPABASE_ANON_KEY`
5. Click **Edit**
6. Paste the entire key (no quotes, no spaces)
7. Click **Save**

#### Step 3: Redeploy
1. Go to **Dashboard** tab
2. Click **Manual Deploy → Deploy latest commit**
3. Wait for deployment to complete

---

## Error: "Storage bucket 'profile-photos' not found"

### Why This Happens:
- ❌ Storage bucket doesn't exist in Supabase
- ❌ Bucket name is different
- ❌ Storage is disabled

### How to Fix:

#### Step 1: Create the Bucket
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Storage**
4. Click **New bucket**
5. Fill in:
   - **Name:** `profile-photos`
   - **Public:** ✅ ON (checked)
   - **File size limit:** 50MB
   - **Allowed MIME types:** Leave default or set to `image/*`
6. Click **Create bucket**

#### Step 2: Configure Bucket Policies (Optional)
For public bucket, default policies should work. If you need custom policies:

```sql
-- Allow public read access
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT USING (bucket_id = 'profile-photos');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated upload" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'profile-photos');
```

#### Step 3: Restart Server
After creating the bucket, your Render deployment should automatically detect it on next request.

---

## Error: "Missing columns in consumers table"

### Why This Happens:
The consumers table is missing required columns that the backend expects.

### How to Fix:

#### Option 1: Use the Auto-Fix Endpoint
1. After server is running, visit:
   ```
   https://your-app.onrender.com/api/fix-consumers-columns
   ```
2. Copy the SQL shown in the response
3. Run it in Supabase SQL Editor

#### Option 2: Manual SQL Fix
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Navigate to **SQL Editor**
3. Click **New query**
4. Run this SQL:

```sql
-- Add missing columns to consumers table
ALTER TABLE consumers 
ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'consumers'
ORDER BY ordinal_position;
```

---

## Server Won't Start / Crashes Immediately

### Checklist:
1. ✅ Verify all environment variables are set correctly
2. ✅ Check Render logs for specific error messages
3. ✅ Ensure Supabase project is not paused (free tier limitation)
4. ✅ Verify database tables exist (consumers, farmers, products, tours)

### View Logs on Render:
1. Go to your service in Render Dashboard
2. Click **Logs** tab
3. Look for red ❌ error messages
4. The logs will tell you exactly what's wrong

---

## Common Issues Summary

| Error Message | Cause | Solution |
|--------------|-------|----------|
| "Invalid Compact JWS" | Invalid SUPABASE_ANON_KEY | Copy correct key from Supabase API settings |
| "Bucket not found" | Storage bucket doesn't exist | Create "profile-photos" bucket in Supabase |
| "Missing columns" | Database schema incomplete | Run SQL to add missing columns |
| "supabaseKey is required" | Environment variable not set | Add SUPABASE_ANON_KEY in Render |
| "SUPABASE_URL must be a valid URL" | URL format wrong | Use format: https://xxx.supabase.co |

---

## Environment Variables Quick Reference

Required variables for Render deployment:

```
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
```

Optional variables (auto-set by Render):
```
PORT=10000
NODE_ENV=production
```

---

## Testing After Deployment

### 1. Test Basic Health
```bash
curl https://your-app.onrender.com/health
```

Expected response:
```json
{
  "success": true,
  "message": "Server is healthy",
  "database": "connected"
}
```

### 2. Check Storage Status
```bash
curl https://your-app.onrender.com/api/check-bucket
```

Expected response:
```json
{
  "success": true,
  "message": "Bucket exists and is accessible",
  "bucket_name": "profile-photos"
}
```

### 3. Verify Table Structure
```bash
curl https://your-app.onrender.com/api/check-structure
```

Should show consumers and farmers table columns.

---

## Still Having Issues?

### Get Detailed Diagnostics:

1. **Check Environment Variables:**
   ```bash
   curl https://your-app.onrender.com/
   ```
   Look at the response - it shows your configuration status

2. **View Debug Info:**
   ```bash
   curl https://your-app.onrender.com/api/debug/storage
   curl https://your-app.onrender.com/api/debug/users
   ```

3. **Check Render Logs:**
   - The startup logs show exactly what's configured
   - Look for ✅ (success) vs ❌ (error) indicators

### Need More Help?

1. Check the server logs on Render (Logs tab)
2. Verify your Supabase project is active
3. Test your Supabase credentials locally first
4. Review the .env.example file for correct format
5. Open an issue on GitHub with your error logs (remove sensitive data)

---

## Prevention Checklist

Before deploying to Render:

- [ ] SUPABASE_URL is set correctly
- [ ] SUPABASE_ANON_KEY is set and starts with "eyJ"
- [ ] Storage bucket "profile-photos" exists in Supabase
- [ ] Bucket is set to Public
- [ ] Consumers table has all required columns
- [ ] Supabase project is not paused (free tier)
- [ ] Test locally with same environment variables

---

**Last Updated:** December 2024
**Tested on:** Render.com, Node.js 18+
