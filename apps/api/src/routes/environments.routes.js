import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { ApiError, asyncHandler } from '../middleware/error.middleware.js';
import { Environment, EnvironmentVersion, Project, Variable } from '../models/index.js';
import { logActivity } from '../services/activity.service.js';
import { createEnvironmentVersion, serializeEnvironmentVersion } from '../services/environment-version.service.js';
import { requireObjectId, serializeDocument } from '../utils/http.js';

const router = Router();

router.use(requireAuth);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const environment = await requireEnvironmentAccess(req.params.id, req.user.sub);
    const previousName = environment.name;
    const nextName = requireName(req.body.name);
    requireProductionConfirmation(req, environment, nextName);
    environment.name = nextName;
    await environment.save();

    await logActivity({
      projectId: environment.projectId,
      actorId: req.user.sub,
      action: 'environment.updated',
      targetType: 'environment',
      targetId: environment.id,
      metadata: { from: previousName, to: environment.name }
    });

    res.json({ environment: serializeDocument(environment) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const environment = await requireEnvironmentAccess(req.params.id, req.user.sub);
    requireProductionConfirmation(req, environment);
    await Variable.deleteMany({ environmentId: environment.id });
    await Environment.deleteOne({ _id: environment.id });

    await logActivity({
      projectId: environment.projectId,
      actorId: req.user.sub,
      action: 'environment.deleted',
      targetType: 'environment',
      targetId: environment.id,
      metadata: { name: environment.name }
    });

    res.status(204).send();
  })
);

router.post(
  '/:id/clone',
  asyncHandler(async (req, res) => {
    const source = await requireEnvironmentAccess(req.params.id, req.user.sub);
    const cloneName = requireName(req.body.name);
    requireProductionConfirmation(req, source, cloneName);
    const clone = await Environment.create({ projectId: source.projectId, name: cloneName });
    const variables = await Variable.find({ environmentId: source.id });

    if (variables.length) {
      await Variable.insertMany(
        variables.map((variable) => ({
          environmentId: clone.id,
          key: variable.key,
          encryptedValue: variable.encryptedValue,
          iv: variable.iv,
          valueDigest: variable.valueDigest,
          updatedBy: req.user.sub
        }))
      );
    }
    const version = await createEnvironmentVersion({
      environment: clone,
      actorId: req.user.sub,
      source: 'web:clone',
      metadata: { clonedFrom: source.id, variableCount: variables.length }
    });

    await logActivity({
      projectId: source.projectId,
      actorId: req.user.sub,
      action: 'environment.cloned',
      targetType: 'environment',
      targetId: clone.id,
      metadata: { from: source.name, to: clone.name, variableCount: variables.length }
    });

    res.status(201).json({
      environment: serializeDocument(clone),
      clonedVariables: variables.length,
      version: serializeEnvironmentVersion(version)
    });
  })
);

router.get(
  '/:id/variables',
  asyncHandler(async (req, res) => {
    const environment = await requireEnvironmentAccess(req.params.id, req.user.sub);
    const variables = await Variable.find({ environmentId: environment.id }).sort({ key: 1 });
    res.json({ variables: variables.map(serializeDocument) });
  })
);

router.post(
  '/:id/variables',
  asyncHandler(async (req, res) => {
    const environment = await requireEnvironmentAccess(req.params.id, req.user.sub);
    requireProductionConfirmation(req, environment);
    const variable = await Variable.create({
      environmentId: environment.id,
      key: req.body.key,
      encryptedValue: req.body.encryptedValue,
      iv: req.body.iv,
      valueDigest: req.body.valueDigest,
      updatedBy: req.user.sub
    });

    await logActivity({
      projectId: environment.projectId,
      actorId: req.user.sub,
      action: 'variable.created',
      targetType: 'variable',
      targetId: variable.id,
      metadata: { key: variable.key, environment: environment.name }
    });
    const version = await createEnvironmentVersion({
      environment,
      actorId: req.user.sub,
      source: 'web:create-variable',
      metadata: { key: variable.key }
    });

    res.status(201).json({ variable: serializeDocument(variable), version: serializeEnvironmentVersion(version) });
  })
);

router.post(
  '/:id/variables/bulk-import',
  asyncHandler(async (req, res) => {
    const environment = await requireEnvironmentAccess(req.params.id, req.user.sub);
    requireProductionConfirmation(req, environment);
    const variables = validateBulkVariables(req.body.variables);
    const keys = variables.map((variable) => variable.key);
    const existing = await Variable.find({ environmentId: environment.id, key: { $in: keys } }).select('key');
    const existingKeys = new Set(existing.map((variable) => variable.key));

    await Variable.bulkWrite(
      variables.map((variable) => ({
        updateOne: {
          filter: { environmentId: environment.id, key: variable.key },
          update: {
            $set: {
              encryptedValue: variable.encryptedValue,
              iv: variable.iv,
              valueDigest: variable.valueDigest || null,
              updatedBy: req.user.sub
            },
            $setOnInsert: {
              environmentId: environment.id,
              key: variable.key
            }
          },
          upsert: true
        }
      })),
      { ordered: true }
    );

    const created = variables.filter((variable) => !existingKeys.has(variable.key)).length;
    const updated = variables.length - created;
    await logActivity({
      projectId: environment.projectId,
      actorId: req.user.sub,
      action: 'variable.bulk-imported',
      targetType: 'environment',
      targetId: environment.id,
      metadata: { environment: environment.name, created, updated, total: variables.length }
    });
    const version = await createEnvironmentVersion({
      environment,
      actorId: req.user.sub,
      source: 'web:bulk-import',
      metadata: { created, updated, total: variables.length }
    });

    const saved = await Variable.find({ environmentId: environment.id, key: { $in: keys } }).sort({ key: 1 });
    res.json({
      summary: { created, updated, total: variables.length },
      version: serializeEnvironmentVersion(version),
      variables: saved.map(serializeDocument)
    });
  })
);

