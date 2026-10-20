import type { LatestMeasurement, LatestMeasurementMeta } from '../monitoring/monitoring.types';

export interface Patient { id: string; code: string; displayName: string; enabled: boolean; createdAt: string; updatedAt: string }
export interface PatientMeasurement extends LatestMeasurement { patientId: string; assignmentId: string }
export interface PatientMonitoringMeta extends LatestMeasurementMeta {
  connectionState: 'disconnected' | 'connected_without_valid_reading' | 'connected_with_recent_reading';
}
export interface PatientSession { id: string; patientId: string; deviceId: string; assignmentId: string; status: 'created' | 'active' | 'finished' }
