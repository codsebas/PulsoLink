import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import type { User, Role } from '../../../lib/contract-types';
import { useCursorList } from '../../../components/admin/useCursorList';

export interface UserFilters {
  enabled?: boolean;
}

export function useUsers(filters: UserFilters = {}) {
  return useCursorList<User>({
    queryKey: ['users', filters],
    endpoint: '/users',
    params: { enabled: filters.enabled },
  });
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  role: Role;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: Role;
  enabled?: boolean;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => apiClient<User>('/users', { json: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      apiClient<User>(`/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
