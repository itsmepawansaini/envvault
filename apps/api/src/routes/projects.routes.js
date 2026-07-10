import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { ApiError, asyncHandler } from '../middleware/error.middleware.js';
import { ActivityLog, EncryptionKey, Environment, KeyRequest, Project, User, Variable } from '../models/index.js';
import { logActivity } from '../services/activity.service.js';
import { requireObjectId, serializeDocument } from '../utils/http.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const archivedFilter = req.query.archived === 'true'
      ? { archivedAt: { $ne: null } }
      : { archivedAt: null };
    const projects = await Project.find({
      ...archivedFilter,
      $or: [{ ownerId: req.user.sub }, { 'members.userId': req.user.sub }]
    }).sort({ createdAt: -1 });

    res.json({ projects: projects.map(serializeDocument) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = requireName(req.body.name, 'Project');
    const duplicate = await Project.findOne({
      name,
      archivedAt: null,
      $or: [{ ownerId: req.user.sub }, { 'members.userId': req.user.sub }]
    });
    if (duplicate) {
      throw new ApiError(409, 'PROJECT_NAME_TAKEN', `A project named ${name} already exists.`);
    }

    const project = await Project.create({
      name,
      ownerId: req.user.sub,
      members: [{ userId: req.user.sub, role: 'owner' }]
    });

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'project.created',
      targetType: 'project',
      targetId: project.id
    });

    res.status(201).json({ project: serializeDocument(project) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub);
    res.json({ project: serializeDocument(project) });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub, { ownerOnly: true });
    if (req.body.name !== undefined) project.name = requireName(req.body.name, 'Project');
    await project.save();

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'project.updated',
      targetType: 'project',
      targetId: project.id,
      metadata: { fields: Object.keys(req.body) }
    });

    res.json({ project: serializeDocument(project) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub, { ownerOnly: true });
    const environments = await Environment.find({ projectId: project.id }).select('_id');
    const environmentIds = environments.map((environment) => environment.id);

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'project.deleted',
      targetType: 'project',
      targetId: project.id
    });

    await Variable.deleteMany({ environmentId: { $in: environmentIds } });
    await EncryptionKey.deleteMany({ projectId: project.id });
    await KeyRequest.deleteMany({ projectId: project.id });
    await Project.deleteOne({ _id: project.id });
    await Environment.deleteMany({ projectId: project.id });

    res.status(204).send();
  })
);

router.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub, { ownerOnly: true });
    project.archivedAt = new Date();
    await project.save();

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'project.archived',
      targetType: 'project',
      targetId: project.id
    });

    res.json({ project: serializeDocument(project) });
  })
);

router.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub, { ownerOnly: true });
    project.archivedAt = null;
    await project.save();

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'project.restored',
      targetType: 'project',
      targetId: project.id
    });

    res.json({ project: serializeDocument(project) });
  })
);

router.get(
  '/:id/environments',
  asyncHandler(async (req, res) => {
    await requireProjectAccess(req.params.id, req.user.sub);
    const environments = await Environment.find({ projectId: req.params.id }).sort({ name: 1 });
    res.json({ environments: environments.map(serializeDocument) });
  })
);

router.post(
  '/:id/environments',
  asyncHandler(async (req, res) => {
    await requireProjectAccess(req.params.id, req.user.sub);
    const environment = await Environment.create({
      projectId: req.params.id,
      name: requireName(req.body.name, 'Environment')
    });

    await logActivity({
      projectId: req.params.id,
      actorId: req.user.sub,
      action: 'environment.created',
      targetType: 'environment',
      targetId: environment.id,
      metadata: { name: environment.name }
    });

    res.status(201).json({ environment: serializeDocument(environment) });
  })
);

router.get(
  '/:id/key',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub);
    const key = await EncryptionKey.findOne({ projectId: project.id, userId: req.user.sub });
    res.json({ key: serializeDocument(key) });
  })
);

