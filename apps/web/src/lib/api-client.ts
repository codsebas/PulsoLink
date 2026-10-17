import { API_BASE_URL } from './env';

export interface ApiErrorDetail {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly requestId?: string;
  public readonly details?: unknown;

  constructor(error: ApiErrorDetail, statusCode: number) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.statusCode = statusCode;
    this.requestId = error.requestId;
    this.details = error.details;
  }
}

let activeCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  activeCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return activeCsrfToken;
}

export async function fetchCsrfToken(): Promise<string> {
  const res = await apiClient<{ csrfToken: string }>('/auth/csrf');
  activeCsrfToken = res.data.csrfToken;
  return res.data.csrfToken;
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const { params, headers: customHeaders, ...restOptions } = options;

  let url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const method = (restOptions.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (restOptions.body && typeof restOptions.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  // Si es una mutación, adjuntar el token CSRF si está disponible
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && activeCsrfToken) {
    headers['X-CSRF-Token'] = activeCsrfToken;
  }

  const response = await fetch(url, {
    ...restOptions,
    headers,
    credentials: 'include', // Para cookies seguras de sesión HttpOnly
  });

  if (response.status === 204) {
    return { data: undefined as unknown as T };
  }

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    if (isJson) {
      const errorBody = await response.json();
      if (errorBody && errorBody.error) {
        throw new ApiClientError(errorBody.error, response.status);
      }
    }
    throw new ApiClientError(
      {
        code: `HTTP_${response.status}`,
        message: response.statusText || 'Error en la solicitud HTTP',
      },
      response.status
    );
  }

  if (!isJson) {
    return { data: (await response.text()) as unknown as T };
  }

  const json = await response.json();
  return json;
}
