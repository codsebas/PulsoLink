import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type { Session, SessionStatus } from '../../lib/contract-types';
import { useCursorList } from '../../components/admin/useCursorList';

export interface SessionFilters {
  status?: SessionStatus;
  patientId?: string;
  deviceId?: string;
  assignmentId?: string;
}

export function useSessions(filters: SessionFilters = {}) {
  return useCursorList<Session>({
    queryKey: ['sessions', filters],
    endpoint: '/sessions',
    params: {
      status: filters.status,
      patientId: filters.patientId,
      deviceId: filters.deviceId,
      assignmentId: filters.assignmentId,
    },
  });
}

export function useSession(id: string) {
  return useQuery<Session>({
    queryKey: ['sessions', id],
    queryFn: async () => {
      const res = await apiClient<Session>(`/sessions/${encodeURIComponent(id)}`);
      return res.data;
    },
  });
}

function useInvalidateSessions() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['devices'] });
  };
}

/** Crear sesión a partir de una asignación activa (contrato B: `{assignmentId}`). */
export function useCreateSession() {
  const invalidate = useInvalidateSessions();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      apiClient<Session>('/sessions', { json: { assignmentId } }),
    onSuccess: invalidate,
  });
}

export function useStartSession() {
  const invalidate = useInvalidateSessions();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<Session>(`/sessions/${encodeURIComponent(id)}/start`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useFinishSession() {
  const invalidate = useInvalidateSessions();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<Session>(`/sessions/${encodeURIComponent(id)}/finish`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}
