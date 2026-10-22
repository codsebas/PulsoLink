interface Props {
  label: string;
  query: { hasNextPage?: boolean; isFetching: boolean; isError: boolean; isFetchNextPageError?: boolean; fetchNextPage: () => unknown; refetch: () => unknown };
}

/** Carga explícita para no descargar todo el catálogo al abrir un formulario. */
export function OptionPagination({ label, query }: Props) {
  if (!query.hasNextPage && !query.isError && !query.isFetching) return null;
  return <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
    {query.isError ? <span role="alert">No se pudieron cargar {label}.</span> : null}
    <button type="button" disabled={query.isFetching}
      onClick={() => { if (query.isError && !query.isFetchNextPageError) void query.refetch(); else void query.fetchNextPage(); }}
      className="rounded border border-slate-300 px-3 py-2 font-semibold text-sky-800 focus-visible:outline focus-visible:outline-2 disabled:opacity-50">
      {query.isFetching ? `Cargando ${label}…` : query.isError ? `Reintentar ${label}` : `Cargar más ${label}`}
    </button>
  </div>;
}
