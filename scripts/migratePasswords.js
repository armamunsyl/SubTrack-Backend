// One-time script: encrypts any plaintext accountPassword values in the DB
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { encrypt } = require('../utils/crypto');

const PREFIX = 'enc:';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const collection = mongoose.connection.collection('accounts');
  const accounts = await collection.find({ accountPassword: { $exists: true, $ne: null, $ne: '' } }).toArray();

  let migrated = 0;
  for (const acc of accounts) {
    if (!acc.accountPassword.startsWith(PREFIX)) {
      await collection.updateOne(
        { _id: acc._id },
        { $set: { accountPassword: encrypt(acc.accountPassword) } }
      );
      migrated++;
    }
  }

  console.log(`Done. Migrated ${migrated} of ${accounts.length} accounts.`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
