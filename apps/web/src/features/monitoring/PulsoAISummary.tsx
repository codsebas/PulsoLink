import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useSessionUser } from '../auth/useSessionUser';

interface Metric {
  unit: string; validCount: number; mean: number | null; min: number | null; max: number | null;
  quality: { valid: number; no_contact: number; invalid: number; unavailable: number };
}
export interface PulsoAIResult {
  sessionId: string;
  status: 'not_requested' | 'pending' | 'generating' | 'ready' | 'failed' | 'disabled' | 'insufficient_data';
  stats: { source: 'real' | 'simulated'; durationSeconds: number | null; total: number;
    metrics: Record<'heartRate' | 'spo2' | 'skinTemperature', Metric> } | null;
  text: string | null; generatedAt: string | null; errorCode: string | null;
}
const labels = { heartRate: 'Pulso', spo2: 'SpO₂ estimada', skinTemperature: 'Temperatura superficial' };
const messages: Record<PulsoAIResult['status'], string> = {
  not_requested: 'Esta sesión todavía no tiene resumen. Un administrador puede solicitarlo.',
  pending: 'PulsoAI está preparando el resumen de la sesión.',
  generating: 'PulsoAI está generando el resumen. Puede volver a esta sesión más tarde.',
  ready: '',
  failed: 'No se pudo generar el resumen. Las lecturas y estadísticas se conservan.',
  disabled: 'La generación de PulsoAI está deshabilitada en el servidor. Las estadísticas siguen disponibles.',
  insufficient_data: 'No hay lecturas válidas suficientes para generar un resumen. No se realizó una llamada a IA.',
};
const number = (value: number | null) => value === null ? 'Sin dato' : value.toLocaleString('es-GT', { maximumFractionDigits: 2 });

/** Kept separate from the dashboard so #74 can refine appearance independently. */
export function PulsoAISummaryView({ result, busy, error, canRequest, onRequest }: {
  result?: PulsoAIResult; busy: boolean; error: boolean; canRequest: boolean; onRequest: () => void;
}) {
  const status = result?.status;
  const waiting = status === 'pending' || status === 'generating';
  const canRetry = status && ['not_requested', 'failed', 'disabled', 'insufficient_data'].includes(status);
  return <section className="space-y-3 border-t border-slate-200 pt-4 text-sm text-slate-700" aria-labelledby="pulsoai-title">
    <h2 id="pulsoai-title" className="font-semibold text-slate-900">
      {status === 'ready' && result?.text ? 'Resumen generado por PulsoAI' : 'PulsoAI — resumen de sesión'}
    </h2>
    <div role="status" aria-live="polite">
      {error ? <p>No se pudo consultar PulsoAI. Intente actualizar la página.</p>
        : !result ? <p>Cargando resumen de la sesión...</p>
        : status === 'ready' && result.text ? <p className="whitespace-pre-line">{result.text}</p>
        : <p>{messages[result.status]}</p>}
    </div>
    {result?.stats && <div className="space-y-2">
      <p className="text-xs">Estadísticas de la sesión completa · Origen {result.stats.source === 'simulated' ? 'simulado' : 'real'} · {result.stats.total} registros · Duración: {number(result.stats.durationSeconds)} segundos</p>
      <dl className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(labels) as Array<keyof typeof labels>).map(key => {
          const m = result.stats!.metrics[key];
          const unit = m.unit === 'C' ? '°C' : m.unit;
          return <div key={key}>
            <dt className="font-medium">{labels[key]}</dt>
            <dd>Promedio: {number(m.mean)}{m.mean !== null ? ` ${unit}` : ''}</dd>
            <dd className="text-xs">Mínimo: {number(m.min)} · Máximo: {number(m.max)} {unit}</dd>
            <dd className="text-xs">Válidas: {m.validCount} de {result.stats!.total} · Sin contacto: {m.quality.no_contact} · Inválidas: {m.quality.invalid} · No disponibles: {m.quality.unavailable}</dd>
          </div>;
        })}
      </dl>
    </div>}
    {canRequest && canRetry && <button type="button" onClick={onRequest} disabled={busy || waiting}
      className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">
      {busy ? 'Solicitando...' : status === 'not_requested' ? 'Generar resumen con PulsoAI' : 'Reintentar PulsoAI'}
    </button>}
    <p className="text-xs text-slate-500">Prototipo académico no validado para uso clínico. SpO₂ estimada y temperatura superficial.</p>
  </section>;
}

export function PulsoAISummary({ sessionId, visible }: { sessionId: string; visible: boolean }) {
  const client = useQueryClient();
  const { data: user } = useSessionUser();
  const key = ['sessions', sessionId, 'summary'];
  const query = useQuery({ queryKey: key,
    queryFn: async ({ signal }) => (await apiClient<PulsoAIResult>(`/sessions/${encodeURIComponent(sessionId)}/summary`, { signal })).data,
    refetchInterval: q => visible && ['pending', 'generating'].includes(q.state.data?.status ?? '') ? 5000 : false,
    refetchIntervalInBackground: false, staleTime: 5000, retry: 1,
  });
  const retry = useMutation({
    mutationFn: async () => (await apiClient<PulsoAIResult>(`/sessions/${encodeURIComponent(sessionId)}/summary/retry`, { json: {} })).data,
    onSuccess: data => client.setQueryData(key, data),
  });
  return <>
    <PulsoAISummaryView result={query.data} busy={retry.isPending} error={query.isError}
      canRequest={user?.role === 'admin'} onRequest={() => retry.mutate()} />
    {retry.isError && <p role="alert" className="text-sm text-rose-700">{retry.error instanceof Error ? retry.error.message : 'No se pudo solicitar el resumen.'}</p>}
  </>;
}
