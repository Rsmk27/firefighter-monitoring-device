'use client';

import maplibregl from 'maplibre-gl';
// CSS imported globally in globals.css

// v5 requires an explicit worker URL when bundled by Turbopack / Webpack
// The file is copied from node_modules to public/ during dev/build
(maplibregl as any).workerUrl = '/maplibre-gl-csp-worker.js';

import { useEffect, useRef } from 'react';

type DeviceState = 'NORMAL' | 'WARNING' | 'EMERGENCY' | 'SOS' | 'OFFLINE';

interface Props {
    lat: number;
    lng: number;
    trail: [number, number][];
    status: DeviceState;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeCircle(cx: number, cy: number, radiusKm: number): GeoJSON.Feature {
    const dx = radiusKm / (111.32 * Math.cos((cy * Math.PI) / 180));
    const dy = radiusKm / 110.574;
    const coords: number[][] = [];
    for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * 2 * Math.PI;
        coords.push([cx + dx * Math.cos(a), cy + dy * Math.sin(a)]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

function makeTrail(trail: [number, number][]): GeoJSON.Feature {
    const coords = trail.length > 1 ? trail.map(([la, ln]) => [ln, la]) : [[0, 0], [0.0001, 0.0001]];
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} };
}

const zoneCol = (s: DeviceState) =>
    s === 'EMERGENCY' || s === 'SOS' ? '#ef4444' : s === 'WARNING' ? '#f59e0b' : '#6366f1';

function injectCSS() {
    if (document.getElementById('sfms-map-css')) return;
    const el = document.createElement('style');
    el.id = 'sfms-map-css';
    el.textContent = `
        @keyframes sfmsPing {
            0%   { transform:scale(0.4); opacity:0.9; }
            100% { transform:scale(2.6); opacity:0; }
        }
        .sfms-r1, .sfms-r2 {
            position:absolute; inset:0; border-radius:50%;
            background:rgba(239,68,68,0.35);
            animation: sfmsPing 1.8s ease-out infinite;
        }
        .sfms-r2 { animation-delay:.65s; }
        .sfms-core {
            position:relative; z-index:1;
            width:30px; height:30px; border-radius:50%;
            background:linear-gradient(135deg,#ef4444,#b91c1c);
            border:2.5px solid white;
            box-shadow:0 2px 14px rgba(239,68,68,.6);
            display:flex; align-items:center; justify-content:center;
        }
        .sfms-wrap {
            position:relative; width:42px; height:42px;
            display:flex; align-items:center; justify-content:center; cursor:pointer;
        }
        .maplibregl-popup-content {
            border-radius:14px !important; padding:10px 14px !important;
            font-family:system-ui,sans-serif;
        }
        .maplibregl-ctrl-group { border-radius:10px !important; overflow:hidden; }
    `;
    document.head.appendChild(el);
}

function buildMarkerEl(): HTMLElement {
    injectCSS();
    const w = document.createElement('div');
    w.className = 'sfms-wrap';
    w.innerHTML = `
        <div class="sfms-r1"></div>
        <div class="sfms-r2"></div>
        <div class="sfms-core">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2zm0 12c-5.33 0-8 2.67-8 4v2h16v-2c0-1.33-2.67-4-8-4z"/>
            </svg>
        </div>
    `;
    return w;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MapLibreMap({ lat, lng, trail, status }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markerRef = useRef<maplibregl.Marker | null>(null);
    // Stores ALL active rAF IDs so cleanup can cancel every one of them
    const rafsRef = useRef<number[]>([]);
    const loadedRef = useRef(false);

    const isEmergency = status === 'EMERGENCY' || status === 'SOS';

    const cancelAllRafs = () => {
        rafsRef.current.forEach(id => cancelAnimationFrame(id));
        rafsRef.current = [];
    };

    // ── Init map ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: 'https://tiles.openfreemap.org/styles/liberty',
            center: [lng, lat],
            zoom: 16,
            pitch: 45,
            bearing: 0,
            fadeDuration: 300,
        });

        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

