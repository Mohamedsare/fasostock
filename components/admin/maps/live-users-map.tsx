"use client";

import type { AppWebPresencePayload } from "@/lib/realtime/app-presence-channel";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

const DEFAULT_CENTER: [number, number] = [12.3714, -1.5197];
const ACCENT = "#EA580C";

type Point = [number, number];

function FitBounds({ points }: { points: Point[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const b = L.latLngBounds(points);
    if (!b.isValid()) return;
    map.fitBounds(b, { padding: [56, 56], maxZoom: 14 });
  }, [map, points]);
  return null;
}

export default function LiveUsersMap({ users }: { users: AppWebPresencePayload[] }) {
  const withCoords = users.filter(
    (u): u is AppWebPresencePayload & { lat: number; lng: number } =>
      u.lat != null && u.lng != null && Number.isFinite(u.lat) && Number.isFinite(u.lng),
  );
  const points: Point[] = withCoords.map((u) => [u.lat, u.lng]);

  return (
    <div className="relative h-[min(82dvh,820px)] min-h-[320px] w-full overflow-hidden rounded-[1.25rem] bg-slate-200/30 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/50 ring-inset">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={withCoords.length ? 7 : 6}
        className="z-0 h-full w-full [&_.leaflet-control-attribution]:rounded-lg [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:opacity-70"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withCoords.length ? <FitBounds points={points} /> : null}
        {withCoords.map((u) => (
          <CircleMarker
            key={u.user_id}
            center={[u.lat, u.lng]}
            radius={11}
            pathOptions={{
              color: "#fff",
              weight: 2.5,
              fillColor: ACCENT,
              fillOpacity: 0.92,
            }}
          >
            <Popup className="[&_.leaflet-popup-content-wrapper]:rounded-xl [&_.leaflet-popup-content-wrapper]:shadow-lg [&_.leaflet-popup-content]:m-3 [&_.leaflet-popup-content]:min-w-[180px]">
              <div className="text-[13px] leading-snug">
                <p className="font-bold text-slate-900">{u.email ?? u.user_id}</p>
                {u.company_name ? <p className="mt-1 text-slate-600">{u.company_name}</p> : null}
                <p className="mt-1.5 font-mono text-[11px] text-slate-500">{u.path || "/"}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
