const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

const memberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    startDate: { type: Date, required: true },
    durationDays: { type: Number, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'expired'], default: 'active' },
    notes: { type: String, trim: true },
  },
  { _id: true }
);

const accountSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    accountPassword: {
      type: String,
      trim: true,
      set: (v) => (v ? encrypt(v) : v),
      get: (v) => (v ? decrypt(v) : v),
    },
    service: { type: String, required: true, trim: true },
    plan: { type: String, trim: true },
    totalSlots: { type: Number, default: 1, min: 1 },
    usedSlots: { type: Number, default: 0, min: 0 },
    price: { type: Number, default: 0 },
    purchasedDate: { type: Date },
    validityDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'expired', 'suspended', 'disabled'],
      default: 'active',
    },
    notes: { type: String, trim: true },
    createdBy: { type: String },
    members: [memberSchema],
  },
  { timestamps: true }
);

accountSchema.virtual('daysUntilExpiry').get(function () {
  const diff = this.validityDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

accountSchema.virtual('freeSlots').get(function () {
  const active = this.members.filter((m) => m.status === 'active').length;
  return Math.max(0, this.totalSlots - active);
});

accountSchema.pre('save', async function () {
  // Auto-expire account
  if (this.status === 'active' && this.validityDate < new Date()) {
    this.status = 'expired';
  }
  // Auto-expire members past their endDate
  this.members.forEach((m) => {
    if (m.status === 'active' && m.endDate < new Date()) {
      m.status = 'expired';
    }
  });
  // Sync usedSlots from active members (only if members array is in use)
  if (this.members.length > 0) {
    this.usedSlots = this.members.filter((m) => m.status === 'active').length;
  }
});

accountSchema.index({ email: 1, createdBy: 1 }, { unique: true });

accountSchema.set('toJSON', { virtuals: true, getters: true });
accountSchema.set('toObject', { virtuals: true, getters: true });

module.exports = mongoose.model('Account', accountSchema);
