import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiService } from '../../services/apiService';
import { storageGet, storageSet } from '../utils/storage';
import type { User, WorkspaceJoinRequest, WorkspaceMember, WorkspaceWithMembership } from '../../types';
import { PUBLIC_WORKSPACE_ID } from '../../types';

const STORAGE_KEY = 'activeWorkspaceId';

export const useWorkspaces = (user: User | null) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembership[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(PUBLIC_WORKSPACE_ID);
  const [pendingRequests, setPendingRequests] = useState<WorkspaceJoinRequest[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const accessibleWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.isPublic || workspace.membership?.status === 'active'),
    [workspaces]
  );

  const refreshWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await apiService.listWorkspaces();
      setWorkspaces(list);

      const stored = storageGet(STORAGE_KEY);
      const accessible = list.filter((workspace) => workspace.isPublic || workspace.membership?.status === 'active');
      const fallback = accessible[0]?.id || PUBLIC_WORKSPACE_ID;
      const next = stored && accessible.some((workspace) => workspace.id === stored) ? stored : fallback;
      setActiveWorkspaceId(next);
      storageSet(STORAGE_KEY, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [user?.id]);

  // Memoize current workspace membership to avoid unnecessary re-renders
  const currentMembership = useMemo(
    () => workspaces.find(w => w.id === activeWorkspaceId)?.membership,
    [workspaces, activeWorkspaceId]
  );

  useEffect(() => {
    const userId = user?.id;
    if (!userId || !currentMembership || currentMembership.role !== 'admin' || currentMembership.status !== 'active') {
      setPendingRequests([]);
      setMembers([]);
      return;
    }
    Promise.all([
      apiService.listWorkspaceRequests(activeWorkspaceId).catch(() => [] as WorkspaceJoinRequest[]),
      apiService.listWorkspaceMembers(activeWorkspaceId).catch(() => [] as WorkspaceMember[]),
    ]).then(([requests, memberList]) => {
      setPendingRequests(requests);
      setMembers(memberList);
    });
  }, [activeWorkspaceId, user?.id, currentMembership]);

  const selectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    storageSet(STORAGE_KEY, id);
  }, []);

  const createWorkspace = useCallback(async (name: string, description?: string) => {
    const workspace = await apiService.createWorkspace({ name, description });
    await refreshWorkspaces();
    if (workspace?.id) {
      selectWorkspace(workspace.id);
    }
    return workspace;
  }, [refreshWorkspaces, selectWorkspace]);

  const requestJoin = useCallback(async (workspaceId: string) => {
    const membership = await apiService.requestJoinWorkspace(workspaceId);
    await refreshWorkspaces();
    return membership;
  }, [refreshWorkspaces]);

  const approveRequest = useCallback(async (workspaceId: string, userId: string) => {
    const membership = await apiService.approveWorkspaceRequest(workspaceId, userId);
    const [requests, memberList] = await Promise.all([
      apiService.listWorkspaceRequests(workspaceId).catch(() => [] as WorkspaceJoinRequest[]),
      apiService.listWorkspaceMembers(workspaceId).catch(() => [] as WorkspaceMember[]),
    ]);
    setPendingRequests(requests);
    setMembers(memberList);
    await refreshWorkspaces();
    return membership;
  }, [refreshWorkspaces]);

  const rejectRequest = useCallback(async (workspaceId: string, userId: string) => {
    await apiService.rejectWorkspaceRequest(workspaceId, userId);
    const [requests, memberList] = await Promise.all([
      apiService.listWorkspaceRequests(workspaceId).catch(() => [] as WorkspaceJoinRequest[]),
      apiService.listWorkspaceMembers(workspaceId).catch(() => [] as WorkspaceMember[]),
    ]);
    setPendingRequests(requests);
    setMembers(memberList);
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

  const removeMember = useCallback(async (workspaceId: string, userId: string) => {
    await apiService.removeWorkspaceMember(workspaceId, userId);
    const memberList = await apiService.listWorkspaceMembers(workspaceId).catch(() => [] as WorkspaceMember[]);
    setMembers(memberList);
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

  return {
    workspaces,
    accessibleWorkspaces,
    activeWorkspaceId,
    setActiveWorkspaceId: selectWorkspace,
    pendingRequests,
    members,
    isLoading,
    error,
    refreshWorkspaces,
    createWorkspace,
    requestJoin,
    approveRequest,
    rejectRequest,
    removeMember,
  };
};
