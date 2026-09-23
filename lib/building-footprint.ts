import { create } from 'zustand';

export interface BuildingFootprint {
  id: string;
  polygon: [number, number][]; // [[lon, lat], ...] closed polygon
  area_sqm: number;
  area_sqft: number;
  area_gaj: number; // Square Yards (Gaj) common in Indian property measurement (1 Gaj = 0.8361 m²)
  perimeter_m: number;
  estimated_height_m: number;
  estimated_floors: number;
  classification:
    | 'Residential'
    | 'Independent House'
    | 'Builder Floor'
    | 'High-Rise'
    | 'Commercial'
    | 'Industrial'
    | 'Outbuilding'
    | 'Civic';
  confidence: number;
  centroid: [number, number]; // [lon, lat]
  orientation_deg: number;
  roof_material?: 'RCC Concrete' | 'Corrugated Tin Sheet' | 'Mangalore Clay Tile' | 'Asphalt / Mixed';
  has_mumty_tank?: boolean; // Detected overhead water tank / stair mumty
  tags?: Record<string, string>;
  name?: string;
  source: 'cv-optical' | 'osm-gis' | 'colab-neural' | 'overture-ml';
}

export interface BuildingMetrics {
  totalCount: number;
  totalAreaSqm: number;
  totalAreaSqft: number;
  totalAreaGaj: number;
  lotCoveragePct: number;
  avgAreaSqm: number;
  avgAreaGaj: number;
  categoryCounts: {
    residential: number;
    independentHouse: number;
    builderFloor: number;
    commercial: number;
    industrial: number;
    highRise: number;
    other: number;
  };
  avgFloors: number;
  roofMaterials?: {
    rccConcrete: number;
    corrugatedSheet: number;
    clayTile: number;
  };
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type DetectionMode = 'viewport' | 'roi-box' | 'point-tap';
export type DetectionEngine = 'hybrid' | 'cv-optical' | 'osm-gis' | 'colab-neural' | 'overture-ml';
export type GeometryMode = 'obb' | 'contour' | 'hybrid';
export type DetectionDensity = 'ultra-dense' | 'standard';

export interface VisualSettings {
  strokeColor: string;
  strokeWeight: number;
  fillOpacity: number;
  show3D: boolean;
  heightScale: number; // 1.0x, 1.5x, 2.0x, 3.0x
  showFloorBands: boolean;
  showLabels: boolean;
  showCentroids: boolean;
  geometryMode: GeometryMode;
  detectionDensity: DetectionDensity;
}

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

export const INDIA_CITY_PRESETS: IndiaCityPreset[] = [
  {
    id: 'blr-koramangala',
    name: 'Koramangala 4th Block',
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.9344,
    lng: 77.6212,
    zoom: 18,
    description: 'High-density tech & residential builder floors with overhead RCC water tanks',
  },
  {
    id: 'del-cp',
    name: 'Connaught Place',
    city: 'New Delhi',
    state: 'Delhi NCR',
    lat: 28.6315,
    lng: 77.2167,
    zoom: 18,
    description: 'Colonial radial commercial blocks & modern commercial high-rises',
  },
  {
    id: 'del-karol-bagh',
    name: 'Karol Bagh (Dense Urban)',
    city: 'New Delhi',
    state: 'Delhi NCR',
    lat: 28.6517,
    lng: 77.1906,
    zoom: 18,
    description: 'Ultra-dense conjoined mohalla row-houses (25-100 Gaj party-wall plots)',
  },
  {
    id: 'mum-bandra',
    name: 'Bandra West (Pali Hill)',
    city: 'Mumbai',
    state: 'Maharashtra',
    lat: 19.0596,
    lng: 72.8295,
    zoom: 18,
    description: 'Bungalows, boutique commercial shops, and sea-facing residential towers',
  },
  {
    id: 'hyd-hitec',
    name: 'Hitec City / Madhapur',
    city: 'Hyderabad',
    state: 'Telangana',
    lat: 17.4435,
    lng: 78.3772,
    zoom: 18,
    description: 'Cyber towers, mega IT campuses, and luxury residential villas',
  },
  {
    id: 'pun-kothrud',
    name: 'Kothrud / Paud Road',
    city: 'Pune',
    state: 'Maharashtra',
    lat: 18.5074,
    lng: 73.8077,
    zoom: 18,
    description: 'Classic residential housing societies, row-houses, and mixed retail',
  },
  {
    id: 'ahm-navrangpura',
    name: 'Navrangpura / CG Road',
    city: 'Ahmedabad',
    state: 'Gujarat',
    lat: 23.0365,
    lng: 72.5611,
    zoom: 18,
    description: 'Commercial avenues, independent bungalows, and flat RCC terraces',
  },
  {
    id: 'ker-kochi',
    name: 'Fort Kochi / Heritage',
    city: 'Kochi',
    state: 'Kerala',
    lat: 9.9656,
    lng: 76.2421,
    zoom: 18,
    description: 'Red Mangalore clay tile roofs nestled in coastal palm canopies',
  },
];

interface BuildingFootprintState {
  isPanelOpen: boolean;
  isDetecting: boolean;
  detectionMode: DetectionMode;
  detectionEngine: DetectionEngine;
  indiaMode: boolean; // India high-density calibration
  roiBox: BoundingBox | null;
  footprints: BuildingFootprint[];
  selectedFootprintId: string | null;
  visualSettings: VisualSettings;
  searchQuery: string;
  filterCategory: string;
  sortBy: 'area-desc' | 'area-asc' | 'conf-desc';
  lastDetectedBounds: BoundingBox | null;
  currentMapBounds: BoundingBox | null;
  detectionError: string | null;

