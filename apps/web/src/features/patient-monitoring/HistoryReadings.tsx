import { useState } from 'react';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { WIDE_TABLE_QUERY } from '../../components/admin/DataTable';
import type { PatientMeasurement } from './patient-monitoring.types';
import { formatVital, guatemalaDate } from './trends';

const quality = { valid: 'Válida', no_contact: 'Sin contacto', invalid: 'Inválida', unavailable: 'No disponible' };
const magnitudes = [
  { key: 'heartRate', label: 'Pulso (bpm)' },
  { key: 'spo2', label: 'SpO₂ (%)' },
  { key: 'skinTemperature', label: 'Superficial (°C)' },
] as const;
/** Lecturas que la lista móvil dibuja por tanda; las cargadas en memoria no cambian. */
export const MOBILE_BATCH = 20;

const readingKey = (reading: PatientMeasurement) => `${reading.sessionId}/${reading.id}`;
const origin = (reading: PatientMeasurement) => (reading.source === 'simulated' ? 'Simulado' : 'Dispositivo real');
const value = (reading: PatientMeasurement, key: (typeof magnitudes)[number]['key']) =>
  reading.measurements[key].status === 'valid' ? formatVital(reading.measurements[key].value) : '—';

function HistoryTable({ readings }: { readings: PatientMeasurement[] }) {
  return <div tabIndex={0} role="region" aria-label="Tabla de lecturas, desplazamiento horizontal" className="max-w-full overflow-x-auto rounded-xl border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"><table className="w-full min-w-[720px] bg-white text-left text-sm tabular-nums"><caption className="sr-only">Valores y calidad por lectura del intervalo cargado</caption>
    <thead className="bg-slate-50 text-slate-600"><tr>{['Fecha (Guatemala)', 'Placa', ...magnitudes.map((m) => m.label), 'Origen'].map((heading) => <th scope="col" key={heading} className="p-3 font-medium">{heading}</th>)}</tr></thead>
    <tbody>{readings.map((reading) => <tr key={readingKey(reading)} data-reading-key={readingKey(reading)} className="border-t border-slate-100"><td className="p-3">{guatemalaDate(reading.receivedAt)}</td><td className="max-w-32 truncate p-3" title={reading.deviceId}>{reading.deviceId}</td>
      {magnitudes.map(({ key }) => <td className="p-3" key={key}>{value(reading, key)}<span className="mt-1 block text-xs text-slate-500">{quality[reading.measurements[key].status]}</span></td>)}<td className="p-3">{origin(reading)}</td></tr>)}</tbody>
  </table></div>;
}

function HistoryList({ readings }: { readings: PatientMeasurement[] }) {
  const [shown, setShown] = useState(MOBILE_BATCH);
  const visible = readings.slice(0, shown);
  return <div className="space-y-3">
    <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white" aria-label="Lecturas del intervalo cargado">
      {visible.map((reading) => <li key={readingKey(reading)} data-reading-key={readingKey(reading)} className="space-y-2 p-3">
        <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
          <span className="font-medium tabular-nums text-slate-900">{guatemalaDate(reading.receivedAt)}</span>
          <span className="min-w-0 truncate text-slate-600" title={reading.deviceId}>{reading.deviceId}</span>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          {magnitudes.map(({ key, label }) => <div key={key} className="min-w-0">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{value(reading, key)}</dd>
            <dd className="text-xs text-slate-500">{quality[reading.measurements[key].status]}</dd>
          </div>)}
        </dl>
        <p className="text-xs text-slate-500">{origin(reading)}</p>
      </li>)}
    </ol>
    <p className="text-sm text-slate-600" aria-live="polite">Mostrando {visible.length} de {readings.length} lecturas cargadas.</p>
    {shown < readings.length ? <button type="button" onClick={() => setShown((count) => count + MOBILE_BATCH)}
      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700">
      Mostrar {Math.min(MOBILE_BATCH, readings.length - shown)} más
    </button> : null}
  </div>;
}

/**
 * Lecturas del intervalo cargado. Desde `sm`, tabla con todas las columnas;
 * por debajo, lista compacta que dibuja tandas de 20 sin cambiar lo cargado
 * en memoria ni la paginación del historial (#74, entrega 3).
 */
export function HistoryReadings({ readings }: { readings: PatientMeasurement[] }) {
  const wide = useMediaQuery(WIDE_TABLE_QUERY, true);
  return wide ? <HistoryTable readings={readings} /> : <HistoryList readings={readings} />;
}
