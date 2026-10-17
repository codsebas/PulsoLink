import dotenv from 'dotenv';
import crypto from 'node:crypto';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api/v1';
const CREDENTIAL_ID = process.env.DEVICE_CREDENTIAL_ID || 'cred-sim-001';
const SECRET = process.env.DEVICE_SECRET || 'sec_sim_local_secret';
const BOOT_ID = crypto.randomUUID();

console.log('🤖 [PulsoLink Simulator] Inicializando simulador de dispositivo IoT...');
console.log(`📡 URL API: ${API_BASE_URL}`);
console.log(`🔑 Credential ID: ${CREDENTIAL_ID}`);
console.log(`🆔 Boot ID: ${BOOT_ID}`);
console.log('ℹ️  Punto de integración para @HugoX2024 (Issue #7).');
console.log('    Implementará el ciclo de consulta de configuración, heartbeat y reporte cada 2 segundos.');
