const admin = require('firebase-admin');

const initFirebase = () => {
  if (admin.apps.length > 0) return;

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is missing');
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('✅ Firebase Admin initialized');
  } catch (err) {
    console.error('❌ Firebase init failed:', err.message);
  }
};

module.exports = { admin, initFirebase };
