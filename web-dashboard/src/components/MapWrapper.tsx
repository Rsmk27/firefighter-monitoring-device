'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';

export default function MapWrapper({ lat, lng, trail = [] }: { lat: number; lng: number, trail?: [number, number][] }) {
    const Map = useMemo(() => dynamic(
        () => import('@/components/Map'),
        {
            loading: () => <div className="h-full w-full bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-slate-400">Loading Map...</div>,
            ssr: false
        }
    ), []);

    return <Map lat={lat} lng={lng} trail={trail} />;
}
