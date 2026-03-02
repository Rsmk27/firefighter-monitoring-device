import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

// ─── Commander phone numbers ───────────────────────────────────────────────────
// All numbers MUST be in E.164 format: +[country code][number]
// Example: +919876543210  (India +91)
// Add as many commanders as needed.
const COMMANDER_NUMBERS: string[] = (
    process.env.COMMANDER_PHONE_NUMBERS ?? ''
)
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

// ─── Twilio credentials (server-side only — never exposed to the browser) ──────
const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID ?? '';
const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN  ?? '';
const TWILIO_FROM   = process.env.TWILIO_PHONE_NUMBER ?? ''; // Your Twilio number

// ─── Rate-limit: only one SMS burst per unit per 60 seconds ───────────────────
// (In-memory — resets on cold start. Replace with Redis/KV for production.)
const lastSmsSent = new Map<string, number>();
const SMS_COOLDOWN_MS = 60 * 1000; // 60 seconds

// ─── POST /api/send-sms ────────────────────────────────────────────────────────
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

        // ── Validate environment ──────────────────────────────────────────────
        if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
            console.error('[SMS] Twilio credentials not configured in .env.local');
            return NextResponse.json(
                { success: false, error: 'SMS service not configured.' },
                { status: 500 }
            );
        }

        if (COMMANDER_NUMBERS.length === 0) {
            console.error('[SMS] No commander phone numbers configured.');
            return NextResponse.json(
                { success: false, error: 'No commander numbers configured.' },
                { status: 500 }
            );
        }

        // ── Rate-limit check ─────────────────────────────────────────────────
        const now = Date.now();
        const lastSent = lastSmsSent.get(unitId) ?? 0;
        if (now - lastSent < SMS_COOLDOWN_MS) {
            const remainingSecs = Math.ceil((SMS_COOLDOWN_MS - (now - lastSent)) / 1000);
            console.log(`[SMS] Rate-limited for ${unitId}. Next SMS in ${remainingSecs}s.`);
            return NextResponse.json(
                { success: false, error: `Rate limited. Retry in ${remainingSecs}s.`, rateLimited: true },
                { status: 429 }
            );
        }

        // ── Build message ─────────────────────────────────────────────────────
        const time = timestamp ?? new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const mapsLink =
            latitude && longitude && latitude !== 0 && longitude !== 0
                ? `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`
                : 'GPS not available';

        const message =
            `🚨 SOS ALERT — IMMEDIATE ACTION REQUIRED\n` +
            `Unit: ${unitName} (${unitId})\n` +
            `Time: ${time}\n` +
            `Location: ${mapsLink}\n` +
            `STATUS: PERSON IN DANGER — Respond immediately.`;

        // ── Send to all commanders ────────────────────────────────────────────
        const client = twilio(TWILIO_SID, TWILIO_TOKEN);

        const results = await Promise.allSettled(
            COMMANDER_NUMBERS.map((to) =>
                client.messages.create({
                    body: message,
                    from: TWILIO_FROM,
                    to,
                })
            )
        );

        // Update rate-limit timestamp
        lastSmsSent.set(unitId, now);

        // Log results
        const succeeded: string[] = [];
        const failed: string[] = [];
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') {
                succeeded.push(COMMANDER_NUMBERS[i]);
                console.log(`[SMS] Sent to ${COMMANDER_NUMBERS[i]}: SID ${r.value.sid}`);
            } else {
                failed.push(COMMANDER_NUMBERS[i]);
                console.error(`[SMS] Failed to send to ${COMMANDER_NUMBERS[i]}:`, r.reason);
            }
        });

        return NextResponse.json({
            success: succeeded.length > 0,
            sent: succeeded.length,
            failed: failed.length,
            message: `SMS sent to ${succeeded.length}/${COMMANDER_NUMBERS.length} commanders.`,
        });

    } catch (err: any) {
        console.error('[SMS] Unexpected error:', err);
        return NextResponse.json(
            { success: false, error: err?.message ?? 'Unknown error' },
            { status: 500 }
        );
    }
}
