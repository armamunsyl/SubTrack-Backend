const admin = require('firebase-admin');

const initFirebase = () => {
  if (admin.apps.length > 0) return;

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.warn('⚠️  Firebase credentials missing in .env — auth routes will not work');
    return;
  }

  try {
    const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    console.log('🔑 Private key starts with:', privateKey.substring(0, 40));
    console.log('🔑 Private key ends with:', privateKey.substring(privateKey.length - 40));
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        privateKey,
        clientEmail: FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('✅ Firebase Admin initialized');
  } catch (err) {
    console.error('❌ Firebase init failed:', err.message);
    console.error('❌ Stack:', err.stack);
  }
};

module.exports = { admin, initFirebase };
