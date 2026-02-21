'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';

type DeviceState = 'NORMAL' | 'WARNING' | 'EMERGENCY' | 'SOS' | 'OFFLINE';

interface Props {
    lat: number;
    lng: number;
    trail?: [number, number][];
    status?: DeviceState;
}

export default function MapWrapper({ lat, lng, trail = [], status = 'NORMAL' }: Props) {
    const Map = useMemo(
        () =>
            dynamic(() => import('@/components/MapLibreMap'), {
                loading: () => (
                    <div className="h-full w-full bg-slate-100 animate-pulse rounded-lg flex flex-col items-center justify-center gap-3">
                        <div className="w-8 h-8 border-4 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                        <span className="text-slate-400 text-sm font-medium">Loading 3D Map…</span>
                    </div>
                ),
                ssr: false,
            }),
        []
    );

    return (
        <div style={{ position: 'absolute', inset: 0 }}>
            <Map lat={lat} lng={lng} trail={trail} status={status} />
        </div>
    );
}
