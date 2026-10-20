import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type { Patient } from '../../lib/contract-types';
import { useCursorList } from '../../components/admin/useCursorList';

export interface PatientFilters {
  enabled?: boolean;
}

export function usePatients(filters: PatientFilters = {}) {
  return useCursorList<Patient>({
    queryKey: ['patients', filters],
    endpoint: '/patients',
    params: { enabled: filters.enabled },
  });
}

export interface PatientInput {
  code: string;
  displayName: string;
}

export interface PatientPatchInput extends Partial<PatientInput> {
  enabled?: boolean;
}

export function useCreatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PatientInput) =>
      apiClient<Patient>('/patients', { json: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatientPatchInput }) =>
      apiClient<Patient>(`/patients/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

/** Pacientes habilitados para seleccionar en formularios (una sola página razonable). */
export function usePatientOptions() {
  return useCursorList<Patient>({
    queryKey: ['patients', 'options', { enabled: true }],
    endpoint: '/patients',
    params: { enabled: true, limit: 100 },
  });
}

export async function fetchPatient(id: string): Promise<Patient> {
  const res = await apiClient<Patient>(`/patients/${encodeURIComponent(id)}`);
  return res.data;
}
