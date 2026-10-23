import { useMemo } from 'react';
import { usePatientOptions } from '../patients/api';
import { useDeviceOptions } from '../devices/api';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Catálogos de pacientes y placas habilitados para selectores y etiquetas de
 * tabla (Asignaciones y Sesiones). Los registros fuera del catálogo se
 * resuelven con `useEntityLabels`.
 */
export function useCatalogOptions() {
  const patientsQuery = usePatientOptions();
  const devicesQuery = useDeviceOptions();

  const patientNames = useMemo(() => {
    const map = new Map<string, string>();
    patientsQuery.data?.pages.forEach((page) =>
      page.data.forEach((patient) => map.set(patient.id, `${patient.displayName} (${patient.code})`)),
    );
    return map;
  }, [patientsQuery.data]);

  const deviceCodes = useMemo(() => {
    const map = new Map<string, string>();
    devicesQuery.data?.pages.forEach((page) => page.data.forEach((device) => map.set(device.id, device.code)));
    return map;
  }, [devicesQuery.data]);

  const patientOptions = useMemo<SelectOption[]>(
    () => Array.from(patientNames, ([value, label]) => ({ value, label })),
    [patientNames],
  );
  const deviceOptions = useMemo<SelectOption[]>(
    () => Array.from(deviceCodes, ([value, label]) => ({ value, label })),
    [deviceCodes],
  );

  return {
    patientsQuery,
    devicesQuery,
    patientNames,
    deviceCodes,
    patientOptions,
    deviceOptions,
    ready: !patientsQuery.isLoading && !devicesQuery.isLoading,
  };
}

export type CatalogOptions = ReturnType<typeof useCatalogOptions>;
