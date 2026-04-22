const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error('ENCRYPTION_KEY is not set in environment');
  return Buffer.from(hex, 'hex');
}

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
  if (!text || !text.startsWith(PREFIX)) return text; // plaintext fallback for old data
  try {
    const [ivHex, authTagHex, encryptedHex] = text.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8');
  } catch {
    return text;
  }
}

module.exports = { encrypt, decrypt };
