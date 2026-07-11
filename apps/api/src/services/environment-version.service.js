import { EnvironmentVersion, Variable } from '../models/index.js';
import { serializeDocument } from '../utils/http.js';

export async function createEnvironmentVersion({ environment, actorId, source, metadata = {} }) {
  const variables = await Variable.find({ environmentId: environment.id }).sort({ key: 1 }).lean();
  const latest = await EnvironmentVersion.findOne({ environmentId: environment.id })
    .sort({ version: -1 })
    .select('version')
    .lean();

  return EnvironmentVersion.create({
    projectId: environment.projectId,
    environmentId: environment.id,
    version: (latest?.version || 0) + 1,
    source,
    metadata,
    createdBy: actorId,
    variables: variables.map((variable) => ({
      key: variable.key,
      encryptedValue: variable.encryptedValue,
      iv: variable.iv,
      valueDigest: variable.valueDigest || null
    }))
  });
}

export function serializeEnvironmentVersion(version, { includeVariables = false } = {}) {
  const serialized = serializeDocument(version);
  serialized.variableCount = version.variables?.length || 0;
  delete serialized.variables;

  if (includeVariables) {
    serialized.variables = (version.variables || []).map((variable) => ({
      key: variable.key,
      encryptedValue: variable.encryptedValue,
      iv: variable.iv,
      valueDigest: variable.valueDigest || null
    }));
  }

  return serialized;
}
