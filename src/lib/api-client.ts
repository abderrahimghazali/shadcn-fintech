const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('mk_access_token') : null;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options?.headers,
      },
    });

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('mk_access_token');
        localStorage.removeItem('mk_refresh_token');
        window.location.href = '/';
      }
      throw new ApiError('Unauthorized', 401);
    }

    const data = await res.json();
    if (!data.success)
      throw new ApiError(data.message, data.error?.statusCode || res.status, data.error);
    return data;
  }

  async get<T>(path: string) {
    return this.request<T>(path);
  }

  async post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // Auth helpers
  setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem('mk_access_token', accessToken);
    localStorage.setItem('mk_refresh_token', refreshToken);
  }

  clearTokens() {
    localStorage.removeItem('mk_access_token');
    localStorage.removeItem('mk_refresh_token');
  }

  getAccessToken() {
    return localStorage.getItem('mk_access_token');
  }

  isAuthenticated() {
    return !!this.getAccessToken();
  }
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  requestId: string;
}

export class ApiError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, error?: { code: string }) {
    super(message);
    this.statusCode = statusCode;
    this.code = error?.code;
    this.name = 'ApiError';
  }
}

const apiClient = new ApiClient(API_URL);
export default apiClient;
