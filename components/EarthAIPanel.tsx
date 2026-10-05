import React, { useState, useMemo } from 'react';
import { useEarthAIStore, EarthAIResult } from '../lib/earth-ai';

interface EarthAIPanelProps {
  currentLat: number;
  currentLng: number;
  currentZoom: number;
  currentRFDenom?: number;
  onFocusCoordinates?: (lat: number, lng: number, zoom?: number) => void;
}

export const EarthAIPanel: React.FC<EarthAIPanelProps> = ({
  currentLat,
  currentLng,
  currentZoom,
  currentRFDenom,
  onFocusCoordinates,
}) => {
  const {
    colabUrl,
    colabStatus,
    colabLatencyMs,
    gpuInfo,
    isPanelOpen,
    isAnalyzing,
    autoScan,
    clickToScan,
    gridSize,
    activeLayers,
    currentResult,
    selectedHomeId,
    scanError,
    setColabUrl,
    testColabConnection,
    togglePanel,
    setAutoScan,
    setClickToScan,
    setGridSize,
    toggleLayer,
    setMaskOpacity,
    setSelectedHomeId,
    analyzeTile,
    clearResult,
  } = useEarthAIStore();

  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'buildings' | 'roads' | 'vehicles'>('all');
  const [show3D, setShow3D] = useState(false);
  const [heightScale, setHeightScale] = useState(1.0);
  const [selectedFloorIndex, setSelectedFloorIndex] = useState<number | null>(null);

  // Get the selected building's detection data
  const selectedBuilding = useMemo(() => {
    if (!selectedHomeId || !currentResult) return null;
    return currentResult.detections.find(d => d.id === selectedHomeId) || null;
  }, [selectedHomeId, currentResult]);

  if (!isPanelOpen) return null;

  const handleManualScan = () => {
    analyzeTile(currentLat, currentLng, Math.round(currentZoom), false, gridSize);
  };

  const handleDownloadNotebook = () => {
    const link = document.createElement('a');
    link.href = '/earth_ai_colab.ipynb';
    link.download = 'earth_ai_colab.ipynb';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportGeoJSON = () => {
    if (!currentResult?.geojson) return;
    const blob = new Blob([JSON.stringify(currentResult.geojson, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `earth-ai-detections-z${currentResult.tile.z}-${currentResult.tile.x}-${currentResult.tile.y}.geojson`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = () => {
    if (!currentResult) return;
    const text = `Earth AI Observation Summary:
Coordinates: ${currentResult.center.lat.toFixed(5)}, ${currentResult.center.lon.toFixed(5)} (Zoom ${currentResult.tile.z}, Grid ${currentResult.tile.grid_size || gridSize}x${currentResult.tile.grid_size || gridSize})
- Buildings & Roofs: ${currentResult.homes_count} detected
- Road Network: ${currentResult.roads ? `${currentResult.roads.total_percentage}% (${currentResult.roads.total_sqm.toLocaleString()} m², ~${currentResult.roads.estimated_km} km)` : 'N/A'}
- Vehicles Detected: ${currentResult.vehicles ? `${currentResult.vehicles.total_count} (${currentResult.vehicles.cars_count} cars, ${currentResult.vehicles.trucks_count} trucks)` : 'N/A'}
- Total Plant Area: ${currentResult.plant_area.total_percentage}% (${currentResult.plant_area.total_sqm.toLocaleString()} m²)
  • Trees & Canopy: ${currentResult.plant_area.trees_percentage}%
  • Grass & Moss: ${currentResult.plant_area.grass_percentage}%
- Land Breakdown:
${currentResult.land_textures.map(t => `  • ${t.name}: ${t.percentage}% (${t.area_sqm.toLocaleString()} m²)`).join('\n')}
Inference: ${currentResult.inference_ms}ms (${currentResult.gpu || 'Simulator'})`;

    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  const isConnected = colabStatus === 'connected';

  return (
    <aside className="earth-ai-panel" id="earth-ai-panel" aria-label="Earth AI Vision Controls">
      {/* Top Header */}
      <div className="earth-ai-header">
        <div className="earth-ai-title-wrap">
          <span className="icon ai-glow-icon">radar</span>
          <div>
            <h2 className="earth-ai-title">Earth AI Vision</h2>
            <div className="earth-ai-subtitle">SegFormer-B0 + YOLOv8n-seg</div>
          </div>
        </div>

        <div className="earth-ai-header-actions">
          <button
            type="button"
            className={`earth-ai-config-btn ${isConfigExpanded ? 'active' : ''}`}
            onClick={() => setIsConfigExpanded(!isConfigExpanded)}
            title="Configure Google Colab GPU connection"
            aria-label="Colab Connection Settings"
          >
            <span className="icon">tune</span>
          </button>
          <button
            type="button"
            className="earth-ai-close-btn"
            onClick={togglePanel}
            title="Close Earth AI Vision Panel"
            aria-label="Close"
          >
            <span className="icon">close</span>
          </button>
        </div>
      </div>

      {/* Colab GPU Connection Banner */}
      <div className="earth-ai-status-banner">
        <div className="status-indicator-wrap">
          <span
            className={`status-dot ${
              isConnected ? 'connected' : colabStatus === 'connecting' ? 'connecting' : 'simulator'
            }`}
          />
          <span className="status-label">
            {isConnected
              ? `Colab GPU Online (${gpuInfo || 'NVIDIA T4'})`
              : colabStatus === 'connecting'
              ? 'Connecting to Colab...'
              : 'Simulator Mode (Interactive GIS)'}
          </span>
        </div>
        {colabLatencyMs !== null && isConnected && (
          <span className="latency-badge">{colabLatencyMs}ms</span>
        )}
      </div>

      {/* Colab Configuration Drawer */}
      {isConfigExpanded && (
        <div className="earth-ai-config-drawer" id="earth-ai-config-drawer">
          <div className="config-drawer-header">
            <strong>Google Colab GPU Setup</strong>
            <div className="config-header-btns">
              <a
                href="https://colab.research.google.com/drive/1dKasbwI2alTDwb-bGL2Q1QJylFE7gAJO?authuser=1"
                target="_blank"
                rel="noopener noreferrer"
                className="open-colab-link-btn"
                title="Open your Google Colab notebook"
              >
                <span className="icon">open_in_new</span>
                <span>Open Colab</span>
              </a>
              <button
                type="button"
                className="download-notebook-btn"
                onClick={handleDownloadNotebook}
                title="Download earth_ai_colab.ipynb to run in Google Colab"
              >
                <span className="icon">cloud_download</span>
                <span>Get .ipynb</span>
              </button>
            </div>
          </div>

          <p className="config-drawer-desc">
            Run <code>earth_ai_colab.ipynb</code> on Google Colab with free T4 GPU. When you run <strong>Cell 5</strong>, copy the printed <code>https://...trycloudflare.com</code> URL and paste it below:
          </p>

          <div className="config-input-row">
            <input
              type="url"
              className="colab-url-input"
              placeholder="e.g. https://xxxx-xxxx.trycloudflare.com"
              value={colabUrl}
              onChange={e => setColabUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && colabUrl && colabStatus !== 'connecting') {
                  testColabConnection();
                }
              }}
            />
            <button
              type="button"
              className="colab-connect-btn"
              onClick={() => testColabConnection()}
              disabled={colabStatus === 'connecting' || !colabUrl}
            >
              {colabStatus === 'connecting' ? 'Testing...' : 'Connect'}
            </button>
          </div>

          {scanError && (
            <div className="colab-config-error" id="colab-config-error">
              <span className="icon error-icon">error_outline</span>
              <div className="error-text-wrap">
                <strong>Connection Alert:</strong>
                <span>{scanError}</span>
              </div>
            </div>
          )}

          <div className="config-hints">
            <span>💡 Cloudflare tunnel URLs are temporary and regenerate each time Colab Cell 5 is run.</span>
          </div>
        </div>
      )}

      {/* Primary Action Controls */}
      <div className="earth-ai-actions-bar">
        {/* Dynamic Scale & Maximum RF Readout */}
        <div className="earth-ai-rf-strip" id="earth-ai-rf-strip">
          <div className="rf-strip-info">
            <span className="icon">straighten</span>
            <span className="rf-strip-text">
              {currentRFDenom
                ? `Scale RF 1:${currentRFDenom.toLocaleString()} (Z${Math.round(currentZoom)})`
                : `Zoom Level ${Math.round(currentZoom)}`}
            </span>
          </div>
          {Math.round(currentZoom) >= 19 ? (
            <span className="rf-strip-pill max-rf" title="Maximum RF Mode active: Building boundaries and textures resolved at ultra-high resolution">
              ⚡ Max RF Active
            </span>
          ) : (
            <span className="rf-strip-pill normal-rf" title="Zoom in to RF 1:500 or higher for maximum detail">
              Dynamic RF
            </span>
          )}
        </div>

        {/* Detection Area Coverage Selector */}
        <div className="earth-ai-area-control" id="earth-ai-area-control">
          <span className="area-control-label">
            <span className="icon">zoom_out_map</span>
            <span>Detection Area:</span>
          </span>
          <div className="area-buttons-group">
            <button
              type="button"
              className={`area-btn ${gridSize === 1 ? 'active' : ''}`}
              onClick={() => setGridSize(1)}
              title="Standard single tile detection area (1x1)"
            >
              1x1
            </button>
            <button
              type="button"
              className={`area-btn ${gridSize === 2 ? 'active' : ''}`}
              onClick={() => setGridSize(2)}
              title="Expanded 2x2 grid (4x coverage area, recommended)"
            >
              2x2 (4x Area)
            </button>
            <button
              type="button"
              className={`area-btn ${gridSize === 3 ? 'active' : ''}`}
              onClick={() => setGridSize(3)}
              title="Panoramic 3x3 grid (9x maximum coverage area)"
            >
              3x3 (9x Full)
            </button>
          </div>
        </div>

        <button
          type="button"
          id="earth-ai-scan-btn"
          className={`earth-ai-scan-btn ${isAnalyzing ? 'scanning' : ''}`}
          onClick={handleManualScan}
          disabled={isAnalyzing}
          title={currentRFDenom ? `Analyze satellite view at RF 1:${currentRFDenom.toLocaleString()} (Zoom ${Math.round(currentZoom)})` : `Analyze satellite view at Zoom ${Math.round(currentZoom)}`}
        >
          <span className="icon">{isAnalyzing ? 'hourglass_top' : 'satellite_alt'}</span>
          <span>{isAnalyzing ? 'Analyzing Imagery...' : 'Scan Current View'}</span>
          {isAnalyzing && <span className="scan-pulse-ring" />}
        </button>

        <div className="earth-ai-toggles-row">
          <label className="earth-ai-toggle-label" title="Automatically analyze new tiles when you fly/pan the map">
            <input
              type="checkbox"
              checked={autoScan}
              onChange={e => setAutoScan(e.target.checked)}
            />
            <span className="toggle-switch-slider" />
            <span className="toggle-text">Auto-Scan on Pan</span>
          </label>

          <label className="earth-ai-toggle-label" title="Click anywhere on the map to scan that specific location">
            <input
              type="checkbox"
              checked={clickToScan}
              onChange={e => setClickToScan(e.target.checked)}
            />
            <span className="toggle-switch-slider" />
            <span className="toggle-text">Click to Scan</span>
          </label>
        </div>
      </div>

      {/* Error / Toast Message */}
      {scanError && (
        <div className="earth-ai-error-banner">
          <span className="icon">info</span>
          <span>{scanError}</span>
        </div>
      )}

      {/* Analysis Results Display */}
      <div className="earth-ai-scrollable-content">
        {currentResult ? (
          <>
            {/* 4 KPI Cards: Buildings, Roads, Vehicles, Plant Area */}
            <div className="earth-ai-kpi-grid">
              {/* Card 1: Homes & Buildings Detected */}
              <div className="earth-ai-kpi-card homes-card">
                <div className="kpi-card-header">
                  <span className="icon kpi-icon">home</span>
                  <span className="kpi-title">Buildings & Roofs</span>
                </div>
                <div className="kpi-main-val">
                  {currentResult.homes_count}
                  <span className="kpi-unit">detected</span>
                </div>
                <div className="kpi-sub-stats">
                  <span>
                    {currentResult.detections.reduce((acc, d) => acc + (d.area_sqm || 0), 0).toLocaleString()} m² roof
                  </span>
                  <span>•</span>
                  <span>
                    Avg Conf:{' '}
                    {currentResult.detections.length > 0
                      ? Math.round(
                          (currentResult.detections.reduce((acc, d) => acc + d.confidence, 0) /
                            currentResult.detections.length) *
                            100
                        ) + '%'
                      : '94%'}
                  </span>
                </div>
              </div>

              {/* Card 2: Road Network ("rad") */}
              <div className="earth-ai-kpi-card road-card">
                <div className="kpi-card-header">
                  <span className="icon kpi-icon road-icon">alt_route</span>
                  <span className="kpi-title">Road Network</span>
                </div>
                <div className="kpi-main-val">
                  {currentResult.roads ? `${currentResult.roads.total_percentage}%` : '18.4%'}
                  <span className="kpi-unit">coverage</span>
                </div>
                <div className="kpi-sub-stats">
                  <span>
                    {currentResult.roads ? `${currentResult.roads.total_sqm.toLocaleString()} m²` : 'Paved Corridors'}
                  </span>
                  {currentResult.roads?.estimated_km && (
                    <>
                      <span>•</span>
                      <span>~{currentResult.roads.estimated_km} km</span>
                    </>
                  )}
                </div>
              </div>

              {/* Card 3: Vehicles Detected ("cars") */}
              <div className="earth-ai-kpi-card vehicle-card">
                <div className="kpi-card-header">
                  <span className="icon kpi-icon vehicle-icon">directions_car</span>
                  <span className="kpi-title">Vehicles & Traffic</span>
                </div>
                <div className="kpi-main-val">
                  {currentResult.vehicles
                    ? currentResult.vehicles.total_count
                    : currentResult.vehicle_detections?.length || 0}
                  <span className="kpi-unit">vehicles</span>
                </div>
                <div className="kpi-sub-stats">
                  {currentResult.vehicles ? (
                    <>
                      <span>{currentResult.vehicles.cars_count} cars</span>
                      <span>•</span>
                      <span>{currentResult.vehicles.trucks_count} trucks</span>
                    </>
                  ) : (
                    <span>YOLOv8 Satellite</span>
                  )}
                </div>
              </div>

              {/* Card 4: Plant & Vegetation Area */}
              <div className="earth-ai-kpi-card plant-card">
                <div className="kpi-card-header">
                  <span className="icon kpi-icon">forest</span>
                  <span className="kpi-title">Plant & Canopy Area</span>
                </div>
                <div className="kpi-main-val">
                  {currentResult.plant_area.total_percentage}%
                  <span className="kpi-unit">coverage</span>
                </div>
                <div className="kpi-sub-stats">
                  <span>{currentResult.plant_area.total_sqm.toLocaleString()} m²</span>
                  {currentResult.plant_area.total_acres && (
                    <>
                      <span>•</span>
                      <span>{currentResult.plant_area.total_acres} acres</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Plant Breakdown Detail (Trees vs Grass) */}
            <div className="plant-breakdown-box">
              <div className="plant-breakdown-row">
                <div className="plant-item">
                  <span className="plant-color-dot trees" />
                  <span className="plant-item-name">Trees & Canopy:</span>
                  <span className="plant-item-val">{currentResult.plant_area.trees_percentage}%</span>
                </div>
                <div className="plant-item">
                  <span className="plant-color-dot grass" />
                  <span className="plant-item-name">Grass & Moss:</span>
                  <span className="plant-item-val">{currentResult.plant_area.grass_percentage}%</span>
                </div>
              </div>
            </div>

            {/* Land Texture Classification Breakdown */}
            <div className="earth-ai-section">
              <div className="section-title-row">
                <span className="section-title">SegFormer Land Textures</span>
                <span className="section-meta">ADE20K Semantic Classes</span>
              </div>

              <div className="land-textures-list">
                {currentResult.land_textures.map(texture => (
                  <div key={texture.name} className="texture-progress-item">
                    <div className="texture-label-row">
                      <span className="texture-dot" style={{ backgroundColor: texture.color }} />
                      <span className="texture-name">{texture.name}</span>
                      <span className="texture-pct">{texture.percentage}%</span>
                      <span className="texture-sqm">({texture.area_sqm.toLocaleString()} m²)</span>
                    </div>
                    <div className="texture-bar-track">
                      <div
                        className="texture-bar-fill"
                        style={{
                          width: `${Math.min(100, texture.percentage)}%`,
                          backgroundColor: texture.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Map Layers Toggles & Opacity */}
            <div className="earth-ai-section">
              <span className="section-title">Overlay Controls</span>

              <div className="overlay-controls-grid">
                <button
                  type="button"
                  className={`layer-btn ${activeLayers.homes ? 'active' : ''}`}
                  onClick={() => toggleLayer('homes')}
                  title="Toggle Buildings Red Outlines"
                >
                  <span className="icon" style={{ color: activeLayers.homes ? '#ef4444' : 'inherit' }}>
                    {activeLayers.homes ? 'home' : 'visibility_off'}
                  </span>
                  <span>Buildings ({currentResult.homes_count})</span>
                </button>

                <button
                  type="button"
                  className={`layer-btn ${activeLayers.roads ? 'active' : ''}`}
                  onClick={() => toggleLayer('roads')}
                  title="Toggle Road Network"
                >
                  <span className="icon" style={{ color: activeLayers.roads ? '#f59e0b' : 'inherit' }}>
                    {activeLayers.roads ? 'alt_route' : 'visibility_off'}
                  </span>
                  <span>Roads ({currentResult.roads ? `${currentResult.roads.total_percentage}%` : 'On'})</span>
                </button>

                <button
                  type="button"
                  className={`layer-btn ${activeLayers.vehicles ? 'active' : ''}`}
                  onClick={() => toggleLayer('vehicles')}
                  title="Toggle Vehicles & Cars"
                >
                  <span className="icon" style={{ color: activeLayers.vehicles ? '#06b6d4' : 'inherit' }}>
                    {activeLayers.vehicles ? 'directions_car' : 'visibility_off'}
                  </span>
                  <span>Cars ({currentResult.vehicles?.total_count || currentResult.vehicle_detections?.length || 0})</span>
                </button>

                <button
                  type="button"
                  className={`layer-btn ${activeLayers.mask ? 'active' : ''}`}
                  onClick={() => toggleLayer('mask')}
                  title="Toggle Land Cover Mask"
                >
                  <span className="icon" style={{ color: activeLayers.mask ? '#10b981' : 'inherit' }}>
                    {activeLayers.mask ? 'layers' : 'layers_clear'}
                  </span>
                  <span>Land Mask</span>
                </button>

                <button
                  type="button"
                  className={`layer-btn ${activeLayers.tileBounds ? 'active' : ''}`}
                  onClick={() => toggleLayer('tileBounds')}
                  title="Toggle Grid Boundary Box"
                >
                  <span className="icon" style={{ color: activeLayers.tileBounds ? '#3b82f6' : 'inherit' }}>
                    crop_square
                  </span>
                  <span>Boundary</span>
                </button>
              </div>

              {activeLayers.mask && (
                <div className="mask-opacity-slider-row">
                  <span className="slider-label">Mask Opacity:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={activeLayers.maskOpacity}
                    onChange={e => setMaskOpacity(parseFloat(e.target.value))}
                    className="opacity-slider"
                  />
                  <span className="slider-val">{Math.round(activeLayers.maskOpacity * 100)}%</span>
                </div>
              )}
            </div>

            {/* Detected Structures & Objects Inspector */}
            <div className="earth-ai-section">
              <div className="section-title-row">
                <span className="section-title">Detection Inspector</span>
                <span className="section-meta">Click item to focus</span>
              </div>

              {/* Inspector Filter Tabs */}
              <div className="inspector-filter-tabs">
                <button
                  type="button"
                  className={`inspector-tab-btn ${activeFilterTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveFilterTab('all')}
                >
                  All (
                  {currentResult.detections.length +
                    (currentResult.vehicle_detections?.length || 0) +
                    (currentResult.roads?.segments_count || 0)}
                  )
                </button>
                <button
                  type="button"
                  className={`inspector-tab-btn ${activeFilterTab === 'buildings' ? 'active' : ''}`}
                  onClick={() => setActiveFilterTab('buildings')}
                >
                  🏠 Buildings ({currentResult.detections.length})
                </button>
                <button
                  type="button"
                  className={`inspector-tab-btn ${activeFilterTab === 'roads' ? 'active' : ''}`}
                  onClick={() => setActiveFilterTab('roads')}
                >
                  🛣️ Roads ({currentResult.roads?.segments_count || 0})
                </button>
                <button
                  type="button"
                  className={`inspector-tab-btn ${activeFilterTab === 'vehicles' ? 'active' : ''}`}
                  onClick={() => setActiveFilterTab('vehicles')}
                >
                  🚗 Vehicles ({currentResult.vehicles?.total_count || currentResult.vehicle_detections?.length || 0})
                </button>
              </div>

              <div className="detections-chip-list">
                {/* Buildings */}
                {(activeFilterTab === 'all' || activeFilterTab === 'buildings') &&
                  currentResult.detections.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      className={`detection-chip building-chip ${selectedHomeId === d.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedHomeId(d.id);
                        if (onFocusCoordinates) {
                          onFocusCoordinates(d.center[1], d.center[0], 19);
                        }
                      }}
                      title={`Focus ${d.id}: Area ${d.area_sqm} m² | Conf ${(d.confidence * 100).toFixed(0)}%`}
                    >
                      <span className="icon chip-icon building-chip-icon">home</span>
                      <span className="chip-name">{d.id}</span>
                      {d.category && <span className="chip-tag">{d.category}</span>}
                      <span className="chip-area">{d.area_sqm} m²</span>
                    </button>
                  ))}

                {/* Road Segments */}
                {(activeFilterTab === 'all' || activeFilterTab === 'roads') &&
                  currentResult.geojson?.features
                    ?.filter((f: any) => f.properties?.category === 'road')
                    ?.map((rf: any) => (
                      <button
                        key={rf.id}
                        type="button"
                        className="detection-chip road-chip"
                        onClick={() => {
                          const coords = rf.geometry.coordinates[0];
                          if (coords && coords.length > 0 && onFocusCoordinates) {
                            onFocusCoordinates(coords[0][1], coords[0][0], 18);
                          }
                        }}
                        title={`Road Corridor: ${rf.properties?.area_sqm || 0} m²`}
                      >
                        <span className="icon chip-icon road-chip-icon">alt_route</span>
                        <span className="chip-name">{rf.properties?.name || rf.id}</span>
                        <span className="chip-area">{rf.properties?.area_sqm || 0} m²</span>
                      </button>
                    ))}

                {/* Vehicles */}
                {(activeFilterTab === 'all' || activeFilterTab === 'vehicles') &&
                  currentResult.vehicle_detections?.map(v => (
                    <button
                      key={v.id}
                      type="button"
                      className="detection-chip vehicle-chip"
                      onClick={() => {
                        if (onFocusCoordinates) {
                          onFocusCoordinates(v.position[1], v.position[0], 20);
                        }
                      }}
                      title={`Vehicle: ${v.category.toUpperCase()} | Conf ${(v.confidence * 100).toFixed(0)}%`}
                    >
                      <span className="icon chip-icon vehicle-chip-icon">directions_car</span>
                      <span className="chip-name">{v.id}</span>
                      <span className="chip-tag vehicle">{v.category.toUpperCase()}</span>
                      <span className="chip-conf">{Math.round(v.confidence * 100)}%</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* 3D View & Floor Selection */}
            <div className="earth-ai-section">
              <span className="section-title">3D View & Floor Selection</span>

              {/* 3D Toggle */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className={`layer-btn ${!show3D ? 'active' : ''}`}
                  onClick={() => setShow3D(false)}
                  style={{ flex: 1, padding: '6px 10px', fontSize: '11px' }}
                >
                  <span className="icon" style={{ fontSize: '14px' }}>map</span>
                  <span>2D Flat</span>
                </button>
                <button
                  type="button"
                  className={`layer-btn ${show3D ? 'active' : ''}`}
                  onClick={() => setShow3D(true)}
                  style={{ flex: 1, padding: '6px 10px', fontSize: '11px' }}
                >
                  <span className="icon" style={{ fontSize: '14px' }}>view_in_ar</span>
                  <span>3D Extrude</span>
                </button>
              </div>

              {show3D && (
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                  <span>Height:</span>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={heightScale}
                    onChange={(e) => setHeightScale(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: '#f472b6' }}
                  />
                  <span>{heightScale.toFixed(1)}x</span>
                </div>
              )}

              {/* Selected Building Floor Selector */}
              {selectedBuilding && (
                <div style={{
                  marginTop: '10px',
                  background: 'rgba(244,114,182,0.08)',
                  border: '1px solid rgba(244,114,182,0.25)',
                  borderRadius: '8px',
                  padding: '10px 12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#f472b6' }}>
                      <span className="icon" style={{ fontSize: '14px', verticalAlign: 'middle' }}>apartment</span>
                      {' '}{selectedBuilding.id}
                    </span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                      {selectedBuilding.area_sqm} m2 | {selectedBuilding.category || 'Building'}
                    </span>
                  </div>

                  {/* Floor info */}
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                    Est. Floors: <strong style={{ color: '#f472b6' }}>{selectedBuilding.estimated_floors || 2}</strong>
                    {' | '}
                    Est. Height: <strong style={{ color: '#f472b6' }}>{selectedBuilding.estimated_height_m || 6.4}m</strong>
                    {' | '}
                    Area/Floor: <strong>{Math.round(selectedBuilding.area_sqm / (selectedBuilding.estimated_floors || 2))} m2</strong>
                  </div>

                  {/* Floor buttons */}
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Select Floor:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedFloorIndex(null)}
                      style={{
                        padding: '4px 10px', fontSize: '11px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        background: selectedFloorIndex === null ? '#f472b6' : 'rgba(255,255,255,0.1)',
                        color: selectedFloorIndex === null ? '#000' : 'rgba(255,255,255,0.7)',
                        fontWeight: selectedFloorIndex === null ? 700 : 400
                      }}
                    >
                      All
                    </button>
                    {Array.from({ length: selectedBuilding.estimated_floors || 2 }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedFloorIndex(i)}
                        style={{
                          padding: '4px 10px', fontSize: '11px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                          background: selectedFloorIndex === i ? '#f472b6' : 'rgba(255,255,255,0.1)',
                          color: selectedFloorIndex === i ? '#000' : 'rgba(255,255,255,0.7)',
                          fontWeight: selectedFloorIndex === i ? 700 : 400
                        }}
                      >
                        F{i + 1}
                      </button>
                    ))}
                  </div>

                  {selectedFloorIndex !== null && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.6)', padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                      Floor {selectedFloorIndex + 1} of {selectedBuilding.estimated_floors || 2}
                      {' | '}
                      Height: {((selectedFloorIndex) * 3.2).toFixed(1)}m - {((selectedFloorIndex + 1) * 3.2).toFixed(1)}m
                      {' | '}
                      Area: {Math.round(selectedBuilding.area_sqm / (selectedBuilding.estimated_floors || 2))} m2
                    </div>
                  )}
                </div>
              )}

              {!selectedBuilding && currentResult && currentResult.detections.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '8px' }}>
                  Click a building above to select floor
                </div>
              )}
            </div>

            {/* Footer Metadata & Export Buttons */}
            <div className="earth-ai-footer">
              <div className="footer-meta-row">
                <span>
                  Tile: Z{currentResult.tile.z} ({currentResult.tile.x}, {currentResult.tile.y})
                </span>
                <span>•</span>
                <span>Inference: {currentResult.inference_ms}ms</span>
              </div>

              <div className="footer-actions-row">
                <button
                  type="button"
                  className="footer-action-btn"
                  onClick={handleExportGeoJSON}
                  title="Export GeoJSON Polygon Features"
                >
                  <span className="icon">download</span>
                  <span>Export GeoJSON</span>
                </button>

                <button
                  type="button"
                  className="footer-action-btn"
                  onClick={handleCopySummary}
                  title="Copy analysis summary to clipboard"
                >
                  <span className="icon">{copiedNotification ? 'check' : 'content_copy'}</span>
                  <span>{copiedNotification ? 'Copied!' : 'Copy Summary'}</span>
                </button>

                <button
                  type="button"
                  className="footer-action-btn clear-btn"
                  onClick={clearResult}
                  title="Clear analysis overlay"
                >
                  <span className="icon">delete_outline</span>
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="earth-ai-empty-state">
            <div className="empty-radar-wrap">
              <span className="icon empty-radar-icon">travel_explore</span>
            </div>
            <h3>Ready for Earth AI Observation</h3>
            <p>
              Click <strong>&quot;Scan Current View&quot;</strong> or click any spot on the map to trigger
              dynamic AI land segmentation and home detection.
            </p>
            <div className="empty-state-features">
              <div className="empty-feature-tag">
                <span className="icon">forest</span> Plant Area & Canopy %
              </div>
              <div className="empty-feature-tag">
                <span className="icon">home</span> YOLOv8n Home Counts
              </div>
              <div className="empty-feature-tag">
                <span className="icon">layers</span> SegFormer Land Textures
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
