# Unobtrix Project Backend

A comprehensive Node.js backend API for the Unobtrix (FarmTrails) platform, providing authentication, OTP verification, user registration, and product/tour management with Supabase integration.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Development](#development)
- [Deployment](#deployment)
- [Security](#security)
- [License](#license)

## Features

✅ **Authentication & Authorization**
- Secure email/password authentication with bcrypt password hashing
- JWT token generation for session management
- Separate authentication for consumers and farmers

✅ **OTP Verification**
- Mobile number verification with OTP
- Aadhaar verification with OTP
- In-memory OTP storage with automatic expiry

✅ **User Registration**
- Consumer registration with profile photos
- Farmer registration with farm details and certifications
- Image upload to Supabase Storage

✅ **Product & Tour Management**
- Product catalog with filtering by category and price
- Tour listings with farmer details
- Support for searching and filtering

✅ **Database Operations**
- Supabase PostgreSQL integration
- Automatic password migration from plain text to hashed
- Table structure validation and health checks

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Supabase Account** with a project set up

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/unobtrix/unobtrix-project-backend.git
   cd unobtrix-project-backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory with the required environment variables (see [Environment Variables](#environment-variables) section).

4. **Set up Supabase Storage**

   In your Supabase Dashboard:
   - Go to Storage → New bucket
   - Name: `profile-photos`
   - Public: ON
   - File size limit: 50MB

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Supabase Configuration (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Server Configuration (Optional)
PORT=5000
NODE_ENV=production
```

### Required Variables

- `SUPABASE_URL`: Your Supabase project URL (found in Supabase Dashboard → Settings → API)
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key (found in Supabase Dashboard → Settings → API)

### Optional Variables

- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment mode (development/production)

## Project Structure

The project follows a modular MVC architecture for better maintainability:

```
unobtrix-project-backend/
├── src/
│   ├── config/              # Configuration files
│   │   ├── cors.js          # CORS configuration
│   │   └── supabase.js      # Supabase client setup
│   ├── controllers/         # Route controllers
│   │   ├── authController.js
│   │   ├── otpController.js
│   │   └── registrationController.js
│   ├── middleware/          # Express middleware
│   │   └── requestLogger.js # Request logging middleware
│   ├── routes/              # Route definitions
│   │   ├── authRoutes.js
│   │   ├── otpRoutes.js
│   │   └── registrationRoutes.js
│   └── utils/               # Utility functions
│       ├── database.js      # Database helper functions
│       ├── otp.js           # OTP generation and verification
│       └── password.js      # Password hashing and verification
├── server.js                # Main server file
├── package.json             # Project dependencies
├── .env                     # Environment variables (not in repo)
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## API Endpoints

### Health & Status

- **GET /** - Server information and status
- **GET /health** - Health check endpoint

### Authentication

- **GET /api/login** - Get login endpoint information
- **POST /api/login** - User login
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "userType": "consumer" // or "farmer"
  }
  ```

### Registration

- **POST /api/register/consumer** - Register a new consumer
  ```json
  {
    "username": "john_doe",
    "email": "john@example.com",
    "mobile": "9876543210",
    "password": "password123",
    "profile_photo_base64": "data:image/jpeg;base64,..."
  }
  ```

- **POST /api/register/farmer** - Register a new farmer
  ```json
  {
    "username": "farmer_joe",
    "email": "joe@example.com",
    "mobile": "9876543210",
    "password": "password123",
    "aadhaar_number": "123456789012",
    "farm_name": "Green Valley Farm",
    "farm_size": 5.5,
    "specialization": "Organic Vegetables"
  }
  ```

### OTP Verification

- **POST /api/mobile/send-otp** - Send OTP to mobile
  ```json
  {
    "mobile": "9876543210"
  }
  ```

- **POST /api/mobile/verify** - Verify mobile OTP
  ```json
  {
    "mobile": "9876543210",
    "otp": "123456"
  }
  ```

- **POST /api/aadhaar/send-otp** - Send OTP for Aadhaar
  ```json
  {
    "aadhaar_number": "123456789012"
  }
  ```

- **POST /api/aadhaar/verify** - Verify Aadhaar OTP
  ```json
  {
    "aadhaar_number": "123456789012",
    "otp": "123456"
  }
  ```

### Products & Tours

- **GET /api/products** - Get all products
  - Query params: `category`, `min_price`, `max_price`, `farmer_id`
  
- **GET /api/products/:id** - Get product by ID

- **GET /api/tours** - Get all tours
  - Query params: `farmer_id`, `min_price`, `max_price`

### Utility Endpoints

- **GET /api/check-structure** - Check database table structure
- **GET /api/fix-consumers-id** - Get SQL to fix consumer ID type
- **GET /api/fix-consumers-columns** - Get SQL to add missing columns
- **GET /api/check-bucket** - Check Supabase storage bucket status
- **POST /api/upload-photo** - Upload profile photo
- **POST /api/test-upload** - Test image upload functionality
- **POST /api/migrate-passwords** - Migrate plain text passwords to hashed

### Debug Endpoints

- **GET /api/debug/storage** - View storage bucket information
- **GET /api/debug/users** - View sample users (first 5 from each table)

## Development

### Running the Development Server

```bash
npm run dev
```

This will start the server with nodemon for automatic reloading on file changes.

### Running the Production Server

```bash
npm start
```

### Running Tests

```bash
npm test
```

Note: Currently, no tests are configured. This is a placeholder for future test implementation.

### Building

```bash
npm run build
```

Note: No build step is required for this Node.js project.

## Deployment

### Deploy to Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Set the following:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add environment variables in the Render dashboard
5. Deploy!

See [RENDER-ENV-SETUP.md](RENDER-ENV-SETUP.md) for detailed instructions.

### Deploy to Railway

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables
4. Railway will automatically detect and deploy your Node.js application

### Deploy to Heroku

```bash
heroku create your-app-name
heroku config:set SUPABASE_URL=your_url
heroku config:set SUPABASE_ANON_KEY=your_key
git push heroku main
```

## Security

### Best Practices Implemented

✅ **Password Security**
- Passwords are hashed using bcrypt with a salt factor of 12
- Plain text passwords are never stored in the database
- Automatic migration of legacy plain text passwords

✅ **CORS Configuration**
- Restricted to specific origins (Netlify deployment + localhost for development)
- Credentials support enabled for secure cookie handling

✅ **Input Validation**
- Email format validation
- Mobile number format validation (10 digits)
- Aadhaar number validation (12 digits)
- Password length requirements (minimum 6 characters)

✅ **Error Handling**
- Sensitive information is not exposed in error messages
- All errors are logged server-side for debugging
- Generic error messages sent to clients

### Security Recommendations

⚠️ **Important Security Notes:**

1. **Never commit `.env` files** to version control
2. **Rotate Supabase keys** regularly
3. **Enable Row Level Security (RLS)** in Supabase for all tables
4. **Use HTTPS** in production
5. **Implement rate limiting** for OTP endpoints
6. **Add JWT token validation** for protected routes
7. **Enable API request logging** and monitoring

## License

MIT License

Copyright (c) 2024 Unobtrix

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Support

For issues, questions, or contributions:
- **GitHub Issues**: https://github.com/unobtrix/unobtrix-project-backend/issues
- **GitHub Repository**: https://github.com/unobtrix/unobtrix-project-backend

---

**Made with ❤️ by the Unobtrix Team**