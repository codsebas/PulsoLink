import React from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
  loadingLabel?: string;
  errorTitle?: string;
  /** Si devuelve `true`, se muestra `empty` en lugar de `children`. */
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
}

/**
 * Renderiza los estados de carga, error y vacío de una consulta de TanStack Query.
 * Mientras existan datos previos, un error de refresco no oculta el contenido.
 */
export function QueryState<T>({
  query,
  children,
  loadingLabel,
  errorTitle,
  isEmpty,
  empty = null,
}: QueryStateProps<T>): React.ReactElement {
  if (query.isPending) {
    return <LoadingState label={loadingLabel} />;
  }

  if (query.isError && query.data === undefined) {
    return <ErrorState error={query.error} title={errorTitle} onRetry={() => void query.refetch()} />;
  }

  const data = query.data as T;
  if (isEmpty?.(data)) {
    return <>{empty}</>;
  }

  return <>{children(data)}</>;
}
