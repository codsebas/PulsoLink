import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Activity, Heart, Thermometer } from 'lucide-react';
import { apiClient, apiList, ApiClientError } from '../../lib/api-client';
import { VitalCard } from '../monitoring/VitalCard';
import type { Patient, PatientMeasurement, PatientMonitoringMeta, PatientSession } from './patient-monitoring.types';
import { guatemalaDate, rangeFromLocal, formatVital } from './trends';

const PatientTrends = lazy(() => import('./PatientTrends'));
const states: Record<PatientMonitoringMeta['connectionState'], string> = {
  disconnected: 'Desconectado', connected_without_valid_reading: 'Conectado sin lectura válida reciente', connected_with_recent_reading: 'Conectado con lectura reciente',
};
const quality = { valid: 'Válida', no_contact: 'Sin contacto', invalid: 'Inválida', unavailable: 'No disponible' };
const keys = ['heartRate', 'spo2', 'skinTemperature'] as const;

function ErrorMessage({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof ApiClientError && error.statusCode === 403 ? 'No tienes permiso para consultar este expediente.'
    : error instanceof ApiClientError && error.statusCode === 404 ? 'El paciente o el recurso solicitado no está disponible.'
    : 'No fue posible cargar los datos. Comprueba la conexión e inténtalo de nuevo.';
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{message}
    {retry ? <button type="button" onClick={retry} className="ml-3 rounded border border-rose-300 px-3 py-1 font-semibold focus-visible:outline focus-visible:outline-2">Reintentar</button> : null}</div>;
}
function useVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => { const update = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  return visible;
}

export function PatientMonitoringIndex() {
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const patients = useQuery({ queryKey: ['patients', 'monitoring', cursor], queryFn: ({ signal }) => apiList<Patient>('/patients', { signal, params: { limit: 25, cursor } }) });
  if (patients.error instanceof ApiClientError && patients.error.statusCode === 401) return <Navigate to="/login" replace />;
  return <main className="space-y-6">
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
  const visible = useVisible();
  const [viewId] = useState(() => crypto.randomUUID());
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [dates, setDates] = useState({ from: '', to: '' });
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [rangeError, setRangeError] = useState('');
  const cursor = cursors[cursors.length - 1];
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
  const access = useQuery({ queryKey: ['patient-access', user.data?.id, patientId, viewId],
    queryFn: () => apiClient<{ eventId: string; duplicate: boolean }>(`/patients/${encodeURIComponent(patientId)}/access`, { json: { viewId } }),
    enabled: authorized && Boolean(patientId), staleTime: Infinity, gcTime: 0, retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const ready = authorized && access.isSuccess;
  const patient = useQuery({ queryKey: ['patient', patientId], queryFn: ({ signal }) => apiClient<Patient>(`/patients/${encodeURIComponent(patientId)}`, { signal }), enabled: ready });
  const active = useQuery({ queryKey: ['patient', patientId, 'active-session'], enabled: ready && patient.isSuccess,
    queryFn: ({ signal }) => apiList<PatientSession>('/sessions', { signal, params: { patientId, status: 'active', limit: 1 } }),
    refetchInterval: (query) => visible && query.state.data?.data[0]?.status === 'active' ? 2000 : false,
  });
  const activeSession = active.data?.data[0];
  const latest = useQuery({ queryKey: ['patient', patientId, 'latest', activeSession?.id ?? 'inactive'],
    queryFn: ({ signal }) => apiClient<PatientMeasurement | null>(`/patients/${encodeURIComponent(patientId)}/latest`, { signal }),
    enabled: ready && patient.isSuccess && active.isSuccess, refetchInterval: visible && activeSession ? 2000 : false,
  });
  const history = useQuery({ queryKey: ['patient', patientId, 'history', range, cursor], enabled: ready && patient.isSuccess,
    queryFn: ({ signal }) => apiList<PatientMeasurement>(`/patients/${encodeURIComponent(patientId)}/measurements`, { signal, params: { ...range, cursor, limit: 100 } }),
    refetchInterval: visible && activeSession && !cursor ? 10000 : false,
  });
  if (user.data === null || [user.error, access.error, patient.error, active.error, latest.error, history.error]
    .some((error) => error instanceof ApiClientError && error.statusCode === 401)) return <Navigate to="/login" replace />;
  if (user.isPending || (authorized && access.isPending)) return <p role="status">Preparando acceso al expediente…</p>;
  if (user.isError || access.isError) return <ErrorMessage error={user.error ?? access.error} retry={() => void (user.isError ? user.refetch() : access.refetch())} />;
  if (!authorized) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">Tu perfil requiere autorización de consulta. Contacta con administración.</p>;
  if (patient.isPending) return <p role="status">Cargando paciente…</p>;
  if (patient.isError) return <ErrorMessage error={patient.error} retry={() => void patient.refetch()} />;
  const row = latest.data?.data;
  const meta = latest.data?.meta as PatientMonitoringMeta | undefined;
  const readings = history.data?.data ?? [];
  const newest = readings[0]?.receivedAt;
  const oldest = readings[readings.length - 1]?.receivedAt;
  const refresh = () => { void active.refetch(); void latest.refetch(); void history.refetch(); };
  return <main className="space-y-6">
    <Link to="/monitoring" className="text-sm font-medium text-sky-700 hover:underline">← Pacientes</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold text-sky-700">{patient.data.data.code}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{patient.data.data.displayName}</h1><p className="mt-2 text-sm text-slate-600">Signos vitales e historia del paciente a través de sus placas.</p></div>
      <button type="button" onClick={refresh} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">Actualizar</button></div>
    <section className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm" aria-label="Estado del monitoreo">
      <p role="status" className="font-semibold text-slate-800">{active.isPending || latest.isPending ? 'Consultando estado…' : meta ? states[meta.connectionState] : 'Estado no disponible'}</p>
      <p className="text-slate-600">{activeSession ? 'Monitoreo activo' : 'Sin sesión activa · consulta histórica'}</p>
      {row?.source === 'simulated' ? <span className="rounded bg-violet-50 px-2 py-1 font-semibold text-violet-800">Datos simulados</span> : null}
    </section>
    {active.isError || latest.isError ? <ErrorMessage error={active.error ?? latest.error} retry={refresh} /> : null}
    <div className="grid gap-4 md:grid-cols-3">
      <VitalCard title="Pulso" measurement={row?.measurements.heartRate} unit="bpm" icon={Heart} accentClassName="bg-rose-50 text-rose-600" />
      <VitalCard title="SpO₂ estimada" measurement={row?.measurements.spo2} unit="%" icon={Activity} accentClassName="bg-sky-50 text-sky-600" />
      <VitalCard title="Temperatura superficial" measurement={row?.measurements.skinTemperature} unit="°C" icon={Thermometer} accentClassName="bg-amber-50 text-amber-600" />
    </div>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500"><p>Última lectura: {guatemalaDate(row?.receivedAt)}</p><p>Última comunicación: {guatemalaDate(meta?.lastSeenAt)}</p>{meta?.stale ? <p>Sin lectura reciente; consulta el historial para ver datos anteriores.</p> : null}</div>
    <section className="space-y-5 border-t border-slate-200 pt-6" aria-labelledby="history-title">
      <div><h2 id="history-title" className="text-xl font-semibold text-slate-900">Evolución e historial</h2><p className="mt-1 text-sm text-slate-600">Valores puntuales, sin interpretación clínica. Los huecos conservan desconexiones, cambios de sesión y datos ausentes.</p></div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); try { setRange(rangeFromLocal(dates.from, dates.to)); setCursors([undefined]); setRangeError(''); } catch (error) { setRangeError(error instanceof Error ? error.message : 'Rango inválido'); } }}>
        <label className="text-sm text-slate-700">Desde (Guatemala)<input type="datetime-local" value={dates.from} onChange={(event) => setDates({ ...dates, from: event.target.value })} className="mt-1 block rounded-lg border border-slate-300 bg-white p-2" /></label>
        <label className="text-sm text-slate-700">Hasta, sin incluir (Guatemala)<input type="datetime-local" value={dates.to} onChange={(event) => setDates({ ...dates, to: event.target.value })} className="mt-1 block rounded-lg border border-slate-300 bg-white p-2" /></label>
        <button className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Aplicar rango</button>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => { setDates({ from: '', to: '' }); setRange({}); setCursors([undefined]); setRangeError(''); }}>Desde el inicio registrado</button>
      </form>
      {rangeError ? <p role="alert" className="text-sm text-rose-700">{rangeError}</p> : null}
      {history.isPending ? <p role="status">Cargando historial…</p> : history.isError ? <ErrorMessage error={history.error} retry={() => void history.refetch()} /> : readings.length === 0 ? <p className="rounded-xl border bg-white p-6 text-sm">No hay lecturas en este intervalo.</p> : <>
        <p className="text-sm text-slate-600">Página {cursors.length} · {readings.length} lecturas cargadas: {guatemalaDate(oldest)} — {guatemalaDate(newest)}. {history.data?.pagination.hasMore ? 'Hay datos más antiguos.' : 'Alcanzaste el inicio del intervalo consultado.'}</p>
        {readings.some((reading) => reading.source === 'simulated') ? <p className="text-xs font-semibold text-violet-800">Este intervalo contiene datos simulados.</p> : null}
        <Suspense fallback={<p role="status">Preparando gráficas…</p>}><PatientTrends readings={readings} /></Suspense>
        <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[720px] bg-white text-left text-sm"><caption className="sr-only">Valores y calidad por lectura del intervalo cargado</caption>
          <thead className="bg-slate-50 text-slate-600"><tr>{['Fecha (Guatemala)', 'Placa', 'Pulso (bpm)', 'SpO₂ (%)', 'Superficial (°C)', 'Origen'].map((heading) => <th scope="col" key={heading} className="p-3 font-medium">{heading}</th>)}</tr></thead>
          <tbody>{readings.map((reading) => <tr key={`${reading.sessionId}/${reading.id}`} className="border-t border-slate-100"><td className="p-3">{guatemalaDate(reading.receivedAt)}</td><td className="max-w-32 truncate p-3" title={reading.deviceId}>{reading.deviceId}</td>
            {keys.map((key) => <td className="p-3" key={key}>{reading.measurements[key].status === 'valid' ? formatVital(reading.measurements[key].value) : '—'}<span className="mt-1 block text-xs text-slate-500">{quality[reading.measurements[key].status]}</span></td>)}<td className="p-3">{reading.source === 'simulated' ? 'Simulado' : 'Dispositivo real'}</td></tr>)}</tbody>
        </table></div>
      </>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={cursors.length === 1 || history.isFetching} onClick={() => setCursors((value) => value.slice(0, -1))} className="rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-40">Más recientes</button>
        <button type="button" disabled={!history.data?.pagination.hasMore || history.isFetching} onClick={() => setCursors((value) => [...value, history.data!.pagination.nextCursor!])} className="rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-40">Más antiguas</button></div>
    </section>
    <p className="text-xs text-slate-500">Prototipo académico, no clínico. SpO₂ estimada sujeta a contacto y calibración; temperatura superficial, no temperatura corporal central. Las tendencias no son ECG ni ondas PPG.</p>
  </main>;
}
