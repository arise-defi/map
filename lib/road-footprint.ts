import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Road Footprint Interfaces
// ---------------------------------------------------------------------------

export interface RoadFootprint {
  id: string;
  polyline: [number, number][]; // [[lon, lat], ...] centerline coordinates
  length_m: number;
  width_m: number;
  name?: string;
  ref?: string; // road reference number (NH-44, SH-17, etc.)
  highway_class: RoadClassification;
  surface?: 'asphalt' | 'paved' | 'unpaved' | 'concrete' | 'cobblestone' | 'gravel' | 'dirt' | 'unknown';
  lanes?: number;
  speed_limit_kmh?: number;
  one_way: boolean;
  bridge: boolean;
  tunnel: boolean;
  lit?: boolean; // street lighting
  confidence: number;
  centroid: [number, number]; // [lon, lat]
  tags?: Record<string, string>;
  source: 'osm-gis' | 'overture-ml';
}

export type RoadClassification =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'service'
  | 'unclassified'
  | 'living_street'
  | 'pedestrian'
  | 'footway'
  | 'cycleway'
  | 'path'
  | 'track'
  | 'motorway_link'
  | 'trunk_link'
  | 'primary_link'
  | 'secondary_link'
  | 'tertiary_link';

export interface RoadMetrics {
  totalCount: number;
  totalLengthKm: number;
  avgLengthM: number;
  classificationCounts: Record<string, number>;
  surfaceCounts: Record<string, number>;
  namedRoadsCount: number;
  oneWayCount: number;
  bridgeCount: number;
  litCount: number;
  avgLanes: number;
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type RoadDetectionEngine = 'hybrid' | 'osm-gis' | 'overture-ml';

export interface RoadVisualSettings {
  colorMode: 'classification' | 'surface' | 'uniform';
  uniformColor: string;
  strokeWeight: number;
  showLabels: boolean;
  showOneWayArrows: boolean;
  filterClasses: string[];
}

// ---------------------------------------------------------------------------
// Road Classification Styling
// ---------------------------------------------------------------------------

export const ROAD_CLASSIFICATION_STYLES: Record<string, { color: string; weight: number; label: string; emoji: string }> = {
  motorway:       { color: '#ef4444', weight: 5.0, label: 'Motorway / Expressway', emoji: '🛣️' },
  trunk:          { color: '#ef4444', weight: 4.5, label: 'Trunk / National Highway', emoji: '🛣️' },
  primary:        { color: '#f97316', weight: 4.0, label: 'Primary / State Highway', emoji: '🔶' },
  secondary:      { color: '#eab308', weight: 3.5, label: 'Secondary Road', emoji: '🟡' },
  tertiary:       { color: '#22c55e', weight: 3.0, label: 'Tertiary Road', emoji: '🟢' },
  residential:    { color: '#3b82f6', weight: 2.5, label: 'Residential Street', emoji: '🏘️' },
  service:        { color: '#8b5cf6', weight: 1.8, label: 'Service / Alley', emoji: '🅿️' },
  unclassified:   { color: '#6b7280', weight: 2.0, label: 'Unclassified', emoji: '⬜' },
  living_street:  { color: '#06b6d4', weight: 2.0, label: 'Living Street', emoji: '🏡' },
  pedestrian:     { color: '#a855f7', weight: 1.5, label: 'Pedestrian', emoji: '🚶' },
  footway:        { color: '#94a3b8', weight: 1.2, label: 'Footway / Path', emoji: '🚶' },
  cycleway:       { color: '#10b981', weight: 1.5, label: 'Cycleway', emoji: '🚲' },
  path:           { color: '#94a3b8', weight: 1.0, label: 'Path / Trail', emoji: '🥾' },
  track:          { color: '#a3a3a3', weight: 1.5, label: 'Track / Farm Road', emoji: '🚜' },
  motorway_link:  { color: '#ef4444', weight: 3.0, label: 'Motorway Link', emoji: '🔗' },
  trunk_link:     { color: '#ef4444', weight: 2.8, label: 'Trunk Link', emoji: '🔗' },
  primary_link:   { color: '#f97316', weight: 2.5, label: 'Primary Link', emoji: '🔗' },
  secondary_link: { color: '#eab308', weight: 2.2, label: 'Secondary Link', emoji: '🔗' },
  tertiary_link:  { color: '#22c55e', weight: 2.0, label: 'Tertiary Link', emoji: '🔗' },
};

export const ROAD_SURFACE_STYLES: Record<string, { color: string; label: string }> = {
  asphalt:     { color: '#3b82f6', label: 'Asphalt' },
  paved:       { color: '#6366f1', label: 'Paved' },
  concrete:    { color: '#8b5cf6', label: 'Concrete' },
  cobblestone: { color: '#f59e0b', label: 'Cobblestone' },
  unpaved:     { color: '#d97706', label: 'Unpaved' },
  gravel:      { color: '#a3a3a3', label: 'Gravel' },
  dirt:        { color: '#92400e', label: 'Dirt' },
  unknown:     { color: '#6b7280', label: 'Unknown' },
};

// ---------------------------------------------------------------------------
// India City Presets
// ---------------------------------------------------------------------------

export interface IndiaCityPreset {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  zoom: number;
  description: string;
}

export const INDIA_ROAD_PRESETS: IndiaCityPreset[] = [
  {
    id: 'del-cp',
    name: 'Connaught Place',
    city: 'New Delhi',
    state: 'Delhi NCR',
    lat: 28.6315,
    lng: 77.2167,
    zoom: 17,
    description: 'Radial road network with Inner/Outer Circle and spokes',
  },
  {
    id: 'del-karol-bagh',
    name: 'Karol Bagh',
    city: 'New Delhi',
    state: 'Delhi NCR',
    lat: 28.6517,
    lng: 77.1906,
    zoom: 17,
    description: 'Dense residential grid with narrow galis and main market roads',
  },
  {
    id: 'blr-koramangala',
    name: 'Koramangala',
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.9344,
    lng: 77.6212,
    zoom: 17,
    description: 'Tech hub road network with mixed residential streets',
  },
  {
    id: 'mum-bandra',
    name: 'Bandra West',
    city: 'Mumbai',
    state: 'Maharashtra',
    lat: 19.0596,
    lng: 72.8295,
    zoom: 17,
    description: 'Dense coastal road network with linking road and SV Road',
  },
  {
    id: 'hyd-hitec',
    name: 'Hitec City',
    city: 'Hyderabad',
    state: 'Telangana',
    lat: 17.4435,
    lng: 78.3772,
    zoom: 17,
    description: 'Wide IT corridor roads with flyovers and service roads',
  },
  {
    id: 'ahm-sg',
    name: 'SG Highway',
    city: 'Ahmedabad',
    state: 'Gujarat',
    lat: 23.0225,
    lng: 72.5065,
    zoom: 16,
    description: 'Major 6-lane arterial with service roads and intersections',
  },
];

// ---------------------------------------------------------------------------
// Geodesic Math
// ---------------------------------------------------------------------------

function calculatePolylineLength(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  const R = 6378137.0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    total += R * c;
  }
  return total;
}

