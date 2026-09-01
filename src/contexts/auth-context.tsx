'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient, { ApiError } from '@/lib/api-client';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  kycStatus?: string;
  createdAt?: string;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  passwordConfirm?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  const loadUser = useCallback(async () => {
    try {
      const response = await apiClient.get<User>('/auth/me');
      const userData = response.data;
      setUser(userData);
      if (typeof window !== 'undefined') {
        localStorage.setItem('mk_user', JSON.stringify(userData));
      }
    } catch {
      // If API is unreachable, keep cached user for demo mode
      try {
        const cachedUser = localStorage.getItem('mk_user');
        if (cachedUser && apiClient.getAccessToken()) {
          setUser(JSON.parse(cachedUser));
        } else {
          apiClient.clearTokens();
          localStorage.removeItem('mk_user');
          setUser(null);
        }
      } catch {
        apiClient.clearTokens();
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (token) {
      try {
        const cachedUser = localStorage.getItem('mk_user');
        if (cachedUser) {
          setUser(JSON.parse(cachedUser));
          setIsLoading(false);
        }
      } catch {
        // ignore parse errors
      }
      loadUser();
    } else {
      setIsLoading(false);
    }
  }, [loadUser]);

  const login = async (email: string, password: string) => {
    try {
      const response = await apiClient.post<{
        accessToken: string;
        refreshToken: string;
        user: User;
      }>('/auth/login', { email, password });
      const { accessToken, refreshToken, user: userData } = response.data;
      apiClient.setTokens(accessToken, refreshToken);
      setUser(userData);
      localStorage.setItem('mk_user', JSON.stringify(userData));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Erro ao fazer login. Tente novamente.', 500);
    }
  };

  const register = async (data: RegisterData) => {
    try {
      const response = await apiClient.post<{
        accessToken: string;
        refreshToken: string;
        user: User;
      }>('/auth/register', data);
      const { accessToken, refreshToken, user: userData } = response.data;
      apiClient.setTokens(accessToken, refreshToken);
      setUser(userData);
      localStorage.setItem('mk_user', JSON.stringify(userData));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Erro ao criar conta. Tente novamente.', 500);
    }
  };

  const logout = useCallback(() => {
    apiClient.clearTokens();
    localStorage.removeItem('mk_user');
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

export type { User, RegisterData };
