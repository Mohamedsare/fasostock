"use client";

import type { AppWebPresencePayload } from "@/lib/realtime/app-presence-channel";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

/** Ouagadougou — point de référence pour les sessions sans coordonnées GPS. */
const DEFAULT_CENTER: [number, number] = [12.3714, -1.5197];
const ACCENT = "#EA580C";
const LANDING_ACCENT = "#0891b2";
const FALLBACK_FILL = "#64748b";
const LANDING_FALLBACK_FILL = "#475569";

/** Imagerie satellite (tuiles Esri World Imagery — ordre {z}/{y}/{x}). */
const TILE_SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
/** Noms de lieux et limites par-dessus le satellite (lisibilité quartiers / routes). */
const TILE_SATELLITE_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com/" rel="noreferrer">Esri</a> · Maxar, Earthstar, IGN &amp; contributeurs';

type Point = [number, number];

function hasGps(u: AppWebPresencePayload): u is AppWebPresencePayload & { lat: number; lng: number } {
  return (
    u.lat != null &&
    u.lng != null &&
    Number.isFinite(u.lat) &&
    Number.isFinite(u.lng)
  );
}

/** Décale chaque session sans GPS pour éviter le chevauchement (stable par user_id). */
function fallbackPoint(userId: string, index: number): Point {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  const angle = ((Math.abs(h) % 360) + index * 47) * (Math.PI / 180);
  const ring = 1 + (index % 5);
  const d = 0.01 * ring;
  return [
    DEFAULT_CENTER[0] + d * Math.cos(angle),
    DEFAULT_CENTER[1] + d * Math.sin(angle),
  ];
}

function FitBounds({ points }: { points: Point[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0]!, 17, { animate: false });
      return;
    }
    const b = L.latLngBounds(points);
    if (!b.isValid()) return;
    map.fitBounds(b, { padding: [56, 56], maxZoom: 18 });
  }, [map, points]);
  return null;
}

export default function LiveUsersMap({ users }: { users: AppWebPresencePayload[] }) {
  const { withGps, withoutGps, allFitPoints } = useMemo(() => {
    const withGps = users.filter(hasGps);
    const withoutGps = users.filter((u) => !hasGps(u));
    const gpsPoints: Point[] = withGps.map((u) => [u.lat, u.lng]);
    const fbPoints: Point[] = withoutGps.map((u, i) => fallbackPoint(u.user_id, i));
    return {
      withGps,
      withoutGps,
      allFitPoints: [...gpsPoints, ...fbPoints],
    };
  }, [users]);

  const zoom = withGps.length > 0 ? 7 : withoutGps.length > 0 ? 8 : 6;

  return (
    <div className="relative h-[min(82dvh,820px)] min-h-[320px] w-full overflow-hidden rounded-[1.25rem] bg-slate-200/30 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/50 ring-inset">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={zoom}
        maxZoom={19}
        className="z-0 h-full w-full [&_.leaflet-control-attribution]:rounded-lg [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:opacity-80"
        scrollWheelZoom
      >
        <TileLayer
          url={TILE_SATELLITE}
          attribution={MAP_ATTRIBUTION}
          maxZoom={19}
          maxNativeZoom={19}
        />
        <TileLayer
          url={TILE_SATELLITE_LABELS}
          attribution=""
          maxZoom={19}
          maxNativeZoom={19}
          opacity={0.95}
        />
        {allFitPoints.length > 0 ? <FitBounds points={allFitPoints} /> : null}

        {withGps.map((u) => {
          const isLanding = u.surface === "landing";
          const fill = isLanding ? LANDING_ACCENT : ACCENT;
          return (
            <CircleMarker
              key={`gps-${u.surface}-${u.user_id}`}
              center={[u.lat, u.lng]}
              radius={11}
              pathOptions={{
                color: "#fff",
                weight: 2.5,
                fillColor: fill,
                fillOpacity: 0.92,
              }}
            >
              <Popup className="[&_.leaflet-popup-content-wrapper]:rounded-xl [&_.leaflet-popup-content-wrapper]:shadow-lg [&_.leaflet-popup-content]:m-3 [&_.leaflet-popup-content]:min-w-[180px]">
                <div className="text-[13px] leading-snug">
                  <p className="font-bold text-slate-900">
                    {u.email ?? (isLanding ? "Visiteur" : u.user_id)}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {isLanding ? "Site public" : "Application"}
                  </p>
                  {u.company_name ? <p className="mt-1 text-slate-600">{u.company_name}</p> : null}
                  <p className="mt-1.5 font-mono text-[11px] text-slate-500">{u.path || "/"}</p>
                  <p className="mt-2 text-[11px] font-medium text-emerald-700">Position GPS (navigateur)</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {withoutGps.map((u, i) => {
          const [lat, lng] = fallbackPoint(u.user_id, i);
          const isLanding = u.surface === "landing";
          return (
            <CircleMarker
              key={`fb-${u.surface}-${u.user_id}`}
              center={[lat, lng]}
              radius={10}
              pathOptions={{
                color: isLanding ? "#94a3b8" : "#cbd5e1",
                weight: 2,
                dashArray: "6 4",
                fillColor: isLanding ? LANDING_FALLBACK_FILL : FALLBACK_FILL,
                fillOpacity: 0.55,
              }}
            >
              <Popup className="[&_.leaflet-popup-content-wrapper]:rounded-xl [&_.leaflet-popup-content-wrapper]:shadow-lg [&_.leaflet-popup-content]:m-3 [&_.leaflet-popup-content]:min-w-[180px]">
                <div className="text-[13px] leading-snug">
                  <p className="font-bold text-slate-900">
                    {u.email ?? (isLanding ? "Visiteur" : u.user_id)}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {isLanding ? "Site public" : "Application"}
                  </p>
                  {u.company_name ? <p className="mt-1 text-slate-600">{u.company_name}</p> : null}
                  <p className="mt-1.5 font-mono text-[11px] text-slate-500">{u.path || "/"}</p>
                  <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-600">
                    Pas de GPS (permission refusée ou indisponible). Point <strong>indicatif</strong>{" "}
                    près d’Ouagadougou — pas la position réelle.
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
