import React, { useState, useEffect } from 'react';
import { useMapStore, useSettings } from './lib/state';
import { LeafletMap, MapTileLayerKey, LeafletMarker } from './components/LeafletMap';
import { EarthAIPanel } from './components/EarthAIPanel';
import { useEarthAIStore } from './lib/earth-ai';
import { BuildingFootprintPanel } from './components/BuildingFootprintPanel';
import { useBuildingFootprintStore } from './lib/building-footprint';
import { RoadFootprintPanel } from './components/RoadFootprintPanel';
import { useRoadFootprintStore } from './lib/road-footprint';
import { CustomDataPanel } from './components/CustomDataPanel';
import { useCustomDataStore } from './lib/custom-data';
import QGISToolsPanel, { useGISToolsStore } from './components/QGISToolsPanel';

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

/** GIS Tools toolbar button */
function GISToolsButton() {
  const { isOpen, toggle } = useGISToolsStore();
  return (
    <button
      id="toggle-gis-tools-btn"
      type="button"
      className={`bld-ai-nav-toggle-btn ${isOpen ? 'active' : ''}`}
      onClick={toggle}
      aria-label="Toggle GIS Tools (QGIS-style)"
      title="GIS exploration tools: Measure, Identify, Draw, Attribute Table, Statistics"
      style={isOpen ? { borderColor: '#22c55e', background: 'rgba(34, 197, 94, 0.15)' } : undefined}
    >
      <span className="icon" style={{ color: isOpen ? '#22c55e' : undefined }}>compass_calibration</span>
      <span className="ai-btn-text">GIS</span>
    </button>
  );
}

/**
 * TIF-Only basemap toggle.
 *
 * When enabled, every basemap tile layer (Esri Satellite, OSM, Carto...) is
 * hidden so that ONLY the uploaded custom raster (GeoTIFF/TIF) data is visible.
 * The button is disabled until a raster layer with a geo-referenced preview
 * has been uploaded in the Custom Data panel.
 */
