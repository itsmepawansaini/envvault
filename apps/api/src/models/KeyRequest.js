import mongoose from 'mongoose';

const keyRequestSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceName: { type: String, required: true, trim: true, maxlength: 120 },
    publicKey: { type: mongoose.Schema.Types.Mixed, required: true },
    encryptedProjectKey: { type: String, default: null },
    status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

keyRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
keyRequestSchema.index({ projectId: 1, status: 1, createdAt: -1 });

export const KeyRequest = mongoose.model('KeyRequest', keyRequestSchema);
