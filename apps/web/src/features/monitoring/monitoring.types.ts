export type MeasurementStatus = 'valid' | 'no_contact' | 'invalid' | 'unavailable';

export interface VitalMeasurement {
  value: number | null;
  unit: 'bpm' | '%' | 'C';
  status: MeasurementStatus;
}

export interface LatestMeasurement {
  id: string;
  sessionId: string;
  deviceId: string;
  source: 'real' | 'simulated';
  bootId: string;
  sequence: number;
  capturedAt: string | null;
  receivedAt: string;
  measurements: {
    heartRate: VitalMeasurement;
    spo2: VitalMeasurement;
    skinTemperature: VitalMeasurement;
  };
}

export interface MeasurementSession {
  id: string;
  participantCode: string;
  deviceId: string;
  source: 'real' | 'simulated';
  status: 'created' | 'active' | 'finished';
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface LatestMeasurementMeta {
  serverTime: string;
  lastSeenAt: string | null;
  deviceOnline: boolean;
  ageMs: number | null;
  stale: boolean;
}
