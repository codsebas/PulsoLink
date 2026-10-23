import React, { useId, useLayoutEffect, useRef } from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { LoadingState } from '../feedback/LoadingState';
import { ErrorState } from '../feedback/ErrorState';
import { useMediaQuery } from '../../lib/useMediaQuery';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  /** Encabeza la tarjeta en móvil. Si ninguna columna lo indica, se usa la primera. */
  primary?: boolean;
  /**
   * Papel de la columna en la tarjeta móvil: `actions` la muestra en el pie sin
   * etiqueta (por defecto para la columna `actions`); `hidden` la omite.
   */
  mobile?: 'actions' | 'hidden';
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

/** Breakpoint `sm` de Tailwind: por debajo, cada fila se muestra como tarjeta. */
export const WIDE_TABLE_QUERY = '(min-width: 640px)';

/** Nada que mostrar: las columnas devuelven `null` (o vacío) cuando no aplica, p. ej. sin acciones. */
const isEmpty = (node: React.ReactNode) => node === null || node === undefined || node === false || node === '';
const EmptyCell = () => <span className="text-xs text-slate-400">—</span>;
function renderCell<T>(column: Column<T>, row: T) {
  const content = column.render(row);
  return isEmpty(content) ? <EmptyCell /> : content;
}

interface ViewProps<T> {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
}

function TableView<T>({ columns, rows, getKey }: ViewProps<T>) {
  return (
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
                  {renderCell(column, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const roleOf = <T,>(column: Column<T>) => column.mobile ?? (column.key === 'actions' ? 'actions' : 'detail');

function CardView<T>({ columns, rows, getKey }: ViewProps<T>) {
  const visible = columns.filter((column) => roleOf(column) !== 'hidden');
  const primary = visible.find((column) => column.primary) ?? visible.find((column) => roleOf(column) === 'detail');
  const details = visible.filter((column) => column !== primary && roleOf(column) === 'detail');
  const actions = visible.filter((column) => roleOf(column) === 'actions');
  const baseId = useId();
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const titleId = `${baseId}-${getKey(row).replace(/\s+/g, '_')}`;
        const footer = actions.map((column) => ({ key: column.key, content: column.render(row) })).filter((item) => !isEmpty(item.content));
        return (
        <li key={getKey(row)} aria-labelledby={primary ? titleId : undefined} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {primary && (
            // Encabezado para navegar entre tarjetas con lector de pantalla. Si el título
            // es un enlace (p. ej. el ID de sesión), también ocupa 44 px de alto.
            <h2 id={titleId} className="min-w-0 break-words text-base font-semibold text-slate-900 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
              {primary.render(row)}
            </h2>
          )}
          {details.length > 0 && (
            <dl className="mt-3 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {details.map((column) => (
                <React.Fragment key={column.key}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{column.header}</dt>
                  <dd className="min-w-0 break-words text-slate-700">{renderCell(column, row)}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
          {footer.length > 0 && (
            // Solo si hay alguna acción. En táctil, los controles ocupan al menos 44 px.
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_button]:min-h-11">
              {footer.map((item) => (
                <React.Fragment key={item.key}>{item.content}</React.Fragment>
              ))}
            </div>
          )}
        </li>
        );
      })}
    </ul>
  );
}

/**
 * Listado administrativo con estados de carga, error y vacío, y paginación
 * incremental por cursor ("Cargar más"). Desde `sm` se muestra como tabla; por
 * debajo, cada fila es una tarjeta con sus campos etiquetados y las acciones al
 * pie, sin desplazamiento horizontal (#74, entrega 2).
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
  const wide = useMediaQuery(WIDE_TABLE_QUERY, true);
  // Al cruzar el breakpoint se desmonta una vista y se monta la otra. Si el foco
  // estaba dentro, se lleva al contenedor en vez de perderlo en <body>.
  const containerRef = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  const previousWide = useRef(wide);
  useLayoutEffect(() => {
    if (previousWide.current === wide) return;
    previousWide.current = wide;
    const container = containerRef.current;
    if (hadFocus.current && container && !container.contains(document.activeElement)) container.focus();
  }, [wide]);
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
    <div
      ref={containerRef}
      tabIndex={-1}
      onFocus={() => { hadFocus.current = true; }}
      onBlur={(event) => { hadFocus.current = event.currentTarget.contains(event.relatedTarget as Node | null); }}
      className="space-y-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
    >
      {wide ? <TableView columns={columns} rows={rows} getKey={getKey} /> : <CardView columns={columns} rows={rows} getKey={getKey} />}

      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 rounded-lg text-sm font-semibold text-slate-700 transition-colors max-sm:min-h-11 max-sm:w-full"
          >
            {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {isLoadingMore ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}
    </div>
  );
}
