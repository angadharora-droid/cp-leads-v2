import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

// Personal sending mailbox (the exec's official email ID). When linked,
// client emails go out from this account instead of the shared SMTP_* one.
// The mailbox password is stored encrypted (utils/mailCrypto.js).
const emailSenderSchema = new Schema(
  {
    email: { type: String, trim: true, lowercase: true },
    host: { type: String, trim: true },
    port: { type: Number, default: 465 },
    secure: { type: Boolean, default: true },
    passEnc: { type: String },
    linkedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    // Optional contact number; lets admins sign in by phone (matched on the
    // last 10 digits, so stored formatting/country code doesn't matter).
    phone: { type: String, trim: true, default: null },
    role: {
      type: String,
      enum: ['admin', 'sales_exec'],
      default: 'sales_exec',
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    emailSender: { type: emailSenderSchema, default: undefined },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.passwordHash;
    if (ret.emailSender) delete ret.emailSender.passEnc;
    delete ret.__v;
    return ret;
  },
});

const User = model('User', userSchema);

export default User;
