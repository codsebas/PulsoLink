import { getDb } from '../../config/firebase.js';

export interface SessionDocument {
  sessionId: string;
  participantCode: string;
  operatorId: string;
  deviceId: string;
  source: 'real' | 'simulated';
  status: 'created' | 'active' | 'finished';
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export class SessionsRepository {
  private collection() {
    return getDb().collection('sessions');
  }

  async getById(sessionId: string): Promise<SessionDocument | null> {
    const doc = await this.collection().doc(sessionId).get();
    if (!doc.exists) return null;
    return doc.data() as SessionDocument;
  }
}
