import mongoose from 'mongoose';
import { ApiError } from '../middleware/error.middleware.js';

export function requireObjectId(value, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, 'INVALID_ID', `Invalid ${label}.`);
  }

  return value;
}

export function notImplemented(res, feature) {
  return res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `${feature} is planned for a later build step.`
    }
  });
}

export function serializeDocument(document) {
  if (!document) return null;
  const value = document.toObject ? document.toObject() : document;
  value.id = value._id?.toString();
  delete value._id;
  delete value.__v;
  return value;
}
