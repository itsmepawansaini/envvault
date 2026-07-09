import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    invitedEmail: { type: String, lowercase: true, trim: true, default: null },
    encryptedProjectKey: { type: String, default: null, select: false },
    joinedAt: { type: Date, default: Date.now }
  },
  {
    toJSON: { transform: removeWrappedKey },
    toObject: { transform: removeWrappedKey }
  }
);

function removeWrappedKey(_document, value) {
  delete value.encryptedProjectKey;
  return value;
}

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
    archivedAt: { type: Date, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

projectSchema.index({ ownerId: 1 });
projectSchema.index({ 'members.userId': 1 });

export const Project = mongoose.model('Project', projectSchema);