        map.on('load', () => {
            loadedRef.current = true;

            // ── 3D Buildings ───────────────────────────────────────────────
            let firstSymbolId: string | undefined;
            for (const layer of map.getStyle().layers) {
                if (layer.type === 'symbol') { firstSymbolId = layer.id; break; }
            }
            try {
                map.addLayer({
                    id: 'sfms-buildings-3d', type: 'fill-extrusion',
                    source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
                    paint: {
                        'fill-extrusion-color': [
                            'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
                            0, '#dde3ed', 15, '#94a3b8', 50, '#64748b',
                        ],
                        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, ['coalesce', ['get', 'render_height'], 6]],
                        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, ['coalesce', ['get', 'render_min_height'], 0]],
                        'fill-extrusion-opacity': 0.72,
                    },
                }, firstSymbolId);
            } catch { /* 3D buildings unavailable in raster fallback */ }

            // ── Zone radius ────────────────────────────────────────────────
            map.addSource('sfms-zone', { type: 'geojson', data: makeCircle(lng, lat, 0.05) as any });
            map.addLayer({ id: 'sfms-zone-fill', type: 'fill', source: 'sfms-zone', paint: { 'fill-color': zoneCol(status), 'fill-opacity': 0.13 } });
            map.addLayer({ id: 'sfms-zone-border', type: 'line', source: 'sfms-zone', paint: { 'line-color': zoneCol(status), 'line-width': 2, 'line-dasharray': [4, 3], 'line-opacity': 0.85 } });

            // ── Trail ──────────────────────────────────────────────────────
            map.addSource('sfms-trail', { type: 'geojson', data: makeTrail(trail) as any });
            map.addLayer({ id: 'sfms-trail-glow', type: 'line', source: 'sfms-trail', paint: { 'line-color': '#f43f5e', 'line-width': 10, 'line-opacity': 0.16, 'line-blur': 5 } });
            map.addLayer({ id: 'sfms-trail-core', type: 'line', source: 'sfms-trail', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#f43f5e', 'line-width': 3.5, 'line-opacity': 0.9 } });

            // ── Firefighter marker ─────────────────────────────────────────
            const marker = new maplibregl.Marker({ element: buildMarkerEl(), anchor: 'center' })
                .setLngLat([lng, lat])
                .setPopup(new maplibregl.Popup({ offset: 28 }).setHTML(`
                    <div style="min-width:160px">
                        <div style="font-weight:700;font-size:13px;color:#0f172a">🚒 FF_001 — Unit Alpha</div>
                        <div style="font-size:11px;color:#64748b;margin-top:3px">Active Firefighter</div>
                        <div style="font-size:10px;color:#94a3b8;margin-top:2px;font-family:monospace">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
                    </div>
                `))
                .addTo(map);
            markerRef.current = marker;
        });

        return () => {
            loadedRef.current = false;
            cancelAllRafs();
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Sync position + zone ──────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;
        markerRef.current?.setLngLat([lng, lat]);
        const src = map.getSource('sfms-zone') as maplibregl.GeoJSONSource | undefined;
        src?.setData(makeCircle(lng, lat, 0.05) as any);
        const col = zoneCol(status);
        if (map.getLayer('sfms-zone-fill')) map.setPaintProperty('sfms-zone-fill', 'fill-color', col);
        if (map.getLayer('sfms-zone-border')) map.setPaintProperty('sfms-zone-border', 'line-color', col);
    }, [lat, lng, status]);

    // ── Sync trail ────────────────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;
        const src = map.getSource('sfms-trail') as maplibregl.GeoJSONSource | undefined;
        src?.setData(makeTrail(trail) as any);
    }, [trail]);

    // ── Emergency camera ──────────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;

        // Cancel any running orbital rotation
        cancelAllRafs();

        if (isEmergency) {
            map.flyTo({ center: [lng, lat], zoom: 17.5, pitch: 60, bearing: map.getBearing(), duration: 2200, easing: t => 1 - Math.pow(1 - t, 3) });

            // Start orbital rotation after fly-in completes
            const timer = setTimeout(() => {
                let b = map.getBearing();
                const rotate = () => {
                    b = (b + 0.12) % 360;
                    map.setBearing(b);
                    const id = requestAnimationFrame(rotate);
                    rafsRef.current = [id]; // keep only latest
                };
                const id = requestAnimationFrame(rotate);
                rafsRef.current = [id];
            }, 2400);

            return () => clearTimeout(timer);
        } else {
            map.flyTo({ center: [lng, lat], zoom: 16, pitch: 45, bearing: 0, duration: 1800 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEmergency]);

    // ── Normal auto-follow ────────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !loadedRef.current || isEmergency) return;
        map.easeTo({ center: [lng, lat], duration: 900 });
    }, [lat, lng, isEmergency]);

    return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
