
import React, { useState, useEffect } from 'react';
import { useMapStore, useSettings, MapMarker } from './lib/state';
import { LeafletMap, MapTileLayerKey, LeafletMarker } from './components/LeafletMap';
import { MapLibreMap, MapLibreStyleKey, MapLibreMarkerData, MAPLIBRE_STYLES } from './components/MapLibreMap';

type MapProvider = 'maplibre' | 'leaflet';

/**
 * Calculates the cartographic Representative Fraction (RF) scale denominator
 * based on the Web Mercator zoom level and latitude at standard 96 DPI.
 */
function getScaleDenominator(zoom: number, latDeg: number): number {
  const earthCircumference = 40075016.686;
  const latRad = (Math.max(-85, Math.min(85, latDeg)) * Math.PI) / 180;
  const groundResolution = (earthCircumference * Math.cos(latRad)) / (256 * Math.pow(2, zoom));
  const metersPerPixelAt96DPI = 0.0254 / 96;
  return Math.max(1, Math.round(groundResolution / metersPerPixelAt96DPI));
}

function formatRF(zoom: number, latDeg: number): string {
  const denom = getScaleDenominator(zoom, latDeg);
  if (!isFinite(denom) || denom <= 0) return '1,000';
  return denom.toLocaleString();
}

function formatCompactRF(denom: number): string {
  if (!isFinite(denom) || denom <= 0) return '1k';
  if (denom >= 1000000) {
    return (denom / 1000000).toFixed(denom >= 10000000 ? 0 : 1) + 'M';
  }
  if (denom >= 1000) {
    return (denom / 1000).toFixed(denom >= 10000 ? 0 : 1) + 'k';
  }
  return denom.toString();
}

