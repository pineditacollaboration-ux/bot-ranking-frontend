const mongoose = require('mongoose');

const VipKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  type: { type: String, required: true, default: 'gengar' }, // 'gengar', 'subestimado', etc.
  status: { type: String, enum: ['active', 'redeemed'], default: 'active' },
  createdBy: { type: String, required: true },
  redeemedBy: { type: String, default: null },
  restrictedTo: { type: String, default: null }, // Only this user can redeem if set
  createdAt: { type: Date, default: Date.now },
  redeemedAt: { type: Date, default: null },
  // Optional: expiration for the key itself before redemption
  expiresAt: { type: Date, default: null } 
});

module.exports = mongoose.model('VipKey', VipKeySchema);