router.get(
  '/:id/variables/export',
  asyncHandler(async (req, res) => {
    const environment = await requireEnvironmentAccess(req.params.id, req.user.sub);
    const variables = await Variable.find({ environmentId: environment.id }).sort({ key: 1 });
    res.json({ environment: serializeDocument(environment), variables: variables.map(serializeDocument) });
  })
);

router.get(
  '/:id/versions',
  asyncHandler(async (req, res) => {
    const environment = await requireEnvironmentAccess(req.params.id, req.user.sub);
    const versions = await EnvironmentVersion.find({ environmentId: environment.id })
      .sort({ version: -1 })
      .limit(50);

    res.json({
      environment: serializeDocument(environment),
      versions: versions.map((version) => serializeEnvironmentVersion(version))
    });
  })
);

router.get(
  '/:id/versions/:versionId',
  asyncHandler(async (req, res) => {
    const environment = await requireEnvironmentAccess(req.params.id, req.user.sub);
    const version = await requireEnvironmentVersion(environment.id, req.params.versionId);

    res.json({
      environment: serializeDocument(environment),
      version: serializeEnvironmentVersion(version, { includeVariables: true })
    });
  })
);

router.post(
  '/:id/versions/:versionId/restore',
  asyncHandler(async (req, res) => {
    const environment = await requireEnvironmentAccess(req.params.id, req.user.sub);
    requireProductionConfirmation(req, environment);
    const version = await requireEnvironmentVersion(environment.id, req.params.versionId);

    await Variable.deleteMany({ environmentId: environment.id });
    if (version.variables.length) {
      await Variable.insertMany(
        version.variables.map((variable) => ({
          environmentId: environment.id,
          key: variable.key,
          encryptedValue: variable.encryptedValue,
          iv: variable.iv,
          valueDigest: variable.valueDigest || null,
          updatedBy: req.user.sub
        }))
      );
    }

    const restoredVersion = await createEnvironmentVersion({
      environment,
      actorId: req.user.sub,
      source: 'web:restore-version',
      metadata: { restoredFromVersion: version.version, restoredFromId: version.id }
    });
    await logActivity({
      projectId: environment.projectId,
      actorId: req.user.sub,
      action: 'environment.version.restored',
      targetType: 'environment',
      targetId: environment.id,
      metadata: {
        environment: environment.name,
        restoredFromVersion: version.version,
        restoredToVersion: restoredVersion.version,
        variableCount: version.variables.length
      }
    });

    res.json({
      environment: serializeDocument(environment),
      restoredFrom: serializeEnvironmentVersion(version),
      version: serializeEnvironmentVersion(restoredVersion),
      restoredVariables: version.variables.length
    });
  })
);

async function requireEnvironmentAccess(environmentId, userId) {
  requireObjectId(environmentId, 'environment id');
  const environment = await Environment.findById(environmentId);

  if (!environment) {
    throw new ApiError(404, 'ENV_NOT_FOUND', 'No environment matches the given id.');
  }

  const project = await Project.findOne({
    _id: environment.projectId,
    $or: [{ ownerId: userId }, { 'members.userId': userId }]
  });

  if (!project) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this environment.');
  }

  return environment;
}

async function requireEnvironmentVersion(environmentId, versionId) {
  requireObjectId(versionId, 'version id');
  const version = await EnvironmentVersion.findOne({ _id: versionId, environmentId });
  if (!version) {
    throw new ApiError(404, 'VERSION_NOT_FOUND', 'No environment version matches the given id.');
  }
  return version;
}

function requireProductionConfirmation(req, environment, nextName = '') {
  const touchesProduction = environment.name.toLowerCase() === 'production'
    || nextName.toLowerCase() === 'production';
  if (!touchesProduction) return;

  const confirmation = req.get('x-envvault-production-confirm') || req.body?.productionConfirmation;
  if (confirmation !== 'production') {
    throw new ApiError(
      400,
      'PRODUCTION_CONFIRMATION_REQUIRED',
      'Type production to modify the production environment.'
    );
  }
}

function requireName(value) {
  const name = String(value || '').trim();
  if (!name) throw new ApiError(400, 'NAME_REQUIRED', 'Environment name is required.');
  if (name.length > 80) throw new ApiError(400, 'NAME_TOO_LONG', 'Environment name must be 80 characters or fewer.');
  return name;
}

function validateBulkVariables(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, 'VARIABLES_REQUIRED', 'Provide at least one encrypted variable.');
  }
  if (value.length > 1000) {
    throw new ApiError(400, 'BULK_LIMIT_EXCEEDED', 'A bulk import can contain at most 1000 variables.');
  }

  const seen = new Set();
  return value.map((item, index) => {
    const key = String(item?.key || '').trim().toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      throw new ApiError(400, 'VARIABLE_KEY_INVALID', `Variable ${index + 1} has an invalid key.`);
    }
    if (!item?.encryptedValue || !item?.iv) {
      throw new ApiError(400, 'ENCRYPTED_VALUE_REQUIRED', `Variable ${key} must include encryptedValue and iv.`);
    }
    if (seen.has(key)) {
      throw new ApiError(400, 'DUPLICATE_VARIABLE_KEY', `Variable ${key} appears more than once.`);
    }
    seen.add(key);
    return {
      key,
      encryptedValue: String(item.encryptedValue),
      iv: String(item.iv),
      valueDigest: item.valueDigest ? String(item.valueDigest) : null
    };
  });
}

export default router;
