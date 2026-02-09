import * as admin from 'firebase-admin';

let adminDb: admin.firestore.Firestore | null = null;

try {
    if (!admin.apps.length) {
        if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
            const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey,
                }),
            });
            console.log("Firebase Admin Initialized successfully.");
        } else {
            console.warn("Firebase Admin: Missing environment variables for initialization.");
        }
    }

    if (admin.apps.length > 0) {
        adminDb = admin.firestore();
    }
} catch (error: any) {
    console.error("Firebase Admin Initialization Error:", error.message);
}

export { adminDb };
