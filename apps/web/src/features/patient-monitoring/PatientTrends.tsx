import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { PatientMeasurement } from './patient-monitoring.types';
import { guatemalaDate, trendPoints, formatVital } from './trends';

const metrics = [
  { key: 'heartRate', title: 'Pulso', unit: 'bpm', color: '#e11d48' },
  { key: 'spo2', title: 'SpO₂ estimada', unit: '%', color: '#0284c7' },
  { key: 'skinTemperature', title: 'Temperatura superficial', unit: '°C', color: '#b45309' },
] as const;

export default function PatientTrends({ readings }: { readings: PatientMeasurement[] }) {
  const points = useMemo(() => trendPoints(readings), [readings]);
  return <div className="grid gap-4 lg:grid-cols-3">
    {metrics.map((metric) => <section key={metric.key} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4" aria-label={`Tendencia de ${metric.title}`}>
      <h3 className="mb-4 text-sm font-semibold text-slate-800">{metric.title} <span className="font-normal text-slate-500">({metric.unit})</span></h3>
      <div className="h-52" role="img" aria-label={`Valores puntuales de ${metric.title}. Consulte los valores exactos en la tabla de historial.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="at" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(value: number) => guatemalaDate(value).split(', ').pop() ?? ''} minTickGap={35} tick={{ fontSize: 10 }} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickFormatter={(value: number) => value.toLocaleString('es-GT', { maximumFractionDigits: 2 })} />
            <Tooltip labelFormatter={(value) => guatemalaDate(Number(value))} formatter={(value) => [formatVital(value == null ? null : Number(value)), metric.unit]} />
            <Line type="linear" dataKey={metric.key} stroke={metric.color} strokeWidth={2} dot={points.length < 30} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>)}
  </div>;
}
