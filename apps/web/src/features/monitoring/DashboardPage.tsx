import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Activity, AlertCircle, Clock, Heart, RefreshCw, Thermometer, WifiOff } from 'lucide-react';
import { ApiClientError, apiClient } from '../../lib/api-client';
import { VitalCard } from './VitalCard';
import { PulsoAISummary } from './PulsoAISummary';
import type {
  LatestMeasurement,
  LatestMeasurementMeta,
  MeasurementSession,
} from './monitoring.types';

const POLLING_INTERVAL_MS = 2000;

function formatGuatemalaTime(value: string | null | undefined): string {
  if (!value) return 'Sin datos';

  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'America/Guatemala',
  }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.code === 'NOT_IMPLEMENTED') {
    return 'El endpoint de monitoreo todavía no está disponible en la API.';
  }

  return error instanceof Error ? error.message : 'No fue posible consultar el monitoreo.';
}

export function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [isPageVisible, setIsPageVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const sessionQuery = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => apiClient<MeasurementSession>(`/sessions/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.data.status;
      return isPageVisible && status !== 'finished' ? POLLING_INTERVAL_MS : false;
    },
  });

  const session = sessionQuery.data?.data;
  const shouldLoadLatest = session?.status === 'active' || session?.status === 'finished';
  const latestQuery = useQuery({
    queryKey: ['sessions', id, 'latest'],
    queryFn: () => apiClient<LatestMeasurement | null>(`/sessions/${id}/latest`),
    enabled: Boolean(id) && shouldLoadLatest,
    refetchInterval:
      isPageVisible && session?.status === 'active' ? POLLING_INTERVAL_MS : false,
  });

  const latest = latestQuery.data?.data;
  const meta = latestQuery.data?.meta as LatestMeasurementMeta | undefined;
  const isHistorical = session?.status === 'finished';
  const error = sessionQuery.error ?? latestQuery.error;

  if (!id) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        No se indicó una sesión para monitorear.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
        <div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
            Sesión: {id}
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Monitoreo de Signos Vitales</h1>
          <p className="text-xs text-slate-500">
            {isHistorical
              ? 'Lecturas históricas de una sesión finalizada.'
              : 'Actualización cada 2 segundos mientras la sesión esté activa y la página visible.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden="true" />
            Origen {session ? (session.source === 'real' ? 'real' : 'simulado') : 'pendiente'}
          </span>
          {isHistorical && (
            <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">
              Histórico
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">No se pudieron cargar las lecturas</p>
            <p className="text-xs">{getErrorMessage(error)}</p>
          </div>
        </div>
      )}

      {!error && (sessionQuery.isPending || latestQuery.isFetching) && (
        <div className="flex items-center gap-2 text-xs text-slate-500" role="status">
          <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Actualizando monitoreo…
        </div>
      )}

      {!error && !isHistorical && meta?.deviceOnline === false && (
        <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="status">
          <WifiOff className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          El dispositivo está desconectado. Esto es distinto de una lectura sin contacto.
        </div>
      )}

      {!error && !isHistorical && meta?.stale && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">
          <Clock className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          Los datos están desactualizados. La última muestra supera el límite de 10 segundos.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <VitalCard
          title="Frecuencia Cardíaca"
          measurement={latest?.measurements.heartRate}
          unit="bpm"
          icon={Heart}
          accentClassName="bg-rose-50 text-rose-600"
        />
        <VitalCard
          title="SpO₂ Estimada"
          measurement={latest?.measurements.spo2}
          unit="%"
          icon={Activity}
          accentClassName="bg-sky-50 text-sky-600"
        />
        <VitalCard
          title="Temperatura Superficial"
          measurement={latest?.measurements.skinTemperature}
          unit="°C"
          icon={Thermometer}
          accentClassName="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="flex flex-col gap-1 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:justify-between">
        <span>Última muestra: {formatGuatemalaTime(latest?.receivedAt)}</span>
        <span>Último contacto: {formatGuatemalaTime(meta?.lastSeenAt)}</span>
      </div>
      {isHistorical && <PulsoAISummary sessionId={id} visible={isPageVisible} />}
    </div>
  );
}
