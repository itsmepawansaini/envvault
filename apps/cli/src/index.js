#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import {
  decryptValue,
  decryptProjectKeyForDevice,
  diffEnvVariables,
  encryptValue,
  fingerprintValue,
  generateDeviceKeyPair,
  generateProjectKey,
  parseEnv,
  stringifyEnv,
  unwrapProjectKey,
  wrapProjectKey
} from '@envvault/crypto-core';

const defaultApiBase = process.env.ENVVAULT_API_BASE || 'https://envvault-staging.onrender.com/api';
const vaultDir = resolve(process.cwd(), '.envvault');
const configPath = resolve(vaultDir, 'config.json');
const sessionPath = resolve(vaultDir, 'session.json');
const keyPath = resolve(vaultDir, 'project-key.json');
const remotePath = resolve(vaultDir, 'remote.json');

const program = new Command();

program
  .name('envvault')
  .description('Git-shaped encrypted environment variable sync.')
  .version('0.1.2');

program
  .command('login')
  .description('Authenticate with GitHub OAuth device-code flow.')
  .option('--api-base <url>', 'API base URL', defaultApiBase)
  .option('--dev', 'Use the local development login endpoint')
  .action(async (options) => {
    await ensureVaultDir();
    const response = options.dev ? await devLogin(options.apiBase) : await githubDeviceLogin(options.apiBase);

    await writeJson(sessionPath, {
      apiBase: options.apiBase,
      token: response.token,
      refreshToken: response.refreshToken,
      user: response.user,
      createdAt: new Date().toISOString()
    });

    console.log(chalk.green(`Logged in as ${response.user.email}`));
  });

program
  .command('init')
  .description('Link this folder to an EnvVault project and environment.')
  .option('--api-base <url>', 'API base URL')
  .option('--project <id>', 'Project id')
  .option('--env <name>', 'Environment name')
  .option('--generate-key', 'Generate a new project key for an empty CLI-first project')
  .action(async (options) => {
    await ensureVaultDir();
    const session = await readSession(options.apiBase);
    const projectsResponse = await apiFetch('/projects', { apiBase: session.apiBase });
    const projects = projectsResponse.projects || [];

    if (!projects.length) {
      throw new Error('No projects available. Create a project in the dashboard first.');
    }

    const projectId = options.project || (await chooseProject(projects));
    const environmentsResponse = await apiFetch(`/projects/${projectId}/environments`, { apiBase: session.apiBase });
    const environments = environmentsResponse.environments || [];

    if (!environments.length) {
      throw new Error('No environments available. Create an environment in the dashboard first.');
    }

    const environment = options.env || (await chooseEnvironment(environments));
    await writeJson(configPath, {
      projectId,
      environment,
      apiBase: session.apiBase
    });
    await ensureGitignoreEntry();

    let projectKey;
    if (options.generateKey) {
      projectKey = await generateProjectKey();
    } else {
      projectKey = await requestProjectKey({
        apiBase: session.apiBase,
        projectId,
        deviceName: `${hostname()} CLI`
      });
    }
    await writeJson(keyPath, { projectId, projectKey, createdAt: new Date().toISOString() });

    console.log(chalk.green('EnvVault linked and project key restored.'));
    console.log(chalk.dim(`project=${projectId}`));
    console.log(chalk.dim(`environment=${environment}`));
    console.log(chalk.dim(`projectKey=${projectKey.slice(0, 8)}... local only`));
  });

program
  .command('pull')
  .description('Decrypt remote secrets and write a local .env file.')
  .option('--out <path>', 'Output file path', '.env')
  .action(async (options) => {
    const { config, projectKey } = await readCliContext();
    const remote = await pullRemote(config);
    const decrypted = await decryptRemoteVariables(remote.variables, projectKey);

    await writeFile(resolve(process.cwd(), options.out), `${stringifyEnv(decrypted)}\n`);
    await writeJson(remotePath, { pulledAt: new Date().toISOString(), keys: Object.keys(decrypted).sort() });

    console.log(chalk.green(`Pulled ${Object.keys(decrypted).length} keys into ${options.out}`));
  });

const keyCommand = program.command('key').description('Manage the local project key wrapper.');

keyCommand
  .command('publish')
  .description('Wrap the local project key with a sync phrase and store it on the API.')
  .option('--phrase <phrase>', 'Sync phrase')
  .action(async (options) => {
    const { config, projectKey } = await readCliContext();
    const phrase = options.phrase || (await promptText('Sync phrase'));
    if (!phrase) throw new Error('Sync phrase is required.');

    const encryptedProjectKey = await wrapProjectKey(projectKey, phrase);
    await apiFetch(`/projects/${config.projectId}/key`, {
      apiBase: config.apiBase,
      method: 'PUT',
      body: { encryptedProjectKey }
    });

    console.log(chalk.green('Published wrapped project key.'));
  });

