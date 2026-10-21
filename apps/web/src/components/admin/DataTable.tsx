import React from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { LoadingState } from '../feedback/LoadingState';
import { ErrorState } from '../feedback/ErrorState';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  emptyMessage?: string;
  emptyHint?: string;
}

/**
 * Tabla reutilizable de listados administrativos con estados de carga,
 * error y vacío, y paginación incremental por cursor ("Cargar más").
 */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  isLoading,
  error,
  onRetry,
  hasMore,
  isLoadingMore,
  onLoadMore,
  emptyMessage = 'No hay registros.',
  emptyHint,
}: DataTableProps<T>) {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 space-y-2">
        <Inbox className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-700">{emptyMessage}</p>
        {emptyHint && <p className="text-xs text-slate-400">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getKey(row)} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-3 text-slate-700 ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 rounded-lg text-sm font-semibold text-slate-700 transition-colors"
          >
            {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {isLoadingMore ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}
    </div>
  );
}
