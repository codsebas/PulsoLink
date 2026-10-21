// `operator` is retained only in already stored profiles during the explicit
// migration window. It is never exposed as an effective API role.
export type UserRole = 'admin' | 'viewer';
export type StoredUserRole = UserRole | 'operator';

const effectiveRoles: Record<StoredUserRole, UserRole> = {
  admin: 'admin',
  viewer: 'viewer',
  operator: 'viewer',
};

export function toEffectiveRole(value: unknown): UserRole | null {
  if (value === 'admin' || value === 'viewer' || value === 'operator') {
    return effectiveRoles[value];
  }
  return null;
}

export type DeviceSource = 'real' | 'simulated';

export type SessionStatus = 'created' | 'active' | 'finished';

export type MeasurementQualityStatus = 'valid' | 'no_contact' | 'invalid' | 'unavailable';

export interface VitalMeasurement {
  value: number | null;
  unit: 'bpm' | '%' | 'C';
  status: MeasurementQualityStatus;
}

export interface MeasurementsPayload {
  heartRate: VitalMeasurement;
  spo2: VitalMeasurement;
  skinTemperature: VitalMeasurement;
}
