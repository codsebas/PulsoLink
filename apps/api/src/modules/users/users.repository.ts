import type { Firestore } from 'firebase-admin/firestore';
import { getDb } from '../../config/firebase.js';
import { documentId } from '../../shared/persistence.js';
import type { UserRole } from '../../shared/types.js';

export interface UserDocument {
  uid: string; displayName: string; role: UserRole; enabled: boolean; createdAt: string;
}

export class UsersRepository {
  constructor(private readonly db: () => Firestore = getDb) {}
  async getById(uid: string): Promise<UserDocument | null> {
    const doc = await this.db().collection('users').doc(documentId.parse(uid)).get();
    return doc.exists ? { ...doc.data(), uid: doc.id } as UserDocument : null;
  }
}
