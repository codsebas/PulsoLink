import { useCallback, useSyncExternalStore } from 'react';

/**
 * Estado de una media query, sincronizado con sus cambios. Si el entorno no
 * implementa `matchMedia` (p. ej. jsdom en pruebas), devuelve `fallback`.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const subscribe = useCallback((onChange: () => void) => {
    if (!supported) return () => undefined;
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query, supported]);
  const getSnapshot = () => (supported ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}
