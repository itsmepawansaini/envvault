import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    oauthProvider: { type: String, required: true, enum: ['github', 'google'] },
    oauthId: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.index({ oauthProvider: 1, oauthId: 1 }, { unique: true });
userSchema.index({ email: 1 });

export const User = mongoose.model('User', userSchema);
