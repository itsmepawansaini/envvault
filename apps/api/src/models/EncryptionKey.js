import mongoose from 'mongoose';

const encryptionKeySchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    encryptedProjectKey: { type: String, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

encryptionKeySchema.index({ projectId: 1, userId: 1 }, { unique: true });

export const EncryptionKey = mongoose.model('EncryptionKey', encryptionKeySchema);
