import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { ApiError, asyncHandler } from '../middleware/error.middleware.js';
import { Environment, Project, Variable } from '../models/index.js';
import {
  createGithubDeviceCode,
  exchangeGithubDeviceCode,
  upsertUserFromGithubToken
} from '../services/github-auth.service.js';
import { logActivity } from '../services/activity.service.js';
import { createSessionPair } from '../services/session.service.js';
import { serializeDocument } from '../utils/http.js';

const router = Router();

router.post(
  '/device-code',
  asyncHandler(async (_req, res) => {
    let deviceCode;
    try {
      deviceCode = await createGithubDeviceCode();
    } catch (error) {
      throw new ApiError(400, 'GITHUB_DEVICE_FLOW_UNAVAILABLE', error.message);
    }

    res.json({
      deviceCode: deviceCode.device_code,
      userCode: deviceCode.user_code,
      verificationUri: deviceCode.verification_uri,
      verificationUriComplete: deviceCode.verification_uri_complete,
      expiresIn: deviceCode.expires_in,
      interval: deviceCode.interval
    });
  })
);

router.post(
  '/token',
  asyncHandler(async (req, res) => {
    if (!req.body.deviceCode) {
      throw new ApiError(400, 'DEVICE_CODE_REQUIRED', 'deviceCode is required.');
    }

    const exchange = await exchangeGithubDeviceCode(req.body.deviceCode);
    if (exchange.error === 'authorization_pending') {
      return res.status(202).json({ status: 'pending' });
    }
    if (exchange.error === 'slow_down') {
      return res.status(202).json({ status: 'slow_down' });
    }
    if (exchange.error) {
      throw new ApiError(400, 'DEVICE_AUTH_FAILED', exchange.error_description || exchange.error);
    }

    const user = await upsertUserFromGithubToken(exchange.access_token);
    const pair = await createSessionPair(user);
    res.json({ ...pair, user: serializeDocument(user) });
  })
);

router.use(requireAuth);

router.get(
  '/pull',
  asyncHandler(async (req, res) => {
    const { project, environment } = await requireCliEnvironment(req, req.user.sub);
    const variables = await Variable.find({ environmentId: environment.id }).sort({ key: 1 });

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'cli.pull',
      targetType: 'environment',
      targetId: environment.id,
      metadata: { environment: environment.name, variableCount: variables.length }
    });

    res.json({
      project: serializeDocument(project),
      environment: serializeDocument(environment),
      variables: variables.map(serializeDocument)
    });
  })
);

router.post(
  '/push',
  asyncHandler(async (req, res) => {
    const { project, environment } = await requireCliEnvironment(req, req.user.sub, req.body);
    requireProductionConfirmation(req, environment);

    const incomingVariables = Array.isArray(req.body.variables) ? req.body.variables : [];
    const incomingKeys = new Set();
    const saved = [];

    for (const item of incomingVariables) {
      if (!item.key || !item.encryptedValue || !item.iv) {
        throw new ApiError(400, 'INVALID_VARIABLE_PAYLOAD', 'Each variable must include key, encryptedValue, and iv.');
      }

      const key = item.key.trim().toUpperCase();
      incomingKeys.add(key);
      const variable = await Variable.findOneAndUpdate(
        { environmentId: environment.id, key },
        {
          key,
          encryptedValue: item.encryptedValue,
          iv: item.iv,
          valueDigest: item.valueDigest,
          updatedBy: req.user.sub
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      saved.push(variable);
    }

    let deletedCount = 0;
    if (req.body.replace === true) {
      const deleteResult = await Variable.deleteMany({
        environmentId: environment.id,
        key: { $nin: [...incomingKeys] }
      });
      deletedCount = deleteResult.deletedCount || 0;
    }

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'cli.push',
      targetType: 'environment',
      targetId: environment.id,
      metadata: { environment: environment.name, upserted: saved.length, deleted: deletedCount }
    });

    res.json({
      environment: serializeDocument(environment),
      upserted: saved.length,
      deleted: deletedCount,
      variables: saved.map(serializeDocument)
    });
  })
);

async function requireCliEnvironment(req, userId, source = req.query) {
  const projectId = source.project || source.projectId;
  const environmentName = source.env || source.environment;

  if (!projectId || !environmentName) {
    throw new ApiError(400, 'CLI_CONFIG_REQUIRED', 'Project id and environment name are required.');
  }

  const project = await Project.findOne({
    _id: projectId,
    $or: [{ ownerId: userId }, { 'members.userId': userId }]
  });

  if (!project) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'No project matches the configured id.');
  }

  const environment = await Environment.findOne({
    projectId: project.id,
    name: environmentName
  });

  if (!environment) {
    throw new ApiError(404, 'ENV_NOT_FOUND', 'No environment matches the configured name.');
  }

  return { project, environment };
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
