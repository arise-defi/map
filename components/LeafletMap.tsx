import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEarthAIStore } from '../lib/earth-ai';
import { useBuildingFootprintStore } from '../lib/building-footprint';
import { useRoadFootprintStore, ROAD_CLASSIFICATION_STYLES, ROAD_SURFACE_STYLES } from '../lib/road-footprint';
import { useCustomDataStore } from '../lib/custom-data';
import { useGISToolsStore } from './QGISToolsPanel';

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
  const aiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const aiMaskOverlayRef = useRef<L.ImageOverlay | null>(null);
  const aiBoundsRectRef = useRef<L.Rectangle | null>(null);
  const bldLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const roadLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const customDataLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const gisToolsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const roiRectRef = useRef<L.Rectangle | null>(null);
  const prevTifOnlyRef = useRef<boolean>(false);

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

    // Respect "TIF Only" mode on first paint (basemap fully hidden)
    if (useCustomDataStore.getState().tifOnlyMode) {
      layer.setOpacity(0);
      if (labelsLayerRef.current) labelsLayerRef.current.setOpacity(0);
      map.getContainer().style.background = '#0b0d10';
    }

    const markerGroup = L.layerGroup().addTo(map);
    markerLayerGroupRef.current = markerGroup;

    const aiGroup = L.layerGroup().addTo(map);
    aiLayerGroupRef.current = aiGroup;

    const bldGroup = L.layerGroup().addTo(map);
    bldLayerGroupRef.current = bldGroup;

    const roadGroup = L.layerGroup().addTo(map);
    roadLayerGroupRef.current = roadGroup;

    const customDataGroup = L.layerGroup().addTo(map);
    customDataLayerGroupRef.current = customDataGroup;

    const gisGroup = L.layerGroup().addTo(map);
    gisToolsLayerGroupRef.current = gisGroup;

    map.on('click', (e) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }

      // Point & Tap mode for AI Building Footprint extraction
      const { detectionMode: bldMode, detectFootprints: detectBld } = useBuildingFootprintStore.getState();
      if (bldMode === 'point-tap') {
        const span = 0.0008;
        const b = {
          south: e.latlng.lat - span / 2,
          north: e.latlng.lat + span / 2,
          west: e.latlng.lng - span * 0.7,
          east: e.latlng.lng + span * 0.7,
        };
        detectBld(b, map.getZoom());
        return;
      }

      const { clickToScan, analyzeTile } = useEarthAIStore.getState();
      if (clickToScan) {
        analyzeTile(e.latlng.lat, e.latlng.lng, map.getZoom());
      }

      // GIS Tools interactions
      const gis = useGISToolsStore.getState();
      if (gis.activeTool === 'measure-distance' || gis.activeTool === 'measure-area') {
        gis.addMeasurePoint({ lat: e.latlng.lat, lng: e.latlng.lng });
      } else if (gis.activeTool === 'identify') {
        // Find nearest custom data feature
        const { layers } = useCustomDataStore.getState();
        let nearest: any = null;
        let minDist = Infinity;
        layers.forEach(layer => {
          if (!layer.visible) return;
          layer.features.forEach(feat => {
            if (feat.center) {
              const d = Math.sqrt((feat.center[0] - e.latlng.lng) ** 2 + (feat.center[1] - e.latlng.lat) ** 2);
              if (d < minDist) { minDist = d; nearest = feat; }
            }
          });
        });
        if (nearest && minDist < 0.01) {
          gis.setIdentifyResult({
            Name: nearest.properties?.name || nearest.id,
            Type: nearest.properties?.classification || nearest.type,
            'Area (m²)': nearest.area_sqm?.toFixed(1) || '-',
            Floors: nearest.estimated_floors || '-',
            'Height (m)': nearest.estimated_height_m || '-',
            Source: nearest.properties?.source || '-',
            Confidence: nearest.properties?.confidence || '-',
            Lat: e.latlng.lat.toFixed(6),
            Lng: e.latlng.lng.toFixed(6),
          });
        } else {
          gis.setIdentifyResult({ Lat: e.latlng.lat.toFixed(6), Lng: e.latlng.lng.toFixed(6), Info: 'No feature at this location' });
        }
      } else if (gis.activeTool === 'draw-point') {
        gis.addDrawnFeature({
          id: `draw-${Date.now()}`, type: 'Point',
          coordinates: [[e.latlng.lng, e.latlng.lat]],
          color: '#3b82f6', label: `Point ${gis.drawnFeatures.length + 1}`,
        });
      }
    });

    const syncMapBounds = () => {
      try {
        const b = map.getBounds();
        useBuildingFootprintStore.getState().setCurrentMapBounds({
          south: b.getSouth(),
          north: b.getNorth(),
          west: b.getWest(),
          east: b.getEast(),
        });
      } catch {
        // Map bounds not ready yet
      }
    };

    map.on('moveend', () => {
      syncMapBounds();
      if (onMoveEnd) {
        const c = map.getCenter();
        onMoveEnd([c.lat, c.lng], map.getZoom());
      }
    });

    // GIS coordinate tracking
    map.on('mousemove', (e) => {
      useGISToolsStore.getState().setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapInstanceRef.current = map;

    // Fix potential container sizing glitch and sync initial bounds
    const timer = setTimeout(() => {
      map.invalidateSize();
      syncMapBounds();
    }, 200);

    return () => {
      clearTimeout(timer);
      if (labelsLayerRef.current) {
        map.removeLayer(labelsLayerRef.current);
        labelsLayerRef.current = null;
      }
      if (aiMaskOverlayRef.current) {
        map.removeLayer(aiMaskOverlayRef.current);
        aiMaskOverlayRef.current = null;
      }
      if (aiBoundsRectRef.current) {
        map.removeLayer(aiBoundsRectRef.current);
        aiBoundsRectRef.current = null;
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

    // Keep the basemap hidden while "TIF Only" mode is active
    if (useCustomDataStore.getState().tifOnlyMode) {
      newLayer.setOpacity(0);
    }
  }, [tileLayer]);

  // Update labels overlay when showLabels or tileLayer changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const shouldShow = showLabels && tileLayer !== 'satellite-pure';
    const tifOnly = useCustomDataStore.getState().tifOnlyMode;

    if (shouldShow) {
      if (!labelsLayerRef.current) {
        labelsLayerRef.current = L.tileLayer(LABELS_OVERLAY_URL, {
          attribution: 'Labels &copy; Esri Reference',
          maxNativeZoom: 18,
          maxZoom: 22,
          zIndex: 5,
        }).addTo(map);
      }
      labelsLayerRef.current.setOpacity(tifOnly ? 0 : 1);
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

    if (distLat > 0.00005 || distLng > 0.00005 || zoomDiff > 0) {
      map.setView(center, zoom);
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

  // Subscribe to Earth AI store for rendering AI land masks, tile bounds, and home polygons
  const { currentResult, activeLayers, selectedHomeId, setSelectedHomeId } = useEarthAIStore();

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // 1. Render Tile Bounding Box
    if (activeLayers.tileBounds && currentResult?.tile?.bounds) {
      const b = currentResult.tile.bounds;
      const boundsLatLng: L.LatLngBoundsExpression = [
        [b.south, b.west],
        [b.north, b.east],
      ];

      if (aiBoundsRectRef.current) {
        aiBoundsRectRef.current.setBounds(boundsLatLng);
      } else {
        aiBoundsRectRef.current = L.rectangle(boundsLatLng, {
          color: '#00f0ff',
          weight: 2,
          dashArray: '6, 4',
          fillColor: '#00f0ff',
          fillOpacity: 0.04,
          interactive: false,
        }).addTo(map);
      }
    } else {
      if (aiBoundsRectRef.current) {
        map.removeLayer(aiBoundsRectRef.current);
        aiBoundsRectRef.current = null;
      }
    }

    // 2. Render SegFormer Semantic Segmentation Mask ImageOverlay
    if (activeLayers.mask && currentResult?.mask_image && currentResult?.tile?.bounds) {
      const b = currentResult.tile.bounds;
      const boundsLatLng: L.LatLngBoundsExpression = [
        [b.south, b.west],
        [b.north, b.east],
      ];

      if (aiMaskOverlayRef.current) {
        map.removeLayer(aiMaskOverlayRef.current);
      }

      aiMaskOverlayRef.current = L.imageOverlay(currentResult.mask_image, boundsLatLng, {
        opacity: activeLayers.maskOpacity,
        zIndex: 6,
        interactive: false,
      }).addTo(map);
    } else {
      if (aiMaskOverlayRef.current) {
        map.removeLayer(aiMaskOverlayRef.current);
        aiMaskOverlayRef.current = null;
      }
    }

    // 3. Render AI Vector Features (Buildings, Roads, Vehicles)
    if (!aiLayerGroupRef.current) return;
    const aiGroup = aiLayerGroupRef.current;
    aiGroup.clearLayers();

    if (currentResult?.geojson?.features) {
      const geoJsonLayer = L.geoJSON(currentResult.geojson, {
        filter: (feature) => {
          const cat = feature?.properties?.category;
          const id = feature?.properties?.id || '';

          if (cat === 'building' || id.startsWith('building') || id.startsWith('yolo')) {
            return !!activeLayers.homes;
          }
          if (cat === 'road' || id.startsWith('road')) {
            return !!activeLayers.roads;
          }
          if (cat === 'vehicle' || id.startsWith('veh') || id.startsWith('opt-veh')) {
            return !!activeLayers.vehicles;
          }
          return !!activeLayers.homes;
        },
        pointToLayer: (feature, latlng) => {
          const cat = feature?.properties?.category;
          if (cat === 'vehicle') {
            return L.circleMarker(latlng, {
              radius: 5,
              fillColor: '#06b6d4',
              color: '#ffffff',
              weight: 1.5,
              fillOpacity: 0.95,
            });
          }
          return L.circleMarker(latlng, {
            radius: 4,
            fillColor: '#e60000',
            color: '#ffffff',
            weight: 1,
            fillOpacity: 0.8,
          });
        },
        style: (feature) => {
          const props = feature?.properties || {};
          const cat = props.category;
          const isSelected = props.id === selectedHomeId;

          if (cat === 'road') {
            return {
              color: '#f59e0b',
              weight: 2,
              fillColor: '#f59e0b',
              fillOpacity: 0.20,
              dashArray: '4, 2',
            };
          }

          if (cat === 'vehicle') {
            return {
              color: '#06b6d4',
              weight: 1.5,
              fillColor: '#06b6d4',
              fillOpacity: 0.70,
            };
          }

          // Default: Building footprint
          return {
            color: isSelected ? '#ffd700' : '#e60000',
            weight: isSelected ? 3 : 1.5,
            fillColor: isSelected ? '#ffd700' : '#e60000',
            fillOpacity: isSelected ? 0.35 : 0.08,
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          const cat = props.category || 'building';

          if (cat === 'road') {
            layer.bindTooltip(
              `
              <div style="font-family: inherit; font-size: 11px; padding: 2px;">
                <strong style="color: #f59e0b;">🛣️ ${props.name || 'Road Corridor'}</strong><br/>
                <span>Area: <strong>${props.area_sqm ? props.area_sqm.toLocaleString() : 0} m²</strong></span>
              </div>
              `,
              { sticky: true, className: 'earth-ai-tooltip' }
            );
          } else if (cat === 'vehicle') {
            layer.bindTooltip(
              `
              <div style="font-family: inherit; font-size: 11px; padding: 2px;">
                <strong style="color: #06b6d4;">🚗 Vehicle: ${props.subcategory?.toUpperCase() || 'Car'}</strong><br/>
                <span>Conf: <strong>${Math.round((props.confidence || 0.9) * 100)}%</strong></span>
              </div>
              `,
              { sticky: true, className: 'earth-ai-tooltip' }
            );
          } else {
            layer.bindTooltip(
              `
              <div style="font-family: inherit; font-size: 11px; padding: 2px;">
                <strong style="color: #ff0055;">🏠 ${props.id || 'Building'}</strong><br/>
                ${props.subcategory ? `<span>Type: <strong>${props.subcategory}</strong></span><br/>` : ''}
                <span>Area: <strong>${props.area_sqm || 0} m²</strong></span><br/>
                <span>Conf: <strong>${Math.round((props.confidence || 0) * 100)}%</strong></span>
              </div>
              `,
              { sticky: true, className: 'earth-ai-tooltip' }
            );
          }

          layer.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            setSelectedHomeId(props.id);
          });
        },
      });

      geoJsonLayer.addTo(aiGroup);
    }
  }, [currentResult, activeLayers, selectedHomeId, setSelectedHomeId]);

  // ---------------------------------------------------------------------------
  // AI Building Footprints Integration
  // ---------------------------------------------------------------------------
  const {
    footprints: bldFootprints,
    selectedFootprintId: bldSelectedId,
    selectedStoryIndex: bldSelectedStory,
    setSelectedFootprintId: setBldSelectedId,
    setSelectedStoryIndex: setBldSelectedStory,
    visualSettings: bldVisual,
    detectionMode: bldDetectionMode,
    setRoiBox,
    detectFootprints: runDetectFootprints,
  } = useBuildingFootprintStore();

  // ROI Box Interactive Drawing Mode
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const container = mapContainerRef.current;

    if (bldDetectionMode === 'roi-box') {
      if (container) container.style.cursor = 'crosshair';
      map.dragging.disable();

      let isDrawing = false;
      let startPoint: L.LatLng | null = null;

      const onMouseDown = (e: L.LeafletMouseEvent) => {
        isDrawing = true;
        startPoint = e.latlng;

        if (roiRectRef.current) {
          map.removeLayer(roiRectRef.current);
          roiRectRef.current = null;
        }

        roiRectRef.current = L.rectangle(L.latLngBounds(startPoint, startPoint), {
          color: '#00f0ff',
          weight: 2,
          dashArray: '6, 6',
          fillColor: '#00f0ff',
          fillOpacity: 0.15,
          interactive: false,
        }).addTo(map);
      };

      const onMouseMove = (e: L.LeafletMouseEvent) => {
        if (!isDrawing || !startPoint || !roiRectRef.current) return;
        const bounds = L.latLngBounds(startPoint, e.latlng);
        roiRectRef.current.setBounds(bounds);
      };

      const onMouseUp = (e: L.LeafletMouseEvent) => {
        if (!isDrawing || !startPoint) return;
        isDrawing = false;

        const endPoint = e.latlng;
        const south = Math.min(startPoint.lat, endPoint.lat);
        const north = Math.max(startPoint.lat, endPoint.lat);
        const west = Math.min(startPoint.lng, endPoint.lng);
        const east = Math.max(startPoint.lng, endPoint.lng);

        if (Math.abs(north - south) > 0.0001 && Math.abs(east - west) > 0.0001) {
          const box = { south, west, north, east };
          setRoiBox(box);
          runDetectFootprints(box, map.getZoom());
        }

        map.dragging.enable();
        if (container) container.style.cursor = '';
      };

      map.on('mousedown', onMouseDown);
      map.on('mousemove', onMouseMove);
      map.on('mouseup', onMouseUp);

      return () => {
        map.off('mousedown', onMouseDown);
        map.off('mousemove', onMouseMove);
        map.off('mouseup', onMouseUp);
        map.dragging.enable();
        if (container) container.style.cursor = '';
      };
    } else {
      if (container) container.style.cursor = '';
      map.dragging.enable();
      if (roiRectRef.current && !bldFootprints.length) {
        map.removeLayer(roiRectRef.current);
        roiRectRef.current = null;
      }
    }
  }, [bldDetectionMode, setRoiBox, runDetectFootprints, bldFootprints.length]);

  // Render Building Footprints (2D & 3D Extrusion)
  useEffect(() => {
    if (!mapInstanceRef.current || !bldLayerGroupRef.current) return;
    const group = bldLayerGroupRef.current;
    group.clearLayers();

    if (!bldFootprints || bldFootprints.length === 0) return;

    const strokeCol = bldVisual.strokeColor || '#ef4444';
    const fillOp = bldVisual.fillOpacity ?? 0.05;
    const is3D = bldVisual.show3D;
    const strokeW = bldVisual.strokeWeight || 1.8;

    bldFootprints.forEach((b) => {
      const isSelected = bldSelectedId === b.id;
      const groundCoords: [number, number][] = b.polygon.map(([lon, lat]) => [lat, lon]);
      const hasStorySelection = isSelected && bldSelectedStory !== null && bldSelectedStory >= 1 && bldSelectedStory <= (b.estimated_floors || 1);

      if (is3D) {
        const heightScale = bldVisual.heightScale || 1.5;
        const h = Math.max(3.0, b.estimated_height_m || 3.5) * heightScale;
        const offsetLat = h * 0.000009;
        const offsetLng = h * 0.000006;

        const roofCoords: [number, number][] = b.polygon.map(([lon, lat]) => [
          lat + offsetLat,
          lon + offsetLng,
        ]);

        // Base ground shadow
        const groundPoly = L.polygon(groundCoords, {
          color: '#000000',
          weight: 1,
          fillColor: '#000000',
          fillOpacity: 0.40,
          interactive: false,
        });
        group.addLayer(groundPoly);

        const totalFloors = Math.min(10, b.estimated_floors || 1);

        // Wall quadrilaterals with directional facet shading
        for (let i = 0; i < groundCoords.length - 1; i++) {
          const g1 = groundCoords[i];
          const g2 = groundCoords[i + 1];
          const r1 = roofCoords[i];
          const r2 = roofCoords[i + 1];

          // Compute wall azimuth angle for directional light vs shadow facet
          const dLng = g2[1] - g1[1];
          const dLat = g2[0] - g1[0];
          const wallAngle = (Math.atan2(dLat, dLng) * 180) / Math.PI;
          const isSunlit = wallAngle > -45 && wallAngle < 135;

          // Per-story rendering: split wall face into individual floor quads
          if (hasStorySelection && totalFloors >= 2) {
            for (let fl = 0; fl < totalFloors; fl++) {
              const floorNum = fl + 1; // 1-indexed
              const fracBottom = fl / totalFloors;
              const fracTop = (fl + 1) / totalFloors;

              const fb1: [number, number] = [g1[0] + (r1[0] - g1[0]) * fracBottom, g1[1] + (r1[1] - g1[1]) * fracBottom];
              const fb2: [number, number] = [g2[0] + (r2[0] - g2[0]) * fracBottom, g2[1] + (r2[1] - g2[1]) * fracBottom];
              const ft1: [number, number] = [g1[0] + (r1[0] - g1[0]) * fracTop, g1[1] + (r1[1] - g1[1]) * fracTop];
              const ft2: [number, number] = [g2[0] + (r2[0] - g2[0]) * fracTop, g2[1] + (r2[1] - g2[1]) * fracTop];

              const isFloorSelected = floorNum === bldSelectedStory;

              const floorWallCol = isFloorSelected ? '#ff3366' : '#ffe066';
              const floorWallOp = isFloorSelected ? 0.88 : (isSunlit ? 0.32 : 0.45);
              const floorBorderCol = isFloorSelected ? '#ffffff' : 'rgba(255, 215, 0, 0.5)';
              const floorBorderW = isFloorSelected ? 2.5 : 0.5;

              const floorPoly = L.polygon([fb1, fb2, ft2, ft1], {
                color: floorBorderCol,
                weight: floorBorderW,
                fillColor: floorWallCol,
                fillOpacity: floorWallOp,
                interactive: false,
                className: isFloorSelected ? 'bld-story-selected-wall' : '',
              });
              group.addLayer(floorPoly);

              // Thicker floor separator bands
              if (fl > 0) {
                const bandLine = L.polyline([fb1, fb2], {
                  color: isFloorSelected || (fl === (bldSelectedStory || 0)) ? 'rgba(255, 51, 102, 0.9)' : 'rgba(255, 255, 255, 0.4)',
                  weight: isFloorSelected ? 2.5 : 1,
                  interactive: false,
                });
                group.addLayer(bandLine);
              }
            }

            // Add a floor-number label on the selected story
            if (i === 0 && bldSelectedStory) {
              const fracMid = (bldSelectedStory - 0.5) / totalFloors;
              const labelLat = g1[0] + (r1[0] - g1[0]) * fracMid;
              const labelLng = g1[1] + (r1[1] - g1[1]) * fracMid;
              const floorLabel = L.divIcon({
                className: 'bld-story-label-marker',
                html: `<div class="bld-story-map-label">Floor ${bldSelectedStory}</div>`,
              });
              const floorMarker = L.marker([labelLat, labelLng], {
                icon: floorLabel,
                interactive: false,
              });
              group.addLayer(floorMarker);
            }
          } else {
            // Standard wall rendering (no story selection or single floor)
            const wallFillOp = isSelected
              ? 0.75
              : isSunlit
              ? Math.min(0.65, fillOp + 0.28)
              : Math.min(0.85, fillOp + 0.45);

            const wallCol = isSelected ? '#ffd700' : strokeCol;

            const wallPoly = L.polygon([g1, g2, r2, r1], {
              color: isSelected ? '#ffd700' : strokeCol,
              weight: 1,
              fillColor: wallCol,
              fillOpacity: wallFillOp,
              interactive: false,
            });
            group.addLayer(wallPoly);

            // Floor banding lines for multi-story buildings (G+2 or higher)
            if (bldVisual.showFloorBands && (b.estimated_floors || 1) >= 2) {
              const floors = Math.min(10, b.estimated_floors || 2);
              for (let fl = 1; fl < floors; fl++) {
                const frac = fl / floors;
                const f1: [number, number] = [g1[0] + (r1[0] - g1[0]) * frac, g1[1] + (r1[1] - g1[1]) * frac];
                const f2: [number, number] = [g2[0] + (r2[0] - g2[0]) * frac, g2[1] + (r2[1] - g2[1]) * frac];
                const bandLine = L.polyline([f1, f2], {
                  color: isSelected ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.25)',
                  weight: 1,
                  interactive: false,
                });
                group.addLayer(bandLine);
              }
            }
          }
        }

        // Elevated Roof polygon
        const roofPoly = L.polygon(roofCoords, {
          color: isSelected ? '#ffffff' : strokeCol,
          weight: isSelected ? 3.5 : strokeW,
          fillColor: isSelected ? '#ffe066' : strokeCol,
          fillOpacity: isSelected ? (hasStorySelection ? 0.65 : 0.80) : Math.max(0.40, fillOp + 0.25),
        });

        bindFootprintEvents(roofPoly, b, isSelected);
        group.addLayer(roofPoly);

        if (bldVisual.showLabels) {
          const labelIcon = L.divIcon({
            className: 'bld-area-label-marker',
            html: `<div class="bld-map-label">${b.area_gaj ? `${Math.round(b.area_gaj)} Gaj` : `${Math.round(b.area_sqm)}m²`}</div>`,
          });
          const labelMarker = L.marker([b.centroid[1] + offsetLat, b.centroid[0] + offsetLng], {
            icon: labelIcon,
            interactive: false,
          });
          group.addLayer(labelMarker);
        }
      } else {
        const poly = L.polygon(groundCoords, {
          color: isSelected ? '#ffd700' : strokeCol,
          weight: isSelected ? 3.5 : strokeW,
          fillColor: isSelected ? '#ffd700' : strokeCol,
          fillOpacity: isSelected ? 0.45 : fillOp,
        });

        bindFootprintEvents(poly, b, isSelected);
        group.addLayer(poly);

        if (bldVisual.showLabels) {
          const labelIcon = L.divIcon({
            className: 'bld-area-label-marker',
            html: `<div class="bld-map-label">${b.area_gaj ? `${Math.round(b.area_gaj)} Gaj` : `${Math.round(b.area_sqm)}m²`}</div>`,
          });
          const labelMarker = L.marker([b.centroid[1], b.centroid[0]], {
            icon: labelIcon,
            interactive: false,
          });
          group.addLayer(labelMarker);
        }
      }
    });

    function bindFootprintEvents(layer: L.Polygon, b: typeof bldFootprints[0], isSelected: boolean) {
      const storyLine = isSelected && bldSelectedStory
        ? `<div class="bld-tt-row" style="color: #00f0ff;"><span>Selected Floor:</span> <strong>Floor ${bldSelectedStory} of ${b.estimated_floors}</strong></div>`
        : '';

      layer.bindTooltip(
        `
        <div class="bld-map-tooltip">
          <div class="bld-tt-head">
            <span class="icon" style="font-size: 14px; vertical-align: middle;">domain</span>
            <strong>${b.name || b.id}</strong>
          </div>
          <div class="bld-tt-cat ${b.classification.toLowerCase().replace(/\s+/g, '-')}">${b.classification}</div>
          <div class="bld-tt-row">
            <span>Plot Size:</span>
            <strong>${b.area_gaj ? `${b.area_gaj} Gaj • ` : ''}${b.area_sqm.toLocaleString()} m² (${b.area_sqft.toLocaleString()} sq ft)</strong>
          </div>
          <div class="bld-tt-row">
            <span>Stories:</span>
            <strong>~${b.estimated_height_m}m (${b.estimated_floors} fl)</strong>
          </div>
          ${storyLine}
          ${b.orientation_deg ? `<div class="bld-tt-row"><span>Orientation:</span> <strong>${b.orientation_deg}°</strong></div>` : ''}
          ${b.roof_material ? `<div class="bld-tt-row"><span>Roof:</span> <strong>${b.roof_material}</strong></div>` : ''}
          ${b.has_mumty_tank ? `<div class="bld-tt-row" style="color: #38bdf8;"><span>Feature:</span> <strong>🚰 Tank / Mumty</strong></div>` : ''}
          <div class="bld-tt-row">
            <span>Confidence:</span>
            <strong>${Math.round(b.confidence * 100)}%</strong>
          </div>
        </div>
        `,
        { sticky: true, className: 'bld-custom-tooltip' }
      );

      layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setBldSelectedId(b.id);
      });
    }
  }, [bldFootprints, bldSelectedId, bldSelectedStory, bldVisual, setBldSelectedId]);

  // Render Road Footprints (Polylines with classification-based styling)
  const {
    roads: roadFootprints,
    selectedRoadId: roadSelectedId,
    setSelectedRoadId: setRoadSelectedId,
    visualSettings: roadVisual,
  } = useRoadFootprintStore();

  useEffect(() => {
    if (!mapInstanceRef.current || !roadLayerGroupRef.current) return;
    const group = roadLayerGroupRef.current;
    group.clearLayers();

    if (!roadFootprints || roadFootprints.length === 0) return;

    const weightScale = roadVisual.strokeWeight || 1.0;

    roadFootprints.forEach((r) => {
      const isSelected = roadSelectedId === r.id;
      const coords: [number, number][] = r.polyline.map(([lon, lat]) => [lat, lon]);

      // Determine color based on color mode
      let roadColor = '#f97316';
      let roadWeight = 2.5;

      if (roadVisual.colorMode === 'classification') {
        const classStyle = ROAD_CLASSIFICATION_STYLES[r.highway_class];
        if (classStyle) {
          roadColor = classStyle.color;
          roadWeight = classStyle.weight;
        }
      } else if (roadVisual.colorMode === 'surface') {
        const surfStyle = ROAD_SURFACE_STYLES[r.surface || 'unknown'];
        if (surfStyle) {
          roadColor = surfStyle.color;
        }
        roadWeight = 2.5;
      } else {
        roadColor = roadVisual.uniformColor || '#f97316';
        roadWeight = 2.5;
      }

      // Apply weight scale
      roadWeight = roadWeight * weightScale;

      // Dash pattern for footways/paths
      const isDashed = ['footway', 'path', 'cycleway', 'track', 'pedestrian'].includes(r.highway_class);

      const polyline = L.polyline(coords, {
        color: isSelected ? '#ffd700' : roadColor,
        weight: isSelected ? roadWeight + 2 : roadWeight,
        opacity: isSelected ? 1.0 : 0.85,
        dashArray: isDashed ? '6, 4' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      });

      // Tooltip
      const classStyle = ROAD_CLASSIFICATION_STYLES[r.highway_class];
      polyline.bindTooltip(
        `
        <div style="font-family: inherit; font-size: 11px; padding: 3px; max-width: 260px;">
          <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 3px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${roadColor};"></span>
            <strong style="color: ${roadColor};">${r.name || r.ref || 'Unnamed Road'}</strong>
          </div>
          <div style="color: rgba(255,255,255,0.7); margin-bottom: 2px;">${classStyle?.emoji || '🛣️'} ${classStyle?.label || r.highway_class}</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 10px; color: rgba(255,255,255,0.6);">
            <span>📏 ${r.length_m > 1000 ? (r.length_m / 1000).toFixed(1) + 'km' : Math.round(r.length_m) + 'm'}</span>
            <span>↔ ${r.width_m}m wide</span>
            ${r.lanes ? `<span>🛤️ ${r.lanes} lanes</span>` : ''}
            ${r.surface && r.surface !== 'unknown' ? `<span>🛤️ ${r.surface}</span>` : ''}
            ${r.speed_limit_kmh ? `<span>⚡ ${r.speed_limit_kmh} km/h</span>` : ''}
            ${r.one_way ? '<span style="color: #f59e0b;">→ One-way</span>' : ''}
            ${r.bridge ? '<span style="color: #38bdf8;">🌉 Bridge</span>' : ''}
            ${r.tunnel ? '<span style="color: #a78bfa;">🚇 Tunnel</span>' : ''}
            ${r.lit ? '<span style="color: #fbbf24;">💡 Lit</span>' : ''}
          </div>
        </div>
        `,
        { sticky: true, className: 'bld-custom-tooltip' }
      );

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setRoadSelectedId(r.id);
      });

      group.addLayer(polyline);

      // Road name label (optional)
      if (roadVisual.showLabels && r.name && coords.length >= 2) {
        const midIdx = Math.floor(coords.length / 2);
        const labelIcon = L.divIcon({
          className: 'bld-area-label-marker',
          html: `<div class="bld-map-label" style="font-size: 9px; color: ${roadColor}; text-shadow: 0 0 3px rgba(0,0,0,0.8);">${r.name}</div>`,
        });
        const labelMarker = L.marker(coords[midIdx], {
          icon: labelIcon,
          interactive: false,
        });
        group.addLayer(labelMarker);
      }
    });
  }, [roadFootprints, roadSelectedId, roadVisual, setRoadSelectedId]);

  // ---------------------------------------------------------------------------
  // Custom Data Layer Rendering
  // ---------------------------------------------------------------------------
  const {
    layers: customLayers,
    selectedFeatureId: cdSelectedId,
    show3D: cdShow3D,
    heightScale: cdHeightScale,
    selectedFloorIndex: cdSelectedFloor,
    selectFeature: cdSelectFeature,
    tifOnlyMode,
  } = useCustomDataStore();

  useEffect(() => {
    if (!mapInstanceRef.current || !customDataLayerGroupRef.current) return;
    const group = customDataLayerGroupRef.current;
    group.clearLayers();

    customLayers.forEach(layer => {
      if (!layer.visible) return;

      // Render raster image overlay if the layer has a preview and bounds
      if (layer.rasterDataUrl && layer.bounds) {
        const bounds: L.LatLngBoundsExpression = [
          [layer.bounds.south, layer.bounds.west],
          [layer.bounds.north, layer.bounds.east],
        ];
        const overlay = L.imageOverlay(layer.rasterDataUrl, bounds, {
          opacity: layer.opacity,
          interactive: false,
        });
        group.addLayer(overlay);

        // Add a dashed border rectangle to show the raster extent
        const rect = L.rectangle(bounds, {
          color: layer.color,
          weight: 2,
          fillOpacity: 0,
          dashArray: '6 4',
          interactive: false,
        });
        group.addLayer(rect);
      }

      if (layer.features.length === 0) return;
      const color = layer.color;
      const opacity = layer.opacity;

      layer.features.forEach(feat => {
        const isSelected = cdSelectedId === feat.id;

        if (feat.type === 'Point' && feat.center) {
          const marker = L.circleMarker([feat.center[1], feat.center[0]], {
            radius: isSelected ? 8 : 5,
            color: isSelected ? '#fff' : color,
            fillColor: color,
            fillOpacity: opacity,
            weight: isSelected ? 3 : 1.5,
          });
          marker.bindPopup(`<strong style="color: ${color};">${feat.properties?.name || feat.id}</strong>`);
          marker.on('click', () => cdSelectFeature(feat.id));
          group.addLayer(marker);
        }

        if (feat.type === 'LineString' && feat.coordinates) {
          const latlngs = feat.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
          const line = L.polyline(latlngs, {
            color,
            weight: isSelected ? 4 : 2,
            opacity,
          });
          line.on('click', () => cdSelectFeature(feat.id));
          group.addLayer(line);
        }

        if ((feat.type === 'Polygon' || feat.type === 'MultiPolygon') && feat.coordinates) {
          const rings = feat.type === 'Polygon' ? feat.coordinates : feat.coordinates[0];
          if (!rings || !rings[0]) return;
          const outerRing = rings[0];
          const groundCoords: [number, number][] = outerRing.map((c: number[]) => [c[1], c[0]]);

          if (cdShow3D && feat.isBuilding && feat.estimated_height_m) {
            const h = Math.max(3, feat.estimated_height_m) * cdHeightScale;
            const offsetLat = h * 0.000009;
            const offsetLng = h * 0.000006;
            const roofCoords: [number, number][] = outerRing.map((c: number[]) => [c[1] + offsetLat, c[0] + offsetLng]);

            // Ground shadow
            group.addLayer(L.polygon(groundCoords, {
              color: '#000', weight: 1, fillColor: '#000', fillOpacity: 0.35, interactive: false,
            }));

            // Walls
            for (let i = 0; i < groundCoords.length - 1; i++) {
              const g1 = groundCoords[i], g2 = groundCoords[i + 1];
              const r1 = roofCoords[i], r2 = roofCoords[i + 1];
              const wallAngle = (Math.atan2(g2[0] - g1[0], g2[1] - g1[1]) * 180) / Math.PI;
              const isSunlit = wallAngle > -45 && wallAngle < 135;

              const totalFloors = feat.estimated_floors || 1;
              if (cdSelectedFloor !== null && totalFloors >= 2) {
                for (let fl = 0; fl < totalFloors; fl++) {
                  const fracB = fl / totalFloors;
                  const fracT = (fl + 1) / totalFloors;
                  const fb1: [number, number] = [g1[0] + (r1[0] - g1[0]) * fracB, g1[1] + (r1[1] - g1[1]) * fracB];
                  const fb2: [number, number] = [g2[0] + (r2[0] - g2[0]) * fracB, g2[1] + (r2[1] - g2[1]) * fracB];
                  const ft1: [number, number] = [g1[0] + (r1[0] - g1[0]) * fracT, g1[1] + (r1[1] - g1[1]) * fracT];
                  const ft2: [number, number] = [g2[0] + (r2[0] - g2[0]) * fracT, g2[1] + (r2[1] - g2[1]) * fracT];
                  const isActive = fl === cdSelectedFloor;
                  group.addLayer(L.polygon([fb1, fb2, ft2, ft1], {
                    color: isActive ? '#fff' : color,
                    weight: isActive ? 2 : 0.5,
                    fillColor: isActive ? color : (isSunlit ? color : '#1e293b'),
                    fillOpacity: isActive ? 0.9 : 0.3,
                    interactive: false,
                  }));
                }
              } else {
                group.addLayer(L.polygon([g1, g2, r2, r1], {
                  color, weight: 0.8,
                  fillColor: isSunlit ? color : '#1e293b',
                  fillOpacity: isSunlit ? 0.5 : 0.35,
                  interactive: false,
                }));
              }
            }

            // Roof
            const roof = L.polygon(roofCoords, {
              color: isSelected ? '#fff' : color,
              weight: isSelected ? 2.5 : 1.5,
              fillColor: color,
              fillOpacity: isSelected ? 0.85 : 0.6,
            });
            roof.bindPopup(`<strong style="color: ${color};">${feat.properties?.name || feat.id}</strong><br/>` +
              `${feat.area_sqm || 0} m² · ${feat.estimated_floors || 1} floors · ${feat.estimated_height_m || 3}m`);
            roof.on('click', () => cdSelectFeature(feat.id));
            group.addLayer(roof);
          } else {
            // 2D polygon
            const poly = L.polygon(groundCoords, {
              color: isSelected ? '#fff' : color,
              weight: isSelected ? 3 : 1.8,
              fillColor: color,
              fillOpacity: isSelected ? 0.35 : (feat.isBuilding ? 0.15 : opacity * 0.3),
              dashArray: feat.isBuilding ? undefined : '4 2',
            });
            poly.bindPopup(`<strong style="color: ${color};">${feat.properties?.name || feat.id}</strong><br/>` +
              (feat.area_sqm ? `Area: ${feat.area_sqm} m²` : '') +
              (feat.isBuilding ? `<br/>Floors: ${feat.estimated_floors || 1} · Height: ${feat.estimated_height_m || 3}m` : ''));
            poly.on('click', () => cdSelectFeature(feat.id));
            group.addLayer(poly);
          }
        }
      });
    });
  }, [customLayers, cdSelectedId, cdShow3D, cdHeightScale, cdSelectedFloor, cdSelectFeature]);

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

  // ── TIF Only Mode: hide the base map so ONLY uploaded raster (TIF) data shows ──
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const tileLayerInstance = tileLayerInstanceRef.current;
    const labelsLayer = labelsLayerRef.current;

    if (tifOnlyMode) {
      // Hide every basemap source (Esri Satellite, OSM, Carto...) — leave only custom rasters
      if (tileLayerInstance) tileLayerInstance.setOpacity(0);
      if (labelsLayer) labelsLayer.setOpacity(0);
      map.getContainer().style.background = '#0b0d10';

      // When switching the mode ON, zoom to the uploaded raster extent
      if (!prevTifOnlyRef.current) {
        const rasterBoundsList = useCustomDataStore.getState().layers
          .filter(l => l.visible && l.layerType === 'raster' && !!l.bounds)
          .map(l => L.latLngBounds(
            [l.bounds!.south, l.bounds!.west],
            [l.bounds!.north, l.bounds!.east]
          ));

        const first = rasterBoundsList[0];
        if (first) {
          const union = rasterBoundsList.slice(1).reduce((acc, b) => acc.extend(b), first);
          map.fitBounds(union, { padding: [24, 24] });
        }
      }
    } else {
      // Restore base map
      if (tileLayerInstance) tileLayerInstance.setOpacity(1);
      if (labelsLayer) labelsLayer.setOpacity(1);
      map.getContainer().style.background = '#1a1d20';
    }

    prevTifOnlyRef.current = tifOnlyMode;
  }, [tifOnlyMode, tileLayer, showLabels]);

  // ── GIS Tools rendering (measurement lines, drawn features) ──
  const {
    activeTool: gisTool,
    measurePoints: gisMeasurePoints,
    drawnFeatures: gisDrawnFeatures,
  } = useGISToolsStore();

  useEffect(() => {
    if (!mapInstanceRef.current || !gisToolsLayerGroupRef.current) return;
    const group = gisToolsLayerGroupRef.current;
    group.clearLayers();

    // Draw measurement points and lines
    if (gisMeasurePoints.length > 0 && (gisTool === 'measure-distance' || gisTool === 'measure-area')) {
      // Markers at each point
      gisMeasurePoints.forEach((pt, i) => {
        L.circleMarker([pt.lat, pt.lng], {
          radius: 6, color: '#3b82f6', fillColor: '#60a5fa', fillOpacity: 1, weight: 2,
        }).bindTooltip(`P${i + 1}`, { permanent: true, direction: 'top', className: 'gis-measure-tooltip' })
          .addTo(group);
      });

      if (gisTool === 'measure-distance' && gisMeasurePoints.length >= 2) {
        const latlngs = gisMeasurePoints.map(p => [p.lat, p.lng] as [number, number]);
        L.polyline(latlngs, {
          color: '#3b82f6', weight: 3, dashArray: '8, 4', opacity: 0.9,
        }).addTo(group);
      }

      if (gisTool === 'measure-area' && gisMeasurePoints.length >= 3) {
        const latlngs = gisMeasurePoints.map(p => [p.lat, p.lng] as [number, number]);
        L.polygon(latlngs, {
          color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.2, weight: 2, dashArray: '6, 3',
        }).addTo(group);
      }
    }

    // Draw annotation features
    gisDrawnFeatures.forEach(feat => {
      if (feat.type === 'Point' && feat.coordinates[0]) {
        const c = feat.coordinates[0] as number[];
        L.circleMarker([c[1], c[0]], {
          radius: 8, color: feat.color, fillColor: feat.color, fillOpacity: 0.8, weight: 2,
        }).bindTooltip(feat.label, { permanent: false, direction: 'top' })
          .addTo(group);
      }
    });
  }, [gisTool, gisMeasurePoints, gisDrawnFeatures]);

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