keyCommand
  .command('pull')
  .description('Pull and unwrap the project key with a sync phrase.')
  .option('--phrase <phrase>', 'Sync phrase')
  .action(async (options) => {
    const config = await readJson(configPath, 'Run envvault init first.');
    const phrase = options.phrase || (await promptText('Sync phrase'));
    if (!phrase) throw new Error('Sync phrase is required.');

    const response = await apiFetch(`/projects/${config.projectId}/key`, { apiBase: config.apiBase });
    if (!response.key?.encryptedProjectKey) {
      throw new Error('No wrapped project key has been published for this project.');
    }

    const projectKey = await unwrapProjectKey(response.key.encryptedProjectKey, phrase);
    await writeJson(keyPath, { projectId: config.projectId, projectKey, restoredAt: new Date().toISOString() });

    console.log(chalk.green('Restored local project key.'));
  });

program
  .command('status')
  .description('Show drift between local .env and remote state.')
  .option('--file <path>', 'Local env file path', '.env')
  .action(async (options) => {
    const { config, projectKey } = await readCliContext();
    const local = await readLocalEnv(options.file);
    const remote = await pullRemote(config);
    const decryptedRemote = await decryptRemoteVariables(remote.variables, projectKey);
    const diff = diffEnvVariables(decryptedRemote, local);

    printDiff(diff);
  });

program
  .command('push')
  .description('Diff local .env, encrypt changed values, and upload ciphertext.')
  .option('--file <path>', 'Local env file path', '.env')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    const { config, projectKey } = await readCliContext();
    const local = await readLocalEnv(options.file);
    const remote = await pullRemote(config);
    const decryptedRemote = await decryptRemoteVariables(remote.variables, projectKey);
    const diff = diffEnvVariables(decryptedRemote, local);

    printDiff(diff);

    if (!hasChanges(diff)) {
      console.log(chalk.green('Remote environment is already in sync.'));
      return;
    }

    if (!options.yes && !(await confirm('Push these changes?'))) {
      console.log(chalk.yellow('Push cancelled.'));
      return;
    }

    const headers = {};
    let productionConfirmation;
    if (config.environment.toLowerCase() === 'production') {
      productionConfirmation = options.yes ? 'production' : await promptText('Type production to push to production');
      if (productionConfirmation !== 'production') {
        console.log(chalk.yellow('Production push cancelled.'));
        return;
      }
      headers['x-envvault-production-confirm'] = 'production';
    }

    const variables = [];
    for (const [key, value] of Object.entries(local)) {
      const encrypted = await encryptValue(value, projectKey);
      const valueDigest = await fingerprintValue(value, projectKey);
      variables.push({ key, ...encrypted, valueDigest });
    }

    const response = await apiFetch('/cli/push', {
      apiBase: config.apiBase,
      method: 'POST',
      headers,
      body: {
        projectId: config.projectId,
        environment: config.environment,
        replace: true,
        productionConfirmation,
        variables
      }
    });

    await writeJson(remotePath, { pushedAt: new Date().toISOString(), keys: Object.keys(local).sort() });
    console.log(chalk.green(`Pushed ${response.upserted} keys. Removed ${response.deleted}.`));
  });

program.parseAsync().catch((error) => {
  console.error(chalk.red(error.message));
  process.exitCode = 1;
});

async function readCliContext() {
  const config = await readJson(configPath, 'Run envvault init first.');
  const projectKeyFile = await readJson(keyPath, 'Run envvault init first.');
  if (projectKeyFile.projectId && projectKeyFile.projectId !== config.projectId) {
    throw new Error('The local project key belongs to another project. Run envvault init again.');
  }
  return { config, projectKey: projectKeyFile.projectKey };
}

async function readSession(apiBaseOverride) {
  const session = await readJson(sessionPath, 'Run envvault login first.');
  if (apiBaseOverride) session.apiBase = apiBaseOverride;
  return session;
}

async function pullRemote(config) {
  const query = new URLSearchParams({ project: config.projectId, env: config.environment });
  return apiFetch(`/cli/pull?${query.toString()}`, { apiBase: config.apiBase });
}

async function decryptRemoteVariables(variables, projectKey) {
  const decrypted = {};

  for (const variable of variables || []) {
    decrypted[variable.key] = await decryptValue(variable.encryptedValue, variable.iv, projectKey);
  }

  return decrypted;
}

async function readLocalEnv(filePath) {
  const source = await readFile(resolve(process.cwd(), filePath), 'utf8');
  return parseEnv(source);
}

