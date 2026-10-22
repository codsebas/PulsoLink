import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { z } from 'zod';
import { getAuth, getDb } from '../config/firebase.js';
import { physicalDeviceSchema, provisionPhysicalDevice } from './physical-device-provisioning.js';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('Configuración incompleta.');
  return value;
}
const privateConfigSchema = physicalDeviceSchema.omit({ actorId: true }).extend({
  version: z.literal(1), projectId: z.string().min(1),
}).strict();

async function main() {
  const projectId = required('FIREBASE_PROJECT_ID');
  z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/).parse(projectId);
  if (required('PROVISION_TARGET_PROJECT') !== projectId ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) !== Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error('Proyecto o emuladores incompatibles.');
  }
  const deviceId = required('PHYSICAL_DEVICE_ID');
  const code = required('PHYSICAL_DEVICE_CODE');
  const actorId = required('PROVISION_ACTOR_UID');
  const hardwareId = process.env.PHYSICAL_HARDWARE_ID?.trim() || undefined;
  // Validate all non-secret inputs before creating a private file.
  physicalDeviceSchema.parse({ deviceId, code, actorId, hardwareId,
    credentialId: 'validation-only', secret: 'x'.repeat(43) });
  const repository = resolve(__dirname, '../../../..');
  const base = process.env.LOCALAPPDATA || resolve(homedir(), '.config');
  const filename = process.env.PHYSICAL_DEVICE_CONFIG_FILE ||
    resolve(base, 'PulsoLink', projectId, `physical-${deviceId}.json`);
  if (!isAbsolute(filename)) throw new Error('Se requiere una ruta privada absoluta.');
  const folder = dirname(filename);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const resolvedFile = resolve(realpathSync(folder), filename.slice(folder.length + 1));
  const finalPath = existsSync(resolvedFile) ? realpathSync(resolvedFile) : resolvedFile;
  const inside = relative(repository, finalPath);
  if (!inside.startsWith(`..${sep}`) && inside !== '..' && !isAbsolute(inside)) {
    throw new Error('Las credenciales deben guardarse fuera del repositorio.');
  }
  for (const oneDriveRoot of [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]) {
    if (!oneDriveRoot) continue;
    const within = relative(resolve(oneDriveRoot), finalPath);
    if (!within.startsWith(`..${sep}`) && within !== '..' && !isAbsolute(within)) {
      throw new Error('Use una carpeta privada local, fuera de OneDrive.');
    }
  }
  let local: z.infer<typeof privateConfigSchema>;
  if (existsSync(finalPath)) {
    local = privateConfigSchema.parse(JSON.parse(readFileSync(finalPath, 'utf8')));
    if (local.projectId !== projectId || local.deviceId !== deviceId || local.code !== code ||
      local.hardwareId !== hardwareId) throw new Error('El archivo privado no coincide con la solicitud.');
  } else {
    local = { version: 1, projectId, deviceId, code, ...(hardwareId ? { hardwareId } : {}),
      credentialId: `physical-${randomUUID()}`, secret: randomBytes(32).toString('base64url') };
    writeFileSync(finalPath, JSON.stringify(local, null, 2), { flag: 'wx', mode: 0o600 });
    if (process.platform === 'win32') {
      try {
        execFileSync('icacls', [finalPath, '/inheritance:r', '/grant:r', `${userInfo().username}:F`, 'SYSTEM:F'],
          { stdio: 'ignore', windowsHide: true });
      } catch { unlinkSync(finalPath); throw new Error('No se pudo proteger el archivo.'); }
    }
  }
  const { version: _version, projectId: _project, ...config } = local;
  const apply = process.env.PROVISION_APPLY === 'true';
  const result = await provisionPhysicalDevice(getDb(), getAuth(), { ...config, actorId }, apply);
  console.log(JSON.stringify({ projectId, ...result, mode: apply ? 'apply' : 'dry-run', privateConfigFile: finalPath }));
}

main().catch(() => {
  console.error('Aprovisionamiento físico no completado. Revise proyecto explícito, actor admin, ruta privada y conflictos. No se imprimen secretos ni se rotan credenciales existentes.');
  process.exitCode = 1;
});
