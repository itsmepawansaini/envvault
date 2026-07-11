import mongoose from 'mongoose';

const versionVariableSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    encryptedValue: { type: String, required: true },
    iv: { type: String, required: true },
    valueDigest: { type: String, default: null }
  },
  { _id: false }
);

const environmentVersionSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    environmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Environment', required: true },
    version: { type: Number, required: true },
    source: { type: String, required: true, trim: true },
    variables: { type: [versionVariableSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

environmentVersionSchema.index({ environmentId: 1, version: -1 }, { unique: true });
environmentVersionSchema.index({ projectId: 1, createdAt: -1 });

export const EnvironmentVersion = mongoose.model('EnvironmentVersion', environmentVersionSchema);