function TifOnlyButton() {
  const { tifOnlyMode, toggleTifOnlyMode, layers } = useCustomDataStore();
  const rasterLayers = layers.filter(l => l.layerType === 'raster' && l.rasterDataUrl && l.bounds);
  const canToggle = rasterLayers.length > 0;

  return (
    <button
      id="toggle-tif-only-btn"
      type="button"
      className={`tif-only-nav-toggle-btn ${tifOnlyMode ? 'active' : ''}`}
      onClick={() => toggleTifOnlyMode()}
      disabled={!canToggle}
      aria-pressed={tifOnlyMode}
      aria-label="Toggle TIF Only view (hide base map)"
      title={
        canToggle
          ? tifOnlyMode
            ? `TIF ONLY ON: base map hidden — showing ${rasterLayers.length} uploaded raster layer${rasterLayers.length > 1 ? 's' : ''} only. Click to restore the satellite basemap.`
            : 'TIF ONLY: hide the Esri satellite/basemap and show only your uploaded TIF data'
          : 'Upload a GeoTIFF (.tif) in the Data panel to enable TIF-only view'
      }
    >
      <span className="icon">{tifOnlyMode ? 'image' : 'hide_image'}</span>
      <span className="ai-btn-text">{tifOnlyMode ? 'TIF Only: ON' : 'TIF Only'}</span>
      {canToggle && <span className="tif-only-badge">{rasterLayers.length}</span>}
    </button>
  );
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
  // OpenStreetMap / Leaflet state - default to Esri Satellite + Labels (satellite-hybrid)
  const [leafletTileLayer, setLeafletTileLayer] = useState<MapTileLayerKey>('satellite-hybrid');
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [leafletCenter, setLeafletCenter] = useState<[number, number]>([41.8781, -87.6298]);
  const [leafletZoom, setLeafletZoom] = useState<number>(18);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const { markers, setMarkers } = useMapStore();
  const { theme, setTheme } = useSettings();
  const { isPanelOpen, togglePanel, currentResult, autoScan, analyzeTile } = useEarthAIStore();
  const {
    isPanelOpen: isBldPanelOpen,
    togglePanel: toggleBldPanel,
    footprints: bldFootprints,
    visualSettings: bldVisual,
    toggle3D: toggleBld3D,
    setDetectionMode: setBldDetectionMode,
  } = useBuildingFootprintStore();

  const {
    isPanelOpen: isRoadPanelOpen,
    togglePanel: toggleRoadPanel,
    roads: roadFootprints,
  } = useRoadFootprintStore();

  const {
    isPanelOpen: isDataPanelOpen,
    togglePanel: toggleDataPanel,
    layers: dataLayers,
    tifOnlyMode,
  } = useCustomDataStore();

  // True while the user is showing uploaded custom raster data only (basemap hidden)
  const activeRasterLayers = dataLayers.filter(l => l.layerType === 'raster' && l.visible);

  // Current active zoom, latitude, and Representative Fraction (RF) values
  const currentLat = leafletCenter[0];
  const currentLng = leafletCenter[1];
  const currentZoom = leafletZoom;
  const currentRFDenom = getScaleDenominator(currentZoom, currentLat);

  // Debounced auto-scan when map moves and autoScan is enabled
  useEffect(() => {
    if (!autoScan) return;
    const timer = setTimeout(() => {
      analyzeTile(currentLat, currentLng, Math.round(currentZoom), true);
    }, 900);
    return () => clearTimeout(timer);
  }, [currentLat, currentLng, currentZoom, autoScan, analyzeTile]);

  // Handle location search via OpenStreetMap Nominatim
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

        setLeafletCenter([lat, lng]);
        setLeafletZoom(15);

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
    setLeafletZoom(z => Math.min(21, z + 1));
  };

  const handleZoomOut = () => {
    setLeafletZoom(z => Math.max(2, z - 1));
  };

  const handleResetCamera = () => {
    setLeafletCenter([41.8781, -87.6298]);
    setLeafletZoom(14);
  };

  // Convert zustand markers to LeafletMarker format
  const leafletMarkers: LeafletMarker[] = markers.map((m, idx) => ({
    id: `m-${idx}-${m.position.lat}-${m.position.lng}`,
    lat: m.position.lat,
    lng: m.position.lng,
    label: m.label || 'Location',
    description: m.address,
  }));

  return (
    <div className="map-explorer-container">
      {/* Primary Map View: Leaflet (OpenStreetMap) */}
      <div className="map-panel">
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
      </div>

      {/* Top Floating Explorer Bar */}
      <div className="map-top-bar" id="map-top-bar">
        {/* Map Engine & Basemap Brand Badge */}
        <div className="osm-brand-badge" id="osm-brand-badge">
          <span className="icon">satellite_alt</span>
          <span className={`osm-brand-text ${tifOnlyMode ? 'tif-only-active' : ''}`}>
            {tifOnlyMode
              ? `Custom TIF Only — ${activeRasterLayers.length} raster layer${activeRasterLayers.length === 1 ? '' : 's'} (basemap hidden)`
              : leafletTileLayer === 'satellite-hybrid'
              ? 'Esri Satellite + Labels'
              : leafletTileLayer === 'satellite-pure'
              ? 'Esri Satellite'
              : leafletTileLayer === 'osm'
              ? 'OpenStreetMap'
              : leafletTileLayer}
          </span>
        </div>

        {/* Location Search Form */}
        <form className="map-search-form" onSubmit={handleSearch} id="search-form">
          <span className="icon search-icon">search</span>
          <input
            id="map-search-input"
            type="text"
            className="map-search-input"
            placeholder="Search places worldwide (OpenStreetMap)..."
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
            {isSearching ? <span className="search-spinner" /> : 'Search'}
          </button>
        </form>

        {/* Layer / Mode Selector */}
        <div className="map-mode-control" id="map-mode-control">
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
            <optgroup label="Satellite Imagery (Default)">
              <option value="satellite-hybrid">🛰️ Esri Satellite + Labels (Default)</option>
              <option value="satellite-pure">🛰️ Esri Satellite (Clean)</option>
              <option value="nasa-blue-marble">🌍 NASA Blue Marble</option>
              <option value="nasa-night">🌃 NASA Earth at Night</option>
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
            title={showLabels ? "Labels ON: Place names are visible (click to hide)" : "Labels OFF: Click to show place names overlay"}
          >
            <span className="icon">label</span>
            <span className="labels-btn-text">{showLabels ? 'Labels ON' : 'Labels OFF'}</span>
          </button>

          <button
            id="theme-toggle-btn"
            type="button"
            className="theme-toggle-button"
            onClick={() => {
              const nextTheme = theme === 'light' ? 'dark' : 'light';
              setTheme(nextTheme);
              if (leafletTileLayer === 'carto-light' || leafletTileLayer === 'carto-dark') {
                setLeafletTileLayer(nextTheme === 'light' ? 'carto-light' : 'carto-dark');
              }
            }}
            aria-label="Toggle theme"
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            <span className="icon">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
          </button>

          <button
            id="toggle-earth-ai-btn"
            type="button"
            className={`earth-ai-nav-toggle-btn ${isPanelOpen ? 'active' : ''}`}
            onClick={togglePanel}
            aria-label="Toggle Earth AI Vision"
            title="Open Earth AI Vision (SegFormer-B0 + YOLOv8n-seg)"
          >
            <span className="icon">radar</span>
            <span className="ai-btn-text">Earth AI</span>
            {currentResult && (
              <span className="ai-active-badge">
                {currentResult.homes_count}
              </span>
            )}
          </button>

          <button
            id="toggle-bld-ai-btn"
            type="button"
            className={`bld-ai-nav-toggle-btn ${isBldPanelOpen ? 'active' : ''}`}
            onClick={toggleBldPanel}
            aria-label="Toggle AI Building Footprints"
            title="Open AI Building Footprints (Optical Satellite CV & Cadastral Vectorizer)"
          >
            <span className="icon">apartment</span>
            <span className="ai-btn-text">Footprints</span>
            {bldFootprints.length > 0 && (
              <span className="bld-active-badge">
                {bldFootprints.length}
              </span>
            )}
          </button>

          <button
            id="toggle-bld-3d-btn"
            type="button"
            className={`bld-3d-nav-btn ${bldVisual.show3D ? 'active' : ''}`}
            onClick={toggleBld3D}
            aria-label="Toggle 3D Buildings"
            title={bldVisual.show3D ? "3D Buildings Active (Click to switch to 2D outlines)" : "Switch to 3D Extruded Buildings View"}
          >
            <span className="icon">view_in_ar</span>
            <span className="ai-btn-text">{bldVisual.show3D ? '3D Active' : '3D View'}</span>
          </button>

          <button
            id="toggle-road-ai-btn"
            type="button"
            className={`bld-ai-nav-toggle-btn ${isRoadPanelOpen ? 'active' : ''}`}
            onClick={toggleRoadPanel}
            aria-label="Toggle AI Road Footprints"
            title="Open AI Road Footprints (Road Network Vectorizer & Classifier)"
            style={isRoadPanelOpen ? { borderColor: '#f97316', background: 'rgba(249, 115, 22, 0.15)' } : undefined}
          >
            <span className="icon" style={{ color: isRoadPanelOpen ? '#f97316' : undefined }}>route</span>
            <span className="ai-btn-text">Roads</span>
            {roadFootprints.length > 0 && (
              <span className="bld-active-badge" style={{ background: '#f97316' }}>
                {roadFootprints.length}
              </span>
            )}
          </button>

          <button
            id="toggle-data-panel-btn"
            type="button"
            className={`bld-ai-nav-toggle-btn ${isDataPanelOpen ? 'active' : ''}`}
            onClick={toggleDataPanel}
            aria-label="Toggle Custom Data Panel"
            title="Upload & analyze custom geospatial data (GeoTIFF, GeoJSON, KML, CSV...)"
            style={isDataPanelOpen ? { borderColor: '#60a5fa', background: 'rgba(96, 165, 250, 0.15)' } : undefined}
          >
            <span className="icon" style={{ color: isDataPanelOpen ? '#60a5fa' : undefined }}>folder_open</span>
            <span className="ai-btn-text">Data</span>
            {dataLayers.length > 0 && (
              <span className="bld-active-badge" style={{ background: '#60a5fa' }}>
                {dataLayers.length}
              </span>
            )}
          </button>

          <TifOnlyButton />
          <GISToolsButton />
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
            title={`Zoom Level: ${currentZoom} | Representative Fraction (Scale): 1:${currentRFDenom.toLocaleString()}`}
          >
            <span className="zoom-num">Z{currentZoom}</span>
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

        <div className="camera-controls-group">
          <button
            id="camera-reset-btn"
            type="button"
            className="camera-ctrl-btn camera-reset-btn"
            onClick={handleResetCamera}
            title="Reset Map View to Default"
            aria-label="Reset Map View"
          >
            <span className="icon">center_focus_strong</span>
          </button>
        </div>
      </div>

      {/* Live Stats Badge */}
      <div className="camera-stats-badge" id="camera-stats-badge">
        <span>Lat: {leafletCenter[0].toFixed(4)}°</span>
        <span className="stat-separator">•</span>
        <span>Lng: {leafletCenter[1].toFixed(4)}°</span>
        <span className="stat-separator">•</span>
        <span>Zoom: {leafletZoom}</span>
        <span className="stat-separator">•</span>
        <span className="rf-stat-badge" id="camera-stat-rf-leaflet" title="Representative Fraction (Scale Ratio)">
          RF 1:{formatRF(leafletZoom, leafletCenter[0])}
        </span>
        <span className="stat-separator">•</span>
        <span>Layer: {tifOnlyMode ? 'Custom TIF Only' : leafletTileLayer === 'osm' ? 'OpenStreetMap' : leafletTileLayer}</span>
      </div>

      {/* Earth AI Vision Floating HUD Panel */}
      <EarthAIPanel
        currentLat={currentLat}
        currentLng={currentLng}
        currentZoom={currentZoom}
        currentRFDenom={currentRFDenom}
        onFocusCoordinates={(lat, lng, zoom) => {
          setLeafletCenter([lat, lng]);
          if (zoom) setLeafletZoom(zoom);
        }}
      />

      {/* AI Building Footprints Studio Panel */}
      <BuildingFootprintPanel
        currentLat={currentLat}
        currentLng={currentLng}
        currentZoom={currentZoom}
        onFocusCoordinates={(lat, lng, zoom) => {
          setLeafletCenter([lat, lng]);
          if (zoom) setLeafletZoom(zoom);
        }}
        onRequestDrawRoi={() => {
          setBldDetectionMode('roi-box');
        }}
      />

      {/* AI Road Footprints Panel */}
      <RoadFootprintPanel
        currentLat={currentLat}
        currentLng={currentLng}
        currentZoom={currentZoom}
        onFocusCoordinates={(lat, lng, zoom) => {
          setLeafletCenter([lat, lng]);
          if (zoom) setLeafletZoom(zoom);
        }}
      />

      {/* Custom Data Upload & Analysis Panel */}
      <CustomDataPanel
        currentLat={currentLat}
        currentLng={currentLng}
        currentZoom={currentZoom}
        onFocusCoordinates={(lat, lng, zoom) => {
          setLeafletCenter([lat, lng]);
          if (zoom) setLeafletZoom(zoom);
        }}
      />

      {/* GIS Exploration Tools (QGIS-style) */}
      <QGISToolsPanel />
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
