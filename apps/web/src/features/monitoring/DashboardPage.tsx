import React from 'react';
import { useParams } from 'react-router-dom';
import { Heart, Activity, Thermometer, AlertCircle, RefreshCw } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
            Sesión: {id || 'ses-001'}
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Monitoreo de Signos Vitales</h1>
          <p className="text-xs text-slate-500">
            Consulta periódica cada 2 segundos mientras la sesión esté activa.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
            Simulado
          </span>
          <button
            onClick={() =>
              alert('Punto de integración para finalizar sesión (@Didhyer - Issue #5).')
            }
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Finalizar Sesión
          </button>
        </div>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Dashboard en Integración (Issue #8 - @Javifa2324):</p>
          <p>
            Consumirá <code className="bg-amber-100 px-1 font-mono">GET /api/v1/sessions/:id/latest</code> cada 2 segundos mostrando:
            Frecuencia cardíaca (bpm), SpO₂ estimada (%) y temperatura superficial (°C), diferenciando estados de falta de contacto y datos desactualizados.
          </p>
        </div>
      </div>

      {/* Grid de los 3 indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pulso Card */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Frecuencia Cardíaca</span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <Heart className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-4xl font-extrabold text-slate-900">—</span>
            <span className="text-sm font-medium text-slate-400 ml-2">bpm</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium inline-block">
            Esperando datos...
          </span>
        </div>

        {/* SpO2 Card */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">SpO₂ Estimada</span>
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-4xl font-extrabold text-slate-900">—</span>
            <span className="text-sm font-medium text-slate-400 ml-2">%</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium inline-block">
            Esperando datos...
          </span>
        </div>

        {/* Temperatura Card */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Temperatura Superficial</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Thermometer className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-4xl font-extrabold text-slate-900">—</span>
            <span className="text-sm font-medium text-slate-400 ml-2">°C</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium inline-block">
            Esperando datos...
          </span>
        </div>
      </div>
    </div>
  );
};
