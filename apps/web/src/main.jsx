import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleUserRound,
  ClipboardPaste,
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
  Moon,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  UserPlus,
  UsersRound,
  WrapText,
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
  const [status, setStatusMessage] = useState('Ready for development login');
  const [statusTone, setStatusTone] = useState('info');
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
  const [activeTab, setActiveTab] = useState('variables');
  const [dialog, setDialog] = useState(null);
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [toastVisible, setToastVisible] = useState(true);
  const dialogResolver = useRef(null);
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [theme, setTheme] = useState(() => {
    try {
      const stored = window.localStorage.getItem('envvault:theme');
      if (stored === 'light' || stored === 'dark') return stored;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch (_error) {
      return 'dark';
    }
  });
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingEnvironments, setLoadingEnvironments] = useState(false);
  const [loadingVariables, setLoadingVariables] = useState(false);
  const [loadingCollab, setLoadingCollab] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [variableValueMultiline, setVariableValueMultiline] = useState(false);
  const [keyBackedUp, setKeyBackedUp] = useState(null);
  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    try {
      return window.localStorage.getItem('envvault:checklist-dismissed') === '1';
    } catch (_error) {
      return false;
    }
  });
  const copyTimerRef = useRef(null);
  const userRef = useRef(null);

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
    setKeyBackedUp(null);
    apiFetch(`/projects/${selectedProjectId}/key`)
      .then((response) => setKeyBackedUp(Boolean(response.key?.encryptedProjectKey)))
      .catch(() => {});
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

  useEffect(() => {
    if (!status) return;
    setToastVisible(true);
    const timer = setTimeout(() => setToastVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    function onExpired() {
      if (!userRef.current) return;
      setUser(null);
      setProjects([]);
      setSelectedProjectId('');
      setSelectedEnvironmentId('');
      setStatus('Session expired — please sign in again', 'error');
    }
    window.addEventListener('envvault:session-expired', onExpired);
    return () => window.removeEventListener('envvault:session-expired', onExpired);
  }, []);

  useEffect(() => {
    if (!Object.keys(revealedValues).length) return;
    const timer = setTimeout(() => {
      setRevealedValues({});
      setStatus('Revealed values hidden again');
    }, 30000);
    function onVisibility() {
      if (document.visibilityState === 'hidden') setRevealedValues({});
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [revealedValues]);

  function setStatus(message, tone = 'info') {
    setStatusMessage(message);
    setStatusTone(tone);
  }

  function flashCopied(id) {
    setCopiedId(id);
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(''), 1600);
  }

  function dismissChecklist() {
    setChecklistDismissed(true);
    try {
      window.localStorage.setItem('envvault:checklist-dismissed', '1');
    } catch (_error) {}
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('envvault:theme', theme);
    } catch (_error) {}
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  async function importPastedEnv(event) {
    event.preventDefault();
    if (!pasteText.trim()) return;
    await handleEnvFile(new File([pasteText], '.env', { type: 'text/plain' }));
    setPasteText('');
    setShowPasteArea(false);
  }

  function openDialog(config) {
    return new Promise((resolve) => {
      dialogResolver.current = resolve;
      setDialog(config);
    });
  }

  function closeDialog(result) {
    dialogResolver.current?.(result);
    dialogResolver.current = null;
    setDialog(null);
  }

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
      setStatus(error.message, 'error');
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
    const confirmed = await openDialog({
      kind: 'confirm',
      title: 'Sign out',
      message: 'Sign out of EnvVault? Your local project keys stay in this browser, so you can pick up where you left off.',
      confirmLabel: 'Sign out'
    });
    if (!confirmed) return;

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
    setLoadingProjects(true);
    try {
      const response = await apiFetch(`/projects${showArchivedProjects ? '?archived=true' : ''}`);
      const nextProjects = response.projects || [];
      setProjects(nextProjects);
      setSelectedProjectId((currentId) => {
        if (nextProjects.some((project) => project.id === currentId)) return currentId;
        return nextProjects[0]?.id || '';
      });
    } finally {
      setLoadingProjects(false);
    }
  }

  async function fetchEnvironments(projectId) {
    setLoadingEnvironments(true);
    try {
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
    } finally {
      setLoadingEnvironments(false);
    }
  }

  async function fetchVariables(environmentId) {
    setLoadingVariables(true);
    try {
      const response = await apiFetch(`/environments/${environmentId}/variables`);
      setVariables(response.variables || []);
    } finally {
      setLoadingVariables(false);
    }
  }

  async function fetchCollaboration(projectId) {
    setLoadingCollab(true);
    try {
      const [memberResponse, activityResponse, keyRequestResponse] = await Promise.all([
        apiFetch(`/projects/${projectId}/members`),
        apiFetch(`/projects/${projectId}/activity`),
        apiFetch(`/projects/${projectId}/key-requests`)
      ]);
      setMembers(memberResponse.members || []);
      setCanManageMembers(Boolean(memberResponse.canManage));
      setActivity(activityResponse.activity || []);
      setKeyRequests(keyRequestResponse.requests || []);
    } finally {
      setLoadingCollab(false);
    }
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
      setStatus(`${request.deviceName} approved`, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
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
      setStatus(encryptedProjectKey ? 'Member invited with wrapped key access' : 'Member invited; key access is still pending', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function removeMember(member) {
    const confirmed = await openDialog({
      kind: 'confirm',
      danger: true,
      title: 'Remove member',
      message: `Remove ${member.name || member.email} from this project? They will lose access to all of its environments.`,
      confirmLabel: 'Remove'
    });
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await apiFetch(`/projects/${selectedProjectId}/members/${member.id}`, { method: 'DELETE' });
      await fetchCollaboration(selectedProjectId);
      await fetchProjects();
      setStatus(`${member.name || member.email} removed`, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function transferOwnership(member) {
    const confirmed = await openDialog({
      kind: 'confirm',
      title: 'Transfer ownership',
      message: `Make ${member.name || member.email} the owner of ${selectedProject.name}? You will keep access as a regular member.`,
      confirmLabel: 'Transfer'
    });
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await apiFetch(`/projects/${selectedProjectId}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify({ userId: member.userId })
      });
      await fetchProjects();
      await fetchCollaboration(selectedProjectId);
      setStatus(`Ownership transferred to ${member.name || member.email}`, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
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
      setStatus(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function syncMissingKeys() {
    const missingKeys = compareResult?.diff?.removed || [];
    if (!selectedProjectId || !missingKeys.length) return;
    const fromEnv = compareResult.from;
    const toEnv = compareResult.to;

    const confirmed = await openDialog({
      kind: 'confirm',
      title: 'Copy missing keys',
      message: `Copy ${missingKeys.length} key${missingKeys.length === 1 ? '' : 's'} from ${fromEnv.name} to ${toEnv.name}? Keys that already exist in ${toEnv.name} are not touched.`,
      confirmLabel: 'Copy keys'
    });
    if (!confirmed) return;

    const headers = await getProductionHeadersForEnvironment(toEnv, `copy ${missingKeys.length} keys`);
    if (headers === null) return;

    setIsLoading(true);
    try {
      const projectKey = await ensureProjectKey(selectedProjectId);
      const response = await apiFetch(`/environments/${fromEnv.id}/variables`);
      const sourceVariables = (response.variables || []).filter((variable) => missingKeys.includes(variable.key));
      const encryptedVariables = await Promise.all(
        sourceVariables.map(async (variable) => {
          const plaintext = await decryptValue(variable.encryptedValue, variable.iv, projectKey);
          return { key: variable.key, ...(await encryptSecretPayload(selectedProjectId, plaintext)) };
        })
      );
      await apiFetch(`/environments/${toEnv.id}/variables/bulk-import`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ variables: encryptedVariables })
      });

      if (selectedEnvironmentId === toEnv.id) await fetchVariables(toEnv.id);
      const refreshed = await apiFetch(`/projects/${selectedProjectId}/compare?from=${compareFromId}&to=${compareToId}`);
      setCompareResult(refreshed);
      setStatus(`Copied ${encryptedVariables.length} key${encryptedVariables.length === 1 ? '' : 's'} to ${toEnv.name}`, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function createProject(event) {
    event.preventDefault();
    const trimmedName = projectName.trim();
    if (!trimmedName) return;
    if (projects.some((project) => project.name.toLowerCase() === trimmedName.toLowerCase())) {
      setStatus(`A project named ${trimmedName} already exists.`, 'error');
      return;
    }

    setIsLoading(true);
    try {
      const quickImportEntries = projectEnvFile ? await readEnvFileEntries(projectEnvFile) : [];
      const quickEnvironmentName = projectEnvFile ? detectEnvironmentName(projectEnvFile.name) || 'development' : '';
      const productionHeaders = quickEnvironmentName === 'production'
        ? await getProductionHeadersForEnvironment({ name: 'production' }, `import ${quickImportEntries.length} keys`)
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
        setStatus(`Project created and ${quickImportEntries.length} encrypted variables imported`, 'success');
      } else {
        setStatus('Project created', 'success');
      }
    } catch (error) {
      setStatus(error.message, 'error');
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
      setStatus('Environment created', 'success');
      await fetchEnvironments(selectedProjectId);
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function renameProject() {
    if (!selectedProject || !canManageMembers) return;
    const name = (await openDialog({
      kind: 'prompt',
      title: 'Rename project',
      message: 'Choose a new name for this project.',
      initialValue: selectedProject.name,
      confirmLabel: 'Rename'
    }))?.trim();
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
    const confirmed = await openDialog({
      kind: 'confirm',
      title: 'Archive project',
      message: `Archive ${selectedProject.name}? It moves to the Archived list and can be restored at any time.`,
      confirmLabel: 'Archive'
    });
    if (!confirmed) return;
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
    const confirmation = await openDialog({
      kind: 'match',
      danger: true,
      title: 'Delete project',
      message: `This permanently deletes ${selectedProject.name} with all of its environments and variables.`,
      expected: selectedProject.name,
      placeholder: selectedProject.name,
      confirmLabel: 'Delete forever'
    });
    if (confirmation !== selectedProject.name) return;

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
    const name = (await openDialog({
      kind: 'prompt',
      title: 'Rename environment',
      message: 'Choose a new name for this environment.',
      initialValue: selectedEnvironment.name,
      confirmLabel: 'Rename'
    }))?.trim();
    if (!name || name === selectedEnvironment.name) return;
    const headers = await getProductionHeadersForEnvironment(
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
    const name = (await openDialog({
      kind: 'prompt',
      title: 'Clone environment',
      message: `Copy every variable from ${selectedEnvironment.name} into a new environment.`,
      initialValue: `${selectedEnvironment.name}-copy`,
      confirmLabel: 'Clone'
    }))?.trim();
    if (!name) return;
    const headers = await getProductionHeadersForEnvironment(
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
    const headers = await getProductionHeaders(`delete ${selectedEnvironment.name}`);
    if (headers === null) return;
    const confirmed = await openDialog({
      kind: 'confirm',
      danger: true,
      title: 'Delete environment',
      message: `Delete ${selectedEnvironment.name} and all of its variables? This cannot be undone.`,
      confirmLabel: 'Delete'
    });
    if (!confirmed) return;
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
      setStatus(successMessage, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function createVariable(event) {
    event.preventDefault();
    const normalizedKey = normalizeKey(variableKey);
    if (!selectedProjectId || !selectedEnvironmentId || !normalizedKey || !variableValue) return;

    if (variables.some((variable) => variable.key === normalizedKey)) {
      setStatus(`${normalizedKey} already exists in this environment.`, 'error');
      return;
    }

    const productionHeaders = await getProductionHeaders('add a variable');
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
      setStatus('Variable encrypted in browser and saved as ciphertext', 'success');
      await fetchVariables(selectedEnvironmentId);
    } catch (error) {
      setStatus(error.message, 'error');
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
      setStatus(`${normalizedKey} already exists in this environment.`, 'error');
      return;
    }

    const productionHeaders = await getProductionHeaders(`edit ${variable.key}`);
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
      setStatus(`${normalizedKey} updated`, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteVariable(variable) {
    const productionHeaders = await getProductionHeaders(`delete ${variable.key}`);
    if (productionHeaders === null) return;

    const confirmed = await openDialog({
      kind: 'confirm',
      danger: true,
      title: 'Delete variable',
      message: `Delete ${variable.key}? This cannot be undone.`,
      confirmLabel: 'Delete'
    });
    if (!confirmed) return;

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
      setStatus(`${variable.key} deleted`, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
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
      setStatus(`Cannot decrypt ${variable.key} with this browser's local project key.`, 'error');
    }
  }

  async function copyVariable(variable) {
    try {
      const projectKey = await ensureProjectKey(selectedProjectId);
      const plaintext = revealedValues[variable.id] || (await decryptValue(variable.encryptedValue, variable.iv, projectKey));
      await logSensitiveAction('variable.copied', variable.id);
      await navigator.clipboard.writeText(plaintext);
      flashCopied(variable.id);
      setStatus(`${variable.key} copied`, 'success');
    } catch (_error) {
      setStatus(`Cannot copy ${variable.key}; reveal failed with this local key.`, 'error');
    }
  }

  async function getProductionHeaders(action) {
    return getProductionHeadersForEnvironment(selectedEnvironment, action);
  }

  async function getProductionHeadersForEnvironment(environment, action) {
    if (environment?.name?.toLowerCase() !== 'production') return {};

    const confirmation = await openDialog({
      kind: 'match',
      danger: true,
      title: 'Production change',
      message: `You are about to ${action} in the production environment.`,
      expected: 'production',
      placeholder: 'production',
      confirmLabel: 'Confirm change'
    });
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
        setStatus('No valid KEY=value pairs found in file.', 'error');
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
      setStatus(error.message || 'Import failed.', 'error');
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

    const productionHeaders = await getProductionHeadersForEnvironment(importPreview.environment, `import ${selectedEntries.length} keys`);
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
      setStatus(`Imported ${response.summary.created} new and ${response.summary.updated} updated keys into ${importPreview.environment.name}`, 'success');
      clearImportPreview();
    } catch (error) {
      setStatus(error.message, 'error');
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
      setStatus(`Exported ${variables.length} keys from ${selectedEnvironment.name}`, 'success');
    } catch (_error) {
      setStatus(`Export failed; one or more keys cannot be decrypted with this browser's local project key.`, 'error');
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
      setKeyBackedUp(true);
      setStatus('Wrapped project key published', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
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
      setStatus('Local project key restored', 'success');
    } catch (_error) {
      setStatus('Could not restore project key with that sync phrase.', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function copyCliSetupCommand() {
    if (!cliSetupCommand) return;
    await navigator.clipboard.writeText(cliSetupCommand);
    flashCopied('cli');
    setStatus('CLI setup command copied', 'success');
  }

  async function logSensitiveAction(action, targetId, metadata = {}) {
    await apiFetch(`/projects/${selectedProjectId}/activity`, {
      method: 'POST',
      body: JSON.stringify({ action, targetId, ...metadata })
    });
    fetchCollaboration(selectedProjectId).catch(() => {});
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <button
          className="icon-action theme-toggle-floating"
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-mark">EV</div>
            <strong>EnvVault</strong>
          </div>
          <h1>Team secrets, encrypted in your browser</h1>
          <p>
            Keep environment variables organized per project and environment. Values are encrypted locally before
            they are stored, so only you and your team can ever read them.
          </p>
          <div className="auth-actions">
            {authProviders.github ? (
              <button className="primary-action" type="button" onClick={githubLogin} disabled={isLoading}>
                <Github size={18} />
                Continue with GitHub
              </button>
            ) : null}
            {authProviders.google ? (
              <button className="primary-action" type="button" onClick={googleLogin} disabled={isLoading}>
                <CircleUserRound size={18} />
                Continue with Google
              </button>
            ) : null}
            <button className="ghost-action" type="button" onClick={devLogin} disabled={isLoading}>
              <KeyRound size={16} />
              Use development login
            </button>
          </div>
          <ul className="auth-points">
            <li>
              <LockKeyhole size={15} />
              Values encrypted client-side, stored only as ciphertext
            </li>
            <li>
              <UsersRound size={15} />
              Invite teammates and approve their device keys
            </li>
            <li>
              <GitCompareArrows size={15} />
              Compare environments without revealing plaintext
            </li>
          </ul>
        </div>
        <p className="auth-status" role="status" aria-live="polite">{status}</p>
      </main>
    );
  }

  const hasProjects = projects.length > 0;
  const checklistItems = selectedProject
    ? [
        { label: 'Add an environment', done: environments.length > 0, onClick: () => setShowEnvForm(true) },
        { label: 'Add a variable', done: variables.length > 0, onClick: () => setActiveTab('variables') },
        { label: 'Invite a teammate', done: members.length > 1, onClick: () => setActiveTab('team') },
        { label: 'Back up your key', done: keyBackedUp === true, onClick: () => setActiveTab('setup') }
      ]
    : [];
  const showChecklist = Boolean(selectedProject) && !checklistDismissed && checklistItems.some((item) => !item.done);
  const showKeyBanner = Boolean(selectedProject) && keyBackedUp === false && !showChecklist && activeTab !== 'setup';

  return (
    <main className="app-shell">
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">EV</div>
          <div>
            <strong>EnvVault</strong>
            <span>encrypted secret sync</span>
          </div>
        </div>

        <div className="sidebar-projects">
          <span className="sidebar-label">Projects</span>
          <div className="project-view-toggle" role="tablist" aria-label="Project status">
            <button type="button" role="tab" aria-selected={!showArchivedProjects} className={!showArchivedProjects ? 'active' : ''} onClick={() => setShowArchivedProjects(false)}>
              Active
            </button>
            <button type="button" role="tab" aria-selected={showArchivedProjects} className={showArchivedProjects ? 'active' : ''} onClick={() => setShowArchivedProjects(true)}>
              Archived
            </button>
          </div>

          {!showArchivedProjects && hasProjects ? (
            <form className="inline-form project-create-form" onSubmit={createProject}>
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="New project name"
                aria-label="Project name"
                disabled={isLoading}
              />
              <label className={`icon-action file-icon-action ${projectEnvFile ? 'attached' : ''}`} aria-label="Attach env file" title={projectEnvFile ? projectEnvFile.name : 'Attach .env file'}>
                <FileUp size={17} />
                <input
                  key={projectEnvFile ? `${projectEnvFile.name}:${projectEnvFile.lastModified}` : 'empty'}
                  type="file"
                  accept=".env,.txt"
                  onChange={(event) => setProjectEnvFile(event.target.files?.[0] || null)}
                  disabled={isLoading}
                />
              </label>
              <button className="icon-action" type="submit" aria-label="Create project" disabled={isLoading}>
                <Plus size={18} />
              </button>
            </form>
          ) : null}
          {projectEnvFile && hasProjects && !showArchivedProjects ? (
            <div className="attached-file">
              <FileUp size={14} />
              <span>{projectEnvFile.name}</span>
              <button type="button" onClick={() => setProjectEnvFile(null)} aria-label="Remove attached env file">
                <X size={14} />
              </button>
            </div>
          ) : null}

          <nav className="stack-list project-nav" aria-label="Project list">
            {loadingProjects && projects.length === 0 ? (
              <div className="skeleton-list" aria-hidden="true">
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
              </div>
            ) : projects.length === 0 ? (
              <div className="empty-state">{showArchivedProjects ? 'No archived projects.' : 'No projects yet — create one to get started.'}</div>
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
                    <span>
                      {project.members?.length || 0} member{project.members?.length === 1 ? '' : 's'}
                      {project.archivedAt ? ' · archived' : ''}
                    </span>
                  </div>
                </button>
              ))
            )}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <CircleUserRound size={18} />}
            <span>{user.name}</span>
          </div>
          <button
            className="icon-action"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="icon-action" onClick={logout} aria-label="Sign out" title="Sign out" disabled={isLoading}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <section className="workspace" id="workspace">
        {!selectedProject ? (
          <div className="onboarding">
            {showArchivedProjects ? (
              <div className="onboarding-card">
                <div className="onboarding-icon">
                  <Archive size={22} />
                </div>
                <h1>No archived projects</h1>
                <p>Projects you archive move here. Switch back to your active projects to keep working.</p>
                <button className="primary-action" type="button" onClick={() => setShowArchivedProjects(false)}>
                  View active projects
                </button>
              </div>
            ) : (
              <div className="onboarding-card">
                <div className="onboarding-icon">
                  <LockKeyhole size={22} />
                </div>
                <h1>Create your first project</h1>
                <p>
                  A project groups environments like development, staging and production, each with its own encrypted
                  variables. Attach a .env file to import your keys right away.
                </p>
                <form className="onboarding-form" onSubmit={createProject}>
                  <input
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="e.g. payments-service"
                    aria-label="Project name"
                    disabled={isLoading}
                  />
                  <button className="primary-action" type="submit" disabled={isLoading}>
                    <Plus size={17} />
                    Create project
                  </button>
                </form>
                <label className="attach-env-button">
                  <FileUp size={15} />
                  <span>{projectEnvFile ? projectEnvFile.name : 'Optional: attach a .env file to import'}</span>
                  <input
                    key={projectEnvFile ? `${projectEnvFile.name}:${projectEnvFile.lastModified}` : 'empty'}
                    type="file"
                    accept=".env,.txt"
                    onChange={(event) => setProjectEnvFile(event.target.files?.[0] || null)}
                    disabled={isLoading}
                  />
                </label>
                {projectEnvFile ? (
                  <button className="clear-attach" type="button" onClick={() => setProjectEnvFile(null)}>
                    <X size={13} />
                    Remove file
                  </button>
                ) : null}
                <ol className="onboarding-steps">
                  <li>Create a project</li>
                  <li>Add an environment</li>
                  <li>Add or import encrypted variables</li>
                </ol>
              </div>
            )}
          </div>
        ) : (
          <>
            <header className="project-header">
              <div className="project-title">
                <h1>{selectedProject.name}</h1>
                <p>
                  {selectedProject.archivedAt ? 'Archived · ' : ''}
                  {environments.length} environment{environments.length === 1 ? '' : 's'} · {members.length} member{members.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="project-header-actions">
                <button className="icon-action" type="button" onClick={renameProject} aria-label="Rename project" title="Rename project" disabled={!canManageMembers || isLoading}>
                  <Edit3 size={16} />
                </button>
                {showArchivedProjects ? (
                  <button className="icon-action" type="button" onClick={restoreProject} aria-label="Restore project" title="Restore project" disabled={!canManageMembers || isLoading}>
                    <ArchiveRestore size={16} />
                  </button>
                ) : (
                  <button className="icon-action" type="button" onClick={archiveProject} aria-label="Archive project" title="Archive project" disabled={!canManageMembers || isLoading}>
                    <Archive size={16} />
                  </button>
                )}
                <button className="icon-action danger" type="button" onClick={deleteProject} aria-label="Delete project" title="Delete project" disabled={!canManageMembers || isLoading}>
                  <Trash2 size={16} />
                </button>
                <button className="icon-action" onClick={refreshActiveData} aria-label="Refresh workspace" title="Refresh" disabled={isLoading}>
                  <RefreshCcw size={16} />
                </button>
              </div>
            </header>

            <div className="env-bar">
              <div className="env-chips" role="tablist" aria-label="Environments">
                {loadingEnvironments && environments.length === 0 ? (
                  <>
                    <span className="skeleton-chip" aria-hidden="true" />
                    <span className="skeleton-chip" aria-hidden="true" />
                  </>
                ) : null}
                {environments.map((environment) => (
                  <button
                    key={environment.id}
                    type="button"
                    role="tab"
                    aria-selected={environment.id === selectedEnvironmentId}
                    className={`env-chip ${environment.id === selectedEnvironmentId ? 'active' : ''} ${
                      environment.name.toLowerCase() === 'production' ? 'production' : ''
                    }`}
                    onClick={() => setSelectedEnvironmentId(environment.id)}
                  >
                    {environment.name}
                  </button>
                ))}
                {showEnvForm || environments.length === 0 ? (
                  <form
                    className="env-create"
                    onSubmit={(event) => {
                      createEnvironment(event);
                      setShowEnvForm(false);
                    }}
                  >
                    <input
                      autoFocus
                      value={environmentName}
                      onChange={(event) => setEnvironmentName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setShowEnvForm(false);
                      }}
                      placeholder={environments.length ? 'Environment name' : 'e.g. development'}
                      aria-label="Environment name"
                      disabled={isLoading}
                    />
                    <button className="icon-action" type="submit" aria-label="Create environment" disabled={isLoading}>
                      <Plus size={16} />
                    </button>
                  </form>
                ) : (
                  <button type="button" className="env-chip env-add" onClick={() => setShowEnvForm(true)}>
                    <Plus size={14} />
                    Add
                  </button>
                )}
              </div>
              {selectedEnvironment ? (
                <div className="env-actions">
                  <button className="icon-action" type="button" onClick={renameEnvironment} aria-label="Rename environment" title={`Rename ${selectedEnvironment.name}`} disabled={isLoading}>
                    <Edit3 size={15} />
                  </button>
                  <button className="icon-action" type="button" onClick={cloneEnvironment} aria-label="Clone environment" title={`Clone ${selectedEnvironment.name}`} disabled={isLoading}>
                    <CopyPlus size={15} />
                  </button>
                  <button className="icon-action danger" type="button" onClick={deleteEnvironment} aria-label="Delete environment" title={`Delete ${selectedEnvironment.name}`} disabled={isLoading}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : null}
            </div>

            {showChecklist ? (
              <div className="onboarding-checklist">
                <div className="checklist-items">
                  {checklistItems.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className={item.done ? 'done' : ''}
                      onClick={item.onClick}
                      disabled={item.done}
                    >
                      <span className="checklist-mark">{item.done ? <Check size={11} /> : null}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
                <button className="icon-action" type="button" onClick={dismissChecklist} aria-label="Dismiss checklist" title="Dismiss">
                  <X size={15} />
                </button>
              </div>
            ) : null}

            {showKeyBanner ? (
              <div className="key-banner">
                <TriangleAlert size={16} />
                <span>Your project key only exists in this browser. Back it up with a sync phrase so you cannot lose access to your secrets.</span>
                <button className="primary-action" type="button" onClick={() => setActiveTab('setup')}>
                  Back up key
                </button>
              </div>
            ) : null}

            <nav className="tab-nav" role="tablist" aria-label="Project sections">
              <button type="button" role="tab" aria-selected={activeTab === 'variables'} className={activeTab === 'variables' ? 'active' : ''} onClick={() => setActiveTab('variables')}>
                <LockKeyhole size={15} />
                Variables
                {variables.length ? <small>{variables.length}</small> : null}
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'compare'} className={activeTab === 'compare' ? 'active' : ''} onClick={() => setActiveTab('compare')}>
                <GitCompareArrows size={15} />
                Compare
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'team'} className={activeTab === 'team' ? 'active' : ''} onClick={() => setActiveTab('team')}>
                <UsersRound size={15} />
                Team
                {members.length ? <small>{members.length}</small> : null}
                {keyRequests.length ? <em className="tab-alert">{keyRequests.length}</em> : null}
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'activity'} className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')}>
                <Activity size={15} />
                Activity
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'setup'} className={activeTab === 'setup' ? 'active' : ''} onClick={() => setActiveTab('setup')}>
                <KeyRound size={15} />
                CLI &amp; Keys
              </button>
            </nav>

            {activeTab === 'variables' ? (
              <div className="tab-panel">
                {!selectedEnvironment ? (
                  <div className="empty-state">Add an environment above, then add or import variables here.</div>
                ) : (
                  <>
                    <div className="tab-panel-head">
                      <p>
                        New values are encrypted in your browser before they are saved to <strong>{selectedEnvironment.name}</strong>.
                      </p>
                      <div className="panel-actions">
                        {isProduction ? <span className="danger-badge">production guard</span> : <span className="success-badge">masked by default</span>}
                        <button className="icon-action" type="button" onClick={exportEnvironment} aria-label="Export environment as .env file" title="Download .env" disabled={!variables.length}>
                          <Download size={16} />
                        </button>
                      </div>
                    </div>

                    <form className={`secret-form ${variableValueMultiline ? 'multiline' : ''}`} onSubmit={createVariable}>
                      <input
                        value={variableKey}
                        onChange={(event) => setVariableKey(event.target.value)}
                        placeholder="KEY_NAME"
                        aria-label="Variable key"
                        disabled={isLoading}
                      />
                      {variableValueMultiline ? (
                        <textarea
                          value={variableValue}
                          onChange={(event) => setVariableValue(event.target.value)}
                          placeholder={'-----BEGIN PRIVATE KEY-----\npaste multiline values here'}
                          rows={4}
                          aria-label="Variable secret value"
                          disabled={isLoading}
                        />
                      ) : (
                        <input
                          value={variableValue}
                          onChange={(event) => setVariableValue(event.target.value)}
                          placeholder="Secret value"
                          type="password"
                          aria-label="Variable secret value"
                          disabled={isLoading}
                        />
                      )}
                      <div className="secret-form-actions">
                        <button
                          className="icon-action"
                          type="button"
                          onClick={() => setVariableValueMultiline((current) => !current)}
                          aria-pressed={variableValueMultiline}
                          aria-label="Toggle multiline value"
                          title={variableValueMultiline ? 'Single-line value' : 'Multiline value'}
                        >
                          <WrapText size={16} />
                        </button>
                        <button className="primary-action" type="submit" disabled={isLoading}>
                          <LockKeyhole size={17} />
                          Add variable
                        </button>
                      </div>
                    </form>

                    {variables.length ? (
                      <div className="variable-toolbar">
                        <Search size={17} aria-hidden="true" />
                        <input
                          value={variableSearch}
                          onChange={(event) => setVariableSearch(event.target.value)}
                          type="search"
                          placeholder="Filter variable keys"
                          aria-label="Filter variable keys"
                        />
                        <span>{filteredVariables.length} of {variables.length}</span>
                        {variableSearch ? (
                          <button className="icon-action" type="button" onClick={() => setVariableSearch('')} aria-label="Clear variable search" title="Clear search">
                            <X size={16} />
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="variable-list">
                      {loadingVariables && variables.length === 0 ? (
                        <div className="skeleton-list" aria-hidden="true">
                          <div className="skeleton-row" />
                          <div className="skeleton-row" />
                          <div className="skeleton-row" />
                        </div>
                      ) : variables.length === 0 ? (
                        <div className="empty-state">No variables yet. Add one above or import a .env file below.</div>
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
                            isCopied={copiedId === variable.id}
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
                        <strong>Import a .env file</strong>
                        <span>Drop a file here, choose one, or paste its contents. Files named .env.production or .env.staging target that environment automatically.</span>
                      </div>
                      <div className="drop-zone-buttons">
                        <label className="file-button">
                          Choose file
                          <input
                            type="file"
                            accept=".env,.txt"
                            onChange={(event) => handleEnvFile(event.target.files?.[0])}
                            disabled={isLoading}
                          />
                        </label>
                        <button className="file-button" type="button" onClick={() => setShowPasteArea((current) => !current)}>
                          <ClipboardPaste size={15} />
                          Paste
                        </button>
                      </div>
                    </div>

                    {showPasteArea ? (
                      <form className="paste-zone" onSubmit={importPastedEnv}>
                        <textarea
                          autoFocus
                          value={pasteText}
                          onChange={(event) => setPasteText(event.target.value)}
                          placeholder={'DATABASE_URL=postgres://user:pass@host:5432/db\nREDIS_URL=redis://localhost:6379'}
                          rows={6}
                          aria-label="Paste .env contents"
                          disabled={isLoading}
                        />
                        <div className="paste-actions">
                          <button className="primary-action" type="submit" disabled={!pasteText.trim() || isLoading}>
                            <ClipboardPaste size={16} />
                            Preview import
                          </button>
                          <button
                            className="ghost-action"
                            type="button"
                            onClick={() => {
                              setShowPasteArea(false);
                              setPasteText('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {importPreview ? (
                      <div className="import-preview">
                        <div className="import-summary">
                          <div>
                            <strong>{importPreview.fileName}</strong>
                            <span>
                              {importCounts.new} new · {importCounts.update} update · {importCounts.skip} skipped — click a row to include or skip it
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
                  </>
                )}
              </div>
            ) : null}

            {activeTab === 'compare' ? (
              <div className="tab-panel">
                <div className="tab-panel-head">
                  <p>Compare which keys exist and whether values differ between two environments — using fingerprints, never plaintext.</p>
                  {compareCounts ? <span className="success-badge">{compareCounts.changed + compareCounts.added + compareCounts.removed} drift</span> : null}
                </div>
                {environments.length < 2 ? (
                  <div className="empty-state">Create at least two environments to compare drift.</div>
                ) : (
                  <>
                    <div className="compare-toolbar">
                      <div className="compare-field">
                        <span>From</span>
                        <SelectField
                          label="Compare from environment"
                          value={compareFromId}
                          onChange={setCompareFromId}
                          options={environments.map((environment) => ({ value: environment.id, label: environment.name }))}
                        />
                      </div>
                      <div className="compare-field">
                        <span>To</span>
                        <SelectField
                          label="Compare to environment"
                          value={compareToId}
                          onChange={setCompareToId}
                          options={environments.map((environment) => ({ value: environment.id, label: environment.name }))}
                        />
                      </div>
                      <button className="primary-action" type="button" onClick={runCompare} disabled={!compareFromId || !compareToId || isLoading}>
                        <GitCompareArrows size={18} />
                        Compare
                      </button>
                    </div>
                    {compareResult && compareResult.diff.removed.length ? (
                      <div className="drift-banner">
                        <div>
                          <strong>
                            {compareResult.diff.removed.length} key{compareResult.diff.removed.length === 1 ? '' : 's'} in {compareResult.from.name} missing from {compareResult.to.name}
                          </strong>
                          <span>Values are copied encrypted with the same project key.</span>
                        </div>
                        <button className="primary-action" type="button" onClick={syncMissingKeys} disabled={isLoading}>
                          Copy to {compareResult.to.name}
                        </button>
                      </div>
                    ) : null}

                    {compareResult ? (
                      <div className="diff-grid">
                        <DiffColumn title="Added" tone="added" keys={compareResult.diff.added} />
                        <DiffColumn title="Removed" tone="removed" keys={compareResult.diff.removed} />
                        <DiffColumn title="Changed" tone="changed" keys={compareResult.diff.changed} />
                        <DiffColumn title="Same" tone="same" keys={compareResult.diff.unchanged} />
                      </div>
                    ) : (
                      <div className="empty-state">Choose two environments and run compare.</div>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {activeTab === 'team' ? (
              <div className="tab-panel">
                <div className="tab-panel-head">
                  <p>
                    {canManageMembers
                      ? 'Invite teammates by email. Add a shared key phrase so they can decrypt values right away.'
                      : 'People with access to this project.'}
                  </p>
                </div>

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
                  {loadingCollab && members.length === 0 ? (
                    <div className="skeleton-list" aria-hidden="true">
                      <div className="skeleton-row" />
                      <div className="skeleton-row" />
                    </div>
                  ) : null}
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
                            <button className="icon-action" type="button" onClick={() => transferOwnership(member)} aria-label={`Make ${member.name || member.email} owner`} title="Transfer ownership">
                              <Crown size={16} />
                            </button>
                          ) : null}
                          <button className="icon-action danger" type="button" onClick={() => removeMember(member)} aria-label={`Remove ${member.name || member.email}`} title="Remove member">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTab === 'activity' ? (
              <div className="tab-panel">
                <div className="tab-panel-head">
                  <p>Recent project changes with actor and timestamp.</p>
                </div>
                <div className="activity-list">
                  {loadingCollab && activity.length === 0 ? (
                    <div className="skeleton-list" aria-hidden="true">
                      <div className="skeleton-row" />
                      <div className="skeleton-row" />
                      <div className="skeleton-row" />
                    </div>
                  ) : activity.length ? (
                    activity.slice(0, 12).map((entry) => (
                      <div className="activity-row" key={entry.id}>
                        <span className="activity-dot" />
                        <div>
                          <strong>{formatActivity(entry)}</strong>
                          <span>{entry.actorId?.name || entry.actorId?.email || 'Unknown user'} · {formatRelativeTime(entry.createdAt)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">No activity recorded yet.</div>
                  )}
                </div>
              </div>
            ) : null}

            {activeTab === 'setup' ? (
              <div className="tab-panel">
                <div className="tab-panel-head">
                  <p>Connect the CLI to this project and move your local encryption key between devices.</p>
                </div>

                <div className="setup-block">
                  <span className="sidebar-label">1 · Connect the CLI</span>
                  {cliSetupCommand ? (
                    <div className="cli-strip">
                      <div>
                        <span>Run in your project folder</span>
                        <code title={cliSetupCommand}>{cliSetupCommand}</code>
                      </div>
                      <button className={`icon-action ${copiedId === 'cli' ? 'copied' : ''}`} type="button" onClick={copyCliSetupCommand} aria-label="Copy CLI setup command" title="Copy command">
                        {copiedId === 'cli' ? <Check size={17} /> : <Copy size={17} />}
                      </button>
                    </div>
                  ) : (
                    <div className="empty-state">Select an environment to generate the setup command.</div>
                  )}
                </div>

                <div className="setup-block">
                  <span className="sidebar-label">2 · Sync your project key</span>
                  <p className="setup-note">
                    Your project key lives only in this browser and is used to decrypt values locally. Publish it with
                    a sync phrase, then use the same phrase to restore it on another device — or share it with an
                    invited teammate.
                  </p>
                  <div className="key-sync">
                    <input
                      value={syncPhrase}
                      onChange={(event) => setSyncPhrase(event.target.value)}
                      type="password"
                      placeholder="Sync phrase"
                      aria-label="Project key sync phrase"
                      disabled={isLoading}
                    />
                    <div className="key-sync-actions">
                      <button type="button" onClick={publishProjectKey} disabled={!syncPhrase || isLoading}>
                        Publish key
                      </button>
                      <button type="button" onClick={restoreProjectKey} disabled={!syncPhrase || isLoading}>
                        Restore key
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {dialog ? <AppDialog key={`${dialog.kind}:${dialog.title}:${dialog.message}`} dialog={dialog} onClose={closeDialog} /> : null}
      <p className={`status-toast ${statusTone} ${toastVisible && status ? 'visible' : ''}`} role="status" aria-live="polite">
        {statusTone === 'error' ? <CircleAlert size={14} /> : null}
        {statusTone === 'success' ? <CircleCheck size={14} /> : null}
        <span>{status}</span>
      </p>
    </main>
  );
}

function AppDialog({ dialog, onClose }) {
  const [inputValue, setInputValue] = useState(dialog.initialValue || '');
  const formRef = useRef(null);
  const isConfirm = dialog.kind === 'confirm';
  const matches = dialog.kind !== 'match' || inputValue.trim() === dialog.expected;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose(isConfirm ? false : null);
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(formRef.current?.querySelectorAll('button:not(:disabled), input') || []);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !formRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  function submit(event) {
    event.preventDefault();
    if (isConfirm) {
      onClose(true);
      return;
    }
    if (!matches) return;
    onClose(inputValue);
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(isConfirm ? false : null);
      }}
    >
      <form className="dialog" role="dialog" aria-modal="true" aria-label={dialog.title} onSubmit={submit} ref={formRef}>
        {dialog.danger ? (
          <div className="dialog-icon danger">
            <TriangleAlert size={19} />
          </div>
        ) : null}
        <h3>{dialog.title}</h3>
        <p>{dialog.message}</p>
        {!isConfirm ? (
          <input
            autoFocus
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder={dialog.placeholder || ''}
            aria-label={dialog.title}
          />
        ) : null}
        {dialog.kind === 'match' ? (
          <small className="dialog-hint">
            Type <code>{dialog.expected}</code> to confirm.
          </small>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="ghost-action" onClick={() => onClose(isConfirm ? false : null)}>
            Cancel
          </button>
          <button type="submit" className={`primary-action ${dialog.danger ? 'danger' : ''}`} autoFocus={isConfirm} disabled={!matches}>
            {dialog.confirmLabel || 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}

function VariableRow({
  variable,
  isEditing,
  editKey,
  editValue,
  revealedValue,
  isCopied,
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
        {editValue.includes('\n') ? (
          <textarea
            value={editValue}
            onChange={(event) => onEditValueChange(event.target.value)}
            rows={3}
            placeholder="New value, optional"
            aria-label="Variable value"
          />
        ) : (
          <input
            value={editValue}
            onChange={(event) => onEditValueChange(event.target.value)}
            type="password"
            placeholder="New value, optional"
            aria-label="Variable value"
          />
        )}
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
        <button className={`icon-action ${isCopied ? 'copied' : ''}`} type="button" onClick={() => onCopy(variable)} aria-label={`Copy ${variable.key}`}>
          {isCopied ? <Check size={16} /> : <Copy size={16} />}
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

function SelectField({ label, value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`select-field ${open ? 'open' : ''}`} ref={containerRef}>
      <button
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label || 'Select…'}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <ul className="select-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? 'selected' : ''}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {option.value === value ? <Check size={14} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
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
    if (typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('envvault:session-expired'));
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Request failed.');
  }

  return payload;
}

createRoot(document.getElementById('root')).render(<App />);
