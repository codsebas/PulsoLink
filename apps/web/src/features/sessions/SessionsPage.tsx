import React from 'react';
import { PlusCircle, Clock, Smartphone, AlertCircle } from 'lucide-react';

export const SessionsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sesiones de Medición</h1>
          <p className="text-sm text-slate-500">
            Crea y administra sesiones telemétricas por participante y dispositivo.
          </p>
        </div>

        <button
          onClick={() =>
            alert(
              'Punto de integración asignado a @Lis671 (Issue #9).\nPermitirá registrar participante (ej. P-001) y dispositivo asignado.'
            )
          }
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm self-start"
        >
          <PlusCircle className="w-4 h-4" />
          Nueva Sesión
        </button>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Módulo de Sesiones en Integración:</p>
          <p>
            <strong>Frontend (@Lis671 - Issue #9):</strong> Formulario de creación, listado e inicio/fin de sesiones con bloqueo de botones.
          </p>
          <p>
            <strong>Backend (@Didhyer - Issue #5):</strong> Endpoints <code className="bg-amber-100 px-1 font-mono">POST /sessions</code>, <code className="bg-amber-100 px-1 font-mono">POST /sessions/:id/start</code> y <code className="bg-amber-100 px-1 font-mono">POST /sessions/:id/finish</code>.
          </p>
        </div>
      </div>

      {/* Lista vacía / placeholder con acceso a Demo */}
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 space-y-4">
        <Clock className="w-10 h-10 text-slate-300 mx-auto" />
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">No hay sesiones en la base de datos real</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Para la presentación de clase y evaluación del prototipo, puedes interactuar directamente con la sala de monitoreo y telemetría simulada.
          </p>
        </div>
        <div>
          <a
            href="/demo"
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            <span>Abrir Sala de Monitoreo en Vivo (Prototipo)</span>
          </a>
        </div>
      </div>
    </div>
  );
};
