import mongoose from 'mongoose';

const environmentSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true, trim: true }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

environmentSchema.index({ projectId: 1, name: 1 }, { unique: true });

export const Environment = mongoose.model('Environment', environmentSchema);
