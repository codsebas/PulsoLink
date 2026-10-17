# @pulsolink/web

SPA de PulsoLink (React + TypeScript + Vite + Tailwind). Consume exclusivamente la API (`/api/v1`, contrato B); nunca accede a Firestore ni a los SDK cliente de Firebase.

## Comandos (desde la raíz del repositorio)

```powershell
npm install
npm run dev:web                               # http://localhost:5173 (proxy /api -> http://localhost:3001)
npm run dev                                   # API + web juntas
npm run typecheck --workspace=apps/web
npm run build --workspace=apps/web
```

Variables opcionales en `apps/web/.env` (ver `.env.example`): `VITE_API_PROXY_TARGET` y `VITE_API_BASE_URL`. No poner secretos en variables `VITE_*`.

## Rutas

| Ruta | Pantalla | Responsable |
| --- | --- | --- |
| `/` | Estado de la API | — |
| `/login` | `features/auth/AuthCard.tsx` | `@Mar-03` (#10) |
| `/sessions` | `features/sessions/SessionsPage.tsx` | `@Lis671` (#9) |
| `/sessions/:id` | `features/monitoring/DashboardPage.tsx` | `@Javifa2324` (#8) |
| `*` | `components/layout/NotFoundPage.tsx` | — |

`/sessions` y `/sessions/:id` cuelgan de `features/auth/ProtectedRoute.tsx`, que por ahora deja pasar todo. Mar-03 lo completa con `GET /auth/me` y la redirección a `/login`, sin modificar las rutas hijas. Si una pantalla falla al renderizar, `RouteErrorPage` la sustituye dentro del layout.

## Cliente HTTP (`src/lib/api-client.ts`)

- `apiClient<T>(endpoint, options)` → `{ data: T, meta? }`. Las respuestas 204 devuelven `{ data: undefined }`.
- `apiList<T>(endpoint, options)` → `{ data: T[], pagination: { nextCursor, hasMore } }`.
- `options.params` construye el query string y omite los valores `undefined` y `null`. `options.json` serializa el cuerpo y, sin `method`, usa `POST`.
- Envía la cookie de sesión (`credentials: 'include'`). En `POST/PUT/PATCH/DELETE` adjunta `X-CSRF-Token`; si todavía no hay token, lo pide antes a `GET /auth/csrf`.
- Después de un login o logout, llamar a `fetchCsrfToken()` para renovar el token (contrato B §9.6).
- Todos los errores son `ApiClientError` con `code`, `statusCode`, `message` y `requestId`. Si la API no responde, `statusCode` vale `0` y `code` es `NETWORK_ERROR`.

`src/lib/query-client.ts` exporta el `queryClient`. Reintenta solo errores de red, 429 y 5xx, y nunca las mutaciones. Al cerrar sesión, ejecutar `queryClient.clear()` (contrato B §9.7).

## Estados de carga, error y vacío (`src/components/feedback`)

```tsx
import { useQuery } from '@tanstack/react-query';
import { apiList } from '../../lib/api-client';
import { QueryState, EmptyState } from '../../components/feedback';

const sessionsQuery = useQuery({
  queryKey: ['sessions'],
  queryFn: () => apiList<Session>('/sessions', { params: { limit: 50 } }),
});

<QueryState
  query={sessionsQuery}
  isEmpty={(res) => res.data.length === 0}
  empty={<EmptyState title="No hay sesiones" />}
>
  {(res) => <SessionTable sessions={res.data} />}
</QueryState>
```

También se pueden usar por separado `LoadingState`, `ErrorState` (con `onRetry`) y `EmptyState`. `getErrorMessage(error)` devuelve un texto para mostrar al usuario según el código HTTP.
