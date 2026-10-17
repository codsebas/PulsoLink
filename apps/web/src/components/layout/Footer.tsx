import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto py-6">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div>
          <p className="font-medium text-slate-700">PulsoLink — Proyecto Académico Web & IoT</p>
          <p>Mediciones superficiales y estimadas con fines educativos. No apto para diagnóstico clínico.</p>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/codsebas/PulsoLink"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-800 underline transition-colors"
          >
            Repositorio GitHub
          </a>
          <span>·</span>
          <span>Node.js 24 + Express 5 + React + Firestore</span>
        </div>
      </div>
    </footer>
  );
};
