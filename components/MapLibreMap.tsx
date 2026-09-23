import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEarthAIStore } from '../lib/earth-ai';

export type MapLibreStyleKey =
  | 'liberty'
  | 'bright'
  | 'positron'
  | 'dark'
  | 'voyager'
  | 'satellite-hybrid'
  | 'osm-raster'
  | 'demotiles';

export interface MapLibreMarkerData {
  id: string;
  lat: number;
  lng: number;
  label: string;
  description?: string;
}

interface MapLibreMapProps {
  center: [number, number]; // [lat, lng]
  zoom: number;
  pitch?: number;
  bearing?: number;
  styleKey: MapLibreStyleKey;
  show3DBuildings?: boolean;
  showLabels?: boolean;
  markers: MapLibreMarkerData[];
  onMapClick?: (lat: number, lng: number) => void;
  onCameraChange?: (center: [number, number], zoom: number, pitch: number, bearing: number) => void;
}

// Map styles configuration
export const MAPLIBRE_STYLES: Record<
  MapLibreStyleKey,
  { name: string; url?: string; styleSpec?: maplibregl.StyleSpecification; isVector: boolean; description: string }
> = {
  liberty: {
    name: 'OpenFreeMap Liberty (3D Vector)',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    isVector: true,
    description: 'Crisp vector tiles with 3D buildings, landcover, and roads',
  },
  bright: {
    name: 'OpenFreeMap Bright (Vector)',
    url: 'https://tiles.openfreemap.org/styles/bright',
    isVector: true,
    description: 'Vibrant OpenStreetMap styling in vector format',
  },
  positron: {
    name: 'Carto Positron GL (Light Vector)',
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    isVector: true,
    description: 'Clean minimalist light vector basemap',
  },
  dark: {
    name: 'Carto Dark Matter GL (Dark Vector)',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    isVector: true,
    description: 'High-contrast dark vector basemap ideal for night exploration',
  },
  voyager: {
    name: 'Carto Voyager GL (Colorful Vector)',
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    isVector: true,
    description: 'Detailed vector basemap highlighting points of interest',
  },
  'satellite-hybrid': {
    name: 'Esri Satellite + Vector Hybrid',
    isVector: false,
    description: 'High-resolution global satellite imagery with boundaries & labels',
    styleSpec: {
      version: 8,
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
          maxzoom: 20,
        },
        'esri-places': {
          type: 'raster',
          tiles: [
            'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 20,
        },
      },
      layers: [
        {
          id: 'satellite-tiles',
          type: 'raster',
          source: 'esri-satellite',
          minzoom: 0,
          maxzoom: 20,
        },
        {
          id: 'satellite-labels',
          type: 'raster',
          source: 'esri-places',
          minzoom: 0,
          maxzoom: 20,
        },
      ],
    },
  },
  'osm-raster': {
    name: 'OpenStreetMap Standard',
    isVector: false,
    description: 'Canonical OpenStreetMap raster rendering',
    styleSpec: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors',
          maxzoom: 19,
        },
      },
      layers: [
        {
          id: 'osm-base-tiles',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
  demotiles: {
    name: 'MapLibre Official Demo (Vector)',
    url: 'https://demotiles.maplibre.org/style.json',
    isVector: true,
    description: 'Official MapLibre vector demo tiles with terrain support',
  },
};

export const MapLibreMap: React.FC<MapLibreMapProps> = ({
  center,
  zoom,
  pitch = 0,
  bearing = 0,
  styleKey,
  show3DBuildings = true,
  showLabels = true,
  markers,
  onMapClick,
  onCameraChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const isProgrammaticMove = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize MapLibre GL Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const selectedStyleConfig = MAPLIBRE_STYLES[styleKey] || MAPLIBRE_STYLES.liberty;
    const initialStyle = selectedStyleConfig.url || selectedStyleConfig.styleSpec;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: [center[1], center[0]], // [lng, lat]
      zoom: zoom,
      pitch: pitch,
      bearing: bearing,
      maxPitch: 85,
      attributionControl: false,
    });

    // Custom attribution control (compact)
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      'bottom-right'
    );

    // Navigation control with pitch / compass tilt
    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: false, // We already provide custom UI buttons
      }),
      'top-right'
    );

    // Scale control
    map.addControl(
      new maplibregl.ScaleControl({
        maxWidth: 100,
        unit: 'metric',
      }),
      'bottom-left'
    );

    mapRef.current = map;

    map.on('load', () => {
      setIsLoaded(true);
      apply3DBuildings(map, show3DBuildings);
      applyLabelsVisibility(map, showLabels);
    });

    const handleCameraUpdate = () => {
      if (isProgrammaticMove.current) return;
      const c = map.getCenter();
      const z = map.getZoom();
      const p = map.getPitch();
      const b = map.getBearing();
      onCameraChange?.([c.lat, c.lng], z, p, b);
    };

    map.on('moveend', handleCameraUpdate);
    map.on('pitchend', handleCameraUpdate);
    map.on('rotateend', handleCameraUpdate);

    map.on('click', (e) => {
      onMapClick?.(e.lngLat.lat, e.lngLat.lng);
      const { clickToScan, analyzeTile } = useEarthAIStore.getState();
      if (clickToScan) {
        analyzeTile(e.lngLat.lat, e.lngLat.lng, map.getZoom());
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setIsLoaded(false);
    };
  }, []); // Run once on mount

  // Handle style switching smoothly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const config = MAPLIBRE_STYLES[styleKey] || MAPLIBRE_STYLES.liberty;
    const newStyle = config.url || config.styleSpec;

    if (newStyle) {
      map.setStyle(newStyle as any);
      map.once('style.load', () => {
        apply3DBuildings(map, show3DBuildings);
        applyLabelsVisibility(map, showLabels);
      });
    }
  }, [styleKey]);

  // Helper to add or toggle 3D building extrusions
  const apply3DBuildings = useCallback((map: maplibregl.Map, enabled: boolean) => {
    try {
      const existingLayer = map.getLayer('3d-buildings-extrusion');
      if (existingLayer) {
        map.setLayoutProperty('3d-buildings-extrusion', 'visibility', enabled ? 'visible' : 'none');
        return;
      }

      if (!enabled) return;

      const style = map.getStyle();
      if (!style || !style.sources) return;

      // Find vector source that has building data (e.g. openmaptiles)
      let buildingSource = '';
      if (style.sources['openmaptiles']) {
        buildingSource = 'openmaptiles';
      } else if (style.sources['demotiles']) {
        buildingSource = 'demotiles';
      } else {
        const sourceKeys = Object.keys(style.sources);
        for (const key of sourceKeys) {
          const src = style.sources[key];
          if (src.type === 'vector') {
            buildingSource = key;
            break;
          }
        }
      }

      if (!buildingSource) return;

      // Find first symbol layer to insert before
      const labelLayerId = style.layers?.find(
        (l) => l.type === 'symbol' && l.layout && 'text-field' in l.layout
      )?.id;

      map.addLayer(
        {
          id: '3d-buildings-extrusion',
          source: buildingSource,
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['get', 'render_height'],
              0,
              '#d6dbe0',
              50,
              '#b4bcc4',
              150,
              '#8e97a0',
              300,
              '#5a636c',
            ],
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              15,
              ['coalesce', ['get', 'render_height'], ['get', 'height'], 15],
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              15,
              ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
            ],
            'fill-extrusion-opacity': 0.88,
          },
        },
        labelLayerId
      );
    } catch {
      // Vector style might not contain standard building layer; fail gracefully
    }
  }, []);

  // Helper to toggle labels on satellite hybrid or vector styles
  const applyLabelsVisibility = useCallback((map: maplibregl.Map, visible: boolean) => {
    try {
      if (map.getLayer('satellite-labels')) {
        map.setLayoutProperty('satellite-labels', 'visibility', visible ? 'visible' : 'none');
      }

      // If vector map, toggle text symbols if requested
      const layers = map.getStyle().layers;
      if (layers) {
        layers.forEach((layer) => {
          if (layer.type === 'symbol' && layer.id.includes('label')) {
            map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
          }
        });
      }
    } catch {
      // Ignore if layer doesn't exist
    }
  }, []);

  // Watch 3D buildings toggle
  useEffect(() => {
    const map = mapRef.current;
    if (map && isLoaded) {
      apply3DBuildings(map, show3DBuildings);
    }
  }, [show3DBuildings, isLoaded, apply3DBuildings]);

  // Watch labels toggle
  useEffect(() => {
    const map = mapRef.current;
    if (map && isLoaded) {
      applyLabelsVisibility(map, showLabels);
    }
  }, [showLabels, isLoaded, applyLabelsVisibility]);

  // Synchronize Camera Props (center, zoom, pitch, bearing)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const currentPitch = map.getPitch();
    const currentBearing = map.getBearing();

    const centerDist = Math.hypot(currentCenter.lat - center[0], currentCenter.lng - center[1]);
    const zoomDiff = Math.abs(currentZoom - zoom);
    const pitchDiff = Math.abs(currentPitch - pitch);
    const bearingDiff = Math.abs(currentBearing - bearing);

    if (centerDist > 0.0001 || zoomDiff > 0.1 || pitchDiff > 1 || bearingDiff > 1) {
      isProgrammaticMove.current = true;
      map.flyTo({
        center: [center[1], center[0]],
        zoom: zoom,
        pitch: pitch,
        bearing: bearing,
        essential: true,
        duration: 1200,
      });
      setTimeout(() => {
        isProgrammaticMove.current = false;
      }, 1300);
    }
  }, [center, zoom, pitch, bearing]);

  // Render Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Create new markers
    markers.forEach((markerData) => {
      const el = document.createElement('div');
      el.className = 'maplibre-custom-marker';
      el.innerHTML = `
        <div class="maplibre-marker-pin">
          <svg width="28" height="36" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.372 0 0 5.372 0 12C0 20.25 10.5 30.75 11.25 31.5C11.66 31.91 12.34 31.91 12.75 31.5C13.5 30.75 24 20.25 24 12C24 5.372 18.628 0 12 0Z" fill="#1f94ff"/>
            <path d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" fill="#ffffff"/>
          </svg>
          <div class="maplibre-marker-label">${escapeHtml(markerData.label)}</div>
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: [0, -32],
        closeButton: true,
        closeOnClick: false,
        className: 'maplibre-custom-popup',
      }).setHTML(`
        <div class="popup-title">${escapeHtml(markerData.label)}</div>
        ${markerData.description ? `<div class="popup-desc">${escapeHtml(markerData.description)}</div>` : ''}
        <div class="popup-coords">${markerData.lat.toFixed(4)}°, ${markerData.lng.toFixed(4)}°</div>
      `);

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat([markerData.lng, markerData.lat])
        .setPopup(popup)
        .addTo(map);

      // Open popup on marker pin click
      el.addEventListener('click', () => {
        marker.togglePopup();
      });

      markersRef.current.push(marker);
    });
  }, [markers]);

  // Subscribe to Earth AI store for rendering AI land masks, tile bounds, and home polygons
  const { currentResult, activeLayers, selectedHomeId, setSelectedHomeId } = useEarthAIStore();

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    // 1. Tile Bounds
    const boundsSourceId = 'earth-ai-tile-bounds';
    const boundsLineLayerId = 'earth-ai-tile-bounds-line';

    if (activeLayers.tileBounds && currentResult?.tile?.bounds) {
      const b = currentResult.tile.bounds;
      const polygonData: any = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [b.west, b.north],
            [b.east, b.north],
            [b.east, b.south],
            [b.west, b.south],
            [b.west, b.north],
          ]],
        },
      };

      const existingSource = map.getSource(boundsSourceId) as maplibregl.GeoJSONSource | undefined;
      if (existingSource && typeof existingSource.setData === 'function') {
        existingSource.setData(polygonData);
      } else {
        if (!map.getSource(boundsSourceId)) {
          map.addSource(boundsSourceId, {
            type: 'geojson',
            data: polygonData,
          });
        }
        if (!map.getLayer(boundsLineLayerId)) {
          map.addLayer({
            id: boundsLineLayerId,
            type: 'line',
            source: boundsSourceId,
            paint: {
              'line-color': '#00f0ff',
              'line-width': 2,
              'line-dasharray': [3, 2],
            },
          });
        }
      }
    } else {
      if (map.getLayer(boundsLineLayerId)) map.removeLayer(boundsLineLayerId);
      if (map.getSource(boundsSourceId)) map.removeSource(boundsSourceId);
    }

    // 2. SegFormer Mask Overlay
    const maskSourceId = 'earth-ai-mask-source';
    const maskLayerId = 'earth-ai-mask-layer';

    if (activeLayers.mask && currentResult?.mask_image && currentResult?.tile?.bounds) {
      const b = currentResult.tile.bounds;
      const coords: [[number, number], [number, number], [number, number], [number, number]] = [
        [b.west, b.north],
        [b.east, b.north],
        [b.east, b.south],
        [b.west, b.south],
      ];

      // Recreate image source if mask or bounds change
      if (map.getLayer(maskLayerId)) map.removeLayer(maskLayerId);
      if (map.getSource(maskSourceId)) map.removeSource(maskSourceId);

      try {
        map.addSource(maskSourceId, {
          type: 'image',
          url: currentResult.mask_image,
          coordinates: coords,
        });
        map.addLayer({
          id: maskLayerId,
          type: 'raster',
          source: maskSourceId,
          paint: {
            'raster-opacity': activeLayers.maskOpacity,
          },
        });
      } catch (err) {
        console.warn('Could not add mask source to MapLibre:', err);
      }
    } else {
      if (map.getLayer(maskLayerId)) map.removeLayer(maskLayerId);
      if (map.getSource(maskSourceId)) map.removeSource(maskSourceId);
    }

    // 3. YOLOv8n Home Instance Segmentation Polygons
    const homesSourceId = 'earth-ai-homes-source';
    const homesFillLayerId = 'earth-ai-homes-fill';
    const homesLineLayerId = 'earth-ai-homes-line';

    if (activeLayers.homes && currentResult?.geojson) {
      const existingHomesSource = map.getSource(homesSourceId) as maplibregl.GeoJSONSource | undefined;
      if (existingHomesSource && typeof existingHomesSource.setData === 'function') {
        existingHomesSource.setData(currentResult.geojson);
      } else {
        if (!map.getSource(homesSourceId)) {
          map.addSource(homesSourceId, {
            type: 'geojson',
            data: currentResult.geojson,
          });
        }

        if (!map.getLayer(homesFillLayerId)) {
          map.addLayer({
            id: homesFillLayerId,
            type: 'fill',
            source: homesSourceId,
            paint: {
              'fill-color': ['coalesce', ['get', 'color'], '#e60000'],
              'fill-opacity': [
                'match',
                ['get', 'category'],
                'vehicle', 0.65,
                'road', 0.22,
                0.08,
              ],
            },
          });
        }

        if (!map.getLayer(homesLineLayerId)) {
          map.addLayer({
            id: homesLineLayerId,
            type: 'line',
            source: homesSourceId,
            paint: {
              'line-color': ['coalesce', ['get', 'color'], '#e60000'],
              'line-width': [
                'match',
                ['get', 'category'],
                'road', 2.0,
                'vehicle', 1.5,
                1.5,
              ],
            },
          });
        }

        map.on('click', homesFillLayerId, (e) => {
          if (e.features && e.features[0]) {
            const id = e.features[0].properties?.id;
            if (id) {
              setSelectedHomeId(id);
            }
          }
        });

        map.on('mouseenter', homesFillLayerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', homesFillLayerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      // Update selected home highlight
      if (map.getLayer(homesFillLayerId)) {
        map.setPaintProperty(homesFillLayerId, 'fill-color', [
          'case',
          ['==', ['get', 'id'], selectedHomeId || ''],
          '#ffd700',
          '#e60000',
        ]);
        map.setPaintProperty(homesFillLayerId, 'fill-opacity', [
          'case',
          ['==', ['get', 'id'], selectedHomeId || ''],
          0.35,
          0.08,
        ]);
      }
      if (map.getLayer(homesLineLayerId)) {
        map.setPaintProperty(homesLineLayerId, 'line-color', [
          'case',
          ['==', ['get', 'id'], selectedHomeId || ''],
          '#ffd700',
          '#e60000',
        ]);
        map.setPaintProperty(homesLineLayerId, 'line-width', [
          'case',
          ['==', ['get', 'id'], selectedHomeId || ''],
          3,
          2,
        ]);
      }
    } else {
      if (map.getLayer(homesFillLayerId)) map.removeLayer(homesFillLayerId);
      if (map.getLayer(homesLineLayerId)) map.removeLayer(homesLineLayerId);
      if (map.getSource(homesSourceId)) map.removeSource(homesSourceId);
    }
  }, [isLoaded, currentResult, activeLayers, selectedHomeId, setSelectedHomeId]);

  return (
    <div className="maplibre-container-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainerRef} className="maplibre-map-stage" style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
