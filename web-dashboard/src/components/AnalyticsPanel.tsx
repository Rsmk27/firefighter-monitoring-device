'use client';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { Thermometer, TrendingUp, TrendingDown, Minus, Activity, BarChart2, MapPin, Cpu, Radio, CheckCircle2, XCircle, AlertCircle, Wifi } from 'lucide-react';
import clsx from 'clsx';

// ---- Types ----
interface TempDataPoint {
    time: string;
    temp: number;
}

interface MovementPoint {
    time: string;
    moving: number; // 1 = MOVING, 0 = STILL
}

interface StatusCount {
    name: string;
    value: number;
    color: string;
}

export interface SensorStatus {
    gps: 'ok' | 'error' | 'unknown';
    dht11: 'ok' | 'error' | 'unknown';
    mpu6050: 'ok' | 'error' | 'unknown';
    wifi: 'ok' | 'error' | 'unknown';
}

interface AnalyticsPanelProps {
    tempHistory: TempDataPoint[];
    movementHistory: MovementPoint[];
    statusCounts: StatusCount[];
    sensorStatus: SensorStatus;
}

// ---- Custom Tooltip ----
const TempTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                <p className="font-bold text-slate-700">{payload[0].value.toFixed(1)}°C</p>
                <p className="text-slate-400">{payload[0].payload.time}</p>
            </div>
        );
    }
    return null;
};

// ---- Stat Card ----
const StatBadge = ({
    label,
    value,
    icon,
    color,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    color: string;
}) => (
    <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl border', color)}>
        <div className="flex-shrink-0">{icon}</div>
        <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-sm font-black text-slate-800">{value}</p>
        </div>
    </div>
);

