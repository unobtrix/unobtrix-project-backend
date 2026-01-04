const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.log('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// User Profile Endpoints
// GET user profile by ID
app.get('/api/users/:userId/profile', (req, res) => {
  try {
    const { userId } = req.params;
    // TODO: Implement database query to fetch user profile
    res.status(200).json({
      message: 'User profile retrieved successfully',
      userId: userId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update user profile
app.put('/api/users/:userId/profile', (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, phone, bio, profilePicture } = req.body;
    // TODO: Implement database query to update user profile
    res.status(200).json({
      message: 'User profile updated successfully',
      userId: userId,
      profile: {
        firstName,
        lastName,
        email,
        phone,
        bio,
        profilePicture
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all user profiles (admin only)
app.get('/api/users/profiles/all', (req, res) => {
  try {
    // TODO: Implement authentication check for admin
    // TODO: Implement database query to fetch all user profiles
    res.status(200).json({
      message: 'All user profiles retrieved successfully',
      profiles: []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE user profile
app.delete('/api/users/:userId/profile', (req, res) => {
  try {
    const { userId } = req.params;
    // TODO: Implement database query to delete user profile
    res.status(200).json({
      message: 'User profile deleted successfully',
      userId: userId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
