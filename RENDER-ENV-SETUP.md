# 🚀 Fix Render Deployment - Missing Environment Variables

## Problem: 'supabaseKey is required' Error

Your Render deployment is failing because environment variables are not set.

## ✅ Solution: Add Environment Variables in Render

### Step 1: Go to Render Dashboard
1. Visit: https://dashboard.render.com
2. Select your **FarmTrails backend** service

### Step 2: Add Environment Variables
1. Click **Environment** tab
2. Click **Add Environment Variable**
3. Add these two variables:

#### Variable 1:
```
Key: SUPABASE_URL


#### Variable 2:
```
Key: SUPABASE_ANON_KEY


### Step 3: Redeploy
1. Go back to **Dashboard** tab
2. Click **Manual Deploy** → **Deploy latest commit**
3. Wait for deployment to complete

### Step 4: Verify
Your backend should now deploy successfully and show:
```
✅ Server is running with all functionality!
```

## 🔍 What These Variables Do:

- **SUPABASE_URL**: Your Supabase project URL
- **SUPABASE_ANON_KEY**: Public API key for client-side operations

## 🛡️ Security Note:

These are **public keys** - it's safe to expose them. The **secret keys** stay in Supabase and are never shared.

## 📋 Full Environment Setup:

After adding the above, your environment should have:
- ✅ **SUPABASE_URL**
- ✅ **SUPABASE_ANON_KEY**
- ✅ **NODE_ENV** (automatically set by Render)
- ✅ **PORT** (automatically set by Render)

## 🚨 If Still Failing:

### Check These:
1. **Variable names are exact** (case-sensitive)
2. **No extra spaces** in values
3. **Repository is accessible** (you made it public)
4. **Build succeeded** (only deployment failed)

### Test Locally:
```bash
# Set environment variables locally

# Test server
node server.js
```

## 💡 Pro Tips:

1. **Save these values** somewhere safe for future reference
2. **Use the same values** for all environments (dev/staging/prod)
3. **Never commit** these to Git (already excluded)
4. **Rotate keys** if you suspect compromise

## 🎯 Expected Result:

After adding environment variables and redeploying:

```
🔗 Supabase connected
✅ Server is running with all functionality!
📋 Available endpoints:

```

---
**Add the environment variables and redeploy - your backend will work!** 🚀
