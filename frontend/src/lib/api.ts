'use client';

import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import Cookies from 'js-cookie';

export const ACCESS_TOKEN_COOKIE = 'pm_access';
export const REFRESH_TOKEN_COOKIE = 'pm_refresh';
export const USER_COOKIE = 'pm_user';

export const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

function processQueue(error: unknown | null, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = Cookies.get(ACCESS_TOKEN_COOKIE);
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      originalRequest.url !== '/auth/token/refresh/'
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token as string}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = Cookies.get(REFRESH_TOKEN_COOKIE);
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const refreshBase = process.env.NEXT_PUBLIC_BFF_BASE_URL ?? '';
        const refreshApiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
        const response = await axios.post<{ access: string }>(
          `${refreshBase || refreshApiBase}/api/auth/token/refresh/`,
          { refresh: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const newAccessToken = response.data.access;
        Cookies.set(ACCESS_TOKEN_COOKIE, newAccessToken, {
          expires: 7,
          path: '/',
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        });

        processQueue(null, newAccessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthCookies();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/sign-in')) {
          window.location.href = '/sign-in?session_expired=1';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(normalizeApiError(error as AxiosError<ApiErrorResponse>));
  }
);

export function setAuthTokens(access: string, refresh: string) {
  Cookies.set(ACCESS_TOKEN_COOKIE, access, {
    expires: 7,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  Cookies.set(REFRESH_TOKEN_COOKIE, refresh, {
    expires: 30,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

export function clearAuthCookies() {
  Cookies.remove(ACCESS_TOKEN_COOKIE, { path: '/' });
  Cookies.remove(REFRESH_TOKEN_COOKIE, { path: '/' });
  Cookies.remove(USER_COOKIE, { path: '/' });
}

export interface ApiErrorResponse {
  detail?: string;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  public readonly status: number | undefined;
  public readonly errors: Record<string, string[]> | undefined;

  constructor(message: string, status?: number, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? undefined;
    this.errors = errors ?? undefined;
  }
}

function normalizeApiError(error: AxiosError<ApiErrorResponse>): ApiError {
  const status = error.response?.status;
  const data = error.response?.data as Record<string, unknown> | undefined;

  let message = error.message || 'An unexpected error occurred';

  if (data) {
    if (typeof data['detail'] === 'string') {
      message = data['detail'];
    } else if (typeof data['message'] === 'string') {
      message = data['message'];
    } else if (typeof data['error'] === 'string') {
      message = data['error'];
    } else {
      // DRF field-level errors: { field: ["error msg", ...], ... }
      // or nested non_field_errors
      const fieldErrors: string[] = [];
      for (const [field, errs] of Object.entries(data)) {
        if (Array.isArray(errs)) {
          const msgs = (errs as unknown[])
            .map((e) => (typeof e === 'string' ? e : typeof e === 'object' && e !== null && 'string' in e ? String((e as Record<string, unknown>)['string']) : String(e)));
          if (field === 'non_field_errors') {
            fieldErrors.push(...msgs);
          } else {
            fieldErrors.push(`${field}: ${msgs.join(', ')}`);
          }
        } else if (typeof errs === 'string') {
          fieldErrors.push(`${field}: ${errs}`);
        }
      }
      if (fieldErrors.length > 0) {
        message = fieldErrors.join(' · ');
      }
    }
  }

  if (status === 400 && message === error.message) {
    message = 'Bad request. Please check your input.';
  } else if (status === 401) {
    message = 'Session expired. Please sign in again.';
  } else if (status === 403) {
    message = 'You do not have permission to perform this action.';
  } else if (status === 404) {
    message = 'Resource not found.';
  } else if (status === 409) {
    message = message || 'A conflict occurred.';
  } else if (status === 422) {
    message = message || 'Validation failed.';
  } else if (status && status >= 500) {
    message = 'A server error occurred. Please try again later.';
  }

  return new ApiError(
    message,
    status,
    data && typeof data === 'object' ? (data['errors'] as Record<string, string[]> | undefined) : undefined,
  );
}

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.get<T>(url, config);
  return response.data;
}

export async function apiPost<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await api.post<T>(url, data, config);
  return response.data;
}

export async function apiPut<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await api.put<T>(url, data, config);
  return response.data;
}

export async function apiPatch<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await api.patch<T>(url, data, config);
  return response.data;
}

export async function apiDelete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.delete<T>(url, config);
  return response.data;
}
