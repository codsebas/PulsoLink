import { API_BASE_URL } from './env';

export interface ApiErrorDetail {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export interface Pagination {
  nextCursor: string | null;
  hasMore: boolean;
}

/** Respuesta individual del contrato B: `{ data, meta? }`. */
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** Respuesta de lista del contrato B: `{ data: [], pagination }`. */
export interface ApiListResponse<T> {
  data: T[];
  pagination: Pagination;
}

/** Código usado cuando la API no responde (red caída, proxy sin backend, CORS). */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

export class ApiClientError extends Error {
  public readonly code: string;
  /** Código HTTP; `0` cuando no hubo respuesta del servidor. */
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

  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }
}

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

let activeCsrfToken: string | null = null;
let pendingCsrfRequest: Promise<string> | null = null;

export function setCsrfToken(token: string | null): void {
  activeCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return activeCsrfToken;
}

/**
 * Solicita un token CSRF nuevo. Llamar tras login/logout para renovarlo (contrato B §9.6).
 * Las solicitudes simultáneas comparten la misma petición.
 */
export function fetchCsrfToken(): Promise<string> {
  if (!pendingCsrfRequest) {
    pendingCsrfRequest = apiClient<{ csrfToken: string }>('/auth/csrf')
      .then((res) => {
        activeCsrfToken = res.data.csrfToken;
        return res.data.csrfToken;
      })
      .finally(() => {
        pendingCsrfRequest = null;
      });
  }
  return pendingCsrfRequest;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean | null | undefined>;
  /** Cuerpo serializado como JSON. Usar en lugar de `body` para mutaciones del contrato B. */
  json?: unknown;
  body?: BodyInit | null;
}

function buildUrl(endpoint: string, params?: RequestOptions['params']): string {
  let url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) searchParams.append(key, String(value));
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  return url;
}

async function parseError(response: Response, isJson: boolean): Promise<ApiClientError> {
  if (isJson) {
    try {
      const errorBody = await response.json();
      if (errorBody && errorBody.error) {
        return new ApiClientError(errorBody.error, response.status);
      }
    } catch {
      // Cuerpo JSON mal formado: se usa el error genérico.
    }
  }
  return new ApiClientError(
    {
      code: `HTTP_${response.status}`,
      message: response.statusText || 'Error en la solicitud HTTP',
    },
    response.status
  );
}

/**
 * Cliente HTTP común. Envía cookies de sesión, adjunta `X-CSRF-Token` en mutaciones
 * (obteniéndolo si aún no existe) y devuelve el cuerpo `{data}` del contrato B.
 * Una respuesta 204 devuelve `{ data: undefined }`.
 */
export async function apiClient<T, R extends { data: unknown } = ApiResponse<T>>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<R> {
  const { params, json, headers: customHeaders, ...restOptions } = options;

  const url = buildUrl(endpoint, params);
  const method = (restOptions.method || (json !== undefined ? 'POST' : 'GET')).toUpperCase();
  const headers = new Headers(customHeaders);
  headers.set('Accept', 'application/json');

  let body = restOptions.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    headers.set('Content-Type', 'application/json');
  } else if (typeof body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (MUTATION_METHODS.includes(method)) {
    const csrfToken = activeCsrfToken ?? (await fetchCsrfToken());
    headers.set('X-CSRF-Token', csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...restOptions,
      method,
      body,
      headers,
      credentials: 'include', // Para cookies seguras de sesión HttpOnly
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiClientError(
      {
        code: NETWORK_ERROR_CODE,
        message: 'No se pudo conectar con la API. Comprueba que el backend esté en ejecución.',
      },
      0
    );
  }

  if (response.status === 204) {
    return { data: undefined } as R;
  }

  const contentType = response.headers.get('content-type');
  const isJson = Boolean(contentType && contentType.includes('application/json'));

  if (!response.ok) {
    throw await parseError(response, isJson);
  }

  if (!isJson) {
    throw new ApiClientError(
      { code: 'INVALID_RESPONSE', message: 'La API devolvió una respuesta que no es JSON.' },
      response.status
    );
  }

  return (await response.json()) as R;
}

/** Atajo para listas paginadas: `GET` que devuelve `{ data: T[], pagination }`. */
export function apiList<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiListResponse<T>> {
  return apiClient<T, ApiListResponse<T>>(endpoint, options);
}
