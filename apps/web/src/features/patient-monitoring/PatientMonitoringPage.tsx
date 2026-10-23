import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Activity, Heart, Thermometer } from 'lucide-react';
import { apiClient, apiList, ApiClientError } from '../../lib/api-client';
import { VitalCard } from '../monitoring/VitalCard';
import { pollingPlan, useDocumentVisible, usePatientAccess, usePatientHistory, usePatientLatest } from './hooks';
import type { HistoryRange } from './api';
import type { Patient, PatientMeasurement, PatientMonitoringMeta, PatientSession } from './patient-monitoring.types';
import { guatemalaDate, rangeFromLocal } from './trends';
import { HistoryReadings } from './HistoryReadings';

const PatientTrends = lazy(() => import('./PatientTrends'));
const states: Record<PatientMonitoringMeta['connectionState'], string> = {
  disconnected: 'Desconectado', connected_without_valid_reading: 'Conectado sin lectura válida reciente', connected_with_recent_reading: 'Conectado con lectura reciente',
};
const connectionStyles: Record<PatientMonitoringMeta['connectionState'], string> = {
  disconnected: 'border-rose-300 bg-rose-50 text-rose-900',
  connected_without_valid_reading: 'border-amber-300 bg-amber-50 text-amber-900',
  connected_with_recent_reading: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

function ErrorMessage({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof ApiClientError && error.statusCode === 403 ? 'No tienes permiso para consultar este expediente.'
    : error instanceof ApiClientError && error.statusCode === 404 ? 'El paciente o el recurso solicitado no está disponible.'
    : 'No fue posible cargar los datos. Comprueba la conexión e inténtalo de nuevo.';
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{message}
    {retry ? <button type="button" onClick={retry} className="ml-3 rounded border border-rose-300 px-3 py-1 font-semibold focus-visible:outline focus-visible:outline-2">Reintentar</button> : null}</div>;
}

export function PatientMonitoringIndex() {
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const patients = useQuery({ queryKey: ['patients', 'monitoring', cursor], queryFn: ({ signal }) => apiList<Patient>('/patients', { signal, params: { limit: 25, cursor } }) });
  if (patients.error instanceof ApiClientError && patients.error.statusCode === 401) return <Navigate to="/login" replace />;
  return <main className="min-w-0 space-y-6 break-words">
    <div><h1 className="text-2xl font-bold text-slate-900">Monitoreo de pacientes</h1><p className="mt-2 text-sm text-slate-600">Selecciona un paciente para consultar sus signos vitales y su historial entre placas.</p></div>
    {patients.isPending ? <p role="status">Cargando pacientes…</p> : patients.isError ? <ErrorMessage error={patients.error} retry={() => void patients.refetch()} /> : <>
      {patients.data.data.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6">No hay pacientes disponibles para consultar.</p> :
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{patients.data.data.map((patient) => <li key={patient.id}>
          <Link to={`/monitoring/${encodeURIComponent(patient.id)}`} className="block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
            <span className="text-xs font-semibold text-sky-700">{patient.code}</span><h2 className="mt-2 font-semibold text-slate-900">{patient.displayName}</h2><p className="mt-4 text-sm text-sky-700">Ver monitoreo e historial →</p>
          </Link></li>)}</ul>}
      <div className="flex gap-3"><button type="button" disabled={cursors.length === 1} onClick={() => setCursors((value) => value.slice(0, -1))} className="rounded-lg border px-4 py-2 disabled:opacity-40">Anteriores</button>
        <button type="button" disabled={!patients.data.pagination.hasMore} onClick={() => setCursors((value) => [...value, patients.data.pagination.nextCursor!])} className="rounded-lg border px-4 py-2 disabled:opacity-40">Más pacientes</button></div>
    </>}
    <p className="text-xs text-slate-500">Prototipo académico no clínico. La SpO₂ es estimada y la temperatura es superficial.</p>
  </main>;
}

export function PatientMonitoringPage() {
  const { patientId } = useParams<{ patientId: string }>();
  return <PatientMonitoring key={patientId} patientId={patientId ?? ''} />;
}

function PatientMonitoring({ patientId }: { patientId: string }) {
  const [viewId] = useState(() => crypto.randomUUID());
  const [dates, setDates] = useState({ from: '', to: '' });
  const [range, setRange] = useState<HistoryRange>({});
  const [rangeError, setRangeError] = useState('');
  const visible = useDocumentVisible();
  // Same cache shape as PL2-06 useSessionUser: profile directly, or null on 401.
  // All consumers of ['auth', 'me'] must agree; an API envelope breaks the menu.
  const user = useQuery({ queryKey: ['auth', 'me'], queryFn: async ({ signal }) => {
    try {
      return (await apiClient<{ id: string; displayName: string; role: 'admin' | 'viewer' }>('/auth/me', { signal })).data;
    } catch (error) {
      if (error instanceof ApiClientError && error.statusCode === 401) return null;
      throw error;
    }
  }, retry: false, staleTime: 60_000 });
  const authorized = user.data?.role === 'admin' || user.data?.role === 'viewer';
  // This POST is idempotent by viewId. The gate must succeed before any patient
  // detail/history is shown; polling never repeats the access operation.
  const access = usePatientAccess(patientId, viewId, authorized);
  const ready = authorized && access.isSuccess;
  const patient = useQuery({ queryKey: ['patient', patientId], queryFn: ({ signal }) => apiClient<Patient>(`/patients/${encodeURIComponent(patientId)}`, { signal }), enabled: ready });
  const active = useQuery({ queryKey: ['patient', patientId, 'active-session'], enabled: ready && patient.isSuccess,
    queryFn: ({ signal }) => apiList<PatientSession>('/sessions', { signal, params: { patientId, status: 'active', limit: 1 } }),
    // La ausencia de sesión es temporal: otra pantalla puede iniciarla después.
    // Solo esta consulta pequeña continúa en reposo; no descarga el historial.
    refetchInterval: (query) => {
      if (!visible) return false;
      if (query.state.error instanceof ApiClientError && [401, 403, 404].includes(query.state.error.statusCode)) return false;
      return query.state.data?.data[0]?.status === 'active' ? 2000 : 5000;
    },
    refetchIntervalInBackground: false,
  });
  const activeSession = active.data?.data[0];
  // Última muestra e historial solo se refrescan con una sesión activa y la
  // pestaña visible; las sesiones nuevas se descubren por separado.
  const plan = pollingPlan({ visible, sessionActive: Boolean(activeSession) });
  const latest = usePatientLatest(patientId, { enabled: ready && patient.isSuccess && active.isSuccess, poll: plan.latest !== false });
  const history = usePatientHistory(patientId, range, { enabled: ready && patient.isSuccess, poll: plan.history !== false });
  if (user.data === null || [user.error, access.error, patient.error, active.error, latest.error, history.error]
    .some((error) => error instanceof ApiClientError && error.statusCode === 401)) return <Navigate to="/login" replace />;
  if (user.isPending || (authorized && access.isPending)) return <p role="status">Preparando acceso al expediente…</p>;
  if (user.isError || access.isError) return <ErrorMessage error={user.error ?? access.error} retry={() => void (user.isError ? user.refetch() : access.refetch())} />;
  if (!authorized) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">Tu perfil requiere autorización de consulta. Contacta con administración.</p>;
  if (patient.isPending) return <p role="status">Cargando paciente…</p>;
  if (patient.isError) return <ErrorMessage error={patient.error} retry={() => void patient.refetch()} />;
  const row = latest.data?.data;
  const meta = latest.data?.meta;
  const readings = history.readings;
  const coverage = history.coverage;
  const refresh = () => { void active.refetch(); void latest.refetch(); history.refresh(); };
  return <main className="min-w-0 space-y-6 break-words">
    <Link to="/monitoring" className="text-sm font-medium text-sky-700 hover:underline">← Pacientes</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold text-sky-700">{patient.data.data.code}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{patient.data.data.displayName}</h1><p className="mt-2 text-sm text-slate-600">Signos vitales e historia del paciente a través de sus placas.</p></div>
      <button type="button" onClick={refresh} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">Actualizar</button></div>
    <section className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm" aria-label="Estado del monitoreo">
      <p role="status" className={`rounded-lg border px-3 py-2 font-semibold ${meta ? connectionStyles[meta.connectionState] : 'border-slate-200 text-slate-700'}`}>{active.isPending || latest.isPending ? 'Consultando estado…' : meta ? states[meta.connectionState] : 'Estado no disponible'}</p>
      <p className="text-slate-600">{activeSession ? 'Monitoreo activo' : 'Sin sesión activa · consulta histórica'}</p>
      {row?.source === 'simulated' ? <span className="rounded bg-violet-50 px-2 py-1 font-semibold text-violet-800">Datos simulados</span> : null}
    </section>
    {active.isError || latest.isError ? <ErrorMessage error={active.error ?? latest.error} retry={refresh} /> : null}
    <div className="grid gap-4 md:grid-cols-3">
      <VitalCard title="Pulso" measurement={row?.measurements.heartRate} unit="bpm" icon={Heart} accentClassName="bg-rose-50 text-rose-600" />
      <VitalCard title="SpO₂ estimada" measurement={row?.measurements.spo2} unit="%" icon={Activity} accentClassName="bg-sky-50 text-sky-600" />
      <VitalCard title="Temperatura superficial" measurement={row?.measurements.skinTemperature} unit="°C" icon={Thermometer} accentClassName="bg-amber-50 text-amber-600" />
    </div>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600"><p>Última lectura: {guatemalaDate(row?.receivedAt)}</p><p>Última comunicación: {guatemalaDate(meta?.lastSeenAt)}</p>{meta?.stale ? <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 font-semibold text-amber-900">Sin lectura reciente; consulta el historial para ver datos anteriores.</p> : null}</div>
    <section className="min-w-0 space-y-5 border-t border-slate-200 pt-6" aria-labelledby="history-title">
      <div><h2 id="history-title" className="text-xl font-semibold text-slate-900">Evolución e historial</h2><p className="mt-1 text-sm text-slate-600">Valores puntuales, sin interpretación clínica. Los huecos conservan desconexiones, cambios de sesión y datos ausentes.</p></div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); try { setRange(rangeFromLocal(dates.from, dates.to)); setRangeError(''); } catch (error) { setRangeError(error instanceof Error ? error.message : 'Rango inválido'); } }}>
        <label className="text-sm text-slate-700">Desde (Guatemala)<input type="datetime-local" value={dates.from} onChange={(event) => setDates({ ...dates, from: event.target.value })} className="mt-1 block rounded-lg border border-slate-300 bg-white p-2" /></label>
        <label className="text-sm text-slate-700">Hasta, sin incluir (Guatemala)<input type="datetime-local" value={dates.to} onChange={(event) => setDates({ ...dates, to: event.target.value })} className="mt-1 block rounded-lg border border-slate-300 bg-white p-2" /></label>
        <button className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Aplicar rango</button>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => { setDates({ from: '', to: '' }); setRange({}); setRangeError(''); }}>Desde el inicio registrado</button>
      </form>
      {rangeError ? <p role="alert" className="text-sm text-rose-700">{rangeError}</p> : null}
      {history.isError ? <ErrorMessage error={history.error} retry={refresh} /> : null}
      {history.isPending ? <p role="status">Cargando historial…</p> : readings.length === 0 ? (history.isError ? null : <p className="rounded-xl border bg-white p-6 text-sm">No hay lecturas en este intervalo.</p>) : <>
        <p className="text-sm text-slate-600">{coverage.loaded} lecturas cargadas en {coverage.pagesLoaded} {coverage.pagesLoaded === 1 ? 'página' : 'páginas'}: {guatemalaDate(coverage.oldestReceivedAt)} — {guatemalaDate(coverage.newestReceivedAt)}. {coverage.hasMore ? 'Hay datos más antiguos por cargar.' : 'Alcanzaste el inicio del intervalo consultado.'}</p>
        {coverage.truncated ? <p className="text-xs font-semibold text-amber-800">Se conservaron las {coverage.loaded} lecturas más recientes; {coverage.dropped} más antiguas quedaron fuera de memoria y de la gráfica.</p> : null}
        {readings.some((reading) => reading.source === 'simulated') ? <p className="text-xs font-semibold text-violet-800">Este intervalo contiene datos simulados.</p> : null}
        <Suspense fallback={<p role="status">Preparando gráficas…</p>}><PatientTrends readings={readings} /></Suspense>
        <HistoryReadings readings={readings} />
      </>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={!history.hasMore || history.isFetching} onClick={history.loadMore} className="rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-40">Cargar más antiguas</button>
        <button type="button" disabled={history.isFetching} onClick={history.refresh} className="rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-40">Refrescar lecturas recientes</button></div>
    </section>
    <p className="text-xs text-slate-500">Prototipo académico, no clínico. SpO₂ estimada sujeta a contacto y calibración; temperatura superficial, no temperatura corporal central. Las tendencias no son ECG ni ondas PPG.</p>
  </main>;
}
