import mongoose from 'mongoose';

const variableSchema = new mongoose.Schema(
  {
    environmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Environment', required: true },
    key: { type: String, required: true, trim: true },
    encryptedValue: { type: String, required: true },
    iv: { type: String, required: true },
    valueDigest: { type: String, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

variableSchema.index({ environmentId: 1, key: 1 }, { unique: true });

export const Variable = mongoose.model('Variable', variableSchema);
