import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 [PulsoLink API] Servidor ejecutándose en http://localhost:${env.PORT}`);
  console.log(`📡 [Health Check] http://localhost:${env.PORT}/api/v1/health`);
  console.log(`⚙️  [Entorno] ${env.NODE_ENV}`);
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
