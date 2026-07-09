import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Archive,
  ArchiveRestore,
  CircleUserRound,
  Copy,
  CopyPlus,
  Crown,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileUp,
  GitCompareArrows,
  Github,
  KeyRound,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
  X
} from 'lucide-react';
import {
  decryptValue,
  encryptProjectKeyForDevice,
  encryptValue,
  fingerprintValue,
  generateProjectKey,
  parseEnv,
  stringifyEnv,
  unwrapProjectKey,
  wrapProjectKey
} from '@envvault/crypto-core';
import './styles.css';

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:4500/api';

function App() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [variables, setVariables] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
  const [projectName, setProjectName] = useState('payments-service');
  const [environmentName, setEnvironmentName] = useState('development');
  const [variableKey, setVariableKey] = useState('DATABASE_URL');
  const [variableValue, setVariableValue] = useState('');
  const [status, setStatus] = useState('Ready for development login');
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [revealedValues, setRevealedValues] = useState({});
  const [importPreview, setImportPreview] = useState(null);
  const [compareFromId, setCompareFromId] = useState('');
  const [compareToId, setCompareToId] = useState('');
  const [compareResult, setCompareResult] = useState(null);
  const [syncPhrase, setSyncPhrase] = useState('');
  const [members, setMembers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [keyRequests, setKeyRequests] = useState([]);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhrase, setInvitePhrase] = useState('');
  const [variableSearch, setVariableSearch] = useState('');
  const [projectEnvFile, setProjectEnvFile] = useState(null);
  const [authProviders, setAuthProviders] = useState({ github: true, google: false });
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedEnvironment = environments.find((environment) => environment.id === selectedEnvironmentId);
  const isProduction = selectedEnvironment?.name?.toLowerCase() === 'production';
  const compareCounts = useMemo(() => {
    if (!compareResult) return null;
    return ['added', 'removed', 'changed', 'unchanged'].reduce((acc, key) => {
      acc[key] = compareResult.diff?.[key]?.length || 0;
      return acc;
    }, {});
  }, [compareResult]);
  const importCounts = useMemo(() => {
    if (!importPreview) return null;
    return importPreview.entries.reduce(
      (acc, entry) => {
        acc[entry.mode] += 1;
        if (entry.selected) acc.selected += 1;
        return acc;
      },
      { new: 0, update: 0, skip: 0, selected: 0 }
    );
  }, [importPreview]);
  const filteredVariables = useMemo(() => {
    const query = variableSearch.trim().toUpperCase();
    if (!query) return variables;
    return variables.filter((variable) => variable.key.includes(query));
  }, [variableSearch, variables]);
  const cliSetupCommand = selectedProject && selectedEnvironment
    ? `npx @itspawansaini/envvault login && npx @itspawansaini/envvault init --project ${selectedProject.id} --env ${selectedEnvironment.name}`
    : '';

  const metrics = useMemo(
    () => [
      { icon: <LockKeyhole />, label: 'Security', value: 'Client encrypted' },
      { icon: <KeyRound />, label: 'Projects', value: `${projects.length} project${projects.length === 1 ? '' : 's'}` },
      { icon: <UsersRound />, label: 'Team', value: `${members.length} member${members.length === 1 ? '' : 's'}` },
      { icon: <Activity />, label: 'Variables', value: `${variables.length} key${variables.length === 1 ? '' : 's'}` }
    ],
    [members.length, projects.length, variables.length]
  );

  useEffect(() => {
    apiFetch('/auth/providers').then(setAuthProviders).catch(() => {});
    fetchMe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setSelectedProjectId('');
    fetchProjects();
  }, [showArchivedProjects]);

  useEffect(() => {
    setRevealedValues({});
    setVariableSearch('');
    cancelEdit();
    clearImportPreview();
    setCompareResult(null);
    if (!selectedProjectId) {
      setEnvironments([]);
      setMembers([]);
      setActivity([]);
      setKeyRequests([]);
      setCanManageMembers(false);
      setSelectedEnvironmentId('');
      return;
    }

    fetchEnvironments(selectedProjectId);
    fetchCollaboration(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    setRevealedValues({});
    cancelEdit();
    clearImportPreview();
    if (!selectedEnvironmentId) {
      setVariables([]);
      return;
    }

    fetchVariables(selectedEnvironmentId);
  }, [selectedEnvironmentId]);

  async function fetchMe() {
    try {
      const response = await apiFetch('/auth/me');
      setUser(response.user);
      await fetchProjects();
      setStatus('Connected to EnvVault API');
    } catch (_error) {
      setStatus('Use dev login to start');
    }
  }

  async function devLogin() {
    setIsLoading(true);
    try {
      const response = await apiFetch('/auth/dev-login', { method: 'POST' });
      setUser(response.user);
      setStatus('Development session created');
      await fetchProjects();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function githubLogin() {
    window.location.href = `${apiBase}/auth/github`;
  }

  function googleLogin() {
    window.location.href = `${apiBase}/auth/google`;
  }

  async function logout() {
    setIsLoading(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setProjects([]);
      setSelectedProjectId('');
      setSelectedEnvironmentId('');
      setStatus('Signed out');
      setIsLoading(false);
    }
  }

  async function refreshActiveData() {
    if (!user) return;
    await fetchProjects();
    if (selectedProjectId) await fetchEnvironments(selectedProjectId);
    if (selectedProjectId) await fetchCollaboration(selectedProjectId);
    if (selectedEnvironmentId) await fetchVariables(selectedEnvironmentId);
    setStatus('Workspace refreshed');
  }

  async function fetchProjects() {
    const response = await apiFetch(`/projects${showArchivedProjects ? '?archived=true' : ''}`);
    const nextProjects = response.projects || [];
    setProjects(nextProjects);
    setSelectedProjectId((currentId) => {
      if (nextProjects.some((project) => project.id === currentId)) return currentId;
      return nextProjects[0]?.id || '';
    });
  }

  async function fetchEnvironments(projectId) {
    const response = await apiFetch(`/projects/${projectId}/environments`);
    const nextEnvironments = response.environments || [];
    setEnvironments(nextEnvironments);
    setCompareFromId((currentId) => {
      if (nextEnvironments.some((environment) => environment.id === currentId)) return currentId;
      return nextEnvironments[0]?.id || '';
    });
    setCompareToId((currentId) => {
      if (nextEnvironments.some((environment) => environment.id === currentId)) return currentId;
      return nextEnvironments[1]?.id || nextEnvironments[0]?.id || '';
    });
    setSelectedEnvironmentId((currentId) => {
      if (nextEnvironments.some((environment) => environment.id === currentId)) return currentId;
      return nextEnvironments[0]?.id || '';
    });
  }

  async function fetchVariables(environmentId) {
    const response = await apiFetch(`/environments/${environmentId}/variables`);
    setVariables(response.variables || []);
  }

  async function fetchCollaboration(projectId) {
    const [memberResponse, activityResponse, keyRequestResponse] = await Promise.all([
      apiFetch(`/projects/${projectId}/members`),
      apiFetch(`/projects/${projectId}/activity`),
      apiFetch(`/projects/${projectId}/key-requests`)
    ]);
    setMembers(memberResponse.members || []);
    setCanManageMembers(Boolean(memberResponse.canManage));
    setActivity(activityResponse.activity || []);
    setKeyRequests(keyRequestResponse.requests || []);
  }

  async function approveKeyRequest(request) {
    setIsLoading(true);
    try {
      const projectKey = await ensureProjectKey(selectedProjectId);
      const encryptedProjectKey = await encryptProjectKeyForDevice(projectKey, request.publicKey);
      await apiFetch(`/projects/${selectedProjectId}/key-requests/${request.id}/approve`, {
        method: 'PUT',
        body: JSON.stringify({ encryptedProjectKey })
      });
      await fetchCollaboration(selectedProjectId);
      setStatus(`${request.deviceName} approved`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function inviteMember(event) {
    event.preventDefault();
    if (!selectedProjectId || !inviteEmail.trim()) return;

    setIsLoading(true);
    try {
      let encryptedProjectKey = null;
      if (invitePhrase) {
        const projectKey = await ensureProjectKey(selectedProjectId);
        encryptedProjectKey = await wrapProjectKey(projectKey, invitePhrase);
      }

      await apiFetch(`/projects/${selectedProjectId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), encryptedProjectKey })
      });
      setInviteEmail('');
      setInvitePhrase('');
      await fetchCollaboration(selectedProjectId);
      await fetchProjects();
      setStatus(encryptedProjectKey ? 'Member invited with wrapped key access' : 'Member invited; key access is still pending');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.name || member.email} from this project?`)) return;

    setIsLoading(true);
    try {
      await apiFetch(`/projects/${selectedProjectId}/members/${member.id}`, { method: 'DELETE' });
      await fetchCollaboration(selectedProjectId);
      await fetchProjects();
      setStatus(`${member.name || member.email} removed`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function transferOwnership(member) {
    if (!window.confirm(`Transfer ownership of ${selectedProject.name} to ${member.name || member.email}?`)) return;

    setIsLoading(true);
    try {
      await apiFetch(`/projects/${selectedProjectId}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify({ userId: member.userId })
      });
      await fetchProjects();
      await fetchCollaboration(selectedProjectId);
      setStatus(`Ownership transferred to ${member.name || member.email}`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function runCompare() {
    if (!selectedProjectId || !compareFromId || !compareToId) return;

    setIsLoading(true);
    try {
      const response = await apiFetch(`/projects/${selectedProjectId}/compare?from=${compareFromId}&to=${compareToId}`);
      setCompareResult(response);
      setStatus(`Compared ${response.from.name} to ${response.to.name}`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function createProject(event) {
    event.preventDefault();
    if (!projectName.trim()) return;

    setIsLoading(true);
    try {
      const quickImportEntries = projectEnvFile ? await readEnvFileEntries(projectEnvFile) : [];
      const quickEnvironmentName = projectEnvFile ? detectEnvironmentName(projectEnvFile.name) || 'development' : '';
      const productionHeaders = quickEnvironmentName === 'production'
        ? getProductionHeadersForEnvironment({ name: 'production' }, `import ${quickImportEntries.length} keys`)
        : {};
      if (productionHeaders === null) return;

      const response = await apiFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: projectName.trim() })
      });
      await ensureProjectKey(response.project.id);
      let quickEnvironment = null;

      if (projectEnvFile) {
        if (!quickImportEntries.length) throw new Error('The selected .env file has no valid KEY=value entries.');
        const environmentResponse = await apiFetch(`/projects/${response.project.id}/environments`, {
          method: 'POST',
          body: JSON.stringify({ name: quickEnvironmentName })
        });
        quickEnvironment = environmentResponse.environment;
        const encryptedVariables = await Promise.all(
          quickImportEntries.map(async (entry) => ({
            key: entry.key,
            ...(await encryptSecretPayload(response.project.id, entry.value))
          }))
        );
        await apiFetch(`/environments/${quickEnvironment.id}/variables/bulk-import`, {
          method: 'POST',
          headers: productionHeaders,
          body: JSON.stringify({ variables: encryptedVariables })
        });
      }

      setProjectName('');
      setProjectEnvFile(null);
      setSelectedProjectId(response.project.id);
      await fetchProjects();
      if (quickEnvironment) {
        await fetchEnvironments(response.project.id);
        setSelectedEnvironmentId(quickEnvironment.id);
        await fetchVariables(quickEnvironment.id);
        setStatus(`Project created and ${quickImportEntries.length} encrypted variables imported`);
      } else {
        setStatus('Project created in MongoDB');
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function createEnvironment(event) {
    event.preventDefault();
    if (!selectedProjectId || !environmentName.trim()) return;

    setIsLoading(true);
    try {
      const response = await apiFetch(`/projects/${selectedProjectId}/environments`, {
        method: 'POST',
        body: JSON.stringify({ name: environmentName.trim() })
      });
      setEnvironmentName('');
      setSelectedEnvironmentId(response.environment.id);
      setStatus('Environment created');
      await fetchEnvironments(selectedProjectId);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function renameProject() {
    if (!selectedProject || !canManageMembers) return;
    const name = window.prompt('Rename project', selectedProject.name)?.trim();
    if (!name || name === selectedProject.name) return;

    await runLifecycleAction(
      () => apiFetch(`/projects/${selectedProject.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      }),
      async () => {
        await fetchProjects();
        await fetchCollaboration(selectedProject.id);
      },
      `Project renamed to ${name}`
    );
  }

  async function archiveProject() {
    if (!selectedProject || !canManageMembers) return;
    if (!window.confirm(`Archive ${selectedProject.name}? It will leave the active project list.`)) return;
    const projectId = selectedProject.id;

    await runLifecycleAction(
      () => apiFetch(`/projects/${projectId}/archive`, { method: 'POST' }),
      async () => {
        setSelectedProjectId('');
        await fetchProjects();
      },
      `${selectedProject.name} archived`
    );
  }

  async function restoreProject() {
    if (!selectedProject || !canManageMembers) return;
    const projectId = selectedProject.id;
    const name = selectedProject.name;
    await runLifecycleAction(
      () => apiFetch(`/projects/${projectId}/restore`, { method: 'POST' }),
      async () => {
        setSelectedProjectId('');
        await fetchProjects();
      },
      `${name} restored`
    );
  }

  async function deleteProject() {
    if (!selectedProject || !canManageMembers) return;
    const confirmation = window.prompt(`Type ${selectedProject.name} to permanently delete this project and all its environments.`);
    if (confirmation !== selectedProject.name) {
      if (confirmation !== null) setStatus('Project deletion cancelled');
      return;
    }

    const projectId = selectedProject.id;
    const name = selectedProject.name;
    await runLifecycleAction(
      () => apiFetch(`/projects/${projectId}`, { method: 'DELETE' }),
      async () => {
        window.localStorage.removeItem(projectKeyStorageKey(projectId));
        setSelectedProjectId('');
        await fetchProjects();
      },
      `${name} deleted`
    );
  }

  async function renameEnvironment() {
    if (!selectedEnvironment) return;
    const name = window.prompt('Rename environment', selectedEnvironment.name)?.trim();
    if (!name || name === selectedEnvironment.name) return;
    const headers = getProductionHeadersForEnvironment(
      name.toLowerCase() === 'production' ? { name: 'production' } : selectedEnvironment,
      `rename ${selectedEnvironment.name} to ${name}`
    );
    if (headers === null) return;

    await runLifecycleAction(
      () => apiFetch(`/environments/${selectedEnvironment.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name })
      }),
      () => fetchEnvironments(selectedProjectId),
      `Environment renamed to ${name}`
    );
  }

  async function cloneEnvironment() {
    if (!selectedEnvironment) return;
    const name = window.prompt('Name the cloned environment', `${selectedEnvironment.name}-copy`)?.trim();
    if (!name) return;
    const headers = getProductionHeadersForEnvironment(
      name.toLowerCase() === 'production' ? { name: 'production' } : selectedEnvironment,
      `clone ${selectedEnvironment.name} as ${name}`
    );
    if (headers === null) return;

    await runLifecycleAction(
      () => apiFetch(`/environments/${selectedEnvironment.id}/clone`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name })
      }),
      async (response) => {
        await fetchEnvironments(selectedProjectId);
        setSelectedEnvironmentId(response.environment.id);
      },
      `${selectedEnvironment.name} cloned as ${name}`
    );
  }

  async function deleteEnvironment() {
    if (!selectedEnvironment) return;
    const headers = getProductionHeaders(`delete ${selectedEnvironment.name}`);
    if (headers === null) return;
    if (!window.confirm(`Delete ${selectedEnvironment.name} and all of its variables? This cannot be undone.`)) return;
    const environmentId = selectedEnvironment.id;
    const name = selectedEnvironment.name;

    await runLifecycleAction(
      () => apiFetch(`/environments/${environmentId}`, { method: 'DELETE', headers }),
      async () => {
        setSelectedEnvironmentId('');
        await fetchEnvironments(selectedProjectId);
      },
      `${name} deleted`
    );
  }

  async function runLifecycleAction(action, onSuccess, successMessage) {
    setIsLoading(true);
    try {
      const response = await action();
      await onSuccess(response);
      setStatus(successMessage);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function createVariable(event) {
    event.preventDefault();
    const normalizedKey = normalizeKey(variableKey);
    if (!selectedProjectId || !selectedEnvironmentId || !normalizedKey || !variableValue) return;

    if (variables.some((variable) => variable.key === normalizedKey)) {
      setStatus(`${normalizedKey} already exists in this environment.`);
      return;
    }

    const productionHeaders = getProductionHeaders('add a variable');
    if (productionHeaders === null) return;

    setIsLoading(true);
    try {
      const encryptedPayload = await encryptSecretPayload(selectedProjectId, variableValue);
      await apiFetch(`/environments/${selectedEnvironmentId}/variables`, {
        method: 'POST',
        headers: productionHeaders,
        body: JSON.stringify({
          key: normalizedKey,
          ...encryptedPayload
        })
      });

      setVariableKey('');
      setVariableValue('');
      setStatus('Variable encrypted in browser and saved as ciphertext');
      await fetchVariables(selectedEnvironmentId);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function startEdit(variable) {
    setEditingId(variable.id);
    setEditKey(variable.key);
    setEditValue(revealedValues[variable.id] || '');
  }

  function cancelEdit() {
    setEditingId('');
    setEditKey('');
    setEditValue('');
  }

  async function saveVariable(variable) {
    const normalizedKey = normalizeKey(editKey);
    if (!normalizedKey) return;

    const duplicate = variables.some((item) => item.id !== variable.id && item.key === normalizedKey);
    if (duplicate) {
      setStatus(`${normalizedKey} already exists in this environment.`);
      return;
    }

    const productionHeaders = getProductionHeaders(`edit ${variable.key}`);
    if (productionHeaders === null) return;

    setIsLoading(true);
    try {
      const body = { key: normalizedKey };
      if (editValue) Object.assign(body, await encryptSecretPayload(selectedProjectId, editValue));

      const response = await apiFetch(`/variables/${variable.id}`, {
        method: 'PATCH',
        headers: productionHeaders,
        body: JSON.stringify(body)
      });

      setVariables((current) => current.map((item) => (item.id === variable.id ? response.variable : item)));
      setRevealedValues((current) => {
        const next = { ...current };
        if (editValue) next[variable.id] = editValue;
        return next;
      });
      cancelEdit();
      setStatus(`${normalizedKey} updated`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteVariable(variable) {
    const productionHeaders = getProductionHeaders(`delete ${variable.key}`);
    if (productionHeaders === null) return;

    if (!window.confirm(`Delete ${variable.key}? This cannot be undone.`)) return;

    setIsLoading(true);
    try {
      await apiFetch(`/variables/${variable.id}`, {
        method: 'DELETE',
        headers: productionHeaders
      });
      setVariables((current) => current.filter((item) => item.id !== variable.id));
      setRevealedValues((current) => {
        const next = { ...current };
        delete next[variable.id];
        return next;
      });
      setStatus(`${variable.key} deleted`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleReveal(variable) {
    if (revealedValues[variable.id]) {
      setRevealedValues((current) => {
        const next = { ...current };
        delete next[variable.id];
        return next;
      });
      return;
    }

    try {
      const projectKey = await ensureProjectKey(selectedProjectId);
      const plaintext = await decryptValue(variable.encryptedValue, variable.iv, projectKey);
      await logSensitiveAction('variable.revealed', variable.id);
      setRevealedValues((current) => ({ ...current, [variable.id]: plaintext }));
      setStatus(`${variable.key} revealed locally`);
    } catch (_error) {
      setStatus(`Cannot decrypt ${variable.key} with this browser's local project key.`);
    }
  }

  async function copyVariable(variable) {
    try {
      const projectKey = await ensureProjectKey(selectedProjectId);
      const plaintext = revealedValues[variable.id] || (await decryptValue(variable.encryptedValue, variable.iv, projectKey));
      await logSensitiveAction('variable.copied', variable.id);
      await navigator.clipboard.writeText(plaintext);
      setStatus(`${variable.key} copied`);
    } catch (_error) {
      setStatus(`Cannot copy ${variable.key}; reveal failed with this local key.`);
    }
  }

  function getProductionHeaders(action) {
    return getProductionHeadersForEnvironment(selectedEnvironment, action);
  }

  function getProductionHeadersForEnvironment(environment, action) {
    if (environment?.name?.toLowerCase() !== 'production') return {};

    const confirmation = window.prompt(`Type production to ${action} in the production environment.`);
    if (confirmation !== 'production') {
      setStatus('Production change cancelled');
      return null;
    }

    return { 'x-envvault-production-confirm': 'production' };
  }

  async function handleEnvFile(file) {
    if (!file || !selectedProjectId) return;

    try {
      const validEntries = await readEnvFileEntries(file);

      if (!validEntries.length) {
        setStatus('No valid KEY=value pairs found in file.');
        return;
      }

      const targetEnvironment = await ensureImportEnvironment(file.name);
      const response = await apiFetch(`/environments/${targetEnvironment.id}/variables`);
      const existingByKey = new Map((response.variables || []).map((variable) => [variable.key, variable]));

      setSelectedEnvironmentId(targetEnvironment.id);
      setVariables(response.variables || []);
      setImportPreview({
        fileName: file.name,
        environment: targetEnvironment,
        entries: validEntries.map((entry) => {
          const existing = existingByKey.get(entry.key);
          return {
            ...entry,
            id: `${entry.key}:${existing?.id || 'new'}`,
            mode: existing ? 'update' : 'new',
            selected: true,
            existingId: existing?.id || null
          };
        })
      });
      setStatus(`Prepared ${validEntries.length} keys from ${file.name}`);
    } catch (error) {
      setStatus(error.message || 'Import failed.');
    }
  }

  async function ensureImportEnvironment(fileName) {
    const detectedName = detectEnvironmentName(fileName);
    const targetName = detectedName || selectedEnvironment?.name;

    if (!targetName) {
      throw new Error('Select an environment before importing this file.');
    }

    const existing = environments.find((environment) => environment.name.toLowerCase() === targetName.toLowerCase());
    if (existing) return existing;

    const response = await apiFetch(`/projects/${selectedProjectId}/environments`, {
      method: 'POST',
      body: JSON.stringify({ name: targetName })
    });

    await fetchEnvironments(selectedProjectId);
    return response.environment;
  }

  function toggleImportEntry(entryId) {
    setImportPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        entries: current.entries.map((entry) =>
          entry.id === entryId
            ? { ...entry, selected: !entry.selected, mode: entry.selected ? 'skip' : entry.existingId ? 'update' : 'new' }
            : entry
        )
      };
    });
  }

  function clearImportPreview() {
    setImportPreview(null);
  }

  async function runImport() {
    if (!importPreview || !selectedProjectId) return;
    const selectedEntries = importPreview.entries.filter((entry) => entry.selected);

    if (!selectedEntries.length) {
      setStatus('No import rows selected.');
      return;
    }

    const productionHeaders = getProductionHeadersForEnvironment(importPreview.environment, `import ${selectedEntries.length} keys`);
    if (productionHeaders === null) return;

    setIsLoading(true);
    try {
      const encryptedVariables = await Promise.all(
        selectedEntries.map(async (entry) => ({
          key: entry.key,
          ...(await encryptSecretPayload(selectedProjectId, entry.value))
        }))
      );
      const response = await apiFetch(`/environments/${importPreview.environment.id}/variables/bulk-import`, {
        method: 'POST',
        headers: productionHeaders,
        body: JSON.stringify({ variables: encryptedVariables })
      });

      setSelectedEnvironmentId(importPreview.environment.id);
      await fetchVariables(importPreview.environment.id);
      setStatus(`Imported ${response.summary.created} new and ${response.summary.updated} updated keys into ${importPreview.environment.name}`);
      clearImportPreview();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function exportEnvironment() {
    if (!selectedProjectId || !selectedEnvironment || !variables.length) return;

    try {
      const projectKey = await ensureProjectKey(selectedProjectId);
      const decrypted = {};
      for (const variable of variables) {
        decrypted[variable.key] = await decryptValue(variable.encryptedValue, variable.iv, projectKey);
      }
      await logSensitiveAction('environment.exported', selectedEnvironment.id, { variableCount: variables.length });

      const content = `${stringifyEnv(decrypted)}\n`;
      const suffix = selectedEnvironment.name === 'development' ? '' : `.${selectedEnvironment.name}`;
      downloadTextFile(`.env${suffix}`, content);
      setStatus(`Exported ${variables.length} keys from ${selectedEnvironment.name}`);
    } catch (_error) {
      setStatus(`Export failed; one or more keys cannot be decrypted with this browser's local project key.`);
    }
  }

  async function publishProjectKey() {
    if (!selectedProjectId || !syncPhrase) return;

    setIsLoading(true);
    try {
      const projectKey = await ensureProjectKey(selectedProjectId);
      const encryptedProjectKey = await wrapProjectKey(projectKey, syncPhrase);
      await apiFetch(`/projects/${selectedProjectId}/key`, {
        method: 'PUT',
        body: JSON.stringify({ encryptedProjectKey })
      });
      setSyncPhrase('');
      setStatus('Wrapped project key published');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function restoreProjectKey() {
    if (!selectedProjectId || !syncPhrase) return;

    setIsLoading(true);
    try {
      const response = await apiFetch(`/projects/${selectedProjectId}/key`);
      if (!response.key?.encryptedProjectKey) {
        throw new Error('No wrapped project key has been published for this project.');
      }

      const projectKey = await unwrapProjectKey(response.key.encryptedProjectKey, syncPhrase);
      window.localStorage.setItem(projectKeyStorageKey(selectedProjectId), projectKey);
      setSyncPhrase('');
      setRevealedValues({});
      setStatus('Local project key restored');
    } catch (_error) {
      setStatus('Could not restore project key with that sync phrase.');
    } finally {
      setIsLoading(false);
    }
  }

  async function copyCliSetupCommand() {
    if (!cliSetupCommand) return;
    await navigator.clipboard.writeText(cliSetupCommand);
    setStatus('CLI setup command copied');
  }

  async function logSensitiveAction(action, targetId, metadata = {}) {
    await apiFetch(`/projects/${selectedProjectId}/activity`, {
      method: 'POST',
      body: JSON.stringify({ action, targetId, ...metadata })
    });
    fetchCollaboration(selectedProjectId).catch(() => {});
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">EV</div>
          <div>
            <strong>EnvVault</strong>
            <span>ciphertext-only secret sync</span>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">Workspace</span>
          <strong>{selectedProject?.name || 'No project selected'}</strong>
          <small>{selectedEnvironment?.name || 'No environment selected'}</small>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">Local key</span>
          <strong>{selectedProjectId ? 'Browser stored' : 'Pending'}</strong>
          <small>Used only for client-side decrypt.</small>
        </div>

        <div className="sidebar-section key-sync">
          <span className="sidebar-label">Key Sync</span>
          <input
            value={syncPhrase}
            onChange={(event) => setSyncPhrase(event.target.value)}
            type="password"
            placeholder="Sync phrase"
            aria-label="Project key sync phrase"
            disabled={!selectedProjectId || isLoading}
          />
          <div className="key-sync-actions">
            <button type="button" onClick={publishProjectKey} disabled={!selectedProjectId || !syncPhrase || isLoading}>
              Publish
            </button>
            <button type="button" onClick={restoreProjectKey} disabled={!selectedProjectId || !syncPhrase || isLoading}>
              Restore
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">Import</span>
          <strong>{importPreview ? importPreview.fileName : 'No file staged'}</strong>
          <small>{importCounts ? `${importCounts.selected} selected` : 'Drop or choose a .env file.'}</small>
        </div>
      </aside>

      <section className="workspace" id="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{selectedProject?.name || 'envvault workspace'}</p>
            <h1>Environment Vault</h1>
            <p className="topbar-note" role="status" aria-live="polite">{status}</p>
          </div>
          <div className="topbar-actions">
            {user ? (
              <>
                <div className="user-chip">
                  {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <CircleUserRound size={18} />}
                  <span>{user.name}</span>
                </div>
                <button className="icon-action" onClick={logout} aria-label="Sign out" title="Sign out" disabled={isLoading}>
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                {authProviders.github ? (
                  <button className="primary-action" onClick={githubLogin} disabled={isLoading}>
                    <Github size={18} />
                    GitHub
                  </button>
                ) : null}
                {authProviders.google ? (
                  <button className="primary-action" onClick={googleLogin} disabled={isLoading}>
                    <CircleUserRound size={18} />
                    Google
                  </button>
                ) : null}
                <button className="icon-action" onClick={devLogin} aria-label="Development login" title="Development login" disabled={isLoading}>
                  <KeyRound size={18} />
                </button>
              </>
            )}
            <button className="icon-action" onClick={refreshActiveData} aria-label="Refresh workspace" disabled={!user || isLoading}>
              <RefreshCcw size={18} />
            </button>
          </div>
        </header>

        <section className="metric-grid" aria-label="Project summary">
          {metrics.map((metric) => (
            <Metric key={metric.label} icon={metric.icon} label={metric.label} value={metric.value} />
          ))}
        </section>

        {cliSetupCommand ? (
          <section className="cli-strip" aria-label="CLI setup">
            <div>
              <span>CLI setup</span>
              <code title={cliSetupCommand}>{cliSetupCommand}</code>
            </div>
            <button className="icon-action" type="button" onClick={copyCliSetupCommand} aria-label="Copy CLI setup command" title="Copy command">
              <Copy size={17} />
            </button>
          </section>
        ) : null}

        <section className="content-grid">
          <Panel
            title="Projects"
            subtitle="Create and select a Mongo-backed project."
            action={
              <div className="panel-actions lifecycle-actions">
                <button className="icon-action" type="button" onClick={renameProject} aria-label="Rename project" title="Rename project" disabled={!selectedProject || !canManageMembers || isLoading}>
                  <Edit3 size={16} />
                </button>
                {showArchivedProjects ? (
                  <button className="icon-action" type="button" onClick={restoreProject} aria-label="Restore project" title="Restore project" disabled={!selectedProject || !canManageMembers || isLoading}>
                    <ArchiveRestore size={16} />
                  </button>
                ) : (
                  <button className="icon-action" type="button" onClick={archiveProject} aria-label="Archive project" title="Archive project" disabled={!selectedProject || !canManageMembers || isLoading}>
                    <Archive size={16} />
                  </button>
                )}
                <button className="icon-action danger" type="button" onClick={deleteProject} aria-label="Delete project" title="Delete project" disabled={!selectedProject || !canManageMembers || isLoading}>
                  <Trash2 size={16} />
                </button>
              </div>
            }
          >
            <div className="project-view-toggle" role="tablist" aria-label="Project status">
              <button type="button" role="tab" aria-selected={!showArchivedProjects} className={!showArchivedProjects ? 'active' : ''} onClick={() => setShowArchivedProjects(false)}>
                Active
              </button>
              <button type="button" role="tab" aria-selected={showArchivedProjects} className={showArchivedProjects ? 'active' : ''} onClick={() => setShowArchivedProjects(true)}>
                Archived
              </button>
            </div>
            {!showArchivedProjects ? <form className="inline-form project-create-form" onSubmit={createProject}>
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Project name"
                aria-label="Project name"
                disabled={!user || isLoading}
              />
              <label className={`icon-action file-icon-action ${projectEnvFile ? 'attached' : ''}`} aria-label="Attach env file" title={projectEnvFile ? projectEnvFile.name : 'Attach .env file'}>
                <FileUp size={17} />
                <input
                  key={projectEnvFile ? `${projectEnvFile.name}:${projectEnvFile.lastModified}` : 'empty'}
                  type="file"
                  accept=".env,.txt"
                  onChange={(event) => setProjectEnvFile(event.target.files?.[0] || null)}
                  disabled={!user || isLoading}
                />
              </label>
              <button className="icon-action" type="submit" aria-label="Create project" disabled={!user || isLoading}>
                <Plus size={18} />
              </button>
            </form> : null}
            {projectEnvFile ? (
              <div className="attached-file">
                <FileUp size={14} />
                <span>{projectEnvFile.name}</span>
                <button type="button" onClick={() => setProjectEnvFile(null)} aria-label="Remove attached env file">
                  <X size={14} />
                </button>
              </div>
            ) : null}
            <div className="stack-list">
              {projects.length === 0 ? (
                <div className="empty-state">{user ? (showArchivedProjects ? 'No archived projects.' : 'No projects yet.') : 'Log in first.'}</div>
              ) : (
                projects.map((project) => (
                  <button
                    className={`select-row ${project.id === selectedProjectId ? 'active' : ''}`}
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    type="button"
                  >
                    <div>
                      <strong>{project.name}</strong>
                      <span>{project.archivedAt ? 'Archived' : 'Active project'}</span>
                    </div>
                    <small>{project.members?.length || 0} member{project.members?.length === 1 ? '' : 's'}</small>
                  </button>
                ))
              )}
            </div>
          </Panel>

          <Panel
            title="Environments"
            subtitle={selectedProject ? `Branch-shaped secret sets for ${selectedProject.name}.` : 'Select a project first.'}
            action={
              <div className="panel-actions lifecycle-actions">
                <button className="icon-action" type="button" onClick={renameEnvironment} aria-label="Rename environment" title="Rename environment" disabled={!selectedEnvironment || isLoading}>
                  <Edit3 size={16} />
                </button>
                <button className="icon-action" type="button" onClick={cloneEnvironment} aria-label="Clone environment" title="Clone environment" disabled={!selectedEnvironment || isLoading}>
                  <CopyPlus size={16} />
                </button>
                <button className="icon-action" onClick={runCompare} aria-label="Compare environments" title="Compare environments" disabled={!selectedProject || !compareFromId || !compareToId || isLoading}>
                  <GitCompareArrows size={16} />
                </button>
                <button className="icon-action danger" type="button" onClick={deleteEnvironment} aria-label="Delete environment" title="Delete environment" disabled={!selectedEnvironment || isLoading}>
                  <Trash2 size={16} />
                </button>
              </div>
            }
          >
            <form className="inline-form" onSubmit={createEnvironment}>
              <input
                value={environmentName}
                onChange={(event) => setEnvironmentName(event.target.value)}
                placeholder="Environment name"
                aria-label="Environment name"
                disabled={!selectedProject || isLoading}
              />
              <button className="icon-action" type="submit" aria-label="Create environment" disabled={!selectedProject || isLoading}>
                <Plus size={18} />
              </button>
            </form>
            <div className="stack-list">
              {environments.length === 0 ? (
                <div className="empty-state">{selectedProject ? 'No environments yet.' : 'Select a project first.'}</div>
              ) : (
                environments.map((environment) => (
                  <button
                    className={`select-row ${environment.id === selectedEnvironmentId ? 'active' : ''} ${
                      environment.name.toLowerCase() === 'production' ? 'production' : ''
                    }`}
                    key={environment.id}
                    onClick={() => setSelectedEnvironmentId(environment.id)}
                    type="button"
                  >
                    <div>
                      <strong>{environment.name}</strong>
                      <span>{environment.id}</span>
                    </div>
                    <small>{environment.id === selectedEnvironmentId ? 'Selected' : 'Open'}</small>
                  </button>
                ))
              )}
            </div>
          </Panel>
        </section>

        <section className="content-grid collaboration-grid">
          <Panel
            title="Team Access"
            subtitle={canManageMembers ? 'Invite teammates and manage project ownership.' : 'People with access to this project.'}
            action={<span className="success-badge">{members.length} total</span>}
          >
            {canManageMembers ? (
              <form className="invite-form" onSubmit={inviteMember}>
                <input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  type="email"
                  placeholder="teammate@example.com"
                  aria-label="Teammate email"
                  disabled={isLoading}
                />
                <input
                  value={invitePhrase}
                  onChange={(event) => setInvitePhrase(event.target.value)}
                  type="password"
                  placeholder="Shared key phrase (optional)"
                  aria-label="Shared key phrase"
                  disabled={isLoading}
                />
                <button className="icon-action" type="submit" aria-label="Invite member" disabled={!inviteEmail.trim() || isLoading}>
                  <UserPlus size={18} />
                </button>
              </form>
            ) : null}

            {keyRequests.length ? (
              <div className="key-request-list">
                {keyRequests.map((request) => (
                  <div className="key-request-row" key={request.id}>
                    <KeyRound size={17} />
                    <div>
                      <strong>{request.deviceName}</strong>
                      <span>{request.user?.name || request.user?.email || 'Project member'} requests key access</span>
                    </div>
                    <button className="primary-action" type="button" onClick={() => approveKeyRequest(request)} disabled={isLoading}>
                      Approve
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="member-list">
              {members.map((member) => (
                <div className="member-row" key={member.id}>
                  <div className="member-avatar">
                    {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : (member.name || member.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="member-identity">
                    <strong>{member.name || member.email}</strong>
                    <span>{member.name ? member.email : member.status === 'invited' ? 'Awaiting GitHub sign-in' : 'Project member'}</span>
                  </div>
                  <span className={`member-status ${member.status}`}>{member.role === 'owner' ? 'owner' : member.status}</span>
                  {canManageMembers && member.role !== 'owner' ? (
                    <div className="row-actions">
                      {member.status === 'joined' ? (
                        <button className="icon-action" type="button" onClick={() => transferOwnership(member)} aria-label={`Make ${member.name || member.email} owner`}>
                          <Crown size={16} />
                        </button>
                      ) : null}
                      <button className="icon-action danger" type="button" onClick={() => removeMember(member)} aria-label={`Remove ${member.name || member.email}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Activity" subtitle="Recent project changes with actor and timestamp." action={<Activity size={18} />}>
            <div className="activity-list">
              {activity.length ? activity.slice(0, 12).map((entry) => (
                <div className="activity-row" key={entry.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{formatActivity(entry)}</strong>
                    <span>{entry.actorId?.name || entry.actorId?.email || 'Unknown user'} · {formatRelativeTime(entry.createdAt)}</span>
                  </div>
                </div>
              )) : <div className="empty-state">No activity recorded yet.</div>}
            </div>
          </Panel>
        </section>

        <section className="content-grid single-row">
          <Panel
            title="Environment Diff"
            subtitle="Compare key presence and keyed value fingerprints without revealing plaintext."
            action={compareCounts ? <span className="success-badge">{compareCounts.changed + compareCounts.added + compareCounts.removed} drift</span> : null}
          >
            <div className="compare-toolbar">
              <label>
                <span>From</span>
                <select value={compareFromId} onChange={(event) => setCompareFromId(event.target.value)} disabled={environments.length < 1}>
                  {environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>To</span>
                <select value={compareToId} onChange={(event) => setCompareToId(event.target.value)} disabled={environments.length < 1}>
                  {environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-action" type="button" onClick={runCompare} disabled={!selectedProject || !compareFromId || !compareToId || isLoading}>
                <GitCompareArrows size={18} />
                Compare
              </button>
            </div>

            {compareResult ? (
              <div className="diff-grid">
                <DiffColumn title="Added" tone="added" keys={compareResult.diff.added} />
                <DiffColumn title="Removed" tone="removed" keys={compareResult.diff.removed} />
                <DiffColumn title="Changed" tone="changed" keys={compareResult.diff.changed} />
                <DiffColumn title="Same" tone="same" keys={compareResult.diff.unchanged} />
              </div>
            ) : (
              <div className="empty-state">
                {environments.length > 1 ? 'Select two environments and run compare.' : 'Create at least two environments to compare drift.'}
              </div>
            )}
          </Panel>
        </section>

        <section className="content-grid single-row">
          <Panel
            title="Variables"
            subtitle={
              selectedEnvironment
                ? `Values are encrypted locally before saving to ${selectedEnvironment.name}.`
                : 'Select an environment first.'
            }
            action={
              <div className="panel-actions">
                {isProduction ? <span className="danger-badge">production guard</span> : <span className="success-badge">masked by default</span>}
                <button className="icon-action" type="button" onClick={exportEnvironment} aria-label="Export environment" disabled={!variables.length}>
                  <Download size={16} />
                </button>
              </div>
            }
          >
            <div
              className="drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleEnvFile(event.dataTransfer.files?.[0]);
              }}
            >
              <FileUp size={18} />
              <div>
                <strong>Import .env</strong>
                <span>.env.production creates/selects production, .env.staging selects staging.</span>
              </div>
              <label className="file-button">
                Choose
                <input
                  type="file"
                  accept=".env,.txt"
                  onChange={(event) => handleEnvFile(event.target.files?.[0])}
                  disabled={!selectedProject || isLoading}
                />
              </label>
            </div>

            {importPreview ? (
              <div className="import-preview">
                <div className="import-summary">
                  <div>
                    <strong>{importPreview.fileName}</strong>
                    <span>
                      {importCounts.new} new · {importCounts.update} update · {importCounts.skip} skipped
                    </span>
                  </div>
                  <div className="import-actions">
                    <button className="primary-action" type="button" onClick={runImport} disabled={isLoading}>
                      <Upload size={16} />
                      Import {importCounts.selected}
                    </button>
                    <button className="icon-action" type="button" onClick={clearImportPreview} aria-label="Clear import preview">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="import-list">
                  {importPreview.entries.map((entry) => (
                    <button
                      className={`import-row ${entry.selected ? '' : 'skipped'}`}
                      key={entry.id}
                      type="button"
                      onClick={() => toggleImportEntry(entry.id)}
                    >
                      <code>{entry.key}</code>
                      <span>{entry.value ? 'value detected' : 'empty value'}</span>
                      <small>{entry.mode}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="variable-toolbar">
              <Search size={17} aria-hidden="true" />
              <input
                value={variableSearch}
                onChange={(event) => setVariableSearch(event.target.value)}
                type="search"
                placeholder="Filter variable keys"
                aria-label="Filter variable keys"
                disabled={!selectedEnvironment}
              />
              <span>{filteredVariables.length} of {variables.length}</span>
              {variableSearch ? (
                <button className="icon-action" type="button" onClick={() => setVariableSearch('')} aria-label="Clear variable search" title="Clear search">
                  <X size={16} />
                </button>
              ) : null}
            </div>

            <form className="secret-form" onSubmit={createVariable}>
              <input
                value={variableKey}
                onChange={(event) => setVariableKey(event.target.value)}
                placeholder="KEY_NAME"
                aria-label="Variable key"
                disabled={!selectedEnvironment || isLoading}
              />
              <input
                value={variableValue}
                onChange={(event) => setVariableValue(event.target.value)}
                placeholder="Secret value"
                type="password"
                aria-label="Variable secret value"
                disabled={!selectedEnvironment || isLoading}
              />
              <button className="primary-action" type="submit" disabled={!selectedEnvironment || isLoading}>
                <LockKeyhole size={18} />
                Encrypt
              </button>
            </form>

            <div className="variable-list">
              {variables.length === 0 ? (
                <div className="empty-state">
                  {selectedEnvironment ? 'No variables in this environment yet.' : 'Select an environment first.'}
                </div>
              ) : filteredVariables.length === 0 ? (
                <div className="empty-state">No variable keys match “{variableSearch}”.</div>
              ) : (
                filteredVariables.map((variable) => (
                  <VariableRow
                    key={variable.id}
                    variable={variable}
                    isEditing={editingId === variable.id}
                    editKey={editKey}
                    editValue={editValue}
                    revealedValue={revealedValues[variable.id]}
                    isLoading={isLoading}
                    onStartEdit={startEdit}
                    onCancelEdit={cancelEdit}
                    onSave={saveVariable}
                    onDelete={deleteVariable}
                    onToggleReveal={toggleReveal}
                    onCopy={copyVariable}
                    onEditKeyChange={setEditKey}
                    onEditValueChange={setEditValue}
                  />
                ))
              )}
            </div>
          </Panel>
        </section>
      </section>
    </main>
  );
}

function VariableRow({
  variable,
  isEditing,
  editKey,
  editValue,
  revealedValue,
  isLoading,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onToggleReveal,
  onCopy,
  onEditKeyChange,
  onEditValueChange
}) {
  if (isEditing) {
    return (
      <div className="variable-row editing">
        <input value={editKey} onChange={(event) => onEditKeyChange(event.target.value)} aria-label="Variable key" />
        <input
          value={editValue}
          onChange={(event) => onEditValueChange(event.target.value)}
          type="password"
          placeholder="New value, optional"
          aria-label="Variable value"
        />
        <small>{new Date(variable.updatedAt).toLocaleString()}</small>
        <div className="row-actions">
          <button className="icon-action" onClick={() => onSave(variable)} type="button" aria-label={`Save ${variable.key}`} disabled={isLoading}>
            <Save size={16} />
          </button>
          <button className="icon-action" onClick={onCancelEdit} type="button" aria-label="Cancel edit" disabled={isLoading}>
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="variable-row">
      <code>{variable.key}</code>
      <span className={revealedValue ? 'secret-value revealed' : 'secret-value'}>{revealedValue || '••••••••••••'}</span>
      <small>{new Date(variable.updatedAt).toLocaleString()}</small>
      <div className="row-actions">
        <button className="icon-action" type="button" onClick={() => onToggleReveal(variable)} aria-label={`${revealedValue ? 'Hide' : 'Reveal'} ${variable.key}`}>
          {revealedValue ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button className="icon-action" type="button" onClick={() => onCopy(variable)} aria-label={`Copy ${variable.key}`}>
          <Copy size={16} />
        </button>
        <button className="icon-action" type="button" onClick={() => onStartEdit(variable)} aria-label={`Edit ${variable.key}`} disabled={isLoading}>
          <Edit3 size={16} />
        </button>
        <button className="icon-action danger" type="button" onClick={() => onDelete(variable)} aria-label={`Delete ${variable.key}`} disabled={isLoading}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function DiffColumn({ title, tone, keys }) {
  return (
    <div className={`diff-column ${tone}`}>
      <div className="diff-head">
        <strong>{title}</strong>
        <span>{keys.length}</span>
      </div>
      <div className="diff-list">
        {keys.length === 0 ? (
          <small>None</small>
        ) : (
          keys.map((key) => (
            <code key={key} title={key}>
              {key}
            </code>
          ))
        )}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, action, children }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function encryptSecretPayload(projectId, plaintext) {
  const projectKey = await ensureProjectKey(projectId);
  const encrypted = await encryptValue(plaintext, projectKey);
  const valueDigest = await fingerprintValue(plaintext, projectKey);
  return { ...encrypted, valueDigest };
}

async function ensureProjectKey(projectId) {
  const storageKey = projectKeyStorageKey(projectId);
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const key = await generateProjectKey();
  window.localStorage.setItem(storageKey, key);
  return key;
}

function projectKeyStorageKey(projectId) {
  return `envvault:project-key:${projectId}`;
}

function normalizeKey(value) {
  return value.trim().toUpperCase();
}

async function readEnvFileEntries(file) {
  const parsed = parseEnv(await file.text());
  const entries = Object.entries(parsed).map(([key, value]) => ({ key: normalizeKey(key), value }));
  const invalid = entries.find((entry) => !/^[A-Z_][A-Z0-9_]*$/.test(entry.key));
  if (invalid) throw new Error(`${invalid.key || 'A variable'} is not a valid environment variable key.`);
  return entries.filter((entry) => entry.key && entry.value !== undefined);
}

function detectEnvironmentName(fileName) {
  const normalized = fileName.toLowerCase();
  const match = normalized.match(/^\.?env\.([a-z0-9_-]+)$/);
  if (!match) return '';
  return match[1];
}

function downloadTextFile(fileName, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatActivity(entry) {
  const labels = {
    'project.created': 'Created the project',
    'project.updated': 'Updated project settings',
    'project.archived': 'Archived the project',
    'project.restored': 'Restored the project',
    'project.key.updated': 'Published a wrapped project key',
    'environment.created': `Created ${entry.metadata?.name || 'an environment'}`,
    'environment.updated': `Renamed ${entry.metadata?.from || 'an environment'} to ${entry.metadata?.to || 'a new name'}`,
    'environment.cloned': `Cloned ${entry.metadata?.from || 'an environment'} to ${entry.metadata?.to || 'a new environment'}`,
    'environment.deleted': `Deleted ${entry.metadata?.name || 'an environment'}`,
    'variable.created': `Added ${entry.metadata?.key || 'a variable'}`,
    'variable.updated': `Updated ${entry.metadata?.key || 'a variable'}`,
    'variable.deleted': `Deleted ${entry.metadata?.key || 'a variable'}`,
    'variable.bulk-imported': `Imported ${entry.metadata?.total || 0} variables into ${entry.metadata?.environment || 'an environment'}`,
    'variable.revealed': `Revealed ${entry.metadata?.key || 'a variable'}`,
    'variable.copied': `Copied ${entry.metadata?.key || 'a variable'}`,
    'environment.exported': `Exported ${entry.metadata?.variableCount || 0} variables from ${entry.metadata?.environment || 'an environment'}`,
    'project.key.requested': `Requested project key access for ${entry.metadata?.deviceName || 'a device'}`,
    'project.key.approved': `Approved project key access for ${entry.metadata?.deviceName || 'a device'}`,
    'member.invited': `Invited ${entry.metadata?.email || 'a teammate'}`,
    'member.added': `Added ${entry.metadata?.email || 'a teammate'}`,
    'member.removed': `Removed ${entry.metadata?.email || 'a teammate'}`,
    'ownership.transferred': 'Transferred project ownership',
    'cli.pull': 'Pulled secrets with the CLI',
    'cli.push': 'Pushed secrets with the CLI'
  };
  return labels[entry.action] || entry.action.replaceAll('.', ' ');
}

function formatRelativeTime(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const payload = response.status === 204 ? null : await response.json();

  if (response.status === 401 && !options.retried && path !== '/auth/refresh') {
    const refreshResponse = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (refreshResponse.ok) return apiFetch(path, { ...options, retried: true });
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Request failed.');
  }

  return payload;
}

createRoot(document.getElementById('root')).render(<App />);
