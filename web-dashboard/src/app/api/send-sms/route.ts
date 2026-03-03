import { NextRequest, NextResponse } from 'next/server';
import { adminRtdb } from '@/lib/firebaseAdmin';

// ─── Commander phone numbers ───────────────────────────────────────────────────
// All numbers MUST be in E.164 format: +[country code][number]
// Example: +919876543210  (India +91)
// These are read by the Firebase Cloud Function — configure them in Firebase
// environment config or keep them here as a fallback reference.
const COMMANDER_NUMBERS: string[] = (
    process.env.COMMANDER_PHONE_NUMBERS ?? ''
)
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

// ─── Rate-limit: only one SOS push per unit per 60 seconds ────────────────────
// (In-memory — resets on cold start. Replace with Redis/KV for production.)
const lastSmsSent = new Map<string, number>();
const SMS_COOLDOWN_MS = 60 * 1000; // 60 seconds

// ─── POST /api/send-sms ────────────────────────────────────────────────────────
// Instead of calling Twilio directly, this route writes an SOS alert document
// to Firebase Realtime Database under `sos_alerts/<unitId>/<timestamp>`.
// A Firebase Cloud Function (see /functions/index.ts) listens to new writes
// there and dispatches SMS to all configured commanders.
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { unitId, unitName, latitude, longitude, timestamp } = body as {
            unitId: string;
            unitName: string;
            latitude?: number;
            longitude?: number;
            timestamp?: string;
        };

        // ── Validate Firebase Admin is ready ──────────────────────────────────
        if (!adminRtdb) {
            console.error('[SOS] Firebase Admin RTDB not initialised. Check FIREBASE_* env vars.');
            return NextResponse.json(
                { success: false, error: 'Firebase not configured on server.' },
                { status: 500 }
            );
        }

        if (COMMANDER_NUMBERS.length === 0) {
            console.warn('[SOS] No COMMANDER_PHONE_NUMBERS set — Cloud Function will use its own config.');
        }

        // ── Rate-limit check ─────────────────────────────────────────────────
        const now = Date.now();
        const lastSent = lastSmsSent.get(unitId) ?? 0;
        if (now - lastSent < SMS_COOLDOWN_MS) {
            const remainingSecs = Math.ceil((SMS_COOLDOWN_MS - (now - lastSent)) / 1000);
            console.log(`[SOS] Rate-limited for ${unitId}. Next alert in ${remainingSecs}s.`);
            return NextResponse.json(
                {
                    success: false,
                    error: `Rate limited. Retry in ${remainingSecs}s.`,
                    rateLimited: true,
                },
                { status: 429 }
            );
        }

        // ── Build alert payload ───────────────────────────────────────────────
        const time = timestamp ?? new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const mapsLink =
            latitude && longitude && latitude !== 0 && longitude !== 0
                ? `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`
                : 'GPS not available';

        const alertPayload = {
            unitId,
            unitName,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
            mapsLink,
            timestamp: time,
            triggeredAt: now,
            // Commanders list embedded so Cloud Function can use it directly
            commanders: COMMANDER_NUMBERS,
            // status lets the Cloud Function know this is a fresh (unprocessed) alert
            smsStatus: 'pending',
        };

        // ── Write SOS alert to Firebase RTDB ──────────────────────────────────
        // Path: sos_alerts/<unitId>/latest
        // Using `set` so the Cloud Function always sees the latest alert
        // (avoids unbounded list growth). Switch to `push` if you need full history.
        const alertRef = adminRtdb.ref(`sos_alerts/${unitId}/latest`);
        await alertRef.set(alertPayload);

        // Also push to a history list (last 100 kept by Cloud Function)
        const historyRef = adminRtdb.ref(`sos_alerts/${unitId}/history`);
        await historyRef.push(alertPayload);

        // Update rate-limit timestamp
        lastSmsSent.set(unitId, now);

        console.log(`[SOS] Alert written to Firebase RTDB for ${unitId}. Cloud Function will dispatch SMS.`);

        return NextResponse.json({
            success: true,
            sent: COMMANDER_NUMBERS.length,
            failed: 0,
            message: `SOS alert queued in Firebase. SMS will be dispatched to ${COMMANDER_NUMBERS.length || 'configured'} commander(s).`,
        });

    } catch (err: any) {
        console.error('[SOS] Unexpected error:', err);
        return NextResponse.json(
            { success: false, error: err?.message ?? 'Unknown error' },
            { status: 500 }
        );
    }
}
