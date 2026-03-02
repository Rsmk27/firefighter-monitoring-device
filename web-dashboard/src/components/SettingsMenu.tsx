'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    MoreVertical, Sun, Moon, Flame, ShieldCheck, Activity,
    Info, Users, X, ChevronRight, Cpu, Wifi,
    MapPin, Thermometer, Zap,
} from 'lucide-react';
import clsx from 'clsx';

export type UnitMode = 'FIREFIGHTER' | 'SOLDIER';
export type Theme = 'light' | 'dark';

interface Props {
    activeMode: UnitMode;
    onModeChange: (mode: UnitMode) => void;
}

// ─── Mode definitions ─────────────────────────────────────────────────────────
const MODES: {
    value: UnitMode;
    label: string;
    icon: React.ReactNode;
    desc: string;
    active: string;
    inactive: string;
}[] = [
        {
            value: 'FIREFIGHTER',
            label: 'Firefighter',
            icon: <Flame className="w-4 h-4" />,
            desc: 'Heat & inactivity monitoring',
            active: 'bg-orange-50 border-orange-300 text-orange-700',
            inactive: 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
        },
        {
            value: 'SOLDIER',
            label: 'Soldier',
            icon: <ShieldCheck className="w-4 h-4" />,
            desc: 'Tactical field monitoring',
            active: 'bg-green-50 border-green-300 text-green-700',
            inactive: 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
        },
    ];