router.put(
  '/:id/key',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub);
    if (!req.body.encryptedProjectKey) {
      throw new ApiError(400, 'WRAPPED_KEY_REQUIRED', 'encryptedProjectKey is required.');
    }

    const key = await EncryptionKey.findOneAndUpdate(
      { projectId: project.id, userId: req.user.sub },
      { encryptedProjectKey: req.body.encryptedProjectKey },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'project.key.updated',
      targetType: 'project',
      targetId: project.id
    });

    res.json({ key: serializeDocument(key) });
  })
);

router.get(
  '/:id/key-requests',
  asyncHandler(async (req, res) => {
    await requireProjectAccess(req.params.id, req.user.sub);
    const requests = await KeyRequest.find({
      projectId: req.params.id,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    })
      .populate('userId', 'name email avatarUrl')
      .sort({ createdAt: -1 });

    res.json({
      requests: requests.map((request) => ({
        id: request.id,
        deviceName: request.deviceName,
        publicKey: request.publicKey,
        user: serializeDocument(request.userId),
        createdAt: request.createdAt,
        expiresAt: request.expiresAt
      }))
    });
  })
);

router.post(
  '/:id/key-requests',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub);
    const publicKey = validateDevicePublicKey(req.body.publicKey);
    const deviceName = String(req.body.deviceName || 'CLI device').trim().slice(0, 120);

    await KeyRequest.deleteMany({
      projectId: project.id,
      userId: req.user.sub,
      status: 'pending'
    });
    const request = await KeyRequest.create({
      projectId: project.id,
      userId: req.user.sub,
      deviceName: deviceName || 'CLI device',
      publicKey,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'project.key.requested',
      targetType: 'key-request',
      targetId: request.id,
      metadata: { deviceName: request.deviceName }
    });

    res.status(201).json({
      request: {
        id: request.id,
        status: request.status,
        expiresAt: request.expiresAt
      }
    });
  })
);

router.get(
  '/:id/key-requests/:requestId',
  asyncHandler(async (req, res) => {
    await requireProjectAccess(req.params.id, req.user.sub);
    requireObjectId(req.params.requestId, 'key request id');
    const request = await KeyRequest.findOne({
      _id: req.params.requestId,
      projectId: req.params.id,
      userId: req.user.sub
    });
    if (!request) throw new ApiError(404, 'KEY_REQUEST_NOT_FOUND', 'Device key request was not found.');
    if (request.expiresAt <= new Date()) {
      throw new ApiError(410, 'KEY_REQUEST_EXPIRED', 'Device key request expired.');
    }

    res.json({
      request: {
        id: request.id,
        status: request.status,
        encryptedProjectKey: request.status === 'approved' ? request.encryptedProjectKey : null,
        expiresAt: request.expiresAt
      }
    });
  })
);

router.put(
  '/:id/key-requests/:requestId/approve',
  asyncHandler(async (req, res) => {
    await requireProjectAccess(req.params.id, req.user.sub);
    requireObjectId(req.params.requestId, 'key request id');
    if (!req.body.encryptedProjectKey) {
      throw new ApiError(400, 'ENCRYPTED_PROJECT_KEY_REQUIRED', 'Encrypted project key is required.');
    }

    const request = await KeyRequest.findOne({
      _id: req.params.requestId,
      projectId: req.params.id,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    });
    if (!request) throw new ApiError(404, 'KEY_REQUEST_NOT_FOUND', 'Pending device key request was not found.');

    request.encryptedProjectKey = String(req.body.encryptedProjectKey);
    request.status = 'approved';
    await request.save();

    await logActivity({
      projectId: req.params.id,
      actorId: req.user.sub,
      action: 'project.key.approved',
      targetType: 'key-request',
      targetId: request.id,
      metadata: { deviceName: request.deviceName }
    });

    res.json({ request: { id: request.id, status: request.status } });
  })
);

