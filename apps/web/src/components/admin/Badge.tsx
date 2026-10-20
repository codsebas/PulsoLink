import React from 'react';

type BadgeTone = 'sky' | 'emerald' | 'amber' | 'rose' | 'slate';

const toneClasses: Record<BadgeTone, string> = {
  sky: 'bg-sky-100 text-sky-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-800',
  slate: 'bg-slate-100 text-slate-600',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
}

/** Insignia compacta para estados (habilitado, origen, estado de sesión). */
export const Badge: React.FC<BadgeProps> = ({ tone = 'slate', children }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}
  >
    {children}
  </span>
);

export const sessionStatusTone: Record<string, BadgeTone> = {
  created: 'amber',
  active: 'emerald',
  finished: 'slate',
};

export const enabledTone = (enabled: boolean): BadgeTone => (enabled ? 'emerald' : 'rose');

export const sourceTone: Record<string, BadgeTone> = {
  real: 'sky',
  simulated: 'amber',
};

export const resultTone: Record<string, BadgeTone> = {
  success: 'emerald',
  failure: 'rose',
};
