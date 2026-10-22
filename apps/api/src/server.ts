import { createApp } from './app.js';
import { env } from './config/env.js';
import { UsersService } from './modules/users/users.service.js';
import { resolve } from 'node:path';

const app = createApp(env.NODE_ENV === 'production'
  ? { webDistPath: resolve(__dirname, '../../web/dist') }
  : {});

const server = app.listen(env.PORT, () => {
  console.log(`✅ [PulsoLink API] Servidor ejecutándose en http://localhost:${env.PORT}`);
  console.log(`📊 [Health Check] http://localhost:${env.PORT}/api/v1/health`);
  console.log(`🌐 [Entorno] ${env.NODE_ENV}`);
  // Recuperación acotada: no bloquea el arranque si Firebase no está disponible.
  void (async () => {
    const users = new UsersService();
    let cursor: { createdAt: string; id: string } | undefined;
    do {
      const result = await users.recoverPending(20, 10, cursor);
      if (result.scanned > 0) console.log(`[users] Recuperación: ${JSON.stringify({
        scanned: result.scanned, completed: result.completed, skipped: result.skipped, failed: result.failed,
      })}`);
      cursor = result.nextCursor;
    } while (cursor);
  })().catch(() => {
    console.error('[users] No se pudo ejecutar la recuperación de operaciones pendientes.');
  });
});

// Manejo de señales de terminación para apagado ordenado en Windows / Node
function handleShutdown(signal: string) {
  console.log(`\n🛑 [PulsoLink API] Recibida señal ${signal}. Cerrando servidor...`);
  server.close(() => {
    console.log('✅ [PulsoLink API] Servidor detenido correctamente.');
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
