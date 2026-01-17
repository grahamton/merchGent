import fs from 'fs';
import path from 'path';
import { getDb } from '../config/firebase.js';

import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');
const hasCreds = fs.existsSync(serviceAccountPath);
// FORCE LOCAL for stability during UI Redesign
const STORAGE_MODE = 'LOCAL'; // was: process.env.STORAGE_MODE || (hasCreds ? 'CLOUD' : 'LOCAL');

console.log(`[Persistence] Initializing in ${STORAGE_MODE} mode`);

// Ensure data is stored in server/data/journeys
const DATA_DIR = path.resolve(__dirname, 'data', 'journeys');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==========================================
// 1. File System Adapter (Legacy/Local)
// ==========================================
const FsAdapter = {
    async createJourney(journeyId, startUrl) {
        const journey = {
            id: journeyId,
            createdAt: new Date().toISOString(),
            startUrl,
            steps: [],
            status: 'active'
        };
        const filePath = path.join(DATA_DIR, `${journeyId}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(journey, null, 2));
        return journey;
    },

    async addStep(journeyId, step) {
        const journey = await this.getJourney(journeyId);
        if (!journey) throw new Error('Journey not found');

        journey.steps.push(step);
        journey.updatedAt = new Date().toISOString();

        // Update Cookies if present in step
        if (step.cookies) {
            journey.cookies = step.cookies;
        }

        const filePath = path.join(DATA_DIR, `${journeyId}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(journey, null, 2));
        return step;
    },

    async getJourney(journeyId) {
        const filePath = path.join(DATA_DIR, `${journeyId}.json`);
        try {
            const data = await fs.promises.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }
};

// ==========================================
// 2. Firestore Adapter (Cloud/Scalable)
// ==========================================
const FirestoreAdapter = {
    async createJourney(journeyId, startUrl) {
        const db = getDb();
        if (!db) throw new Error('Firestore not initialized');

        const journey = {
            id: journeyId,
            createdAt: new Date().toISOString(),
            startUrl,
            status: 'active',
            stepCount: 0
        };

        // Create the Metadata Document
        await db.collection('journeys').doc(journeyId).set(journey);
        return { ...journey, steps: [] };
    },

    async addStep(journeyId, step) {
        const db = getDb();
        if (!db) throw new Error('Firestore not initialized');

        const journeyRef = db.collection('journeys').doc(journeyId);
        const stepsCol = journeyRef.collection('steps');

        // Add Step as a Sub-Document
        await stepsCol.add({
            ...step,
            timestamp: new Date().toISOString()
        });

        // Update Parent Metadata
        const updatePayload = {
            updatedAt: new Date().toISOString(),
            stepCount: (await stepsCol.count().get()).data().count
        };

        if (step.cookies) {
             updatePayload.cookies = step.cookies; // Keep cookies handy on parent
        }

        await journeyRef.update(updatePayload);
        return step;
    },

    async getJourney(journeyId) {
        const db = getDb();
        if (!db) throw new Error('Firestore not initialized');

        const doc = await db.collection('journeys').doc(journeyId).get();
        if (!doc.exists) return null;

        const journey = doc.data();

        // Fetch Steps (Ordered)
        const stepsSnapshot = await db.collection('journeys').doc(journeyId)
            .collection('steps')
            .orderBy('sequence', 'asc') // Assuming step has a sequence
            .get(); // Note: Without sequence, order might be arbitrary. We should ensure steps have timestamps.

        // Fallback sort if sequence missing
        const steps = stepsSnapshot.docs.map(d => d.data()).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        return { ...journey, steps };
    }
};

// ==========================================
// 3. Exported Interface
// ==========================================
export const Persistence = STORAGE_MODE === 'CLOUD' ? FirestoreAdapter : FsAdapter;

export const setStorageMode = (mode) => {
    // Runtime switch for testing
    console.log(`[Persistence] Switching to ${mode}`);
    if (mode === 'CLOUD') return FirestoreAdapter;
    return FsAdapter;
};