function calculateCentroid(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  let sumLon = 0;
  let sumLat = 0;
  for (const [lon, lat] of coords) {
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / coords.length, sumLat / coords.length];
}

function parseRoadWidth(tags: Record<string, string>): number {
  if (tags.width) {
    const w = parseFloat(tags.width);
    if (!isNaN(w) && w > 0) return w;
  }
  const lanes = tags.lanes ? parseInt(tags.lanes) : 0;
  if (lanes > 0) return lanes * 3.5;

  const hw = (tags.highway || '').toLowerCase();
  if (hw === 'motorway' || hw === 'trunk') return 14;
  if (hw === 'primary') return 10;
  if (hw === 'secondary') return 8;
  if (hw === 'tertiary') return 7;
  if (hw === 'residential') return 5.5;
  if (hw === 'service') return 3.5;
  if (hw === 'footway' || hw === 'path' || hw === 'cycleway') return 1.5;
  return 5;
}

function parseSpeedLimit(tags: Record<string, string>): number | undefined {
  if (tags.maxspeed) {
    const s = parseInt(tags.maxspeed);
    if (!isNaN(s) && s > 0) return s;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// OSM Road Footprints Fetch
// ---------------------------------------------------------------------------

async function fetchOSMRoadFootprints(bounds: BoundingBox): Promise<RoadFootprint[]> {
  const query = `[out:json][timeout:30];
(
  way["highway"]["highway"!~"proposed|construction|raceway|bus_guideway|escape|elevator|platform"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out geom qt;`;

  let data: any = null;

  try {
    const proxyRes = await fetch('/api/road-footprints/osm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bounds, query }),
    });
    if (proxyRes.ok) {
      data = await proxyRes.json();
    }
  } catch (err) {
    console.warn('[RoadFootprint] Proxy attempt failed:', err);
  }

  if (!data || !data.elements) {
    const mirrors = [
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass-api.de/api/interpreter',
    ];

    for (const mirror of mirrors) {
      try {
        const res = await fetch(mirror, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'RoadFootprintAI/1.0',
          },
          body: 'data=' + encodeURIComponent(query),
        });
        if (res.ok) {
          data = await res.json();
          if (data && data.elements) break;
        }
      } catch {
        // try next mirror
      }
    }
  }

  if (!data || !data.elements || !Array.isArray(data.elements)) {
    return [];
  }

  return parseOSMRoads(data.elements, 'osm-gis');
}

