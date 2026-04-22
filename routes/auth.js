const express = require('express');
const jwt = require('jsonwebtoken');
const { admin } = require('../config/firebase');
const User = require('../models/User');

const router = express.Router();

// POST /api/auth/verify
router.post('/verify', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'Firebase ID token required' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);

    // Upsert user in DB
    await User.findOneAndUpdate(
      { uid: decoded.uid },
      {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name || decoded.email,
        photoURL: decoded.picture || '',
        lastLogin: new Date(),
      },
      { upsert: true, new: true }
    );

    const payload = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.json({ token, user: payload });
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({ message: 'Invalid Firebase token' });
  }
});

module.exports = router;
