import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuth, getDb } from '../config/firebase.js';
import { migrateLegacy } from './legacy-migration.js';

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args.find((arg) => arg.startsWith('--manifest='))?.slice('--manifest='.length);
  if (!manifestPath || !process.env.FIREBASE_PROJECT_ID) throw new Error('Proyecto y manifest requeridos.');
  const apply = args.includes('--apply');
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
  if (Boolean(process.env.FIRESTORE_EMULATOR_HOST) !== Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)) throw new Error('Configure ambos emuladores o ninguno.');
  if (apply && !emulator && !args.includes('--allow-cloud')) throw new Error('La aplicación en nube exige --allow-cloud y mantenimiento aprobado.');
  const manifest: unknown = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
  const report = await migrateLegacy(getDb(), getAuth(), manifest as Parameters<typeof migrateLegacy>[2], {
    apply,
    backup: async (records) => {
      const directoryArg = args.find((arg) => arg.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
      if (!directoryArg) throw new Error('Directorio privado de respaldo requerido.');
      const directory = resolve(directoryArg);
      const repository = resolve(__dirname, '../../../..');
      const rel = relative(repository, directory);
      if (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) throw new Error('El respaldo debe estar fuera del repositorio.');
      await mkdir(directory, { recursive: true });
      const actualDirectory = await realpath(directory);
      const actualRepository = await realpath(repository);
      const actualRelative = relative(actualRepository, actualDirectory);
      if (actualRelative !== '..' && !actualRelative.startsWith(`..${sep}`) && !isAbsolute(actualRelative)) throw new Error('El respaldo resuelve dentro del repositorio.');
      await writeFile(join(actualDirectory, `pulsolink-${randomUUID()}.json`), JSON.stringify({ version: 1, projectId: process.env.FIREBASE_PROJECT_ID,
        capturedAt: new Date().toISOString(), records }), { flag: 'wx', mode: 0o600 });
    },
  });
  console.log('Migración:', { ...report, unresolved: report.unresolved.length });
}
main().catch(() => {
  console.error('Migración no completada. Revise manifest, entorno, respaldo y ventana de mantenimiento. Si la revocación Auth falló, reintente: la cuenta permanece viewer y el journal conserva la operación pendiente.');
  process.exitCode = 1;
});
