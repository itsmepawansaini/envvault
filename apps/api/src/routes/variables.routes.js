import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { ApiError, asyncHandler } from '../middleware/error.middleware.js';
import { Environment, Project, Variable } from '../models/index.js';
import { logActivity } from '../services/activity.service.js';
import { createEnvironmentVersion, serializeEnvironmentVersion } from '../services/environment-version.service.js';
import { requireObjectId, serializeDocument } from '../utils/http.js';

const router = Router();

router.use(requireAuth);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { variable, environment } = await requireVariableAccess(req.params.id, req.user.sub);
    requireProductionConfirmation(req, environment);
    for (const field of ['key', 'encryptedValue', 'iv', 'valueDigest']) {
      if (req.body[field] !== undefined) variable[field] = req.body[field];
    }
    variable.updatedBy = req.user.sub;
    await variable.save();

    await logActivity({
      projectId: environment.projectId,
      actorId: req.user.sub,
      action: 'variable.updated',
      targetType: 'variable',
      targetId: variable.id,
      metadata: { key: variable.key, environment: environment.name }
    });
    const version = await createEnvironmentVersion({
      environment,
      actorId: req.user.sub,
      source: 'web:update-variable',
      metadata: { key: variable.key }
    });

    res.json({ variable: serializeDocument(variable), version: serializeEnvironmentVersion(version) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { variable, environment } = await requireVariableAccess(req.params.id, req.user.sub);
    requireProductionConfirmation(req, environment);
    await Variable.deleteOne({ _id: variable.id });

    await logActivity({
      projectId: environment.projectId,
      actorId: req.user.sub,
      action: 'variable.deleted',
      targetType: 'variable',
      targetId: variable.id,
      metadata: { key: variable.key, environment: environment.name }
    });
    await createEnvironmentVersion({
      environment,
      actorId: req.user.sub,
      source: 'web:delete-variable',
      metadata: { key: variable.key }
    });

    res.status(204).send();
  })
);

async function requireVariableAccess(variableId, userId) {
  requireObjectId(variableId, 'variable id');
  const variable = await Variable.findById(variableId);

  if (!variable) {
    throw new ApiError(404, 'VARIABLE_NOT_FOUND', 'No variable matches the given id.');
  }

  const environment = await Environment.findById(variable.environmentId);
  const project = await Project.findOne({
    _id: environment?.projectId,
    $or: [{ ownerId: userId }, { 'members.userId': userId }]
  });

  if (!environment || !project) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this variable.');
  }

  return { variable, environment };
}

function requireProductionConfirmation(req, environment) {
  if (environment.name.toLowerCase() !== 'production') return;

  const confirmation = req.get('x-envvault-production-confirm') || req.body?.productionConfirmation;
  if (confirmation !== 'production') {
    throw new ApiError(
      400,
      'PRODUCTION_CONFIRMATION_REQUIRED',
      'Type production to modify variables in the production environment.'
    );
  }
}

export default router;
