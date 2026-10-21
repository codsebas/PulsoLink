import { z } from 'zod';

const positive = (fallback: number) => z.coerce.number().int().min(1).max(2_147_483_647).default(fallback);
const schema = z.object({
  API_BASE_URL: z.string().url().default('http://localhost:3001/api/v1'),
  DEVICE_CREDENTIAL_ID: z.string().min(1).regex(/^[^\s.]+$/),
  DEVICE_SECRET: z.string().min(1).regex(/^\S+$/),
  DEVICE_ID: z.string().min(1).max(128).regex(/^[^/]+$/),
  SIMULATOR_MODE: z.enum(['normal', 'no_contact', 'unavailable', 'invalid', 'random_disconnect']).default('normal'),
  REQUEST_TIMEOUT_MS: positive(5000), CONFIG_INTERVAL_MS: positive(2000), RECONNECT_INTERVAL_MS: positive(2000),
  DISCONNECT_EVERY_MS: positive(60000), DISCONNECT_DURATION_MS: positive(50000),
  SIMULATOR_SEED: z.coerce.number().int().min(0).max(4294967295).default(42),
});
export type Settings = z.infer<typeof schema>;
export function readSettings(env: NodeJS.ProcessEnv): Settings {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Never include credential values or raw Zod input in diagnostics.
    throw new Error(`Configuración inválida: ${[...new Set(result.error.issues.map(i => i.path.join('.')))].join(', ')}`);
  }
  const url = new URL(result.data.API_BASE_URL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API_BASE_URL debe ser HTTP(S), sin credenciales, query ni fragmento');
  result.data.API_BASE_URL = result.data.API_BASE_URL.replace(/\/+$/, '');
  return result.data;
}