export default function AnalyticsPanel({
    tempHistory,
    movementHistory,
    statusCounts,
    sensorStatus,
}: AnalyticsPanelProps) {
    // Filter out any stale -999 sensor-error values (safety net)
    const temps = tempHistory.map((d) => d.temp).filter((t) => t !== -999);
    const hasTemp = temps.length > 0;
    const minTemp = hasTemp ? Math.min(...temps) : null;
    const maxTemp = hasTemp ? Math.max(...temps) : null;
    const avgTemp = hasTemp ? temps.reduce((a, b) => a + b, 0) / temps.length : null;

    const movingCount = movementHistory.filter((m) => m.moving === 1).length;
    const totalCount = movementHistory.length || 1;
    const movingPct = Math.round((movingCount / totalCount) * 100);

    const totalStatus = statusCounts.reduce((a, b) => a + b.value, 0) || 1;

    return (
        <div className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar pr-1">

            {/* ---- Header ---- */}
            <div className="flex items-center gap-2 flex-none">
                <div className="bg-gradient-to-br from-violet-500 to-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                    <BarChart2 className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-sm font-bold text-slate-800 tracking-tight">Analytics</h2>
            </div>

            {/* ---- Temp Stats Row ---- */}
            <div className="flex-none grid grid-cols-3 gap-2">
                <StatBadge
                    label="Min Temp"
                    value={minTemp !== null ? `${minTemp.toFixed(1)}°C` : 'N/A'}
                    icon={<TrendingDown className="w-3.5 h-3.5 text-sky-500" />}
                    color="bg-sky-50 border-sky-100"
                />
                <StatBadge
                    label="Avg Temp"
                    value={avgTemp !== null ? `${avgTemp.toFixed(1)}°C` : 'N/A'}
                    icon={<Minus className="w-3.5 h-3.5 text-violet-500" />}
                    color="bg-violet-50 border-violet-100"
                />
                <StatBadge
                    label="Max Temp"
                    value={maxTemp !== null ? `${maxTemp.toFixed(1)}°C` : 'N/A'}
                    icon={<TrendingUp className="w-3.5 h-3.5 text-rose-500" />}
                    color="bg-rose-50 border-rose-100"
                />
            </div>

            {/* ---- Temperature Trend Chart ---- */}
            <div className="flex-none bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <Thermometer className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Temperature Trend
                    </span>
                    <span className="ml-auto text-[9px] text-slate-400 font-mono">
                        Last {tempHistory.length} readings
                    </span>
                </div>
                <div className="h-[120px]">
                    {hasTemp ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={tempHistory.filter(d => d.temp !== -999)} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="tempGrad" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#6366f1" />
                                        <stop offset="100%" stopColor="#f43f5e" />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis
                                    dataKey="time"
                                    tick={{ fontSize: 8, fill: '#94a3b8' }}
                                    tickLine={false}
                                    axisLine={false}
                                    interval="preserveStartEnd"
                                />
                                <YAxis
                                    tick={{ fontSize: 8, fill: '#94a3b8' }}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={['auto', 'auto']}
                                    tickFormatter={(v) => `${v}°`}
                                />
                                <Tooltip content={<TempTooltip />} />
                                <Line
                                    type="monotone"
                                    dataKey="temp"
                                    stroke="url(#tempGrad)"
                                    strokeWidth={2.5}
                                    dot={false}
                                    activeDot={{ r: 4, fill: '#f43f5e', strokeWidth: 0 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-1">
                            <Thermometer className="w-6 h-6 text-slate-300" />
                            <p className="text-[10px] text-slate-400 font-medium">N/A — No temperature data yet</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ---- Movement Timeline ---- */}
            <div className="flex-none bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Movement Timeline
                    </span>
                    <span className="ml-auto text-[9px] text-blue-600 font-bold">
                        {movingPct}% Active
                    </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-700"
                        style={{ width: `${movingPct}%` }}
                    />
                </div>

                {/* Pixel timeline strip */}
                <div className="flex gap-[2px] mt-3 flex-wrap">
                    {movementHistory.slice(-60).map((m, i) => (
                        <div
                            key={i}
                            title={m.moving ? 'Moving' : 'Still'}
                            className={clsx(
                                'h-3 rounded-sm transition-all duration-300',
                                m.moving === 1
                                    ? 'bg-blue-400'
                                    : 'bg-slate-200'
                            )}
                            style={{ width: '6px' }}
                        />
                    ))}
                </div>
                <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1 text-[9px] text-slate-500">
                        <span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" /> Moving
                    </span>
                    <span className="flex items-center gap-1 text-[9px] text-slate-500">
                        <span className="w-2 h-2 rounded-sm bg-slate-200 inline-block" /> Still
                    </span>
                </div>
            </div>

            {/* ---- Sensor Health ---- */}
            <div className="flex-none bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-1 rounded-lg bg-teal-50">
                        <Radio className="w-3.5 h-3.5 text-teal-500" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Sensor Health
                    </span>
                    <span className={clsx(
                        'ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                        Object.values(sensorStatus).every(s => s === 'ok')
                            ? 'bg-emerald-100 text-emerald-700'
                            : Object.values(sensorStatus).some(s => s === 'error')
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                    )}>
                        {Object.values(sensorStatus).every(s => s === 'ok') ? 'All OK'
                            : Object.values(sensorStatus).some(s => s === 'error') ? 'Fault'
                                : 'Pending'}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {([
                        {
                            key: 'gps',
                            label: 'GPS Module',
                            sublabel: 'NMEA 0183',
                            icon: <MapPin className="w-4 h-4" />,
                            iconBg: 'bg-sky-100 text-sky-600',
                        },
                        {
                            key: 'dht11',
                            label: 'DHT11',
                            sublabel: 'Temp · Humidity',
                            icon: <Thermometer className="w-4 h-4" />,
                            iconBg: 'bg-amber-100 text-amber-600',
                        },
                        {
                            key: 'mpu6050',
                            label: 'MPU6050',
                            sublabel: '6-axis IMU',
                            icon: <Cpu className="w-4 h-4" />,
                            iconBg: 'bg-violet-100 text-violet-600',
                        },
                        {
                            key: 'wifi',
                            label: 'Wi-Fi',
                            sublabel: 'Firebase RTDB',
                            icon: <Wifi className="w-4 h-4" />,
                            iconBg: 'bg-emerald-100 text-emerald-600',
                        },
                    ] as const).map(({ key, label, sublabel, icon, iconBg }) => {
                        const st = sensorStatus[key];
                        const isOk = st === 'ok';
                        const isError = st === 'error';
                        return (
                            <div
                                key={key}
                                className={clsx(
                                    'relative flex flex-col gap-2 p-2.5 rounded-xl border transition-all duration-300',
                                    isOk ? 'bg-emerald-50  border-emerald-200'
                                        : isError ? 'bg-rose-50     border-rose-200'
                                            : 'bg-slate-50    border-slate-200'
                                )}
                            >
                                {/* Status dot — pulse when connected */}
                                <span className={clsx(
                                    'absolute top-2 right-2 w-1.5 h-1.5 rounded-full',
                                    isOk ? 'bg-emerald-500 animate-pulse'
                                        : isError ? 'bg-rose-500'
                                            : 'bg-slate-300'
                                )} />

                                {/* Icon */}
                                <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
                                    {icon}
                                </div>

                                {/* Labels */}
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-slate-700 leading-tight">{label}</p>
                                    <p className="text-[9px] text-slate-400 leading-tight mt-0.5">{sublabel}</p>
                                </div>

                                {/* Status badge */}
                                <div className={clsx(
                                    'flex items-center gap-1 mt-auto'
                                )}>
                                    {isOk
                                        ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                        : isError
                                            ? <XCircle className="w-3 h-3 text-rose-500" />
                                            : <AlertCircle className="w-3 h-3 text-slate-400" />}
                                    <span className={clsx(
                                        'text-[9px] font-black uppercase tracking-wider',
                                        isOk ? 'text-emerald-600'
                                            : isError ? 'text-rose-600'
                                                : 'text-slate-400'
                                    )}>
                                        {isOk ? 'Connected' : isError ? 'Error' : 'Unknown'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
}
