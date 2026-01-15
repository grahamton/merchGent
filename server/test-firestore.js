import { initFirebase } from './config/firebase.js';

console.log('--- FIRESTORE CONNECTIVITY TEST ---');

const db = initFirebase();

if (!db) {
    console.error('FAIL: Could not initialize Firebase (Check service-account.json path)');
    process.exit(1);
}

async function testWrite() {
    try {
        console.log('Attempting to write to collection "test_connectivity"...');
        const docRef = db.collection('test_connectivity').doc('ping');
        await docRef.set({
            timestamp: new Date().toISOString(),
            message: 'Hello from MerchGent CLI'
        });
        console.log('SUCCESS: Write completed!');
        console.log('Your Firestore Connection is HEALTHY. ✅');
    } catch (error) {
        console.error('FAIL: Write Failed.');
        console.error('Error Code:', error.code);
        console.error('Error Message:', error.message);
        if (error.code === 7) {
            console.error('HINT: This is PERMISSION_DENIED. Did you enable the API in Cloud Console?');
        }
    }
}

testWrite();
