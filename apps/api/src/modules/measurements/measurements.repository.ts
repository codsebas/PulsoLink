import { getDb } from '../../config/firebase.js';
import { MeasurementsPayload } from '../../shared/types.js';

export interface StoredMeasurement {
  id: string;
  sessionId: string;
  deviceId: string;
  bootId: string;
  sequence: number;
  capturedAt: string | null;
  receivedAt: string;
  measurements: MeasurementsPayload;
}

export class MeasurementsRepository {
  private measurementsCollection(sessionId: string) {
    return getDb().collection('sessions').doc(sessionId).collection('measurements');
  }

  private ingestionKeysCollection() {
    return getDb().collection('ingestionKeys');
  }

  async getLatest(sessionId: string): Promise<StoredMeasurement | null> {
    const snapshot = await this.measurementsCollection(sessionId)
      .orderBy('receivedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as StoredMeasurement;
  }
}
