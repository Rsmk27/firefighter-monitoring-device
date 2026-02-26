'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { collection, doc, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, rtdb } from '@/lib/firebase';
import MapWrapper from '@/components/MapWrapper';
import AnalyticsPanel from '@/components/AnalyticsPanel';
import {
    Thermometer, Activity, ShieldCheck, AlertTriangle,
    Siren, Clock, Wifi, Zap,
    BatteryFull, BatteryMedium, BatteryLow, BatteryWarning,
    Signal, Users,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────
type DeviceState = 'NORMAL' | 'WARNING' | 'EMERGENCY' | 'SOS' | 'OFFLINE';

interface DeviceData {
    device_id: string;
    temperature: number;
    movement: 'MOVING' | 'STILL';
    status: DeviceState;
    battery: number;      // 0–100 %
    signal: number;       // 0–100 %
    packetLoss: number;   // 0–100 %
    latency: number;      // ms
    location: { lat: number; lng: number };
    lastSeen?: any;
}

interface AlertLog {
    id: string;
    timestamp: any;
    status: DeviceState;
    message: string;
}

interface MockDevice {
    id: string;
    name: string;
    online: boolean;
    status: DeviceState;
}

const DEVICE_ID = 'FF_001';

// ─── Multi-device roster ──────────────────────────────────────────────────────
const DEVICE_ROSTER: MockDevice[] = [
    { id: 'FF_001', name: 'Unit Alpha', online: true, status: 'NORMAL' },
    { id: 'FF_002', name: 'Unit Bravo', online: false, status: 'OFFLINE' },
    { id: 'FF_003', name: 'Unit Delta', online: false, status: 'OFFLINE' },
    { id: 'FF_004', name: 'Unit Echo', online: false, status: 'OFFLINE' },
];

// ─── Mock data generator ──────────────────────────────────────────────────────
let mockBattery = 88;
const generateMockData = (prevLat: number, prevLng: number): DeviceData => {
    const statuses: DeviceState[] = ['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'WARNING', 'EMERGENCY', 'SOS'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const newLat = prevLat + (Math.random() - 0.5) * 0.001;
    const newLng = prevLng + (Math.random() - 0.5) * 0.001;
    const isMoving = Math.random() > 0.3;
    mockBattery = Math.max(5, mockBattery - Math.random() * 0.4);
    return {
        device_id: DEVICE_ID,
        temperature: 30 + Math.random() * 25,
        movement: isMoving ? 'MOVING' : 'STILL',
        status,
        battery: Math.round(mockBattery),
        signal: 60 + Math.random() * 40,
        packetLoss: Math.random() * 8,
        latency: 20 + Math.random() * 80,
        location: { lat: newLat, lng: newLng },
        lastSeen: new Date(),
    };
};

const generateMockAlerts = (): AlertLog[] =>
    Array.from({ length: 5 }).map((_, i) => ({
        id: `mog-${i}`,
        timestamp: { toDate: () => new Date(Date.now() - i * 1000 * 60 * 5) },
        status: i === 0 ? 'EMERGENCY' : i === 2 ? 'WARNING' : 'NORMAL',
        message: i === 0 ? 'High Temperature Detected' : i === 2 ? 'Inactivity Warning' : 'Status Normal',
    }));

// ─── Battery helpers ──────────────────────────────────────────────────────────
const BatteryIcon = ({ pct }: { pct: number }) => {
    if (pct > 60) return <BatteryFull className="w-4 h-4" />;
    if (pct > 30) return <BatteryMedium className="w-4 h-4" />;
    if (pct > 15) return <BatteryLow className="w-4 h-4" />;
    return <BatteryWarning className="w-4 h-4" />;
};
const batteryTextColor = (pct: number) =>
    pct > 60 ? 'text-emerald-500' : pct > 30 ? 'text-amber-500' : 'text-rose-500';
const batteryBarColor = (pct: number) =>
    pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-500' : 'bg-rose-500';

// ─── Signal helpers ───────────────────────────────────────────────────────────
const signalQuality = (s: number) => {
    if (s >= 80) return { label: 'Excellent', color: 'text-emerald-500' };
    if (s >= 60) return { label: 'Good', color: 'text-sky-500' };
    if (s >= 40) return { label: 'Fair', color: 'text-amber-500' };
    return { label: 'Poor', color: 'text-rose-500' };
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
    const [deviceData, setDeviceData] = useState<DeviceData | null>(null);
    const [alerts, setAlerts] = useState<AlertLog[]>([]);
    const [isClient, setIsClient] = useState(false);
    const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
    const [useMock, setUseMock] = useState(false);
    const [trail, setTrail] = useState<[number, number][]>([]);

    // Analytics state
    const [tempHistory, setTempHistory] = useState<{ time: string; temp: number }[]>([]);
    const [movementHistory, setMovementHistory] = useState<{ time: string; moving: number }[]>([]);
    const [statusCounts, setStatusCounts] = useState<{ name: string; value: number; color: string }[]>([
        { name: 'Normal', value: 0, color: '#10b981' },
        { name: 'Warning', value: 0, color: '#f59e0b' },
        { name: 'Emergency', value: 0, color: '#ef4444' },
        { name: 'SOS', value: 0, color: '#a855f7' },
    ]);

    const pushAnalytics = useCallback((temp: number, movement: 'MOVING' | 'STILL', status: string) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setTempHistory(prev => [...prev.slice(-59), { time, temp }]);
        setMovementHistory(prev => [...prev.slice(-59), { time, moving: movement === 'MOVING' ? 1 : 0 }]);
        setStatusCounts(prev => prev.map(s => {
            const match =
                (s.name === 'Normal' && status === 'NORMAL') ||
                (s.name === 'Warning' && status === 'WARNING') ||
                (s.name === 'Emergency' && status === 'EMERGENCY') ||
                (s.name === 'SOS' && status === 'SOS');
            return match ? { ...s, value: s.value + 1 } : s;
        }));
    }, []);

    // Voice alert
    const lastAnnouncedStatus = useRef<string>('');
    const announceStatus = (status: string) => {
        if (!status || status === 'NORMAL' || status === 'OFFLINE') return;
        if (lastAnnouncedStatus.current === status) return;
        const text =
            status === 'SOS' ? 'Emergency! SOS Signal Received!'
                : status === 'EMERGENCY' ? 'Critical Alert! Immediate Attention Required.'
                    : `Warning: System status is, ${status}`;
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();
            const preferred = voices.find(v => v.name.includes('Google US English') || v.lang === 'en-US');
            if (preferred) utterance.voice = preferred;
            window.speechSynthesis.speak(utterance);
            lastAnnouncedStatus.current = status;
            setTimeout(() => { lastAnnouncedStatus.current = ''; }, 10000);
        }
    };

    useEffect(() => {
        setIsClient(true);
        setTrail([]);
        setTempHistory([]);
        setMovementHistory([]);
        mockBattery = 88;
        setStatusCounts([
            { name: 'Normal', value: 0, color: '#10b981' },
            { name: 'Warning', value: 0, color: '#f59e0b' },
            { name: 'Emergency', value: 0, color: '#ef4444' },
            { name: 'SOS', value: 0, color: '#a855f7' },
        ]);

        if (useMock) {
            let mockLat = 16.508908144342104;
            let mockLng = 80.65868082784321;
            const initialData = generateMockData(mockLat, mockLng);
            setDeviceData(initialData);
            setAlerts(generateMockAlerts());
            setLastHeartbeat(new Date());
            setTrail([[initialData.location.lat, initialData.location.lng]]);

            const loop = setInterval(() => {
                const newData = generateMockData(mockLat, mockLng);
                mockLat = newData.location.lat;
                mockLng = newData.location.lng;
                setDeviceData(newData);
                setLastHeartbeat(new Date());
                setTrail(prev => [...prev.slice(-50), [newData.location.lat, newData.location.lng]]);
                pushAnalytics(newData.temperature, newData.movement, newData.status);
                if (newData.status !== 'NORMAL') announceStatus(newData.status);
                if (Math.random() > 0.8) {
                    const msg = newData.status === 'EMERGENCY' ? 'Critical Vitals / Sensor Limit' : 'Status Change Detected';
                    setAlerts(prev => [{
                        id: `new-${Date.now()}`,
                        timestamp: { toDate: () => new Date() },
                        status: newData.status,
                        message: msg,
                    }, ...prev.slice(0, 20)]);
                }
            }, 3000);
            return () => clearInterval(loop);
        }

        // Real Firebase via RTDB
        const deviceRef = ref(rtdb, `firefighters/${DEVICE_ID}`);
        let lastStatus = 'NORMAL';

        const unsubDevice = onValue(deviceRef, snap => {
            if (snap.exists()) {
                const rtdbData = snap.val();

                let mappedStatus = 'NORMAL';
                const s = rtdbData.status || '';
                if (s.includes('EMERGENCY')) mappedStatus = 'EMERGENCY';
                else if (s.includes('WARNING')) mappedStatus = 'WARNING';
                else if (s.includes('SOS')) mappedStatus = 'SOS';
                else if (s.includes('NORMAL')) mappedStatus = 'NORMAL';

                const data: DeviceData = {
                    device_id: DEVICE_ID,
                    temperature: rtdbData.temperature || 0,
                    movement: rtdbData.movement === 'MOVING' ? 'MOVING' : 'STILL',
                    status: mappedStatus as DeviceState,
                    battery: 100, // Not provided by current ESP code
                    signal: rtdbData.gps_status === 'OK' ? 100 : rtdbData.gps_status === 'NO_SIGNAL' ? 20 : 0,
                    packetLoss: rtdbData.system_status === 'OK' ? 0 : 10,
                    latency: 50,
                    location: {
                        lat: rtdbData.latitude || 0,
                        lng: rtdbData.longitude || 0
                    },
                    lastSeen: { toDate: () => new Date() } // Best effort local timestamp
                };

                if (mappedStatus !== 'NORMAL' && mappedStatus !== 'OFFLINE') announceStatus(mappedStatus);
                setDeviceData(data);
                pushAnalytics(data.temperature, data.movement, mappedStatus);
                setLastHeartbeat(new Date());

                if (data.location && (data.location.lat !== 0 || data.location.lng !== 0)) {
                    setTrail(prev => {
                        const last = prev[prev.length - 1];
                        if (!last || Math.abs(last[0] - data.location.lat) > 0.0001 || Math.abs(last[1] - data.location.lng) > 0.0001)
                            return [...prev.slice(-50), [data.location.lat, data.location.lng]];
                        return prev;
                    });
                }

                // Generate local alert history since RTDB doesn't store it in this setup
                if (mappedStatus !== lastStatus) {
                    if (['WARNING', 'EMERGENCY', 'SOS'].includes(mappedStatus)) {
                        const msg = mappedStatus === 'EMERGENCY' ? (rtdbData.status === 'EMERGENCY (HIGH TEMP)' ? 'Critical High Temperature' : 'Emergency State Detected') : 'Status Change Detected';
                        setAlerts(prev => [{
                            id: `new-${Date.now()}`,
                            timestamp: { toDate: () => new Date() },
                            status: mappedStatus as DeviceState,
                            message: msg,
                        }, ...prev.slice(0, 19)]);
                    }
                    lastStatus = mappedStatus;
                }
            }
        });

        return () => { unsubDevice(); };
    }, [useMock, pushAnalytics]);

    const isOnline = lastHeartbeat && (new Date().getTime() - lastHeartbeat.getTime() < 10000);
    const displayStatus: DeviceState = useMock
        ? (deviceData?.status || 'NORMAL')
        : (!isOnline ? 'OFFLINE' : deviceData?.status || 'NORMAL');

    // Status styles
    const getStatusStyles = (s: DeviceState) => {
        switch (s) {
            case 'NORMAL': return { gradient: 'from-emerald-500 to-teal-400', shadow: 'shadow-emerald-500/30' };
            case 'WARNING': return { gradient: 'from-amber-500 to-orange-400', shadow: 'shadow-amber-500/30' };
            case 'EMERGENCY': return { gradient: 'from-rose-600 to-red-500', shadow: 'shadow-rose-600/40' };
            case 'SOS': return { gradient: 'from-red-600 to-fuchsia-600', shadow: 'shadow-red-600/50' };
            default: return { gradient: 'from-slate-600 to-slate-400', shadow: 'shadow-slate-500/20' };
        }
    };
    const statusStyle = getStatusStyles(displayStatus);

    const getStatusIcon = (s: DeviceState) => {
        switch (s) {
            case 'NORMAL': return <ShieldCheck className="w-12 h-12 text-white drop-shadow-md" />;
            case 'WARNING': return <AlertTriangle className="w-12 h-12 text-white drop-shadow-md" />;
            case 'EMERGENCY': return <Siren className="w-12 h-12 text-white drop-shadow-md animate-bounce" />;
            case 'SOS': return <Zap className="w-12 h-12 text-white drop-shadow-md animate-pulse" />;
            default: return <Wifi className="w-12 h-12 text-slate-100 drop-shadow-md" />;
        }
    };

    if (!isClient) return null;

    const batt = deviceData?.battery ?? 100;
    const sig = deviceData?.signal ?? 100;
    const sigQ = signalQuality(sig);

    return (
        <main className="h-screen w-full bg-slate-50 text-slate-900 font-sans selection:bg-indigo-500/30 overflow-hidden flex flex-col">

            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-100/50 via-slate-50/0 to-transparent opacity-60" />
                <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] bg-sky-200/40 blur-[120px] rounded-full" />
                <div className="absolute top-[20%] -left-[10%] w-[500px] h-[500px] bg-emerald-200/30 blur-[100px] rounded-full" />
            </div>

            {/* ── HEADER ─────────────────────────────────────────────────────── */}
            <header className="flex-none px-6 py-4 border-b border-slate-200 bg-white/50 backdrop-blur-md z-20 flex justify-between items-center h-16">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                        <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-none">
                        SFMS <span className="text-slate-500 font-normal">Command Center</span>
                    </h1>
                </div>

                <div className="flex items-center gap-3">
                    {/* Signal quality pill */}
                    <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-sm">
                        <Signal className={clsx('w-3.5 h-3.5', sigQ.color)} />
                        <span className={clsx('text-[10px] font-bold', sigQ.color)}>{sigQ.label}</span>
                        <span className="text-[10px] text-slate-400">{Math.round(sig)}%</span>
                    </div>

                    {/* Battery pill */}
                    <div className={clsx('hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-sm', batt < 15 && 'battery-critical')}>
                        <span className={batteryTextColor(batt)}><BatteryIcon pct={batt} /></span>
                        <span className={clsx('text-[10px] font-bold', batteryTextColor(batt))}>{batt}%</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={clsx('w-2 h-2 rounded-full', (isOnline || useMock) ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')} />
                        <span className={clsx('text-xs font-bold', (isOnline || useMock) ? 'text-emerald-600' : 'text-slate-500')}>
                            {(isOnline || useMock) ? 'LIVE FEED' : 'OFFLINE'}
                        </span>
                        <span className="text-xs text-slate-400">|</span>
                        <span className="text-xs text-slate-500 font-mono">ID: {DEVICE_ID}</span>
                    </div>

                    <button
                        onClick={() => setUseMock(!useMock)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-medium border border-indigo-200">
                        {useMock ? 'Exit Simulation' : 'Run Simulation'}
                    </button>
                </div>
            </header>

            {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
            <div className="flex-1 p-4 overflow-hidden z-10">
                <div className="h-full grid grid-cols-12 gap-4">

                    {/* ═══ COL 1: LEFT PANEL (3 cols) ══════════════════════════ */}
                    <div className="col-span-12 lg:col-span-3 flex flex-col gap-3 h-full overflow-hidden">

                        {/* Status Card */}
                        <motion.div layout
                            className={clsx(
                                'relative overflow-hidden rounded-3xl p-6 shadow-xl transition-all duration-500 border border-white/20 bg-gradient-to-br flex-none h-44 flex flex-col items-center justify-center text-center',
                                statusStyle.gradient, statusStyle.shadow
                            )}>
                            <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />
                            <div className="relative z-10 flex flex-col items-center gap-2">
                                <div className="bg-white/20 p-3 rounded-full backdrop-blur-md border border-white/30 shadow-inner">
                                    {getStatusIcon(displayStatus)}
                                </div>
                                <div className="text-2xl font-black text-white tracking-tighter drop-shadow-sm">
                                    {displayStatus}
                                </div>
                            </div>
                        </motion.div>

                        {/* Battery Card */}
                        <div className={clsx('bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex-none', batt < 15 && 'battery-critical')}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className={batteryTextColor(batt)}><BatteryIcon pct={batt} /></span>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Battery</span>
                                </div>
                                <span className={clsx('text-sm font-black', batteryTextColor(batt))}>{batt}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={clsx('h-full rounded-full transition-all duration-700', batteryBarColor(batt))}
                                    style={{ width: `${batt}%` }} />
                            </div>
                            {batt < 20 && (
                                <p className="text-[9px] text-rose-500 font-bold mt-1.5 text-center">⚠ LOW BATTERY — REPLACE SOON</p>
                            )}
                        </div>

                        {/* Sensor Row */}
                        <div className="grid grid-cols-2 gap-3 flex-none">
                            <div className="col-span-1 bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex items-center gap-2 h-14">
                                <div className={clsx('p-1.5 rounded-lg', (deviceData?.temperature || 0) > 40 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600')}>
                                    <Thermometer className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Temp</div>
                                    <div className="text-sm font-bold text-slate-800">{deviceData?.temperature.toFixed(1)}°C</div>
                                </div>
                            </div>
                            <div className="col-span-1 bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex items-center gap-2 h-14">
                                <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
                                    <Activity className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Motion</div>
                                    <div className="text-sm font-bold text-slate-800">
                                        {deviceData?.movement === 'MOVING' ? 'Moving' : 'Still'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Comm Reliability Panel */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex-none space-y-2">
                            <div className="flex items-center gap-2 mb-1">
                                <Signal className="w-3.5 h-3.5 text-sky-500" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Comm Reliability</span>
                            </div>

                            {/* Signal strength */}
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 w-20">Signal</span>
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-sky-400 transition-all duration-500"
                                            style={{ width: `${sig}%` }} />
                                    </div>
                                    <span className={clsx('text-[10px] font-bold w-8 text-right', sigQ.color)}>{Math.round(sig)}%</span>
                                </div>
                            </div>

                            {/* Packet loss */}
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 w-20">Pkt Loss</span>
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-rose-400 transition-all duration-500"
                                            style={{ width: `${Math.min(100, (deviceData?.packetLoss ?? 0) * 10)}%` }} />
                                    </div>
                                    <span className={clsx('text-[10px] font-bold w-8 text-right',
                                        (deviceData?.packetLoss ?? 0) > 5 ? 'text-rose-500' : 'text-emerald-500')}>
                                        {(deviceData?.packetLoss ?? 0).toFixed(1)}%
                                    </span>
                                </div>
                            </div>

                            {/* Latency */}
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 w-20">Latency</span>
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-violet-400 transition-all duration-500"
                                            style={{ width: `${Math.min(100, (deviceData?.latency ?? 0) / 5)}%` }} />
                                    </div>
                                    <span className={clsx('text-[10px] font-bold w-8 text-right',
                                        (deviceData?.latency ?? 0) > 200 ? 'text-rose-500' : 'text-violet-500')}>
                                        {Math.round(deviceData?.latency ?? 0)}ms
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Live Logs */}
                        <div className="flex-1 min-h-0 flex flex-col bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 flex-none">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-slate-400" />
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Live Logs</h3>
                                </div>
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                    {alerts.length} events
                                </span>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                                <AnimatePresence>
                                    {alerts.map((alert) => (
                                        <motion.div key={alert.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-300 transition-all">
                                            <div className={clsx('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0',
                                                alert.status === 'EMERGENCY' || alert.status === 'SOS' ? 'bg-rose-500' :
                                                    alert.status === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500')} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        {alert.timestamp ? new Date(alert.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                                                    </span>
                                                    <span className={clsx('text-xs font-bold',
                                                        alert.status === 'EMERGENCY' ? 'text-rose-600' :
                                                            alert.status === 'SOS' ? 'text-fuchsia-600' :
                                                                alert.status === 'WARNING' ? 'text-amber-600' : 'text-emerald-600')}>
                                                        {alert.status}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 mt-1">{alert.message}</p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    {/* ═══ COL 2: MAP + ROSTER (5 cols) ════════════════════════ */}
                    <div className="col-span-12 lg:col-span-5 h-full flex flex-col gap-3">

                        {/* Map */}
                        <div className="flex-1 bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-md relative">
                            <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur-xl px-3 py-1.5 rounded-full border border-slate-200 flex items-center gap-2 shadow-sm pointer-events-none">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                                </span>
                                <span className="text-[10px] font-bold text-slate-700 tracking-wide uppercase">Live GPS</span>
                            </div>
                            {deviceData?.location ? (
                                <div style={{ position: 'absolute', inset: 0 }}>
                                    <MapWrapper lat={deviceData.location.lat || 0} lng={deviceData.location.lng || 0} trail={trail} status={displayStatus} />
                                </div>
                            ) : (
                                <div className="h-full w-full flex items-center justify-center bg-slate-50">
                                    <p className="text-slate-400 text-sm">Connecting...</p>
                                </div>
                            )}
                        </div>

                        {/* Multi-Device Roster */}
                        <div className="flex-none bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <Users className="w-3.5 h-3.5 text-indigo-500" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Field Units</span>
                                <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                                    1 Active
                                </span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {DEVICE_ROSTER.map(dev => (
                                    <div key={dev.id}
                                        className={clsx('flex flex-col items-center gap-1 p-2 rounded-xl border transition-all',
                                            dev.online ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200')}>
                                        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white',
                                            dev.online ? 'bg-gradient-to-br from-emerald-400 to-teal-500' : 'bg-slate-300')}>
                                            {dev.id.split('_')[1]}
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-500 text-center leading-tight">{dev.name}</span>
                                        <div className="flex items-center gap-0.5">
                                            <div className={clsx('w-1.5 h-1.5 rounded-full',
                                                dev.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300')} />
                                            <span className={clsx('text-[8px] font-bold',
                                                dev.online ? 'text-emerald-600' : 'text-slate-400')}>
                                                {dev.online ? 'LIVE' : 'OFF'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ═══ COL 3: ANALYTICS (4 cols) ════════════════════════════ */}
                    <div className="col-span-12 lg:col-span-4 h-full overflow-hidden">
                        <AnalyticsPanel
                            tempHistory={tempHistory}
                            movementHistory={movementHistory}
                            statusCounts={statusCounts}
                        />
                    </div>

                </div>
            </div>
        </main>
    );
}
