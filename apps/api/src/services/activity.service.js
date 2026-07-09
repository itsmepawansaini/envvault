import { ActivityLog } from '../models/index.js';

export async function logActivity({ projectId, actorId, action, targetType, targetId, metadata = {} }) {
  return ActivityLog.create({ projectId, actorId, action, targetType, targetId, metadata });
}
