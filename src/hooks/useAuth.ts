import { useCallback, useEffect, useState } from 'react';
import { apiService } from '../../services/apiService';
import { storageGet, storageRemove, storageSet } from '../utils/storage';
import { getValidationDetails } from '../utils/error';
import type { User } from '../../types';

const TOKEN_KEY = 'authToken';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ReturnType<typeof getValidationDetails> | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorDetails(null);
    const token = storageGet(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const result = await apiService.me();
      setUser(result.user);
    } catch (err) {
      storageRemove(TOKEN_KEY);
      setUser(null);
      setError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const result = await apiService.login({ username, password });
      storageSet(TOKEN_KEY, result.token);
      setUser(result.user);
      return result.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      setErrorDetails(getValidationDetails(err) ?? null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const result = await apiService.register({ username, password });
      storageSet(TOKEN_KEY, result.token);
      setUser(result.user);
      return result.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      setErrorDetails(getValidationDetails(err) ?? null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      await apiService.logout();
    } catch {
      // Ignore logout API errors
    } finally {
      storageRemove(TOKEN_KEY);
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (updates: { allowThinking?: boolean }) => {
    try {
      const result = await apiService.updateProfile(updates);
      setUser(result.user);
      return result.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      throw new Error(message);
    }
  }, []);

  return {
    user,
    isLoading,
    error,
    errorDetails,
    refresh,
    login,
    register,
    logout,
    updateProfile,
  };
};