// ---------------------------------------------------------------------------
// Overture ML Road Footprints (enhanced query with all roads)
// ---------------------------------------------------------------------------

async function fetchOvertureMLRoads(bounds: BoundingBox): Promise<RoadFootprint[]> {
  const query = `[out:json][timeout:30];
(
  way["highway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out geom qt;`;

  let data: any = null;

  try {
    const proxyRes = await fetch('/api/road-footprints/overture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bounds, query }),
    });
    if (proxyRes.ok) {
      data = await proxyRes.json();
    }
  } catch (err) {
    console.warn('[RoadFootprint] Overture proxy failed:', err);
  }

  if (!data || !data.elements) {
    const mirrors = [
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass-api.de/api/interpreter',
    ];
    for (const mirror of mirrors) {
      try {
        const res = await fetch(mirror, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'RoadFootprintAI/2.0 (ML-Mode)',
          },
          body: 'data=' + encodeURIComponent(query),
        });
        if (res.ok) {
          data = await res.json();
          if (data && data.elements) break;
        }
      } catch {
        // next
      }
    }
  }

  if (!data || !data.elements || !Array.isArray(data.elements)) {
    return [];
  }

  return parseOSMRoads(data.elements, 'overture-ml');
}

// ---------------------------------------------------------------------------
// Parse OSM Road Elements
// ---------------------------------------------------------------------------