// ─── System Info content ──────────────────────────────────────────────────────
function SystemInfoModal() {
    const specs = [
        { icon: <Cpu className="w-3.5 h-3.5" />, label: 'Microcontroller', value: 'ESP32  (Dual-core 240 MHz)' },
        { icon: <Activity className="w-3.5 h-3.5" />, label: 'Motion Sensor', value: 'MPU6050  (6-axis IMU)' },
        { icon: <Thermometer className="w-3.5 h-3.5" />, label: 'Environment', value: 'DHT11  (Temp + Humidity)' },
        { icon: <MapPin className="w-3.5 h-3.5" />, label: 'Location', value: 'GPS Module  (NMEA 0183)' },
        { icon: <Zap className="w-3.5 h-3.5" />, label: 'SOS Trigger', value: 'Push Button  (GPIO 0, toggle)' },
        { icon: <Wifi className="w-3.5 h-3.5" />, label: 'Connectivity', value: 'Wi-Fi → Firebase RTDB' },
    ];

    const states: { label: string; desc: string; color: string; time: string }[] = [
        { label: 'NORMAL', desc: 'Person moving normally', color: 'bg-emerald-500', time: '—' },
        { label: 'WARNING', desc: 'No movement detected', color: 'bg-amber-400', time: '10 s' },
        { label: 'EMERGENCY', desc: 'No movement for extended period', color: 'bg-rose-500', time: '30 s' },
        { label: 'SOS', desc: 'Manual SOS button pressed', color: 'bg-fuchsia-600', time: 'Instant' },
    ];

    return (
        <div className="space-y-6">
            {/* Hardware */}
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    Hardware Specifications
                </p>
                <div className="space-y-1.5">
                    {specs.map(s => (
                        <div key={s.label}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 flex-shrink-0">{s.icon}</span>
                            <span className="text-xs text-slate-500 w-32 flex-shrink-0">{s.label}</span>
                            <span className="text-xs font-semibold text-slate-800">{s.value}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Alert states */}
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    Alert State Logic
                </p>
                <div className="space-y-2">
                    {states.map(s => (
                        <div key={s.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.color}`} />
                            <span className="text-xs font-black text-slate-700 w-24 flex-shrink-0">{s.label}</span>
                            <span className="text-xs text-slate-500 flex-1">{s.desc}</span>
                            <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">{s.time}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Buzzer */}
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Buzzer Behaviour
                </p>
                <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100 leading-relaxed space-y-1">
                    <p>🌡️ <span className="font-semibold text-slate-700">25–40°C</span> → Ambient temp beeps (1–3 per min)</p>
                    <p>⚠️ <span className="font-semibold text-slate-700">WARNING</span> → Slow alert pattern</p>
                    <p>🚨 <span className="font-semibold text-slate-700">EMERGENCY</span> → Rapid repeat pattern</p>
                    <p>🔴 <span className="font-semibold text-slate-700">SOS</span> → Continuous (highest priority)</p>
                </div>
            </div>

            <p className="text-[10px] text-center text-slate-400">
                Dashboard: Next.js 16 · Firebase RTDB · MapLibre GL
            </p>
        </div>
    );
}

// ─── About content ────────────────────────────────────────────────────────────
function AboutModal() {
    const team = [
        { name: 'RSMK', role: 'Project Lead · Firmware & Dashboard', callsign: 'Omega', gradient: 'from-indigo-400 to-violet-500' },
        // Add more team members below as needed:
        // { name: 'Arjun', role: 'Hardware Engineer', callsign: 'Delta', gradient: 'from-emerald-400 to-teal-500' },
    ];

    return (
        <div className="space-y-6">
            {/* Logo / title */}
            <div className="text-center py-2">
                <div className="inline-flex items-center gap-2 mb-3">
                    <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-500/30">
                        <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                </div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">RSMK Guardian</h3>
                <p className="text-xs text-slate-500 mt-1">Multipurpose Personnel Monitoring System</p>
                <div className="flex items-center justify-center gap-2 mt-3">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 font-semibold">
                        v1.0.0
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200 font-semibold">
                        ESP32 + Next.js
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 font-semibold">
                        Open Source
                    </span>
                </div>
            </div>

            {/* Features — only 2 modes */}
            <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                    { icon: '🔥', label: 'Firefighter' },
                    { icon: '🪖', label: 'Soldier' },
                ].map(f => (
                    <div key={f.label} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 font-medium">
                        <span>{f.icon}</span> {f.label} Mode
                    </div>
                ))}
            </div>

            {/* Team */}
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Core Team</p>
                <div className="space-y-2">
                    {team.map(t => (
                        <div key={t.name}
                            className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-100">
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm`}>
                                {t.name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-slate-800">{t.name}</div>
                                <div className="text-[10px] text-slate-500 truncate">{t.role}</div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
                                ({t.callsign})
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="text-center border-t border-slate-100 pt-4 space-y-1">
                <p className="text-[11px] text-slate-500">Built with ❤️ for field safety</p>
                <p className="text-[10px] text-slate-400">© 2026 RSMK Team · All rights reserved</p>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SettingsMenu({ activeMode, onModeChange }: Props) {
    const [open, setOpen] = useState(false);
    const [showModePanel, setShowModePanel] = useState(false);
    const [activeModal, setActiveModal] = useState<'system-info' | 'about' | null>(null);
    const [theme, setTheme] = useState<Theme>('light');
    const [mounted, setMounted] = useState(false); // guards portal (SSR safe)
    const menuRef = useRef<HTMLDivElement>(null);

    // Mark as mounted so createPortal can run client-side
    useEffect(() => { setMounted(true); }, []);

    // Apply / remove dark class on <html>
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
                setShowModePanel(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const openModal = (modal: 'system-info' | 'about') => {
        setOpen(false);
        setShowModePanel(false);
        setActiveModal(modal);
    };

    const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

    return (
        <>
            {/* ── Three-dot button + dropdown ─────────────────────────────── */}
            <div ref={menuRef} className="relative">
                <button
                    id="settings-menu-btn"
                    onClick={() => { setOpen(o => !o); setShowModePanel(false); }}
                    className={clsx(
                        'p-2 rounded-xl transition-all duration-150 border',
                        open
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                            : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:border-slate-200'
                    )}
                    aria-label="Settings"
                >
                    <MoreVertical className="w-5 h-5" />
                </button>

                {/* Dropdown */}
                {open && (
                    <div className="absolute right-0 top-11 w-60 bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/10 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">

                        {/* Dropdown header */}
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Options</p>
                        </div>

                        {/* ── Theme toggle ── */}
                        <button
                            onClick={toggleTheme}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                {theme === 'light'
                                    ? <Moon className="w-4 h-4 text-indigo-500" />
                                    : <Sun className="w-4 h-4 text-amber-400" />}
                                <span className="text-sm font-medium text-slate-700">
                                    {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                                </span>
                            </div>
                            {/* Toggle pill */}
                            <div className={clsx(
                                'w-9 h-5 rounded-full relative transition-colors duration-300',
                                theme === 'dark' ? 'bg-indigo-500' : 'bg-slate-200'
                            )}>
                                <div className={clsx(
                                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300',
                                    theme === 'dark' ? 'left-4' : 'left-0.5'
                                )} />
                            </div>
                        </button>

                        {/* ── Change Mode ── */}
                        <button
                            onClick={() => setShowModePanel(p => !p)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors border-t border-slate-100"
                        >
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                <span className="text-sm font-medium text-slate-700">Change Mode</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{activeMode}</span>
                                <ChevronRight className={clsx(
                                    'w-3.5 h-3.5 text-slate-400 transition-transform duration-200',
                                    showModePanel && 'rotate-90'
                                )} />
                            </div>
                        </button>

                        {/* Mode sub-panel — horizontal row, only 2 modes */}
                        {showModePanel && (
                            <div className="px-3 pb-2 pt-1 flex gap-1.5 border-t border-slate-100 bg-slate-50/60">
                                {MODES.map(m => (
                                    <button
                                        key={m.value}
                                        onClick={() => {
                                            onModeChange(m.value);
                                            setShowModePanel(false);
                                            setOpen(false);
                                        }}
                                        title={m.desc}
                                        className={clsx(
                                            'flex-1 flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-bold transition-all',
                                            activeMode === m.value ? m.active : m.inactive
                                        )}
                                    >
                                        {m.icon}
                                        <span className="text-[10px]">{m.label}</span>
                                        {activeMode === m.value && (
                                            <span className="text-[8px] font-black opacity-70 tracking-widest">ACTIVE</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* ── System Info ── */}
                        <button
                            onClick={() => openModal('system-info')}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors border-t border-slate-100"
                        >
                            <Info className="w-4 h-4 text-sky-500" />
                            <span className="text-sm font-medium text-slate-700">System Info</span>
                        </button>

                        {/* ── About ── */}
                        <button
                            onClick={() => openModal('about')}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors border-t border-slate-100"
                        >
                            <Users className="w-4 h-4 text-violet-500" />
                            <div className="flex-1 text-left">
                                <span className="text-sm font-medium text-slate-700">About</span>
                                <p className="text-[10px] text-slate-400">RSMK Team · v1.0.0</p>
                            </div>
                        </button>

                    </div>
                )}
            </div>

            {/* ── Modal overlay ─────────────────────────────────────────────── */}
            {/* ── Modal — rendered via portal to escape header stacking context ── */}
            {mounted && activeModal && createPortal(
                <div
                    className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setActiveModal(null)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className={clsx(
                            'flex items-center justify-between px-6 py-4 border-b flex-none',
                            activeModal === 'system-info'
                                ? 'bg-sky-50 border-sky-100'
                                : 'bg-violet-50 border-violet-100'
                        )}>
                            <div className="flex items-center gap-3">
                                <div className={clsx(
                                    'p-1.5 rounded-xl',
                                    activeModal === 'system-info' ? 'bg-sky-100' : 'bg-violet-100'
                                )}>
                                    {activeModal === 'system-info'
                                        ? <Info className="w-4 h-4 text-sky-600" />
                                        : <Users className="w-4 h-4 text-violet-600" />}
                                </div>
                                <h2 className="font-bold text-slate-800">
                                    {activeModal === 'system-info' ? 'System Info' : 'About'}
                                </h2>
                            </div>
                            <button
                                onClick={() => setActiveModal(null)}
                                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal body — scrollable */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {activeModal === 'system-info' ? <SystemInfoModal /> : <AboutModal />}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