function AppComponent() {
  const [mapProvider, setMapProvider] = useState<MapProvider>('maplibre');
  const [leafletTileLayer, setLeafletTileLayer] = useState<MapTileLayerKey>('satellite-hybrid');
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [leafletCenter, setLeafletCenter] = useState<[number, number]>([41.8781, -87.6298]);
  const [leafletZoom, setLeafletZoom] = useState<number>(14);

  // MapLibre GL state
  const [maplibreStyle, setMaplibreStyle] = useState<MapLibreStyleKey>('liberty');
  const [maplibreCenter, setMaplibreCenter] = useState<[number, number]>([41.8781, -87.6298]);
  const [maplibreZoom, setMaplibreZoom] = useState<number>(14.5);
  const [maplibrePitch, setMaplibrePitch] = useState<number>(55);
  const [maplibreBearing, setMaplibreBearing] = useState<number>(45);
  const [show3DBuildings, setShow3DBuildings] = useState<boolean>(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const { markers, setMarkers } = useMapStore();
  const { theme, setTheme } = useSettings();

  // Handle location search for MapLibre and Leaflet via OpenStreetMap Nominatim
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'en',
        },
      });
      const data = await res.json();
      setIsSearching(false);

      if (data && data.length > 0 && data[0]) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        const displayName = data[0].display_name;

        if (mapProvider === 'maplibre') {
          setMaplibreCenter([lat, lng]);
          setMaplibreZoom(15);
        } else {
          setLeafletCenter([lat, lng]);
          setLeafletZoom(15);
        }

        setMarkers([{
          position: { lat, lng, altitude: 0 },
          label: displayName.split(',').slice(0, 2).join(','),
          showLabel: true,
        }]);
      } else {
        setSearchError('Location not found in OpenStreetMap. Please try another query.');
      }
    } catch {
      setIsSearching(false);
      setSearchError('Search failed. Please verify your connection and try again.');
    }
  };

  // Camera navigation controls
  const handleZoomIn = () => {
    if (mapProvider === 'maplibre') {
      setMaplibreZoom(z => Math.min(22, z + 1));
    } else {
      setLeafletZoom(z => Math.min(21, z + 1));
    }
  };

  const handleZoomOut = () => {
    if (mapProvider === 'maplibre') {
      setMaplibreZoom(z => Math.max(1, z - 1));
    } else {
      setLeafletZoom(z => Math.max(2, z - 1));
    }
  };

  const handleTiltUp = () => {
    if (mapProvider === 'maplibre') {
      setMaplibrePitch(p => Math.min(85, p + 12));
    }
  };

  const handleTiltDown = () => {
    if (mapProvider === 'maplibre') {
      setMaplibrePitch(p => Math.max(0, p - 12));
    }
  };

  const handleRotateLeft = () => {
    if (mapProvider === 'maplibre') {
      setMaplibreBearing(b => (b - 30 + 360) % 360);
    }
  };

  const handleRotateRight = () => {
    if (mapProvider === 'maplibre') {
      setMaplibreBearing(b => (b + 30) % 360);
    }
  };

  const handleResetCamera = () => {
    if (mapProvider === 'maplibre') {
      setMaplibreCenter([41.8781, -87.6298]);
      setMaplibreZoom(14);
      setMaplibrePitch(0);
      setMaplibreBearing(0);
    } else {
      setLeafletCenter([41.8781, -87.6298]);
      setLeafletZoom(14);
    }
  };

  // Convert zustand markers to LeafletMarker format
  const leafletMarkers: LeafletMarker[] = markers.map((m, idx) => ({
    id: `m-${idx}-${m.position.lat}-${m.position.lng}`,
    lat: m.position.lat,
    lng: m.position.lng,
    label: m.label || 'Location',
    description: m.address,
  }));

  // Convert zustand markers to MapLibreMarkerData format
  const maplibreMarkers: MapLibreMarkerData[] = markers.map((m, idx) => ({
    id: `ml-${idx}-${m.position.lat}-${m.position.lng}`,
    lat: m.position.lat,
    lng: m.position.lng,
    label: m.label || 'Location',
    description: m.address,
  }));

  // Current active zoom, latitude, and Representative Fraction (RF) values
  const currentLat = mapProvider === 'maplibre' ? maplibreCenter[0] : leafletCenter[0];
  const currentZoom = mapProvider === 'maplibre' ? maplibreZoom : leafletZoom;
  const currentRFDenom = getScaleDenominator(currentZoom, currentLat);

  return (
    <div className="map-explorer-container">
      {/* Map Views: MapLibre GL or Leaflet Third-Party */}
      <div className="map-panel">
        {mapProvider === 'maplibre' ? (
          <MapLibreMap
            center={maplibreCenter}
            zoom={maplibreZoom}
            pitch={maplibrePitch}
            bearing={maplibreBearing}
            styleKey={maplibreStyle}
            show3DBuildings={show3DBuildings}
            showLabels={showLabels}
            markers={maplibreMarkers}
            onCameraChange={(center, zoom, pitch, bearing) => {
              setMaplibreCenter(center);
              setMaplibreZoom(zoom);
              setMaplibrePitch(pitch);
              setMaplibreBearing(bearing);
            }}
          />
        ) : (
          <LeafletMap
            center={leafletCenter}
            zoom={leafletZoom}
            tileLayer={leafletTileLayer}
            showLabels={showLabels}
            markers={leafletMarkers}
            onMoveEnd={(center, zoom) => {
              setLeafletCenter(center);
              setLeafletZoom(zoom);
            }}
          />
        )}
      </div>

      {/* Top Floating Explorer Bar */}
      <div className="map-top-bar" id="map-top-bar">
        {/* Provider Switcher */}
        <div className="map-provider-switcher" id="map-provider-switcher">
          <button
            id="provider-maplibre-btn"
            type="button"
            className={`provider-tab ${mapProvider === 'maplibre' ? 'active' : ''}`}
            onClick={() => setMapProvider('maplibre')}
            title="Switch to MapLibre GL (Fast 3D Vector Tiles, Tilt, Continuous Rotation & 3D Buildings)"
          >
            <span className="icon">view_in_ar</span>
            <span>MapLibre GL</span>
          </button>
          <button
            id="provider-leaflet-btn"
            type="button"
            className={`provider-tab ${mapProvider === 'leaflet' ? 'active' : ''}`}
            onClick={() => setMapProvider('leaflet')}
            title="Switch to OpenStreetMap & Raster Maps (Leaflet)"
          >
            <span className="icon">public</span>
            <span>OpenStreetMap</span>
          </button>
        </div>

        {/* Location Search Form */}
        <form className="map-search-form" onSubmit={handleSearch} id="search-form">
          <span className="icon search-icon">search</span>
          <input
            id="map-search-input"
            type="text"
            className="map-search-input"
            placeholder={
              mapProvider === 'maplibre'
                ? 'Search places worldwide (MapLibre vector)...'
                : 'Search places worldwide (OpenStreetMap)...'
            }
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (searchError) setSearchError(null);
            }}
          />
          {searchQuery && (
            <button
              id="clear-search-btn"
              type="button"
              className="clear-search-button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <span className="icon">close</span>
            </button>
          )}
          <button
            id="submit-search-btn"
            type="submit"
            className="search-submit-button"
            disabled={isSearching || !searchQuery.trim()}
          >
            {isSearching ? <span className="search-spinner" /> : 'Fly'}
          </button>
        </form>

        {/* Layer / Mode Selector */}
        <div className="map-mode-control" id="map-mode-control">
          {mapProvider === 'maplibre' ? (
            <>
              <select
                id="maplibre-style-select"
                value={maplibreStyle}
                onChange={(e) => setMaplibreStyle(e.target.value as MapLibreStyleKey)}
                aria-label="Change MapLibre vector style"
                className="map-mode-select"
              >
                <optgroup label="3D Vector Basemaps">
                  <option value="liberty">🏙️ OpenFreeMap Liberty (3D)</option>
                  <option value="bright">🗺️ OpenFreeMap Bright (Vector)</option>
                  <option value="positron">☀️ Carto Positron (Light Vector)</option>
                  <option value="dark">🌙 Carto Dark Matter (Dark Vector)</option>
                  <option value="voyager">🧭 Carto Voyager (POI Vector)</option>
                  <option value="demotiles">🌐 MapLibre Demo Tiles</option>
                </optgroup>
                <optgroup label="Raster & Hybrid">
                  <option value="satellite-hybrid">🛰️ Esri Satellite + Hybrid</option>
                  <option value="osm-raster">🗺️ OpenStreetMap Standard</option>
                </optgroup>
              </select>

              <button
                id="toggle-3d-buildings-btn"
                type="button"
                className={`labels-toggle-btn ${show3DBuildings ? 'active' : ''}`}
                onClick={() => setShow3DBuildings(!show3DBuildings)}
                aria-label="Toggle 3D Buildings Extrusion"
                title={show3DBuildings ? "3D Buildings ON: Click to disable building heights" : "3D Buildings OFF: Click to enable extruded 3D buildings"}
              >
                <span className="icon">apartment</span>
                <span className="labels-btn-text">{show3DBuildings ? '3D Buildings ON' : '3D Buildings OFF'}</span>
              </button>

              <button
                id="toggle-labels-btn"
                type="button"
                className={`labels-toggle-btn ${showLabels ? 'active' : ''}`}
                onClick={() => setShowLabels(!showLabels)}
                aria-label="Toggle labels overlay"
                title={showLabels ? "Labels ON: Click to hide labels" : "Labels OFF: Click to show labels"}
              >
                <span className="icon">label</span>
                <span className="labels-btn-text">{showLabels ? 'Labels ON' : 'Labels OFF'}</span>
              </button>
            </>
          ) : (
            <>
              <select
                id="leaflet-layer-select"
                value={leafletTileLayer}
                onChange={(e) => {
                  const val = e.target.value as MapTileLayerKey;
                  setLeafletTileLayer(val);
                  if (val === 'satellite-hybrid') {
                    setShowLabels(true);
                  } else if (val === 'satellite-pure') {
                    setShowLabels(false);
                  }
                }}
                aria-label="Change tile layer"
                className="map-mode-select"
              >
                <optgroup label="Satellite & Space">
                  <option value="satellite-hybrid">🛰️ Esri Satellite + Labels</option>
                  <option value="satellite-pure">🛰️ Esri Satellite (Clean)</option>
                  <option value="nasa-blue-marble">🌍 NASA Blue Marble (Free)</option>
                  <option value="nasa-night">🌃 NASA Earth at Night (Free)</option>
                </optgroup>
                <optgroup label="Standard Maps">
                  <option value="osm">🗺️ OpenStreetMap</option>
                  <option value="carto-light">☀️ Carto Light</option>
                  <option value="carto-dark">🌙 Carto Dark</option>
                  <option value="terrain">⛰️ OpenTopoMap (Terrain)</option>
                </optgroup>
              </select>

              <button
                id="toggle-labels-btn"
                type="button"
                className={`labels-toggle-btn ${showLabels ? 'active' : ''}`}
                onClick={() => setShowLabels(!showLabels)}
                aria-label="Toggle country, state, and place names"
                title={showLabels ? "Labels ON: Country & place names are visible (click to hide)" : "Labels OFF: Click to show country & place names overlay"}
              >
                <span className="icon">label</span>
                <span className="labels-btn-text">{showLabels ? 'Labels ON' : 'Labels OFF'}</span>
              </button>
            </>
          )}

          <button
            id="theme-toggle-btn"
            type="button"
            className="theme-toggle-button"
            onClick={() => {
              const nextTheme = theme === 'light' ? 'dark' : 'light';
              setTheme(nextTheme);
              if (mapProvider === 'leaflet') {
                setLeafletTileLayer(nextTheme === 'light' ? 'carto-light' : 'carto-dark');
              } else if (mapProvider === 'maplibre') {
                setMaplibreStyle(nextTheme === 'light' ? 'positron' : 'dark');
              }
            }}
            aria-label="Toggle theme"
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            <span className="icon">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
          </button>
        </div>
      </div>

      {/* Error notification if search fails */}
      {searchError && (
        <div className="search-error-toast" id="search-error-toast">
          <span className="icon">warning</span>
          <span>{searchError}</span>
          <button type="button" onClick={() => setSearchError(null)} aria-label="Dismiss error">
            <span className="icon">close</span>
          </button>
        </div>
      )}

      {/* Camera Controls Widget */}
      <div className="camera-controls-widget" id="camera-controls-widget">
        <div className="camera-controls-group">
          <button
            id="camera-zoom-in-btn"
            type="button"
            className="camera-ctrl-btn"
            onClick={handleZoomIn}
            title="Zoom In"
            aria-label="Zoom In"
          >
            <span className="icon">add</span>
          </button>
          <div
            className="camera-zoom-level-indicator"
            id="camera-zoom-level-indicator"
            title={`Zoom Level: ${currentZoom.toFixed(1)} | Representative Fraction (Scale): 1:${currentRFDenom.toLocaleString()}`}
          >
            <span className="zoom-num">Z{currentZoom.toFixed(mapProvider === 'leaflet' ? 0 : 1)}</span>
            <span className="rf-num">1:{formatCompactRF(currentRFDenom)}</span>
          </div>
          <button
            id="camera-zoom-out-btn"
            type="button"
            className="camera-ctrl-btn"
            onClick={handleZoomOut}
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <span className="icon">remove</span>
          </button>
        </div>

        {mapProvider === 'maplibre' && (
          <>
            <div className="camera-controls-group">
              <button
                id="camera-tilt-up-btn"
                type="button"
                className="camera-ctrl-btn"
                onClick={handleTiltUp}
                title="Tilt Up / Increase Pitch"
                aria-label="Tilt Up"
              >
                <span className="icon">arrow_upward</span>
              </button>
              <button
                id="camera-tilt-down-btn"
                type="button"
                className="camera-ctrl-btn"
                onClick={handleTiltDown}
                title="Tilt Down / Decrease Pitch"
                aria-label="Tilt Down"
              >
                <span className="icon">arrow_downward</span>
              </button>
            </div>

            <div className="camera-controls-group">
              <button
                id="camera-rotate-left-btn"
                type="button"
                className="camera-ctrl-btn"
                onClick={handleRotateLeft}
                title="Rotate Left / Counter-Clockwise"
                aria-label="Rotate Left"
              >
                <span className="icon">rotate_left</span>
              </button>
              <button
                id="camera-rotate-right-btn"
                type="button"
                className="camera-ctrl-btn"
                onClick={handleRotateRight}
                title="Rotate Right / Clockwise"
                aria-label="Rotate Right"
              >
                <span className="icon">rotate_right</span>
              </button>
            </div>
          </>
        )}

        <div className="camera-controls-group">
          <button
            id="camera-reset-btn"
            type="button"
            className="camera-ctrl-btn camera-reset-btn"
            onClick={handleResetCamera}
            title="Reset Map View to North"
            aria-label="Reset Map View"
          >
            <span className="icon">center_focus_strong</span>
          </button>
        </div>
      </div>

      {/* Live Stats Badge */}
      <div className="camera-stats-badge" id="camera-stats-badge">
        {mapProvider === 'maplibre' ? (
          <>
            <span>Pitch: {Math.round(maplibrePitch)}°</span>
            <span className="stat-separator">•</span>
            <span>Bearing: {Math.round(maplibreBearing)}°</span>
            <span className="stat-separator">•</span>
            <span>Zoom: {maplibreZoom.toFixed(1)}</span>
            <span className="stat-separator">•</span>
            <span className="rf-stat-badge" id="camera-stat-rf-maplibre" title="Representative Fraction (Scale Ratio)">
              RF 1:{formatRF(maplibreZoom, maplibreCenter[0])}
            </span>
            <span className="stat-separator">•</span>
            <span>Lat: {maplibreCenter[0].toFixed(3)}°</span>
            <span className="stat-separator">•</span>
            <span>Lng: {maplibreCenter[1].toFixed(3)}°</span>
            <span className="stat-separator">•</span>
            <span>3D Buildings: {show3DBuildings ? 'ON' : 'OFF'}</span>
          </>
        ) : (
          <>
            <span>Lat: {leafletCenter[0].toFixed(3)}°</span>
            <span className="stat-separator">•</span>
            <span>Lng: {leafletCenter[1].toFixed(3)}°</span>
            <span className="stat-separator">•</span>
            <span>Zoom: {leafletZoom}</span>
            <span className="stat-separator">•</span>
            <span className="rf-stat-badge" id="camera-stat-rf-leaflet" title="Representative Fraction (Scale Ratio)">
              RF 1:{formatRF(leafletZoom, leafletCenter[0])}
            </span>
            <span className="stat-separator">•</span>
            <span>Labels: {showLabels && leafletTileLayer !== 'satellite-pure' ? 'ON' : 'OFF'}</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Main application component.
 */
function App() {
  const { theme } = useSettings();

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);

  return (
    <div className="App">
      <AppComponent />
    </div>
  );
}

export default App;

