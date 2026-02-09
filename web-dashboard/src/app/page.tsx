'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, doc, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import MapWrapper from '@/components/MapWrapper';
import {
    Thermometer,
    Activity,
    MapPin,
    ShieldCheck,
    AlertTriangle,
    Siren,
    Clock,
    Battery,
    Wifi,
    Zap,
    Heart,
    Wind
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

// Types based on the PRD
type DeviceState = 'NORMAL' | 'WARNING' | 'EMERGENCY' | 'SOS' | 'OFFLINE';

interface DeviceData {
    device_id: string;
    temperature: number;
    heartRate: number;      // New: BPM
    airQuality: number;     // New: AQI (0-500)
    movement: 'MOVING' | 'STILL';
    status: DeviceState;
    location: {
        lat: number;
        lng: number;
    };
    lastSeen?: any;
}

interface AlertLog {
    id: string;
    timestamp: any;
    status: DeviceState;
    message: string;
}

const DEVICE_ID = 'FF_001';

// --- MOCK DATA GENERATOR ---
const generateMockData = (prevLat: number, prevLng: number): DeviceData => {
    const statuses: DeviceState[] = ['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'WARNING', 'EMERGENCY', 'SOS'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    // Simulate walking path by adding small increments
    const newLat = prevLat + (Math.random() - 0.5) * 0.001;
    const newLng = prevLng + (Math.random() - 0.5) * 0.001;
    const isMoving = Math.random() > 0.3;

    return {
        device_id: DEVICE_ID,
        temperature: 30 + Math.random() * 25,
        // Heart rate increases if moving (90-140), resting (60-90)
        heartRate: isMoving ? 90 + Math.random() * 50 : 60 + Math.random() * 30,
        // Air Quality: Normal < 50, Hazardous > 150
        airQuality: 20 + Math.random() * (Math.random() > 0.9 ? 200 : 30),
        movement: isMoving ? 'MOVING' : 'STILL',
        status: status,
        location: {
            lat: newLat,
            lng: newLng
        },
        lastSeen: new Date()
    };
};

const generateMockAlerts = (): AlertLog[] => {
    return Array.from({ length: 5 }).map((_, i) => ({
        id: `mog-${i}`,
        timestamp: { toDate: () => new Date(Date.now() - i * 1000 * 60 * 5) },
        status: i === 0 ? 'EMERGENCY' : i === 2 ? 'WARNING' : 'NORMAL',
        message: i === 0 ? 'High Temperature Detected' : i === 2 ? 'Inactivity Warning' : 'Status Normal'
    }));
};

export default function Dashboard() {
    const [deviceData, setDeviceData] = useState<DeviceData | null>(null);
    const [alerts, setAlerts] = useState<AlertLog[]>([]);
    const [isClient, setIsClient] = useState(false);
    const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
    const [useMock, setUseMock] = useState(true);
    const [trail, setTrail] = useState<[number, number][]>([]);

    // Voice Alert State
    const lastAnnouncedStatus = useRef<string>('');

    // --- VOICE ALERT FUNCTION ---
    const announceStatus = (status: string, message?: string) => {
        if (!status || status === 'NORMAL' || status === 'OFFLINE') return;
        if (lastAnnouncedStatus.current === status) return; // Don't spam

        const text = status === 'SOS' ? "Emergency! SOS Signal Received!" :
            status === 'EMERGENCY' ? "Critical Alert! Immediate Attention Required." :
                `Warning: System status is, ${status}`;

        // Check for browser support
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Try to select a clear English voice if available
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(voice => voice.name.includes('Google US English') || voice.name.includes('Microsoft Zira') || voice.lang === 'en-US');
            if (preferredVoice) utterance.voice = preferredVoice;

            window.speechSynthesis.speak(utterance);
            lastAnnouncedStatus.current = status;

            // Reset lockout after 10 seconds so it can announce again if it persists
            setTimeout(() => { lastAnnouncedStatus.current = ''; }, 10000);
        }
    };

    useEffect(() => {
        setIsClient(true);
        let interval: NodeJS.Timeout;

        // Reset trail when switching modes
        setTrail([]);

        if (useMock) {
            let mockLat = 40.7128;
            let mockLng = -74.0060;

            const initialData = generateMockData(mockLat, mockLng);
            setDeviceData(initialData);
            setAlerts(generateMockAlerts());
            setLastHeartbeat(new Date());
            setTrail([[initialData.location.lat, initialData.location.lng]]);

            const mockLoop = setInterval(() => {
                const newData = generateMockData(mockLat, mockLng);
                mockLat = newData.location.lat;
                mockLng = newData.location.lng;

                setDeviceData(newData);
                setLastHeartbeat(new Date());
                setTrail(prev => [...prev.slice(-50), [newData.location.lat, newData.location.lng]]); // Keep last 50 points

                // Trigger Voice Alert
                if (newData.status !== 'NORMAL') {
                    announceStatus(newData.status);
                }

                // Randomly update logs
                if (Math.random() > 0.8) {
                    const msg = newData.status === 'EMERGENCY' ? 'Critical Vitals / Sensor Limit' : 'Status Change Detected';
                    setAlerts(prev => [
                        {
                            id: `new-${Date.now()}`,
                            timestamp: { toDate: () => new Date() },
                            status: newData.status,
                            message: msg
                        },
                        ...prev.slice(0, 20)
                    ]);
                }
            }, 3000);

            return () => clearInterval(mockLoop);
        }

        // Real Firebase Logic
        const unsubDevice = onSnapshot(doc(db, 'devices', DEVICE_ID), (doc) => {
            if (doc.exists()) {
                const data = doc.data() as DeviceData;

                // Voice Alert for Real Data
                if (data.status !== 'NORMAL' && data.status !== 'OFFLINE') {
                    announceStatus(data.status);
                }

                setDeviceData(data);
                if (data.lastSeen) {
                    setLastHeartbeat(data.lastSeen.toDate());
                }
                // Append to trail
                if (data.location) {
                    setTrail(prev => {
                        const last = prev[prev.length - 1];
                        if (!last || (Math.abs(last[0] - data.location.lat) > 0.0001 || Math.abs(last[1] - data.location.lng) > 0.0001)) {
                            return [...prev, [data.location.lat, data.location.lng]];
                        }
                        return prev;
                    });
                }
            }
        });

        const alertsQuery = query(
            collection(db, 'readings'),
            where('device_id', '==', DEVICE_ID),
            where('status', 'in', ['WARNING', 'EMERGENCY', 'SOS']),
            orderBy('timestamp', 'desc'),
            limit(20)
        );

        const unsubAlerts = onSnapshot(alertsQuery, (snapshot) => {
            const newAlerts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                message: `Status changed to ${doc.data().status}`
            })) as AlertLog[];
            setAlerts(newAlerts);
        });

        return () => {
            unsubDevice();
            unsubAlerts();
        };

    }, [useMock]);

    const isOnline = lastHeartbeat && (new Date().getTime() - lastHeartbeat.getTime() < 10000);
    const displayStatus = useMock ? (deviceData?.status || 'NORMAL') : (!isOnline ? 'OFFLINE' : deviceData?.status || 'NORMAL');

    // Status Styles
    const getStatusStyles = (status: DeviceState) => {
        switch (status) {
            case 'NORMAL': return { gradient: 'from-emerald-500 to-teal-400', shadow: 'shadow-emerald-500/30' };
            case 'WARNING': return { gradient: 'from-amber-500 to-orange-400', shadow: 'shadow-amber-500/30' };
            case 'EMERGENCY': return { gradient: 'from-rose-600 to-red-500', shadow: 'shadow-rose-600/40' };
            case 'SOS': return { gradient: 'from-red-600 to-fuchsia-600', shadow: 'shadow-red-600/50' };
            default: return { gradient: 'from-slate-600 to-slate-400', shadow: 'shadow-slate-500/20' };
        }
    };
    const statusStyle = getStatusStyles(displayStatus);

    const getStatusIcon = (status: DeviceState) => {
        switch (status) {
            case 'NORMAL': return <ShieldCheck className="w-12 h-12 text-white drop-shadow-md" />;
            case 'WARNING': return <AlertTriangle className="w-12 h-12 text-white drop-shadow-md" />;
            case 'EMERGENCY': return <Siren className="w-12 h-12 text-white drop-shadow-md animate-bounce" />;
            case 'SOS': return <Zap className="w-12 h-12 text-white drop-shadow-md animate-pulse" />;
            default: return <Wifi className="w-12 h-12 text-slate-100 drop-shadow-md" />;
        }
    };

    if (!isClient) return null;

    return (
        <main className="h-screen w-full bg-slate-50 text-slate-900 font-sans selection:bg-indigo-500/30 overflow-hidden flex flex-col">

            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-100/50 via-slate-50/0 to-transparent opacity-60" />
                <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] bg-sky-200/40 blur-[120px] rounded-full" />
                <div className="absolute top-[20%] -left-[10%] w-[500px] h-[500px] bg-emerald-200/30 blur-[100px] rounded-full" />
            </div>

            {/* --- HEADER --- */}
            <header className="flex-none px-6 py-4 border-b border-slate-200 bg-white/50 backdrop-blur-md z-20 flex justify-between items-center h-16">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                        <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-none">
                            SFMS <span className="text-slate-500 font-normal">Command Center</span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className={clsx("w-2 h-2 rounded-full", (isOnline || useMock) ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                        <span className={clsx("text-xs font-bold", (isOnline || useMock) ? "text-emerald-600" : "text-slate-500")}>
                            {(isOnline || useMock) ? 'LIVE FEED' : 'OFFLINE'}
                        </span>
                        <span className="text-xs text-slate-400">|</span>
                        <span className="text-xs text-slate-500 font-mono">ID: {DEVICE_ID}</span>
                    </div>
                    <button
                        onClick={() => setUseMock(!useMock)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-medium border border-indigo-200"
                    >
                        {useMock ? 'Exit Simulation' : 'Run Simulation'}
                    </button>
                </div>
            </header>

            {/* --- MAIN CONTENT --- */}
            <div className="flex-1 p-4 overflow-hidden z-10">
                <div className="h-full grid grid-cols-12 gap-4">

                    {/* COL 1: DASHBOARD (3 Cols) */}
                    <div className="col-span-12 lg:col-span-3 flex flex-col gap-3 h-full overflow-y-auto custom-scrollbar pr-1">

                        {/* Status Card */}
                        <motion.div
                            layout
                            className={clsx(
                                "relative overflow-hidden rounded-3xl p-6 shadow-xl transition-all duration-500 border border-white/20 bg-gradient-to-br flex-none h-48 flex flex-col items-center justify-center text-center",
                                statusStyle.gradient,
                                statusStyle.shadow
                            )}
                        >
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

                        {/* SENSORS */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Heart Rate */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
                                <div className="flex items-center gap-2 mb-1">
                                    <Heart className={clsx("w-4 h-4", (deviceData?.heartRate || 0) > 120 ? "text-rose-500 animate-pulse" : "text-rose-400")} />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Heart Rate</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-slate-800 tracking-tight">
                                        {Math.round(deviceData?.heartRate || 0)}
                                    </span>
                                    <span className="text-[10px] text-slate-400">BPM</span>
                                </div>
                            </div>

                            {/* Air Quality */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
                                <div className="flex items-center gap-2 mb-1">
                                    <Wind className={clsx("w-4 h-4", (deviceData?.airQuality || 0) > 100 ? "text-amber-500" : "text-slate-400")} />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Air Quality</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className={clsx("text-2xl font-bold tracking-tight", (deviceData?.airQuality || 0) > 150 ? "text-amber-600" : "text-slate-800")}>
                                        {Math.round(deviceData?.airQuality || 0)}
                                    </span>
                                    <span className="text-[10px] text-slate-400">AQI</span>
                                </div>
                            </div>

                            {/* Temp (Full Width) */}
                            <div className="col-span-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between h-16">
                                <div className="flex items-center gap-3">
                                    <div className={clsx("p-2 rounded-lg", (deviceData?.temperature || 0) > 40 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
                                        <Thermometer className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase">Body Temp</div>
                                        <div className="text-lg font-bold text-slate-800">{deviceData?.temperature.toFixed(1)}°C</div>
                                    </div>
                                </div>
                            </div>

                            {/* Motion (Full Width) */}
                            <div className="col-span-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between h-16">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                        <Activity className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase">Movement</div>
                                        <div className="text-sm font-bold text-slate-800">{deviceData?.movement === 'MOVING' ? 'Active / Moving' : 'Stationary'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* COL 2: MAP (6 Cols) */}
                    <div className="col-span-12 lg:col-span-6 h-full flex flex-col relative group">
                        <div className="flex-1 bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-md relative">
                            <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur-xl px-3 py-1.5 rounded-full border border-slate-200 flex items-center gap-2 shadow-sm pointer-events-none">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                                </span>
                                <span className="text-[10px] font-bold text-slate-700 tracking-wide uppercase">Live GPS</span>
                            </div>
                            {deviceData?.location ? (
                                <MapWrapper
                                    lat={deviceData.location.lat || 0}
                                    lng={deviceData.location.lng || 0}
                                    trail={trail}
                                />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center bg-slate-50"><p className="text-slate-400 text-sm">Connecting...</p></div>
                            )}
                        </div>
                    </div>

                    {/* COL 3: LOGS (3 Cols) */}
                    <div className="col-span-12 lg:col-span-3 h-full flex flex-col bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-slate-400" />
                                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Live Logs</h3>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                            <AnimatePresence>
                                {alerts.map((alert, i) => (
                                    <motion.div
                                        key={alert.id}
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-300 transition-all"
                                    >
                                        <div className={clsx(
                                            "w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                                            alert.status === 'EMERGENCY' || alert.status === 'SOS' ? "bg-rose-500" :
                                                alert.status === 'WARNING' ? "bg-amber-500" : "bg-emerald-500"
                                        )} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                    {alert.timestamp ? new Date(alert.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                                                </span>
                                                <span className={clsx("text-xs font-bold", alert.status === 'EMERGENCY' ? "text-rose-600" : "text-slate-700")}>
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
            </div>
        </main>
    );
}
