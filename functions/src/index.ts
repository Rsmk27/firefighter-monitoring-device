import * as admin from 'firebase-admin';
import { onValueWritten } from 'firebase-functions/v2/database';
import { defineString } from 'firebase-functions/params';
import axios from 'axios';

admin.initializeApp();

// ─── Firebase Functions parameters (set via `firebase functions:config:set` or
//     Firebase Console → Functions → Environment variables) ─────────────────────
//
// Required env vars (set in Firebase Console or .env):
//   SMS_PROVIDER         — "fast2sms" | "textlocal" | "vonage" | "generic"
//   SMS_API_KEY          — API key from your SMS provider
//   COMMANDER_NUMBERS    — Comma-separated E.164 numbers, e.g. "+919876543210,+918765432109"
//
// Optional (provider-specific):
//   SMS_SENDER_ID        — Sender ID / DLT header (Fast2SMS, TextLocal)
//   VONAGE_API_SECRET    — Required only for Vonage/Nexmo
// ─────────────────────────────────────────────────────────────────────────────

const SMS_PROVIDER = defineString('SMS_PROVIDER', { default: 'fast2sms' });
const SMS_API_KEY = defineString('SMS_API_KEY', { default: '' });
const SMS_SENDER_ID = defineString('SMS_SENDER_ID', { default: 'RSMKFF' });
const VONAGE_API_SECRET = defineString('VONAGE_API_SECRET', { default: '' });
const COMMANDER_NUMBERS = defineString('COMMANDER_NUMBERS', { default: '' });

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Function: sendSosSmS
// Trigger: Firebase Realtime Database write to /sos_alerts/{unitId}/latest
// ─────────────────────────────────────────────────────────────────────────────
export const sendSosSms = onValueWritten(
    {
        ref: '/sos_alerts/{unitId}/latest',
        region: 'asia-south1',   // Change to your nearest region
    },
    async (event) => {
        const after = event.data.after.val();

        // Skip deletions or non-pending alerts (already processed)
        if (!after || after.smsStatus !== 'pending') {
            console.log('[SosSms] Skipping — no data or already processed.');
            return null;
        }

        const { unitId, unitName, mapsLink, timestamp } = after as {
            unitId: string;
            unitName: string;
            mapsLink: string;
            timestamp: string;
        };

        // ── Resolve commander numbers ──────────────────────────────────────
        // Prefer numbers embedded in the alert (from Next.js .env.local),
        // fall back to the Cloud Function's own config.
        const fromAlert: string[] = (Array.isArray(after.commanders) ? after.commanders : [])
            .filter(Boolean);

        const fromConfig: string[] = (COMMANDER_NUMBERS.value() ?? '')
            .split(',').map((n: string) => n.trim()).filter(Boolean);

        const commanders = fromAlert.length > 0 ? fromAlert : fromConfig;

        if (commanders.length === 0) {
            console.error('[SosSms] No commander numbers configured. Set COMMANDER_NUMBERS env var.');
            await markProcessed(unitId, 'error:no-commanders');
            return null;
        }

        // ── Build message ──────────────────────────────────────────────────
        const message =
            `🚨 SOS ALERT — IMMEDIATE ACTION REQUIRED\n` +
            `Unit: ${unitName} (${unitId})\n` +
            `Time: ${timestamp}\n` +
            `Location: ${mapsLink}\n` +
            `STATUS: PERSON IN DANGER — Respond immediately.`;

        console.log(`[SosSms] Dispatching to ${commanders.length} commander(s) via ${SMS_PROVIDER.value()}`);

        // ── Send SMS ───────────────────────────────────────────────────────
        try {
            const results = await Promise.allSettled(
                commanders.map((to) => sendSms(to, message))
            );

            const succeeded = results.filter((r) => r.status === 'fulfilled').length;
            const failed = results.filter((r) => r.status === 'rejected').length;

            results.forEach((r, i) => {
                if (r.status === 'rejected') {
                    console.error(`[SosSms] Failed to send to ${commanders[i]}:`, r.reason);
                } else {
                    console.log(`[SosSms] Sent to ${commanders[i]}`);
                }
            });

            await markProcessed(
                unitId,
                failed === 0 ? 'sent' : succeeded > 0 ? 'partial' : 'error',
                succeeded,
                failed
            );

            return { succeeded, failed };

        } catch (err: any) {
            console.error('[SosSms] Unexpected error dispatching SMS:', err.message);
            await markProcessed(unitId, 'error', 0, commanders.length);
            return null;
        }
    }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mark the alert as processed so re-triggers are skipped */
async function markProcessed(
    unitId: string,
    status: string,
    sent = 0,
    failed = 0
) {
    await admin.database()
        .ref(`sos_alerts/${unitId}/latest/smsStatus`)
        .set(status);
    await admin.database()
        .ref(`sos_alerts/${unitId}/latest/smsResult`)
        .set({ sent, failed, processedAt: Date.now() });
}

/** Route SMS through the configured provider */
async function sendSms(to: string, message: string): Promise<void> {
    const provider = SMS_PROVIDER.value().toLowerCase();
    const apiKey = SMS_API_KEY.value();

    // Strip leading "+" from Indian numbers for Fast2SMS (expects 10-digit)
    const toLocal = to.replace(/^\+91/, '').replace(/^\+/, '');

    switch (provider) {

        // ── Fast2SMS (popular in India, free tier available) ───────────────
        case 'fast2sms': {
            const resp = await axios.post(
                'https://www.fast2sms.com/dev/bulkV2',
                {
                    route: 'q',          // Transactional route (requires DLT)
                    sender_id: SMS_SENDER_ID.value() || 'RSMKFF',
                    message: message,
                    language: 'english',
                    numbers: toLocal,
                },
                {
                    headers: {
                        authorization: apiKey,
                        'Content-Type': 'application/json',
                    },
                }
            );
            if (!resp.data?.return) {
                throw new Error(`Fast2SMS error: ${JSON.stringify(resp.data)}`);
            }
            break;
        }

        // ── TextLocal (supports India, free test credits) ──────────────────
        case 'textlocal': {
            const params = new URLSearchParams({
                apikey: apiKey,
                numbers: toLocal,
                message: message,
                sender: SMS_SENDER_ID.value() || 'RSMKFF',
            });
            const resp = await axios.post(
                'https://api.textlocal.in/send/',
                params.toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            if (resp.data?.status !== 'success') {
                throw new Error(`TextLocal error: ${JSON.stringify(resp.data)}`);
            }
            break;
        }

        // ── Vonage / Nexmo (global, requires account balance) ─────────────
        case 'vonage':
        case 'nexmo': {
            const resp = await axios.post(
                'https://rest.nexmo.com/sms/json',
                {
                    api_key: apiKey,
                    api_secret: VONAGE_API_SECRET.value(),
                    to: to,
                    from: SMS_SENDER_ID.value() || 'RSMKFF',
                    text: message,
                }
            );
            const msg = resp.data?.messages?.[0];
            if (!msg || msg.status !== '0') {
                throw new Error(`Vonage error: ${JSON.stringify(msg)}`);
            }
            break;
        }

        // ── Generic HTTP POST (bring your own SMS gateway) ─────────────────
        // Set SMS_API_KEY to your full endpoint URL in this mode.
        // The function will POST JSON: { to, message }
        case 'generic': {
            await axios.post(apiKey, { to, message });
            break;
        }

        default:
            throw new Error(`Unknown SMS provider: "${provider}". Use fast2sms, textlocal, vonage, or generic.`);
    }
}
