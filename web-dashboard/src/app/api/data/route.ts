import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

export async function POST(req: NextRequest) {
    try {
        if (!adminDb) {
            console.warn('API POST: Firebase Admin not initialized.');
            return NextResponse.json({ error: 'Database service unavailable due to missing configuration.' }, { status: 503 });
        }

        const body = await req.json();
        const { device_id, temperature, movement, status, latitude, longitude } = body;

        if (!device_id) {
            return NextResponse.json({ error: 'device_id is required' }, { status: 400 });
        }

        const data = {
            device_id,
            temperature,
            movement,
            status,
            location: {
                lat: latitude,
                lng: longitude
            },
            // Using server timestamp for consistency
        };

        // 1. Store in historical readings
        await adminDb.collection('readings').add({
            ...data,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Update latest device state (for real-time dashboard)
        await adminDb.collection('devices').doc(device_id).set({
            ...data,
            lastSeen: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error processing data:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