router.get(
  '/:id/compare',
  asyncHandler(async (req, res) => {
    await requireProjectAccess(req.params.id, req.user.sub);
    if (!req.query.from || !req.query.to) {
      throw new ApiError(400, 'COMPARE_ENV_REQUIRED', 'Both from and to environment ids are required.');
    }

    const from = await Environment.findOne({ projectId: req.params.id, _id: requireObjectId(req.query.from, 'from') });
    const to = await Environment.findOne({ projectId: req.params.id, _id: requireObjectId(req.query.to, 'to') });

    if (!from || !to) {
      throw new ApiError(404, 'ENV_NOT_FOUND', 'One or both environments were not found.');
    }

    const [fromVariables, toVariables] = await Promise.all([
      Variable.find({ environmentId: from.id }),
      Variable.find({ environmentId: to.id })
    ]);

    const diff = compareVariables(fromVariables, toVariables);
    res.json({ from: serializeDocument(from), to: serializeDocument(to), diff });
  })
);

router.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub);
    await project.populate('members.userId', 'name email avatarUrl');

    res.json({
      members: project.members.map(serializeMember),
      canManage: project.ownerId.toString() === req.user.sub
    });
  })
);

router.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub, { ownerOnly: true });
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(400, 'EMAIL_INVALID', 'Enter a valid email address.');
    }

    const duplicate = project.members.some(
      (member) => member.invitedEmail === email || member.userId?.toString() === req.user.sub && email === req.user.email
    );
    if (duplicate) {
      throw new ApiError(409, 'MEMBER_EXISTS', 'This person is already a member or has a pending invitation.');
    }

    const user = await User.findOne({ email });
    project.members.push({
      userId: user?.id || null,
      role: 'member',
      invitedEmail: email,
      encryptedProjectKey: req.body.encryptedProjectKey || null,
      joinedAt: user ? new Date() : null
    });
    await project.save();

    if (user && req.body.encryptedProjectKey) {
      await EncryptionKey.findOneAndUpdate(
        { projectId: project.id, userId: user.id },
        { encryptedProjectKey: req.body.encryptedProjectKey },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: user ? 'member.added' : 'member.invited',
      targetType: 'user',
      targetId: user?.id || req.user.sub,
      metadata: { email }
    });

    await project.populate('members.userId', 'name email avatarUrl');
    const member = project.members.find((item) => item.invitedEmail === email);
    res.status(201).json({ member: serializeMember(member) });
  })
);

router.delete(
  '/:id/members/:memberId',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub, { ownerOnly: true });
    const member = project.members.id(req.params.memberId)
      || project.members.find((item) => item.userId?.toString() === req.params.memberId);

    if (!member) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Project member was not found.');
    if (member.role === 'owner' || member.userId?.toString() === project.ownerId.toString()) {
      throw new ApiError(400, 'OWNER_REMOVE_FORBIDDEN', 'Transfer ownership before removing the owner.');
    }

    const removedUserId = member.userId;
    const removedEmail = member.invitedEmail;
    project.members.pull(member._id);
    await project.save();
    if (removedUserId) {
      await EncryptionKey.deleteOne({ projectId: project.id, userId: removedUserId });
    }

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'member.removed',
      targetType: 'user',
      targetId: removedUserId || req.user.sub,
      metadata: { email: removedEmail }
    });

    res.status(204).send();
  })
);

router.post(
  '/:id/transfer-ownership',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub, { ownerOnly: true });
    const nextOwnerId = requireObjectId(req.body.userId, 'user id').toString();
    const nextOwner = project.members.find((member) => member.userId?.toString() === nextOwnerId);
    const currentOwner = project.members.find((member) => member.userId?.toString() === req.user.sub);

    if (!nextOwner) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'The new owner must be a joined project member.');
    if (nextOwnerId === req.user.sub) {
      throw new ApiError(400, 'ALREADY_OWNER', 'This user already owns the project.');
    }

    nextOwner.role = 'owner';
    if (currentOwner) currentOwner.role = 'member';
    project.ownerId = nextOwnerId;
    await project.save();

    await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action: 'ownership.transferred',
      targetType: 'user',
      targetId: nextOwnerId
    });

    res.json({ project: serializeDocument(project) });
  })
);

router.get(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    await requireProjectAccess(req.params.id, req.user.sub);
    const activity = await ActivityLog.find({ projectId: req.params.id })
      .populate('actorId', 'name email avatarUrl')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ activity: activity.map(serializeDocument) });
  })
);

