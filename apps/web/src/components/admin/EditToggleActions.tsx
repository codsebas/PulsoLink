import React from 'react';
import { Pencil, Power } from 'lucide-react';

interface EditToggleActionsProps {
  enabled: boolean;
  onEdit: () => void;
  onToggle: () => void;
}

/** Acciones de fila de los catálogos administrativos: editar y habilitar/deshabilitar. */
export const EditToggleActions: React.FC<EditToggleActionsProps> = ({ enabled, onEdit, onToggle }) => (
  <div className="flex gap-2">
    <button
      type="button"
      onClick={onEdit}
      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
    >
      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
      Editar
    </button>
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
        enabled
          ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
      }`}
    >
      <Power className="w-3.5 h-3.5" aria-hidden="true" />
      {enabled ? 'Deshabilitar' : 'Habilitar'}
    </button>
  </div>
);
