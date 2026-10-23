import { useCallback, useRef, useSyncExternalStore } from 'react';

/**
 * Estado de una media query, sincronizado con sus cambios. Si el entorno no
 * implementa `matchMedia` (p. ej. jsdom en pruebas), devuelve `fallback`.
 *
 * `onBeforeChange` se ejecuta dentro del mismo aviso de `matchMedia` y antes de
 * pedir el nuevo render, mientras el DOM anterior sigue montado (p. ej. para
 * saber dónde estaba el foco). Un listener aparte no lo garantiza: el navegador
 * vacía las microtareas tras cada listener y React puede renderizar antes.
 */
export function useMediaQuery(query: string, fallback = false, onBeforeChange?: () => void): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const beforeChange = useRef(onBeforeChange);
  beforeChange.current = onBeforeChange;
  const subscribe = useCallback((onChange: () => void) => {
    if (!supported) return () => undefined;
    const list = window.matchMedia(query);
    const handler = () => {
      beforeChange.current?.();
      onChange();
    };
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  }, [query, supported]);
  const getSnapshot = () => (supported ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}
