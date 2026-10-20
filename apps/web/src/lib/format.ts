/** Formatea una fecha ISO UTC en la zona horaria de la web (America/Guatemala). */
const dateTimeFormatter = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Guatemala',
});

const dateFormatter = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeZone: 'America/Guatemala',
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}