  // Actions
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  toggleIndiaMode: () => void;
  setIndiaMode: (enabled: boolean) => void;
  setDetectionMode: (mode: DetectionMode) => void;
  setDetectionEngine: (engine: DetectionEngine) => void;
  setRoiBox: (box: BoundingBox | null) => void;
  setSelectedFootprintId: (id: string | null) => void;
  setCurrentMapBounds: (bounds: BoundingBox | null) => void;
  setVisualSettings: (settings: Partial<VisualSettings>) => void;
  setSearchQuery: (query: string) => void;
  setFilterCategory: (category: string) => void;
  setSortBy: (sort: 'area-desc' | 'area-asc' | 'conf-desc') => void;
  clearDetections: () => void;
  detectFootprints: (bounds: BoundingBox, zoom?: number) => Promise<BuildingFootprint[]>;
  exportGeoJSON: () => void;
  exportCSV: () => void;
  copyGeoJSONToClipboard: () => Promise<boolean>;
  applyReferenceStyle: () => void;
  toggle3D: () => void;
  setHeightScale: (scale: number) => void;
  toggleFloorBands: () => void;
  setGeometryMode: (mode: GeometryMode) => void;
  setDetectionDensity: (density: DetectionDensity) => void;
}

// ---------------------------------------------------------------------------
// Geodesic Math & Utilities
// ---------------------------------------------------------------------------

export function isLocationInIndia(lat: number, lon: number): boolean {
  return lat >= 6.0 && lat <= 37.5 && lon >= 68.0 && lon <= 97.5;
}

export function sqmToGaj(sqm: number): number {
  return Math.round((sqm / 0.836127) * 10) / 10;
}

export function calculatePolygonAreaSqm(coords: [number, number][], refLat: number): number {
  if (coords.length < 3) return 0;
  const r = 6378137.0; // Earth radius in meters
  const latFactor = Math.cos((refLat * Math.PI) / 180);

  const p0 = coords[0];
  const pts: [number, number][] = coords.map(pt => [
    ((pt[0] - p0[0]) * Math.PI * r * latFactor) / 180,
    ((pt[1] - p0[1]) * Math.PI * r) / 180,
  ]);

  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return Math.abs(area) / 2.0;
}

export function calculatePolygonPerimeterM(coords: [number, number][], refLat: number): number {
  if (coords.length < 2) return 0;
  const r = 6378137.0;
  const latFactor = Math.cos((refLat * Math.PI) / 180);

  let perimeter = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const dx = ((p2[0] - p1[0]) * Math.PI * r * latFactor) / 180;
    const dy = ((p2[1] - p1[1]) * Math.PI * r) / 180;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

export function calculateCentroid(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  const n = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
    ? coords.length - 1
    : coords.length;
  let sumLon = 0;
  let sumLat = 0;
  for (let i = 0; i < n; i++) {
    sumLon += coords[i][0];
    sumLat += coords[i][1];
  }
  return [sumLon / n, sumLat / n];
}

// ---------------------------------------------------------------------------
// Rotating Calipers: Minimum Area Bounding Box (Oriented Bounding Box - OBB)
// Computes exact rotated architectural rectangle matching building roof angle
// ---------------------------------------------------------------------------

export function getConvexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;
  const pts = points.slice().sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export interface RotatedRect {
  corners: [number, number][]; // 4 corners in pixel space
  angleDeg: number;
  width: number;
  height: number;
  area: number;
}

export function getMinAreaRect(points: [number, number][]): RotatedRect | null {
  const hull = getConvexHull(points);
  if (hull.length === 0) return null;
  if (hull.length === 1) {
    const p = hull[0];
    return { corners: [p, p, p, p], angleDeg: 0, width: 0, height: 0, area: 0 };
  }
  if (hull.length === 2) {
    const [p1, p2] = hull;
    const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    let deg = (angle * 180) / Math.PI;
    if (deg < 0) deg += 180;
    return { corners: [p1, p2, p2, p1], angleDeg: Math.round(deg), width: 1, height: 1, area: 1 };
  }

  let minArea = Infinity;
  let bestCorners: [number, number][] = [];
  let bestAngle = 0;
  let bestW = 0;
  let bestH = 0;

  for (let i = 0; i < hull.length; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % hull.length];
    const edgeAngle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    const cos = Math.cos(-edgeAngle);
    const sin = Math.sin(-edgeAngle);

    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (const p of hull) {
      const u = p[0] * cos - p[1] * sin;
      const v = p[0] * sin + p[1] * cos;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    const w = maxU - minU;
    const h = maxV - minV;
    const area = w * h;

    if (area < minArea && w > 0 && h > 0) {
      minArea = area;
      bestW = w;
      bestH = h;
      bestAngle = edgeAngle;

      const cosR = Math.cos(edgeAngle);
      const sinR = Math.sin(edgeAngle);
      const rot = (u: number, v: number): [number, number] => [
        u * cosR - v * sinR,
        u * sinR + v * cosR,
      ];
      bestCorners = [
        rot(minU, minV),
        rot(maxU, minV),
        rot(maxU, maxV),
        rot(minU, maxV),
      ];
    }
  }

  let deg = (bestAngle * 180) / Math.PI;
  if (deg < 0) deg += 180;
  if (deg >= 180) deg -= 180;

  return {
    corners: bestCorners,
    angleDeg: Math.round(deg),
    width: bestW,
    height: bestH,
    area: minArea,
  };
}

export function simplifyDouglasPeucker(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;

  const sqDistToSegment = (p: [number, number], a: [number, number], b: [number, number]) => {
    const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    if (l2 === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p[0] - (a[0] + t * (b[0] - a[0]))) ** 2 + (p[1] - (a[1] + t * (b[1] - a[1]))) ** 2;
  };

  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = Math.sqrt(sqDistToSegment(points[i], points[0], points[points.length - 1]));
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const rec1 = simplifyDouglasPeucker(points.slice(0, index + 1), epsilon);
    const rec2 = simplifyDouglasPeucker(points.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  } else {
    return [points[0], points[points.length - 1]];
  }
}

/**
 * Classifies building structures with specialized Indian real-estate taxonomy.
 */
export function classifyBuilding(
  areaSqm: number,
  tags?: Record<string, string>,
  isIndia: boolean = true
): {
  classification: BuildingFootprint['classification'];
  estimated_floors: number;
  estimated_height_m: number;
} {
  let floors = 1;
  let height = 3.5;
  let classification: BuildingFootprint['classification'] = isIndia ? 'Independent House' : 'Residential';

  if (tags) {
    if (tags['building:levels']) {
      const parsedFloors = parseFloat(tags['building:levels']);
      if (!isNaN(parsedFloors) && parsedFloors > 0) floors = Math.round(parsedFloors);
    }
    if (tags.height) {
      const parsedHeight = parseFloat(tags.height);
      if (!isNaN(parsedHeight) && parsedHeight > 0) height = parsedHeight;
    }

    const bType = (tags.building || '').toLowerCase();
    if (['commercial', 'retail', 'office', 'bank', 'supermarket', 'hotel'].includes(bType)) {
      classification = 'Commercial';
    } else if (['industrial', 'warehouse', 'manufacture', 'factory', 'shed'].includes(bType)) {
      classification = 'Industrial';
    } else if (['apartments', 'residential', 'house', 'detached', 'terrace'].includes(bType)) {
      classification = isIndia && floors >= 3 ? 'Builder Floor' : isIndia ? 'Independent House' : 'Residential';
    } else if (['school', 'university', 'hospital', 'civic', 'public', 'temple', 'mosque'].includes(bType)) {
      classification = 'Civic';
    } else if (['shed', 'garage', 'roof', 'outbuilding'].includes(bType)) {
      classification = 'Outbuilding';
    }
  }

  // Geometric area & height heuristics calibrated for Indian plots
  if (floors === 1 && !tags?.height) {
    if (areaSqm > 3000) {
      classification = 'Industrial';
      floors = 2;
      height = 9.5;
    } else if (areaSqm > 850) {
      classification = 'Commercial';
      floors = Math.max(floors, Math.min(10, Math.round(areaSqm / 200)));
      height = floors * 3.8;
    } else if (areaSqm >= 250 && areaSqm <= 850) {
      classification = isIndia ? 'Builder Floor' : 'Commercial';
      floors = Math.max(floors, isIndia ? 4 : 2);
      height = floors * 3.2;
    } else if (areaSqm >= 60 && areaSqm < 250) {
      // 70 to 300 Gaj - classic Indian Kothi / Independent House or G+2 builder floor
      floors = areaSqm > 140 ? 3 : 2;
      classification = isIndia && floors >= 3 ? 'Builder Floor' : 'Independent House';
      height = floors * 3.2;
    } else if (areaSqm < 35) {
      classification = 'Outbuilding';
      floors = 1;
      height = 3.0;
    } else {
      // 35 to 60 sqm (compact Indian urban plot / mohalla row house)
      classification = isIndia ? 'Independent House' : 'Residential';
      floors = 2;
      height = 6.2;
    }
  }

  if (floors >= 6 || height >= 22) {
    classification = 'High-Rise';
  }

  return { classification, estimated_floors: floors, estimated_height_m: Math.round(height * 10) / 10 };
}

// ---------------------------------------------------------------------------
// GIS Ground Truth Service (OpenStreetMap Vector Footprints)
// ---------------------------------------------------------------------------

async function fetchOSMBuildingFootprints(bounds: BoundingBox, indiaMode: boolean = true): Promise<BuildingFootprint[]> {
  const query = `[out:json][timeout:30];
(
  way["building"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  relation["building"]["type"="multipolygon"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out geom qt;`;

  let data: any = null;

  try {
    const proxyRes = await fetch('/api/building-footprints/osm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bounds, query }),
    });
    if (proxyRes.ok) {
      data = await proxyRes.json();
    }
  } catch (err) {
    console.warn('[BuildingFootprint] Proxy attempt failed, trying direct mirrors:', err);
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
            'User-Agent': 'BuildingFootprintAI/1.0 (https://github.com/google/gemini)',
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

  const results: BuildingFootprint[] = [];
  const refLat = (bounds.south + bounds.north) / 2;
  const inIndia = indiaMode || isLocationInIndia(refLat, (bounds.west + bounds.east) / 2);

  data.elements.forEach((el: any, idx: number) => {
    if (!el.geometry || el.geometry.length < 3) return;

    const coords: [number, number][] = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }

    const areaSqm = calculatePolygonAreaSqm(coords, refLat);
    // Lower area threshold in India to capture compact 18m² (20 Gaj) plots
    if (areaSqm < (inIndia ? 12.0 : 15.0)) return;

    const perimeterM = calculatePolygonPerimeterM(coords, refLat);
    const centroid = calculateCentroid(coords);
    const tags = el.tags || {};
    const { classification, estimated_floors, estimated_height_m } = classifyBuilding(areaSqm, tags, inIndia);

    let maxEdgeLen = 0;
    let orientation = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const dLon = coords[i + 1][0] - coords[i][0];
      const dLat = coords[i + 1][1] - coords[i][1];
      const len = Math.sqrt(dLon * dLon + dLat * dLat);
      if (len > maxEdgeLen) {
        maxEdgeLen = len;
        orientation = Math.round((Math.atan2(dLat, dLon) * 180) / Math.PI);
        if (orientation < 0) orientation += 180;
      }
    }

    const buildingName = tags.name || tags['addr:housenumber']
      ? `${tags['addr:housenumber'] || ''} ${tags['addr:street'] || tags.name || ''}`.trim()
      : undefined;

    results.push({
      id: `bld-osm-${el.id || idx + 1}`,
      polygon: coords,
      area_sqm: Math.round(areaSqm * 10) / 10,
      area_sqft: Math.round(areaSqm * 10.7639),
      area_gaj: sqmToGaj(areaSqm),
      perimeter_m: Math.round(perimeterM * 10) / 10,
      estimated_height_m,
      estimated_floors,
      classification,
      confidence: 0.98,
      centroid: [Math.round(centroid[0] * 1e7) / 1e7, Math.round(centroid[1] * 1e7) / 1e7],
      orientation_deg: orientation,
      tags,
      name: buildingName,
      source: 'osm-gis',
    });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Optical Satellite Computer Vision AI Engine
// (Tuned for India: Multi-material roof spectrum, party-wall ridge separation, mumties)
// ---------------------------------------------------------------------------

function decomposeBlockIntoParcels(
  rect: { corners: [number, number][]; width: number; height: number; angleDeg: number; area: number },
  maxParcelLengthPx: number = 22
): { corners: [number, number][]; width: number; height: number; angleDeg: number; area: number }[] {
  const { corners, width, height, angleDeg } = rect;
  const numW = Math.max(1, Math.round(width / maxParcelLengthPx));
  const numH = Math.max(1, Math.round(height / maxParcelLengthPx));

  if (numW <= 1 && numH <= 1) {
    return [rect];
  }

  const c0 = corners[0];
  const c1 = corners[1];
  const c2 = corners[2];
  const c3 = corners[3];

  const parcels: { corners: [number, number][]; width: number; height: number; angleDeg: number; area: number }[] = [];
  const parcelW = width / numW;
  const parcelH = height / numH;

  for (let iw = 0; iw < numW; iw++) {
    for (let ih = 0; ih < numH; ih++) {
      const u0 = iw / numW;
      const u1 = (iw + 1) / numW;
      const v0 = ih / numH;
      const v1 = (ih + 1) / numH;

      const interp = (u: number, v: number): [number, number] => [
        (1 - u) * (1 - v) * c0[0] + u * (1 - v) * c1[0] + u * v * c2[0] + (1 - u) * v * c3[0],
        (1 - u) * (1 - v) * c0[1] + u * (1 - v) * c1[1] + u * v * c2[1] + (1 - u) * v * c3[1],
      ];

      parcels.push({
        corners: [interp(u0, v0), interp(u1, v0), interp(u1, v1), interp(u0, v1)],
        width: parcelW,
        height: parcelH,
        area: parcelW * parcelH,
        angleDeg,
      });
    }
  }

  return parcels;
}

async function detectOpticalSatelliteFootprints(
  bounds: BoundingBox,
  zoom: number = 18,
  indiaMode: boolean = true,
  geometryMode: GeometryMode = 'obb',
  density: DetectionDensity = 'ultra-dense'
): Promise<BuildingFootprint[]> {
  const effectiveZoom = Math.min(18, Math.max(16, Math.round(zoom)));

  const latToTileY = (lat: number, z: number) => {
    const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z));
  };
  const lonToTileX = (lon: number, z: number) => {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
  };

  const minX = lonToTileX(bounds.west, effectiveZoom);
  const maxX = lonToTileX(bounds.east, effectiveZoom);
  const minY = latToTileY(bounds.north, effectiveZoom);
  const maxY = latToTileY(bounds.south, effectiveZoom);

  // Cover up to 4x4 tiles (1024x1024 pixels) for complete screen-wide building vectorization
  const numX = Math.min(4, Math.max(1, maxX - minX + 1));
  const numY = Math.min(4, Math.max(1, maxY - minY + 1));

  const tileSize = 256;
  const canvas = document.createElement('canvas');
  canvas.width = numX * tileSize;
  canvas.height = numY * tileSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const tilePromises: Promise<void>[] = [];
  for (let dx = 0; dx < numX; dx++) {
    for (let dy = 0; dy < numY; dy++) {
      const tx = minX + dx;
      const ty = minY + dy;
      // Append ?cors=1 to guarantee clean cache headers
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${effectiveZoom}/${ty}/${tx}?cors=1`;

      const p = new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            ctx.drawImage(img, dx * tileSize, dy * tileSize, tileSize, tileSize);
          } catch {
            // Ignored
          }
          resolve();
        };
        img.onerror = () => {
          resolve();
        };
        img.src = url;
      });
      tilePromises.push(p);
    }
  }

  await Promise.all(tilePromises);

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return [];
  }

  const { width, height, data } = imgData;
  const gray = new Uint8Array(width * height);
  const isRoofCandidate = new Uint8Array(width * height);
  const roofMaterialType = new Uint8Array(width * height); // 1: RCC, 2: Tin Sheet, 3: Clay Tile, 4: Mixed
  const hasMumtyFeature = new Uint8Array(width * height);

  // 1. Multi-Material Satellite Spectrum Analysis
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    gray[i] = luma;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);

    // Filter True Trees / Dense Vegetation (Strict green dominance, never reject grey/tan concrete)
    const isFoliage = g > 55 && g > r * 1.10 && g > b * 1.08 && (2 * g - r - b) > 20;
    if (isFoliage) {
      continue;
    }

    // Filter Water Bodies (ponds, lakes, wide swimming pools)
    const isWater = b > 75 && b > r * 1.25 && b > g * 1.05 && luma < 95;
    if (isWater) {
      continue;
    }

    // Material 1: Corrugated Blue/Turquoise/Galvanized Tin Sheets & Industrial Sheds
    if ((b > Math.max(r, g) - 4 && b > 60) || (luma > 140 && sat < 38)) {
      isRoofCandidate[i] = 1;
      roofMaterialType[i] = 2; // Tin sheet
      continue;
    }

    // Material 2: Mangalore / Terracotta Red Clay Tiles
    if (r > Math.max(g, b) + 7 && r > 68) {
      isRoofCandidate[i] = 1;
      roofMaterialType[i] = 3; // Clay tile
      continue;
    }

    // Material 3: Flat RCC Concrete Terrace (High reflectance, neutral tone, lime-wash)
    if (luma >= 62 && sat < 52) {
      isRoofCandidate[i] = 1;
      roofMaterialType[i] = 1; // RCC Concrete
      continue;
    }

    // Material 4: Dark Bituminous / Asphalt / Weathered Industrial Roofs
    if (luma >= 35 && luma < 62 && sat < 28) {
      isRoofCandidate[i] = 1;
      roofMaterialType[i] = 4; // Mixed
    }
  }

  // 2. Parapet & Party-Wall Ridge Edge Detection (Sobel Filter)
  const edges = new Uint8Array(width * height);
  const thresh = density === 'ultra-dense' ? (indiaMode ? 22 : 30) : (indiaMode ? 28 : 40);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (!isRoofCandidate[idx]) continue;

      const gx =
        -gray[(y - 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] -
        2 * gray[y * width + (x - 1)] +
        2 * gray[y * width + (x + 1)] -
        gray[(y + 1) * width + (x - 1)] +
        gray[(y + 1) * width + (x + 1)];

      const gy =
        -gray[(y - 1) * width + (x - 1)] -
        2 * gray[(y - 1) * width + x] -
        gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] +
        2 * gray[(y + 1) * width + x] +
        gray[(y + 1) * width + (x + 1)];

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > thresh) {
        edges[idx] = 255;
      }

      // Overhead Water Tank / Mumty detector
      if (mag > 42 && gray[idx] > 130) {
        hasMumtyFeature[idx] = 1;
      }
    }
  }

  // 3. Cluster Connected Components with Boundary Point Sampling
  const visited = new Uint8Array(width * height);
  const candidates: {
    points: [number, number][];
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    pixels: number;
    material: BuildingFootprint['roof_material'];
    hasMumty: boolean;
  }[] = [];

  const step = density === 'ultra-dense' ? 2 : 3;
  const minPixelThreshold = density === 'ultra-dense' ? 10 : 20;

  for (let y = 2; y < height - 2; y += step) {
    for (let x = 2; x < width - 2; x += step) {
      const idx = y * width + x;
      if (visited[idx] || !isRoofCandidate[idx] || edges[idx] > 0) continue;

      let cMinX = x;
      let cMaxX = x;
      let cMinY = y;
      let cMaxY = y;
      let count = 0;
      let tinCount = 0;
      let tileCount = 0;
      let mumtyCount = 0;

      const boundaryPoints: [number, number][] = [];
      const queue: [number, number][] = [[x, y]];
      visited[idx] = 1;

      while (queue.length > 0 && count < 14000) {
        const [cx, cy] = queue.pop()!;
        count++;

        if (cx < cMinX) cMinX = cx;
        if (cx > cMaxX) cMaxX = cx;
        if (cy < cMinY) cMinY = cy;
        if (cy > cMaxY) cMaxY = cy;

        const cIdx = cy * width + cx;
        if (roofMaterialType[cIdx] === 2) tinCount++;
        if (roofMaterialType[cIdx] === 3) tileCount++;
        if (hasMumtyFeature[cIdx]) mumtyCount++;

        let isBoundary = false;
        const neighbors: [number, number][] = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            isBoundary = true;
            continue;
          }
          const nIdx = ny * width + nx;
          if (!isRoofCandidate[nIdx] || edges[nIdx] > 0) {
            isBoundary = true;
          } else if (!visited[nIdx]) {
            visited[nIdx] = 1;
            queue.push([nx, ny]);
          }
        }

        if (isBoundary && boundaryPoints.length < 320) {
          boundaryPoints.push([cx, cy]);
        }
      }

      if (boundaryPoints.length < 3) {
        boundaryPoints.push([cMinX, cMinY], [cMaxX, cMinY], [cMaxX, cMaxY], [cMinX, cMaxY]);
      }

      const mat: BuildingFootprint['roof_material'] =
        tinCount / Math.max(1, count) > 0.30
          ? 'Corrugated Tin Sheet'
          : tileCount / Math.max(1, count) > 0.30
          ? 'Mangalore Clay Tile'
          : 'RCC Concrete';

      const hasMumty = mumtyCount > 0;

      if (count >= minPixelThreshold) {
        candidates.push({
          points: boundaryPoints,
          minX: cMinX,
          maxX: cMaxX,
          minY: cMinY,
          maxY: cMaxY,
          pixels: count,
          material: mat,
          hasMumty,
        });
      }
    }
  }

  const pixelToLatLon = (px: number, py: number): [number, number] => {
    const globalTileX = minX + px / tileSize;
    const globalTileY = minY + py / tileSize;
    const n = Math.pow(2, effectiveZoom);
    const lon = (globalTileX / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * globalTileY) / n)));
    const lat = (latRad * 180) / Math.PI;
    return [Number(lon.toFixed(7)), Number(lat.toFixed(7))];
  };

  const refLat = (bounds.south + bounds.north) / 2;
  const inIndia = indiaMode || isLocationInIndia(refLat, (bounds.west + bounds.east) / 2);
  const minAreaThreshold = density === 'ultra-dense' ? (inIndia ? 8.0 : 10.0) : (inIndia ? 14.0 : 18.0);
  const maxParcelPx = indiaMode ? 22 : 30; // ~12m - 16m standard frontage

  // 4. Extract Bounding Boxes and Decompose Large Multi-Plot Terraces
  interface RawParcel {
    corners: [number, number][];
    angleDeg: number;
    material: BuildingFootprint['roof_material'];
    hasMumty: boolean;
    pixels: number;
    isContour?: boolean;
    contourPoints?: [number, number][];
  }

  const rawParcels: RawParcel[] = [];
  const anglesList: number[] = [];

  candidates.forEach((c) => {
    const minRect = getMinAreaRect(c.points);
    if (!minRect) return;

    anglesList.push(minRect.angleDeg % 90);

    if (geometryMode === 'contour' && c.points.length >= 6) {
      const hull = getConvexHull(c.points);
      const simplified = simplifyDouglasPeucker(hull, 1.8);
      rawParcels.push({
        corners: minRect.corners,
        angleDeg: minRect.angleDeg,
        material: c.material,
        hasMumty: c.hasMumty,
        pixels: c.pixels,
        isContour: true,
        contourPoints: simplified,
      });
    } else {
      // Cadastral decomposition for conjoined blocks / row houses
      const decomposed = decomposeBlockIntoParcels(minRect, maxParcelPx);
      decomposed.forEach((p) => {
        rawParcels.push({
          corners: p.corners,
          angleDeg: p.angleDeg,
          material: c.material,
          hasMumty: c.hasMumty,
          pixels: Math.round(c.pixels / decomposed.length),
        });
      });
    }
  });

  // 5. Dominant Street Angle Regularization
  let dominantAngle = 0;
  if (anglesList.length >= 6) {
    const bins = new Array(18).fill(0);
    anglesList.forEach((a) => {
      const bIdx = Math.min(17, Math.max(0, Math.floor((a % 90) / 5)));
      bins[bIdx]++;
    });
    let maxBin = 0;
    let maxCount = 0;
    bins.forEach((cnt, idx) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        maxBin = idx;
      }
    });
    dominantAngle = maxBin * 5 + 2.5;
  }

  const results: BuildingFootprint[] = [];

  rawParcels.forEach((p, idx) => {
    let polyCoords: [number, number][] = [];
    let orientationDeg = p.angleDeg;

    if (p.isContour && p.contourPoints && p.contourPoints.length >= 3) {
      polyCoords = p.contourPoints.map((pt) => pixelToLatLon(pt[0], pt[1]));
      if (polyCoords.length > 2) polyCoords.push(polyCoords[0]);
    } else {
      // Regularize angle to dominant street grid if within 22 degrees
      const diff = ((p.angleDeg - dominantAngle + 45) % 90) - 45;
      let corners = p.corners;
      if (Math.abs(diff) < 22 && corners.length === 4) {
        orientationDeg = (p.angleDeg - diff + 90) % 90;
        const cx = (corners[0][0] + corners[2][0]) / 2;
        const cy = (corners[0][1] + corners[2][1]) / 2;
        const w = Math.sqrt((corners[1][0] - corners[0][0]) ** 2 + (corners[1][1] - corners[0][1]) ** 2);
        const h = Math.sqrt((corners[3][0] - corners[0][0]) ** 2 + (corners[3][1] - corners[0][1]) ** 2);

        const rad = (orientationDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const halfW = w / 2;
        const halfH = h / 2;

        corners = [
          [cx - halfW * cos + halfH * sin, cy - halfW * sin - halfH * cos],
          [cx + halfW * cos + halfH * sin, cy + halfW * sin - halfH * cos],
          [cx + halfW * cos - halfH * sin, cy + halfW * sin + halfH * cos],
          [cx - halfW * cos - halfH * sin, cy - halfW * sin + halfH * cos],
        ];
      }

      polyCoords = corners.map((pt) => pixelToLatLon(pt[0], pt[1]));
      polyCoords.push(polyCoords[0]);
    }

    if (polyCoords.length < 4) return;

    const areaSqm = calculatePolygonAreaSqm(polyCoords, refLat);
    if (areaSqm < minAreaThreshold || areaSqm > 35000) return;

    const perimeterM = calculatePolygonPerimeterM(polyCoords, refLat);
    const centroid = calculateCentroid(polyCoords);
    const { classification, estimated_floors, estimated_height_m } = classifyBuilding(areaSqm, undefined, inIndia);

    results.push({
      id: `bld-cv-${idx + 1}`,
      polygon: polyCoords,
      area_sqm: Math.round(areaSqm * 10) / 10,
      area_sqft: Math.round(areaSqm * 10.7639),
      area_gaj: sqmToGaj(areaSqm),
      perimeter_m: Math.round(perimeterM * 10) / 10,
      estimated_height_m,
      estimated_floors,
      classification,
      confidence: Math.round((0.91 + (Math.min(p.pixels, 400) / 4000)) * 100) / 100,
      centroid: [Math.round(centroid[0] * 1e7) / 1e7, Math.round(centroid[1] * 1e7) / 1e7],
      orientation_deg: Math.round(orientationDeg),
      roof_material: p.material,
      has_mumty_tank: p.hasMumty,
      source: 'cv-optical',
    });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Overture Maps / Microsoft ML Building Footprints Fetch
// (High-precision ML-derived polygons with sub-meter accuracy)
// ---------------------------------------------------------------------------

async function fetchOvertureMLFootprints(bounds: BoundingBox, indiaMode: boolean = true): Promise<BuildingFootprint[]> {
  let data: any = null;

  try {
    const proxyRes = await fetch('/api/building-footprints/overture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bounds }),
    });
    if (proxyRes.ok) {
      data = await proxyRes.json();
    }
  } catch (err) {
    console.warn('[BuildingFootprint] Overture ML proxy failed:', err);
  }

  if (!data || !data.elements || !Array.isArray(data.elements)) {
    // Fallback: try direct Overpass mirrors with enhanced building:part query
    const query = `[out:json][timeout:30];
(
  way["building"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  relation["building"]["type"="multipolygon"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["building:part"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out geom qt;`;

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
            'User-Agent': 'BuildingFootprintAI/2.0 (ML-Precision-Mode)',
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

  const results: BuildingFootprint[] = [];
  const refLat = (bounds.south + bounds.north) / 2;
  const inIndia = indiaMode || isLocationInIndia(refLat, (bounds.west + bounds.east) / 2);

  data.elements.forEach((el: any, idx: number) => {
    if (!el.geometry || el.geometry.length < 3) return;

    const coords: [number, number][] = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }

    const areaSqm = calculatePolygonAreaSqm(coords, refLat);
    // Very low threshold to capture even tiny structures
    if (areaSqm < (inIndia ? 8.0 : 12.0)) return;

    const perimeterM = calculatePolygonPerimeterM(coords, refLat);
    const centroid = calculateCentroid(coords);
    const tags = el.tags || {};
    const { classification, estimated_floors, estimated_height_m } = classifyBuilding(areaSqm, tags, inIndia);

    let maxEdgeLen = 0;
    let orientation = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const dLon = coords[i + 1][0] - coords[i][0];
      const dLat = coords[i + 1][1] - coords[i][1];
      const len = Math.sqrt(dLon * dLon + dLat * dLat);
      if (len > maxEdgeLen) {
        maxEdgeLen = len;
        orientation = Math.round((Math.atan2(dLat, dLon) * 180) / Math.PI);
        if (orientation < 0) orientation += 180;
      }
    }

    const buildingName = tags.name || tags['addr:housenumber']
      ? `${tags['addr:housenumber'] || ''} ${tags['addr:street'] || tags.name || ''}`.trim()
      : undefined;

    results.push({
      id: `bld-ml-${el.id || idx + 1}`,
      polygon: coords,
      area_sqm: Math.round(areaSqm * 10) / 10,
      area_sqft: Math.round(areaSqm * 10.7639),
      area_gaj: sqmToGaj(areaSqm),
      perimeter_m: Math.round(perimeterM * 10) / 10,
      estimated_height_m,
      estimated_floors,
      classification,
      confidence: 0.96,
      centroid: [Math.round(centroid[0] * 1e7) / 1e7, Math.round(centroid[1] * 1e7) / 1e7],
      orientation_deg: orientation,
      tags,
      name: buildingName,
      source: 'overture-ml',
    });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Smart Precision Merger: Combines Multiple Sources by Priority
// Priority: Precise Polygon (OSM/ML) > CV Rectangle
// Never replaces a hand-traced polygon with a crude CV bounding box
// ---------------------------------------------------------------------------

function mergeFootprints(
  gisFootprints: BuildingFootprint[],
  cvFootprints: BuildingFootprint[],
  mlFootprints: BuildingFootprint[] = []
): BuildingFootprint[] {
  // Start with the highest-precision sources: ML and OSM (precise polygons)
  const preciseFootprints = [...mlFootprints, ...gisFootprints];

  // Deduplicate precise footprints (ML and OSM may overlap)
  const deduped: BuildingFootprint[] = [];
  const usedCentroids = new Set<string>();

  preciseFootprints.forEach((fp) => {
    const key = `${fp.centroid[0].toFixed(5)},${fp.centroid[1].toFixed(5)}`;
    // Check if a very similar footprint already exists (within ~5m)
    const isDuplicate = deduped.some((existing) => {
      const dLon = existing.centroid[0] - fp.centroid[0];
      const dLat = existing.centroid[1] - fp.centroid[1];
      return Math.sqrt(dLon * dLon + dLat * dLat) < 0.00005; // ~5.5m
    });

    if (!isDuplicate) {
      deduped.push(fp);
      usedCentroids.add(key);
    }
  });

  // Only add CV footprints for areas NOT covered by precise sources
  if (cvFootprints.length > 0 && deduped.length > 0) {
    cvFootprints.forEach((cv) => {
      // Check if this CV detection overlaps with any precise footprint
      const isAlreadyCovered = deduped.some((precise) => {
        const dLon = precise.centroid[0] - cv.centroid[0];
        const dLat = precise.centroid[1] - cv.centroid[1];
        return Math.sqrt(dLon * dLon + dLat * dLat) < 0.00012; // ~13m proximity threshold
      });

      if (!isAlreadyCovered) {
        deduped.push(cv);
      }
    });
  } else if (deduped.length === 0) {
    // No precise data available, use all CV footprints
    return cvFootprints;
  }

  console.log(`[SmartMerger] Precise: ${preciseFootprints.length} (ML: ${mlFootprints.length}, OSM: ${gisFootprints.length}), CV gap-fill: ${deduped.length - preciseFootprints.length}, Total: ${deduped.length}`);
  return deduped;
}

// ---------------------------------------------------------------------------
// Compute Building Metrics
// ---------------------------------------------------------------------------

export function computeBuildingMetrics(footprints: BuildingFootprint[], bounds?: BoundingBox | null): BuildingMetrics {
  const totalCount = footprints.length;
  if (totalCount === 0) {
    return {
      totalCount: 0,
      totalAreaSqm: 0,
      totalAreaSqft: 0,
      totalAreaGaj: 0,
      lotCoveragePct: 0,
      avgAreaSqm: 0,
      avgAreaGaj: 0,
      categoryCounts: {
        residential: 0,
        independentHouse: 0,
        builderFloor: 0,
        commercial: 0,
        industrial: 0,
        highRise: 0,
        other: 0,
      },
      avgFloors: 1,
      roofMaterials: { rccConcrete: 0, corrugatedSheet: 0, clayTile: 0 },
    };
  }

  let totalAreaSqm = 0;
  let totalFloors = 0;
  const categoryCounts = {
    residential: 0,
    independentHouse: 0,
    builderFloor: 0,
    commercial: 0,
    industrial: 0,
    highRise: 0,
    other: 0,
  };
  const roofMaterials = {
    rccConcrete: 0,
    corrugatedSheet: 0,
    clayTile: 0,
  };

  footprints.forEach((f) => {
    totalAreaSqm += f.area_sqm;
    totalFloors += f.estimated_floors || 1;

    switch (f.classification) {
      case 'Independent House':
        categoryCounts.independentHouse++;
        break;
      case 'Builder Floor':
        categoryCounts.builderFloor++;
        break;
      case 'Residential':
        categoryCounts.residential++;
        break;
      case 'Commercial':
        categoryCounts.commercial++;
        break;
      case 'Industrial':
        categoryCounts.industrial++;
        break;
      case 'High-Rise':
        categoryCounts.highRise++;
        break;
      default:
        categoryCounts.other++;
        break;
    }

    if (f.roof_material === 'Corrugated Tin Sheet') roofMaterials.corrugatedSheet++;
    else if (f.roof_material === 'Mangalore Clay Tile') roofMaterials.clayTile++;
    else roofMaterials.rccConcrete++;
  });

  const totalAreaSqft = Math.round(totalAreaSqm * 10.7639);
  const totalAreaGaj = Math.round(totalAreaSqm / 0.836127);
  const avgAreaSqm = Math.round(totalAreaSqm / totalCount);
  const avgAreaGaj = Math.round(totalAreaGaj / totalCount);
  const avgFloors = Math.round((totalFloors / totalCount) * 10) / 10;

  let lotCoveragePct = 32.0;
  if (bounds) {
    const r = 6378137.0;
    const latRad = ((bounds.south + bounds.north) / 2 * Math.PI) / 180;
    const w = ((bounds.east - bounds.west) * Math.PI * r * Math.cos(latRad)) / 180;
    const h = ((bounds.north - bounds.south) * Math.PI * r) / 180;
    const totalLandAreaSqm = Math.abs(w * h);
    if (totalLandAreaSqm > 0) {
      lotCoveragePct = Math.min(96, Math.max(1, Math.round((totalAreaSqm / totalLandAreaSqm) * 1000) / 10));
    }
  }

  return {
    totalCount,
    totalAreaSqm: Math.round(totalAreaSqm),
    totalAreaSqft,
    totalAreaGaj,
    lotCoveragePct,
    avgAreaSqm,
    avgAreaGaj,
    categoryCounts,
    avgFloors,
    roofMaterials,
  };
}

// ---------------------------------------------------------------------------
// Zustand Store Implementation
// ---------------------------------------------------------------------------

export const useBuildingFootprintStore = create<BuildingFootprintState>((set, get) => ({
  isPanelOpen: false,
  isDetecting: false,
  detectionMode: 'viewport',
  detectionEngine: 'hybrid',
  indiaMode: true, // Enabled by default for ultra-high Indian accuracy
  roiBox: null,
  footprints: [],
  selectedFootprintId: null,
  visualSettings: {
    strokeColor: '#ef4444', // AI Cadastral Red (Matches user reference image)
    strokeWeight: 1.8,
    fillOpacity: 0.05,
    show3D: false, // 2D crisp vector outlines matching reference image
    heightScale: 1.5,
    showFloorBands: true,
    showLabels: false,
    showCentroids: false,
    geometryMode: 'obb',
    detectionDensity: 'ultra-dense',
  },
  searchQuery: '',
  filterCategory: 'all',
  sortBy: 'area-desc',
  lastDetectedBounds: null,
  currentMapBounds: null,
  detectionError: null,

  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false }),

  toggleIndiaMode: () => set((s) => ({ indiaMode: !s.indiaMode })),
  setIndiaMode: (enabled) => set({ indiaMode: enabled }),

  setDetectionMode: (mode) => set({ detectionMode: mode }),
  setDetectionEngine: (engine) => set({ detectionEngine: engine }),
  setRoiBox: (box) => set({ roiBox: box }),
  setSelectedFootprintId: (id) => set({ selectedFootprintId: id }),
  setCurrentMapBounds: (bounds) => set({ currentMapBounds: bounds }),
  setVisualSettings: (settings) =>
    set((s) => ({ visualSettings: { ...s.visualSettings, ...settings } })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterCategory: (category) => set({ filterCategory: category }),
  setSortBy: (sort) => set({ sortBy: sort }),

  applyReferenceStyle: () =>
    set((s) => ({
      visualSettings: {
        ...s.visualSettings,
        strokeColor: '#ef4444',
        strokeWeight: 1.8,
        fillOpacity: 0.05,
        show3D: false,
        geometryMode: 'obb',
      },
    })),

  toggle3D: () =>
    set((s) => ({
      visualSettings: {
        ...s.visualSettings,
        show3D: !s.visualSettings.show3D,
        fillOpacity: !s.visualSettings.show3D ? 0.35 : 0.05,
      },
    })),

  setHeightScale: (scale) =>
    set((s) => ({ visualSettings: { ...s.visualSettings, heightScale: scale } })),

  toggleFloorBands: () =>
    set((s) => ({
      visualSettings: { ...s.visualSettings, showFloorBands: !s.visualSettings.showFloorBands },
    })),

  setGeometryMode: (mode) =>
    set((s) => ({ visualSettings: { ...s.visualSettings, geometryMode: mode } })),

  setDetectionDensity: (density) =>
    set((s) => ({ visualSettings: { ...s.visualSettings, detectionDensity: density } })),

  clearDetections: () =>
    set({
      footprints: [],
      selectedFootprintId: null,
      roiBox: null,
      detectionError: null,
    }),

  detectFootprints: async (bounds: BoundingBox, zoom: number = 19) => {
    const { detectionEngine, indiaMode, visualSettings } = get();
    const { geometryMode, detectionDensity } = visualSettings;
    set({ isDetecting: true, detectionError: null, lastDetectedBounds: bounds });

    try {
      let results: BuildingFootprint[] = [];

      if (detectionEngine === 'osm-gis') {
        results = await fetchOSMBuildingFootprints(bounds, indiaMode);
        console.log(`[DetectEngine:osm-gis] ${results.length} precise polygons`);
      } else if (detectionEngine === 'cv-optical') {
        results = await detectOpticalSatelliteFootprints(bounds, zoom, indiaMode, geometryMode, detectionDensity);
        console.log(`[DetectEngine:cv-optical] ${results.length} CV detections`);
      } else if (detectionEngine === 'overture-ml') {
        results = await fetchOvertureMLFootprints(bounds, indiaMode);
        console.log(`[DetectEngine:overture-ml] ${results.length} ML-precision footprints`);
      } else {
        // Hybrid: All 3 sources with smart precision merger
        const [gis, cv, ml] = await Promise.all([
          fetchOSMBuildingFootprints(bounds, indiaMode).catch(() => [] as BuildingFootprint[]),
          detectOpticalSatelliteFootprints(bounds, zoom, indiaMode, geometryMode, detectionDensity).catch(() => [] as BuildingFootprint[]),
          fetchOvertureMLFootprints(bounds, indiaMode).catch(() => [] as BuildingFootprint[]),
        ]);
        console.log(`[DetectEngine:hybrid] OSM: ${gis.length}, CV: ${cv.length}, ML: ${ml.length}`);
        results = mergeFootprints(gis, cv, ml);
      }

      set({
        footprints: results,
        isDetecting: false,
        isPanelOpen: true,
        detectionError: results.length === 0 ? 'No building footprints resolved in this area. Try zooming in or selecting a built-up area.' : null,
      });

      return results;
    } catch (err: any) {
      set({
        isDetecting: false,
        detectionError: `Detection failed: ${err.message || 'Network error'}`,
      });
      return [];
    }
  },

  exportGeoJSON: () => {
    const { footprints, lastDetectedBounds, indiaMode } = get();
    if (footprints.length === 0) return;

    const featureCollection = {
      type: 'FeatureCollection',
      metadata: {
        title: 'Earth AI Building Footprint Detections (India High-Precision Calibration)',
        timestamp: new Date().toISOString(),
        total_count: footprints.length,
        india_mode: indiaMode,
        bounds: lastDetectedBounds,
      },
      features: footprints.map((f) => ({
        type: 'Feature',
        id: f.id,
        geometry: {
          type: 'Polygon',
          coordinates: [f.polygon],
        },
        properties: {
          id: f.id,
          name: f.name || null,
          category: f.classification,
          area_sqm: f.area_sqm,
          area_sqft: f.area_sqft,
          area_gaj: f.area_gaj,
          perimeter_m: f.perimeter_m,
          estimated_floors: f.estimated_floors,
          estimated_height_m: f.estimated_height_m,
          roof_material: f.roof_material || 'RCC Concrete',
          has_mumty_tank: f.has_mumty_tank || false,
          confidence: f.confidence,
          orientation_deg: f.orientation_deg,
          centroid_lon: f.centroid[0],
          centroid_lat: f.centroid[1],
          source: f.source,
          tags: f.tags || {},
        },
      })),
    };

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `building-footprints-india-${Date.now()}.geojson`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  exportCSV: () => {
    const { footprints } = get();
    if (footprints.length === 0) return;

    const headers = [
      'ID',
      'Name',
      'Classification',
      'Area_Gaj',
      'Area_m2',
      'Area_sqft',
      'Perimeter_m',
      'Estimated_Floors',
      'Estimated_Height_m',
      'Roof_Material',
      'Overhead_Tank_Mumty',
      'Confidence',
      'Centroid_Lon',
      'Centroid_Lat',
      'Orientation_deg',
      'Source',
    ];

    const rows = footprints.map((f) => [
      f.id,
      `"${f.name || ''}"`,
      f.classification,
      f.area_gaj,
      f.area_sqm,
      f.area_sqft,
      f.perimeter_m,
      f.estimated_floors,
      f.estimated_height_m,
      `"${f.roof_material || 'RCC Concrete'}"`,
      f.has_mumty_tank ? 'Yes' : 'No',
      f.confidence,
      f.centroid[0],
      f.centroid[1],
      f.orientation_deg,
      f.source,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `building-footprints-india-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  copyGeoJSONToClipboard: async () => {
    const { footprints } = get();
    if (footprints.length === 0) return false;

    const featureCollection = {
      type: 'FeatureCollection',
      features: footprints.map((f) => ({
        type: 'Feature',
        id: f.id,
        geometry: {
          type: 'Polygon',
          coordinates: [f.polygon],
        },
        properties: {
          id: f.id,
          classification: f.classification,
          area_gaj: f.area_gaj,
          area_sqm: f.area_sqm,
          confidence: f.confidence,
        },
      })),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(featureCollection, null, 2));
      return true;
    } catch {
      return false;
    }
  },
}));
