import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type { Device, DeviceSource } from '../../lib/contract-types';
import { useCursorList } from '../../components/admin/useCursorList';

export interface DeviceFilters {
  enabled?: boolean;
}

export function useDevices(filters: DeviceFilters = {}) {
  return useCursorList<Device>({
    queryKey: ['devices', filters],
    endpoint: '/devices',
    params: { enabled: filters.enabled },
  });
}

export interface DeviceInput {
  code: string;
  source: DeviceSource;
  hardwareId?: string;
}

export interface DevicePatchInput {
  code?: string;
  hardwareId?: string;
  enabled?: boolean;
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceInput) => apiClient<Device>('/devices', { json: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useUpdateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DevicePatchInput }) =>
      apiClient<Device>(`/devices/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useDeviceOptions() {
  return useCursorList<Device>({
    queryKey: ['devices', 'options', { enabled: true }],
    endpoint: '/devices',
    params: { enabled: true, limit: 100 },
  });
}

export async function fetchDevice(id: string): Promise<Device> {
  const res = await apiClient<Device>(`/devices/${encodeURIComponent(id)}`);
  return res.data;
}

