'use client';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { Thermometer, TrendingUp, TrendingDown, Minus, Activity, BarChart2 } from 'lucide-react';
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

interface AnalyticsPanelProps {
    tempHistory: TempDataPoint[];
    movementHistory: MovementPoint[];
    statusCounts: StatusCount[];
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
}: AnalyticsPanelProps) {
    // Compute stats
    const temps = tempHistory.map((d) => d.temp);
    const minTemp = temps.length ? Math.min(...temps) : 0;
    const maxTemp = temps.length ? Math.max(...temps) : 0;
    const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;

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
                    value={`${minTemp.toFixed(1)}°C`}
                    icon={<TrendingDown className="w-3.5 h-3.5 text-sky-500" />}
                    color="bg-sky-50 border-sky-100"
                />
                <StatBadge
                    label="Avg Temp"
                    value={`${avgTemp.toFixed(1)}°C`}
                    icon={<Minus className="w-3.5 h-3.5 text-violet-500" />}
                    color="bg-violet-50 border-violet-100"
                />
                <StatBadge
                    label="Max Temp"
                    value={`${maxTemp.toFixed(1)}°C`}
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
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={tempHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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

            {/* ---- Status Distribution ---- */}
            <div className="flex-none bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <BarChart2 className="w-3.5 h-3.5 text-violet-500" />
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Status Distribution
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    {/* Donut */}
                    <div className="flex-none">
                        <PieChart width={90} height={90}>
                            <Pie
                                data={statusCounts.filter((s) => s.value > 0)}
                                cx={40}
                                cy={40}
                                innerRadius={28}
                                outerRadius={42}
                                paddingAngle={3}
                                dataKey="value"
                                strokeWidth={0}
                            >
                                {statusCounts.filter((s) => s.value > 0).map((entry, index) => (
                                    <Cell key={index} fill={entry.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-col gap-1.5 flex-1">
                        {statusCounts.map((s) => (
                            <div key={s.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <span
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: s.color }}
                                    />
                                    <span className="text-[10px] text-slate-600 font-medium">{s.name}</span>
                                </div>
                                <span className="text-[10px] font-bold text-slate-700">
                                    {Math.round((s.value / totalStatus) * 100)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
}
