'use client';

import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icon issue using CDN
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
    lat: number;
    lng: number;
    zoom?: number;
    trail?: [number, number][]; // Array of [lat, lng]
}

export default function Map({ lat, lng, zoom, trail = [] }: MapProps) {
    return (
        <MapContainer
            center={[lat, lng]}
            zoom={zoom || 13}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%', borderRadius: '0.5rem' }}
            className="z-0"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Trail Polyline */}
            {trail.length > 1 && (
                <Polyline
                    positions={trail}
                    pathOptions={{ color: 'blue', weight: 4, opacity: 0.6, dashArray: '10, 10' }}
                />
            )}

            <Marker position={[lat, lng]}>
                <Popup>
                    Location: {lat.toFixed(4)}, {lng.toFixed(4)}
                </Popup>
            </Marker>
        </MapContainer>
    );
}