async function apiFetch(path, options = {}) {
  const apiBase = options.apiBase || defaultApiBase;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (options.auth !== false) {
    const session = await readSession(options.apiBase);
    headers.Authorization = `Bearer ${session.token}`;
  }

  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = response.status === 204 ? null : await response.json();

  if (response.status === 401 && options.auth !== false && !options.retried) {
    await refreshCliSession(apiBase);
    return apiFetch(path, { ...options, retried: true });
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Request failed with ${response.status}`);
  }

  return payload;
}

async function refreshCliSession(apiBase) {
  const session = await readSession(apiBase);
  if (!session.refreshToken) throw new Error('Session expired. Run envvault login again.');
  const response = await fetch(`${apiBase}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });
  const payload = await response.json();
  if (!response.ok || !payload.token || !payload.refreshToken) {
    throw new Error('Session expired. Run envvault login again.');
  }
  await writeJson(sessionPath, {
    ...session,
    token: payload.token,
    refreshToken: payload.refreshToken,
    refreshedAt: new Date().toISOString()
  });
}

async function devLogin(apiBase) {
  return apiFetch('/auth/dev-login', {
    apiBase,
    method: 'POST',
    auth: false
  });
}

async function githubDeviceLogin(apiBase) {
  const device = await apiFetch('/cli/device-code', {
    apiBase,
    method: 'POST',
    auth: false
  });

  console.log(chalk.cyan('GitHub authorization required'));
  console.log(`Open: ${chalk.underline(device.verificationUriComplete || device.verificationUri)}`);
  console.log(`Code: ${chalk.bold(device.userCode)}`);

  const startedAt = Date.now();
  let intervalMs = Math.max(Number(device.interval || 5), 1) * 1000;

  while (Date.now() - startedAt < Number(device.expiresIn || 900) * 1000) {
    await wait(intervalMs);
    const response = await apiFetch('/cli/token', {
      apiBase,
      method: 'POST',
      auth: false,
      body: { deviceCode: device.deviceCode }
    });

    if (response.status === 'slow_down') {
      intervalMs += 5000;
      continue;
    }

    if (response.status !== 'pending') return response;
  }

  throw new Error('GitHub device login expired.');
}

async function chooseProject(projects) {
  const response = await prompts({
    type: 'select',
    name: 'projectId',
    message: 'Select project',
    choices: projects.map((project) => ({ title: project.name, value: project.id }))
  });

  if (!response.projectId) throw new Error('Project selection cancelled.');
  return response.projectId;
}

async function chooseEnvironment(environments) {
  const response = await prompts({
    type: 'select',
    name: 'environment',
    message: 'Select environment',
    choices: environments.map((environment) => ({ title: environment.name, value: environment.name }))
  });

  if (!response.environment) throw new Error('Environment selection cancelled.');
  return response.environment;
}

async function confirm(message) {
  const response = await prompts({
    type: 'confirm',
    name: 'value',
    message,
    initial: false
  });

  return response.value === true;
}

async function promptText(message) {
  const response = await prompts({
    type: 'text',
    name: 'value',
    message
  });

  return response.value || '';
}

async function requestProjectKey({ apiBase, projectId, deviceName }) {
  const keyPair = await generateDeviceKeyPair();
  const response = await apiFetch(`/projects/${projectId}/key-requests`, {
    apiBase,
    method: 'POST',
    body: { publicKey: keyPair.publicKey, deviceName }
  });

  console.log(chalk.cyan('Project key approval required.'));
  console.log('Open EnvVault in a browser and approve this CLI device in Team Access.');

  const expiresAt = new Date(response.request.expiresAt).getTime();
  while (Date.now() < expiresAt) {
    await wait(3000);
    const poll = await apiFetch(`/projects/${projectId}/key-requests/${response.request.id}`, { apiBase });
    if (poll.request.status !== 'approved') continue;
    return decryptProjectKeyForDevice(poll.request.encryptedProjectKey, keyPair.privateKey);
  }

  throw new Error('Project key approval expired. Run envvault init again.');
}

async function ensureVaultDir() {
  await mkdir(vaultDir, { recursive: true });
}

async function ensureGitignoreEntry() {
  const gitignorePath = resolve(process.cwd(), '.gitignore');
  let content = '';

  try {
    content = await readFile(gitignorePath, 'utf8');
  } catch (_error) {
    // Create the file below.
  }

  if (!content.split(/\r?\n/).includes('.envvault')) {
    await writeFile(gitignorePath, `${content}${content.endsWith('\n') || !content ? '' : '\n'}.envvault\n`);
  }
}

async function readJson(filePath, missingMessage = `Missing ${filePath}`) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(missingMessage);
    throw error;
  }
}

async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function printDiff(diff) {
  console.log(chalk.cyan('EnvVault status'));
  printDiffLine('+ added', diff.added, chalk.green);
  printDiffLine('~ changed', diff.changed, chalk.yellow);
  printDiffLine('- removed', diff.removed, chalk.red);
  printDiffLine('= same', diff.unchanged, chalk.dim);
}

function printDiffLine(label, keys, color) {
  console.log(color(`${label}: ${keys.length ? keys.join(', ') : 'none'}`));
}

function hasChanges(diff) {
  return diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0;
}

function wait(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
