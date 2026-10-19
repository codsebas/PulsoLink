import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Database,
  Cpu,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  firebase: {
    configured: boolean;
    mode: string;
    message?: string;
  };
}

export const HomePage: React.FC = () => {
  const {
    data: healthData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      // apiClient realiza fetch a /api/v1/health a través del proxy de Vite
      const response = await fetch('/api/v1/health');
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }
      return (await response.json()) as HealthResponse;
    },
    refetchInterval: 10000, // actualización cada 10s
  });

  return (
    <div className="space-y-8">
      {/* Banner de Bienvenida */}
      <section className="bg-gradient-to-br from-sky-900 via-sky-800 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 text-sky-200 text-xs font-semibold backdrop-blur-sm border border-sky-400/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Prototipo Telemétrico IoT & Web
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Plataforma PulsoLink
          </h1>
          <p className="text-sky-100/90 text-sm sm:text-base leading-relaxed">
            Estructura base ejecutable lista para la integración del equipo. Monitoreo telemétrico
            de signos vitales (pulso cardíaco, SpO₂ estimada y temperatura superficial)
            mediante API modular y Cloud Firestore.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all"
            >
              <Activity className="w-4 h-4 animate-pulse" />
              <span>Probar Prototipo en Vivo (Simulador de Telemetría)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Tarjeta de Estado del Backend y Health Check */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-5 h-5 text-sky-600" />
              Estado de Comunicación con la API
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Verificación en vivo del proceso backend mediante el endpoint <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sky-700 font-mono">GET /api/v1/health</code>
            </p>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Verificando...' : 'Comprobar ahora'}
          </button>
        </div>

        <div className="mt-6">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-sky-600" />
              <p className="text-sm">Consultando API de backend en el puerto 3001...</p>
            </div>
          ) : isError ? (
            <div className="p-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-sm">No se pudo conectar con la API</h3>
                  <p className="text-xs text-rose-700 mt-0.5">
                    {error instanceof Error ? error.message : 'Error de conexión desconocido'}
                  </p>
                </div>
              </div>
              <div className="text-xs bg-white/70 p-3 rounded-lg border border-rose-200/60 font-mono text-slate-700">
                Asegúrate de que el backend esté ejecutándose: <br />
                <span className="font-bold text-slate-900">npm run dev:api</span> (o <span className="font-bold text-slate-900">npm run dev</span> desde la raíz).
              </div>
            </div>
          ) : healthData ? (
            <div className="space-y-6">
              {/* Badge principal */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                  <div>
                    <h3 className="font-bold text-emerald-900 text-sm">Conexión con la API Exitosa</h3>
                    <p className="text-xs text-emerald-700">
                      Servicio: <span className="font-mono font-medium">{healthData.service}</span> v{healthData.version}
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-200 text-emerald-800">
                  {healthData.status.toUpperCase()}
                </span>
              </div>

              {/* Grid de detalles */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
                  <span className="text-xs text-slate-500 font-medium block">Tiempo del Servidor</span>
                  <span className="text-sm font-mono font-semibold text-slate-800 mt-1 block">
                    {new Date(healthData.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                    {healthData.timestamp}
                  </span>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
                  <span className="text-xs text-slate-500 font-medium block">Tiempo Activo (Uptime)</span>
                  <span className="text-sm font-mono font-semibold text-slate-800 mt-1 block">
                    {healthData.uptimeSeconds} segundos
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Proceso Node.js Express 5
                  </span>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
                  <span className="text-xs text-slate-500 font-medium block">Persistencia Firebase</span>
                  <span className="text-sm font-semibold mt-1 flex items-center gap-1.5">
                    {healthData.firebase.configured ? (
                      <span className="text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Configurado ({healthData.firebase.mode})
                      </span>
                    ) : (
                      <span className="text-amber-700 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" /> Pendiente de credenciales
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {healthData.firebase.configured
                      ? 'Admin SDK conectado'
                      : 'Arranque base sin credenciales'}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Mapeo de Puntos de Integración del Equipo */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Layers className="w-5 h-5 text-sky-600" />
          Puntos de Integración y Módulos
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                Frontend SPA
              </span>
              <span className="text-xs text-slate-400">Puerto 5173</span>
            </div>
            <h3 className="font-bold text-slate-900 text-sm">React + Vite + Tailwind</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Enrutamiento preparado con React Router y TanStack Query.
              Cliente HTTP unificado en <code className="bg-slate-100 px-1 font-mono">src/lib/api-client.ts</code>.
            </p>
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <span>Responsable: Axel, Lis, Javifa, Mar</span>
              <Link to="/sessions" className="text-sky-600 hover:text-sky-800 font-medium inline-flex items-center gap-1">
                Ver vistas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Backend API
              </span>
              <span className="text-xs text-slate-400">Puerto 3001</span>
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Express 5 + Zod + Admin SDK</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Módulos de autenticación, dispositivos, sesiones y mediciones preparados con esquemas de validación Zod y repositorios desacoplados.
            </p>
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <span>Responsable: codsebas, Didhyer, gioore</span>
              <span className="text-slate-400">Contratos A & B</span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                Simulador & IoT
              </span>
              <span className="text-xs text-slate-400">Contrato A</span>
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Node.js Sim & NodeMCU</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Simulador en <code className="bg-slate-100 px-1 font-mono">tools/device-simulator/</code> con credencial independiente y firmware en <code className="bg-slate-100 px-1 font-mono">firmware/nodemcu/</code>.
            </p>
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <span>Responsable: HugoX2024, codsebas</span>
              <span className="text-slate-400">Reporte cada 2s</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
