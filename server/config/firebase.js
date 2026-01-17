import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, 'service-account.json');

let db = null;

export const initFirebase = () => {
    if (getApps().length > 0) {
        return getFirestore();
    }

    if (!fs.existsSync(serviceAccountPath)) {
        console.warn('[Firebase] Warning: service-account.json not found in server root.');
        return null;
    }

    try {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

        initializeApp({
            credential: cert(serviceAccount)
        });

        db = getFirestore();
        console.log('[Firebase] Connected to Firestore project:', serviceAccount.project_id);
    } catch (error) {
        console.error('[Firebase] Initialization Failed:', error.message);
    }

    return db;
};

export const getDb = () => {
    if (!db) return initFirebase();
    return db;
};