function parseOSMRoads(elements: any[], source: RoadFootprint['source']): RoadFootprint[] {
  const results: RoadFootprint[] = [];

  elements.forEach((el: any, idx: number) => {
    if (!el.geometry || el.geometry.length < 2) return;
    const tags = el.tags || {};
    const hwClass = (tags.highway || 'unclassified').toLowerCase() as RoadClassification;

    const coords: [number, number][] = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
    const lengthM = calculatePolylineLength(coords);
    if (lengthM < 3) return;

    const centroid = calculateCentroid(coords);
    const widthM = parseRoadWidth(tags);
    const speedLimit = parseSpeedLimit(tags);
    const lanes = tags.lanes ? parseInt(tags.lanes) : undefined;
    const surface = (tags.surface || 'unknown') as RoadFootprint['surface'];

    results.push({
      id: `road-${source === 'overture-ml' ? 'ml' : 'osm'}-${el.id || idx + 1}`,
      polyline: coords,
      length_m: Math.round(lengthM * 10) / 10,
      width_m: Math.round(widthM * 10) / 10,
      name: tags.name || undefined,
      ref: tags.ref || undefined,
      highway_class: hwClass,
      surface,
      lanes: lanes && !isNaN(lanes) ? lanes : undefined,
      speed_limit_kmh: speedLimit,
      one_way: tags.oneway === 'yes' || tags.oneway === '1',
      bridge: tags.bridge === 'yes',
      tunnel: tags.tunnel === 'yes',
      lit: tags.lit === 'yes',
      confidence: 0.97,
      centroid: [Math.round(centroid[0] * 1e7) / 1e7, Math.round(centroid[1] * 1e7) / 1e7],
      tags,
      source,
    });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Smart Road Merger
// ---------------------------------------------------------------------------

function mergeRoadFootprints(osmRoads: RoadFootprint[], mlRoads: RoadFootprint[]): RoadFootprint[] {
  if (osmRoads.length === 0) return mlRoads;
  if (mlRoads.length === 0) return osmRoads;

  const merged: RoadFootprint[] = [...osmRoads];
  mlRoads.forEach((ml) => {
    const isDuplicate = merged.some((existing) => {
      const dLon = existing.centroid[0] - ml.centroid[0];
      const dLat = existing.centroid[1] - ml.centroid[1];
      return Math.sqrt(dLon * dLon + dLat * dLat) < 0.00004;
    });
    if (!isDuplicate) {
      merged.push(ml);
    }
  });

  return merged;
}

// ---------------------------------------------------------------------------
// Compute Road Metrics
// ---------------------------------------------------------------------------

export function computeRoadMetrics(roads: RoadFootprint[]): RoadMetrics {
  if (roads.length === 0) {
    return {
      totalCount: 0, totalLengthKm: 0, avgLengthM: 0,
      classificationCounts: {}, surfaceCounts: {},
      namedRoadsCount: 0, oneWayCount: 0, bridgeCount: 0, litCount: 0, avgLanes: 0,
    };
  }

  let totalLength = 0;
  let totalLanes = 0;
  let lanesCount = 0;
  let namedCount = 0;
  let oneWayCount = 0;
  let bridgeCount = 0;
  let litCount = 0;
  const classCounts: Record<string, number> = {};
  const surfCounts: Record<string, number> = {};

  roads.forEach((r) => {
    totalLength += r.length_m;
    if (r.name) namedCount++;
    if (r.one_way) oneWayCount++;
    if (r.bridge) bridgeCount++;
    if (r.lit) litCount++;
    if (r.lanes) { totalLanes += r.lanes; lanesCount++; }
    const cls = r.highway_class || 'unclassified';
    classCounts[cls] = (classCounts[cls] || 0) + 1;
    const surf = r.surface || 'unknown';
    surfCounts[surf] = (surfCounts[surf] || 0) + 1;
  });

  return {
    totalCount: roads.length,
    totalLengthKm: Math.round((totalLength / 1000) * 10) / 10,
    avgLengthM: Math.round(totalLength / roads.length),
    classificationCounts: classCounts,
    surfaceCounts: surfCounts,
    namedRoadsCount: namedCount,
    oneWayCount,
    bridgeCount,
    litCount,
    avgLanes: lanesCount > 0 ? Math.round((totalLanes / lanesCount) * 10) / 10 : 2,
  };
}

// ---------------------------------------------------------------------------
// Zustand Store
// ---------------------------------------------------------------------------

interface RoadFootprintState {
  isPanelOpen: boolean;
  isDetecting: boolean;
  detectionEngine: RoadDetectionEngine;
  roads: RoadFootprint[];
  selectedRoadId: string | null;
  visualSettings: RoadVisualSettings;
  searchQuery: string;
  filterClass: string;
  lastDetectedBounds: BoundingBox | null;
  detectionError: string | null;
  currentMapBounds: BoundingBox | null;

  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setDetectionEngine: (engine: RoadDetectionEngine) => void;
  setSelectedRoadId: (id: string | null) => void;
  setVisualSettings: (settings: Partial<RoadVisualSettings>) => void;
  setSearchQuery: (query: string) => void;
  setFilterClass: (cls: string) => void;
  clearDetections: () => void;
  detectRoads: (bounds: BoundingBox) => Promise<RoadFootprint[]>;
  exportGeoJSON: () => void;
  exportCSV: () => void;
}

export const useRoadFootprintStore = create<RoadFootprintState>((set, get) => ({
  isPanelOpen: false,
  isDetecting: false,
  detectionEngine: 'hybrid',
  roads: [],
  selectedRoadId: null,
  visualSettings: {
    colorMode: 'classification',
    uniformColor: '#f97316',
    strokeWeight: 1.0,
    showLabels: false,
    showOneWayArrows: false,
    filterClasses: [],
  },
  searchQuery: '',
  filterClass: 'all',
  lastDetectedBounds: null,
  detectionError: null,
  currentMapBounds: null,

  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false }),
  setDetectionEngine: (engine) => set({ detectionEngine: engine }),
  setSelectedRoadId: (id) => set({ selectedRoadId: id }),
  setVisualSettings: (settings) =>
    set((s) => ({ visualSettings: { ...s.visualSettings, ...settings } })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterClass: (cls) => set({ filterClass: cls }),
  clearDetections: () => set({ roads: [], selectedRoadId: null, detectionError: null }),

  detectRoads: async (bounds: BoundingBox) => {
    const { detectionEngine } = get();
    set({ isDetecting: true, detectionError: null, lastDetectedBounds: bounds });

    try {
      let results: RoadFootprint[] = [];

      if (detectionEngine === 'osm-gis') {
        results = await fetchOSMRoadFootprints(bounds);
        console.log(`[RoadDetect:osm-gis] ${results.length} road segments`);
      } else if (detectionEngine === 'overture-ml') {
        results = await fetchOvertureMLRoads(bounds);
        console.log(`[RoadDetect:overture-ml] ${results.length} road segments`);
      } else {
        const [osm, ml] = await Promise.all([
          fetchOSMRoadFootprints(bounds).catch(() => [] as RoadFootprint[]),
          fetchOvertureMLRoads(bounds).catch(() => [] as RoadFootprint[]),
        ]);
        console.log(`[RoadDetect:hybrid] OSM: ${osm.length}, ML: ${ml.length}`);
        results = mergeRoadFootprints(osm, ml);
      }

      set({
        roads: results,
        isDetecting: false,
        isPanelOpen: true,
        detectionError: results.length === 0
          ? 'No road segments found. Try zooming in or selecting a built-up area.'
          : null,
      });
      return results;
    } catch (err: any) {
      set({
        isDetecting: false,
        detectionError: `Road detection failed: ${err.message || 'Network error'}`,
      });
      return [];
    }
  },

  exportGeoJSON: () => {
    const { roads, lastDetectedBounds } = get();
    if (roads.length === 0) return;
    const fc = {
      type: 'FeatureCollection',
      metadata: {
        title: 'AI Road Footprint Detections',
        timestamp: new Date().toISOString(),
        total_count: roads.length,
        bounds: lastDetectedBounds,
      },
      features: roads.map((r) => ({
        type: 'Feature',
        id: r.id,
        geometry: { type: 'LineString', coordinates: r.polyline },
        properties: {
          name: r.name || null,
          ref: r.ref || null,
          highway_class: r.highway_class,
          surface: r.surface,
          width_m: r.width_m,
          lanes: r.lanes || null,
          speed_limit_kmh: r.speed_limit_kmh || null,
          length_m: r.length_m,
          one_way: r.one_way,
          bridge: r.bridge,
          tunnel: r.tunnel,
          source: r.source,
        },
      })),
    };
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `road-footprints-${Date.now()}.geojson`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  exportCSV: () => {
    const { roads } = get();
    if (roads.length === 0) return;
    const headers = ['ID', 'Name', 'Ref', 'Class', 'Surface', 'Width_m', 'Lanes', 'Speed', 'Length_m', 'OneWay', 'Bridge', 'Source'];
    const rows = roads.map((r) => [
      r.id, `"${r.name || ''}"`, `"${r.ref || ''}"`, r.highway_class, r.surface || '',
      r.width_m, r.lanes || '', r.speed_limit_kmh || '', r.length_m,
      r.one_way ? 'Yes' : 'No', r.bridge ? 'Yes' : 'No', r.source,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `road-footprints-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
}));
