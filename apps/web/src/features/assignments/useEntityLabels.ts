import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchPatient } from '../patients/api';
import { fetchDevice } from '../devices/api';

interface EntityRefs {
  patientId: string;
  deviceId: string;
}

/**
 * Etiquetas de paciente/placa para tablas históricas. Los catálogos de opciones
 * solo traen registros habilitados; los IDs que no aparecen ahí (deshabilitados
 * o fuera de la página cargada) se resuelven uno a uno con GET /patients/{id} y
 * GET /devices/{id}, sin descargar el catálogo completo.
 */
export function useEntityLabels(
  rows: readonly EntityRefs[],
  patientNames: ReadonlyMap<string, string>,
  deviceCodes: ReadonlyMap<string, string>,
  catalogsReady: boolean,
) {
  const missingPatients = useMemo(
    () => (catalogsReady ? [...new Set(rows.map((r) => r.patientId))].filter((id) => !patientNames.has(id)) : []),
    [rows, patientNames, catalogsReady],
  );
  const missingDevices = useMemo(
    () => (catalogsReady ? [...new Set(rows.map((r) => r.deviceId))].filter((id) => !deviceCodes.has(id)) : []),
    [rows, deviceCodes, catalogsReady],
  );

  const patientQueries = useQueries({
    queries: missingPatients.map((id) => ({
      queryKey: ['patients', 'detail', id],
      queryFn: () => fetchPatient(id),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const deviceQueries = useQueries({
    queries: missingDevices.map((id) => ({
      queryKey: ['devices', 'detail', id],
      queryFn: () => fetchDevice(id),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });

  const resolvedPatients = new Map<string, string>();
  patientQueries.forEach(({ data: patient }) => {
    if (patient) {
      const label = `${patient.displayName} (${patient.code})`;
      resolvedPatients.set(patient.id, patient.enabled ? label : `${label} · deshabilitado`);
    }
  });
  const resolvedDevices = new Map<string, string>();
  deviceQueries.forEach(({ data: device }) => {
    if (device) resolvedDevices.set(device.id, device.enabled ? device.code : `${device.code} · deshabilitada`);
  });

  return {
    patientLabel: (id: string) => patientNames.get(id) ?? resolvedPatients.get(id),
    deviceLabel: (id: string) => deviceCodes.get(id) ?? resolvedDevices.get(id),
  };
}