router.post(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    const project = await requireProjectAccess(req.params.id, req.user.sub);
    const action = String(req.body.action || '');
    const allowedActions = new Set(['variable.revealed', 'variable.copied', 'environment.exported']);
    if (!allowedActions.has(action)) {
      throw new ApiError(400, 'ACTIVITY_ACTION_INVALID', 'This client activity action is not allowed.');
    }

    const targetId = requireObjectId(req.body.targetId, 'activity target id');
    let targetType;
    let metadata;
    if (action.startsWith('variable.')) {
      const variable = await Variable.findById(targetId);
      const environment = variable ? await Environment.findById(variable.environmentId) : null;
      if (!variable || !environment || environment.projectId.toString() !== project.id) {
        throw new ApiError(404, 'VARIABLE_NOT_FOUND', 'Variable was not found in this project.');
      }
      targetType = 'variable';
      metadata = { key: variable.key, environment: environment.name };
    } else {
      const environment = await Environment.findOne({ _id: targetId, projectId: project.id });
      if (!environment) throw new ApiError(404, 'ENV_NOT_FOUND', 'Environment was not found in this project.');
      targetType = 'environment';
      metadata = { environment: environment.name, variableCount: Number(req.body.variableCount || 0) };
    }

    const activity = await logActivity({
      projectId: project.id,
      actorId: req.user.sub,
      action,
      targetType,
      targetId,
      metadata
    });
    res.status(201).json({ activity: serializeDocument(activity) });
  })
);

async function requireProjectAccess(projectId, userId, options = {}) {
  requireObjectId(projectId, 'project id');
  const project = await Project.findOne({
    _id: projectId,
    $or: [{ ownerId: userId }, { 'members.userId': userId }]
  });

  if (!project) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'No project matches the given id.');
  }

  if (options.ownerOnly && project.ownerId.toString() !== userId) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the project owner can perform this action.');
  }

  return project;
}

function serializeMember(member) {
  const user = member.userId && typeof member.userId === 'object'
    ? serializeDocument(member.userId)
    : null;

  return {
    id: user?.id || member.userId?.toString() || member.id,
    user,
    userId: user?.id || member.userId?.toString() || null,
    email: user?.email || member.invitedEmail,
    name: user?.name || null,
    avatarUrl: user?.avatarUrl || null,
    role: member.role,
    status: member.userId ? 'joined' : 'invited',
    joinedAt: member.joinedAt
  };
}

function compareVariables(fromVariables, toVariables) {
  const fromByKey = new Map(fromVariables.map((variable) => [variable.key, variable]));
  const toByKey = new Map(toVariables.map((variable) => [variable.key, variable]));
  const keys = new Set([...fromByKey.keys(), ...toByKey.keys()]);

  return [...keys].sort().reduce(
    (acc, key) => {
      const left = fromByKey.get(key);
      const right = toByKey.get(key);

      if (!left) acc.added.push(key);
      else if (!right) acc.removed.push(key);
      else if (left.valueDigest && right.valueDigest && left.valueDigest !== right.valueDigest) acc.changed.push(key);
      else if (left.encryptedValue !== right.encryptedValue || left.iv !== right.iv) acc.changed.push(key);
      else acc.unchanged.push(key);

      return acc;
    },
    { added: [], removed: [], changed: [], unchanged: [] }
  );
}

function requireName(value, label) {
  const name = String(value || '').trim();
  if (!name) throw new ApiError(400, 'NAME_REQUIRED', `${label} name is required.`);
  if (name.length > 80) throw new ApiError(400, 'NAME_TOO_LONG', `${label} name must be 80 characters or fewer.`);
  return name;
}

function validateDevicePublicKey(value) {
  if (!value || value.kty !== 'RSA' || !value.n || !value.e) {
    throw new ApiError(400, 'PUBLIC_KEY_INVALID', 'A valid RSA device public key is required.');
  }
  return {
    kty: 'RSA',
    n: String(value.n),
    e: String(value.e),
    alg: 'RSA-OAEP-256',
    ext: true,
    key_ops: ['encrypt']
  };
}

export default router;
