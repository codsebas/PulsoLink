import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type { Assignment, AssignmentStatusFilter } from '../../lib/contract-types';
import { useCursorList } from '../../components/admin/useCursorList';

export interface AssignmentFilters {
  status?: AssignmentStatusFilter;
  patientId?: string;
  deviceId?: string;
}

export function useAssignments(
  filters: AssignmentFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useCursorList<Assignment>({
    queryKey: ['assignments', filters],
    endpoint: '/assignments',
    params: {
      status: filters.status,
      patientId: filters.patientId,
      deviceId: filters.deviceId,
    },
    enabled: options.enabled ?? true,
  });
}

export interface AssignmentInput {
  patientId: string;
  deviceId: string;
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignmentInput) =>
      apiClient<Assignment>('/assignments', { json: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useCloseAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<Assignment>(`/assignments/${encodeURIComponent(id)}/close`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}
