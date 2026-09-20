import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapTileLayerKey =
  | 'osm'
  | 'satellite-hybrid'
  | 'satellite-pure'
  | 'satellite'
  | 'nasa-blue-marble'
  | 'nasa-night'
  | 'carto-dark'
  | 'carto-light'
  | 'terrain';

export interface LeafletMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  description?: string;
}

interface LeafletMapProps {
  center: [number, number];
  zoom: number;
  tileLayer: MapTileLayerKey;
  showLabels?: boolean;
  markers: LeafletMarker[];
  onMapClick?: (lat: number, lng: number) => void;
  onMoveEnd?: (center: [number, number], zoom: number) => void;
}

const TILE_LAYERS: Record<string, { url: string; attribution: string; maxNativeZoom: number; maxZoom: number; subdomains?: string }> = {
  'osm': {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxNativeZoom: 18,
    maxZoom: 22,
    subdomains: 'abc',
  },
  'satellite-hybrid': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxNativeZoom: 18,
    maxZoom: 22,
  },
  'satellite-pure': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri',
    maxNativeZoom: 18,
    maxZoom: 22,
  },
  'satellite': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri',
    maxNativeZoom: 18,
    maxZoom: 22,
  },
  'nasa-blue-marble': {
    url: 'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
    attribution: '&copy; <a href="https://earthdata.nasa.gov" target="_blank" rel="noreferrer">NASA GIBS</a> Blue Marble (Free API)',
    maxNativeZoom: 8,
    maxZoom: 22,
    subdomains: 'abc',
  },
  'nasa-night': {
    url: 'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
    attribution: '&copy; <a href="https://earthdata.nasa.gov" target="_blank" rel="noreferrer">NASA GIBS</a> VIIRS Earth at Night (Free API)',
    maxNativeZoom: 8,
    maxZoom: 22,
    subdomains: 'abc',
  },
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
    maxNativeZoom: 18,
    maxZoom: 22,
    subdomains: 'abc',
  },
  'carto-light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
    maxNativeZoom: 18,
    maxZoom: 22,
    subdomains: 'abc',
  },
  'terrain': {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC-BY-SA</a>)',
    maxNativeZoom: 17,
    maxZoom: 22,
    subdomains: 'abc',
  },
};

const LABELS_OVERLAY_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

// Create a custom SVG pin icon
const createPinIcon = (label: string, isHighlighted: boolean = false) => {
  const pinColor = isHighlighted ? '#10b981' : '#3b82f6';
  const shadowColor = 'rgba(0, 0, 0, 0.4)';

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
        <div style="
          background: ${pinColor};
          color: white;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          box-shadow: 0 2px 6px ${shadowColor};
          margin-bottom: 3px;
          border: 1px solid rgba(255,255,255,0.3);
          pointer-events: none;
        ">${label}</div>
        <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px ${shadowColor});">
          <path d="M12 0C5.372 0 0 5.373 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.373 18.628 0 12 0Z" fill="${pinColor}"/>
          <circle cx="12" cy="12" r="5" fill="white"/>
        </svg>
      </div>
    `,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
  });
};

export const LeafletMap: React.FC<LeafletMapProps> = ({
  center,
  zoom,
  tileLayer,
  showLabels = true,
  markers,
  onMapClick,
  onMoveEnd,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerInstanceRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  const markerLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      minZoom: 2,
      maxZoom: 22,
      zoomControl: false, // We provide custom controls
      attributionControl: true,
    });

    const config = TILE_LAYERS[tileLayer] || TILE_LAYERS['osm'];
    const layer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxNativeZoom: config.maxNativeZoom,
      maxZoom: config.maxZoom,
      subdomains: config.subdomains || 'abc',
    }).addTo(map);

    tileLayerInstanceRef.current = layer;

    // Determine if labels should be added initially
    const shouldShow = showLabels && tileLayer !== 'satellite-pure';
    if (shouldShow) {
      labelsLayerRef.current = L.tileLayer(LABELS_OVERLAY_URL, {
        attribution: 'Labels &copy; Esri Reference',
        maxNativeZoom: 18,
        maxZoom: 22,
        zIndex: 5,
      }).addTo(map);
    }

    const markerGroup = L.layerGroup().addTo(map);
    markerLayerGroupRef.current = markerGroup;

    map.on('click', (e) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    });

    map.on('moveend', () => {
      if (onMoveEnd) {
        const c = map.getCenter();
        onMoveEnd([c.lat, c.lng], map.getZoom());
      }
    });

    mapInstanceRef.current = map;

    // Fix potential container sizing glitch
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      if (labelsLayerRef.current) {
        map.removeLayer(labelsLayerRef.current);
        labelsLayerRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update tile layer when tileLayer prop changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (tileLayerInstanceRef.current) {
      map.removeLayer(tileLayerInstanceRef.current);
    }

    const config = TILE_LAYERS[tileLayer] || TILE_LAYERS['osm'];
    const newLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxNativeZoom: config.maxNativeZoom,
      maxZoom: config.maxZoom,
      subdomains: config.subdomains || 'abc',
    }).addTo(map);

    tileLayerInstanceRef.current = newLayer;
  }, [tileLayer]);

  // Update labels overlay when showLabels or tileLayer changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const shouldShow = showLabels && tileLayer !== 'satellite-pure';

    if (shouldShow) {
      if (!labelsLayerRef.current) {
        labelsLayerRef.current = L.tileLayer(LABELS_OVERLAY_URL, {
          attribution: 'Labels &copy; Esri Reference',
          maxNativeZoom: 18,
          maxZoom: 22,
          zIndex: 5,
        }).addTo(map);
      }
    } else {
      if (labelsLayerRef.current) {
        map.removeLayer(labelsLayerRef.current);
        labelsLayerRef.current = null;
      }
    }
  }, [showLabels, tileLayer]);

  // Update map center and zoom if changed externally
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();

    const distLat = Math.abs(currentCenter.lat - center[0]);
    const distLng = Math.abs(currentCenter.lng - center[1]);
    const zoomDiff = Math.abs(currentZoom - zoom);

    if (distLat > 0.0001 || distLng > 0.0001 || zoomDiff > 0) {
      map.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [center, zoom]);

  // Update markers
  useEffect(() => {
    if (!markerLayerGroupRef.current || !mapInstanceRef.current) return;
    const group = markerLayerGroupRef.current;
    group.clearLayers();

    markers.forEach((m, idx) => {
      const icon = createPinIcon(m.label, idx === 0);
      const marker = L.marker([m.lat, m.lng], { icon });

      if (m.description || m.label) {
        marker.bindPopup(`
          <div style="font-family: inherit; padding: 4px;">
            <strong style="font-size: 13px; color: #111827;">${m.label}</strong>
            ${m.description ? `<p style="font-size: 12px; color: #4b5563; margin: 4px 0 0 0;">${m.description}</p>` : ''}
            <div style="font-size: 10px; color: #9ca3af; margin-top: 6px; font-family: monospace;">
              ${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}
            </div>
          </div>
        `);
      }

      marker.addTo(group);
    });
  }, [markers]);

  // Ensure map container resizes dynamically
  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={mapContainerRef}
      id="leaflet-map-canvas"
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
        background: '#1a1d20',
      }}
    />
  );
};
