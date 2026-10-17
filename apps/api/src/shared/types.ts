export type UserRole = 'admin' | 'operator';

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
