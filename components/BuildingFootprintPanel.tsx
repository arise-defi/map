import React, { useMemo, useState } from 'react';
import {
  useBuildingFootprintStore,
  computeBuildingMetrics,
  BuildingFootprint,
  INDIA_CITY_PRESETS,
  IndiaCityPreset,
} from '../lib/building-footprint';

interface BuildingFootprintPanelProps {
  currentLat: number;
  currentLng: number;
  currentZoom: number;
  onFocusCoordinates?: (lat: number, lng: number, zoom?: number) => void;
  onRequestDrawRoi?: () => void;
}

export const BuildingFootprintPanel: React.FC<BuildingFootprintPanelProps> = ({
  currentLat,
  currentLng,
  currentZoom,
  onFocusCoordinates,
  onRequestDrawRoi,
}) => {
  const {
    isPanelOpen,
    isDetecting,
    detectionMode,
    detectionEngine,
    indiaMode,
    footprints,
    selectedFootprintId,
    selectedStoryIndex,
    visualSettings,
    searchQuery,
    filterCategory,
    sortBy,
    lastDetectedBounds,
    detectionError,
    togglePanel,
    closePanel,
    toggleIndiaMode,
    setDetectionMode,
    setDetectionEngine,
    setSelectedFootprintId,
    setSelectedStoryIndex,
    setVisualSettings,
    setSearchQuery,
    setFilterCategory,
    setSortBy,
    clearDetections,
    detectFootprints,
    exportGeoJSON,
    exportCSV,
    copyGeoJSONToClipboard,
    applyReferenceStyle,
    toggle3D,
    setHeightScale,
    toggleFloorBands,
    setGeometryMode,
    setDetectionDensity,
  } = useBuildingFootprintStore();

  const [isPresetsExpanded, setIsPresetsExpanded] = useState(false);

  const metrics = useMemo(() => {
    return computeBuildingMetrics(footprints, lastDetectedBounds);
  }, [footprints, lastDetectedBounds]);

  const selectedBuilding = useMemo(() => {
    if (!selectedFootprintId) return null;
    return footprints.find((f) => f.id === selectedFootprintId) || null;
  }, [footprints, selectedFootprintId]);

  const filteredFootprints = useMemo(() => {
    let list = [...footprints];

    if (filterCategory !== 'all') {
      list = list.filter((f) => f.classification.toLowerCase() === filterCategory.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (f) =>
          f.id.toLowerCase().includes(q) ||
          (f.name && f.name.toLowerCase().includes(q)) ||
          f.classification.toLowerCase().includes(q) ||
          (f.roof_material && f.roof_material.toLowerCase().includes(q))
      );
    }

    if (sortBy === 'area-desc') {
      list.sort((a, b) => b.area_sqm - a.area_sqm);
    } else if (sortBy === 'area-asc') {
      list.sort((a, b) => a.area_sqm - b.area_sqm);
    } else if (sortBy === 'conf-desc') {
      list.sort((a, b) => b.confidence - a.confidence);
    }

    return list;
  }, [footprints, filterCategory, searchQuery, sortBy]);

  if (!isPanelOpen) return null;

  const handleScanCurrentView = () => {
    const { currentMapBounds } = useBuildingFootprintStore.getState();
    if (currentMapBounds) {
      detectFootprints(currentMapBounds, Math.round(currentZoom));
    } else {
      const latSpan = (180 / Math.pow(2, currentZoom)) * 1.5;
      const lonSpan = (360 / Math.pow(2, currentZoom)) * 2.2;

      const bounds = {
        south: Math.max(-85, currentLat - latSpan),
        north: Math.min(85, currentLat + latSpan),
        west: currentLng - lonSpan,
        east: currentLng + lonSpan,
      };

      detectFootprints(bounds, Math.round(currentZoom));
    }
  };

  const handleSelectPreset = (p: IndiaCityPreset) => {
    if (onFocusCoordinates) {
      onFocusCoordinates(p.lat, p.lng, p.zoom);
    }

    const latSpan = (180 / Math.pow(2, p.zoom)) * 1.5;
    const lonSpan = (360 / Math.pow(2, p.zoom)) * 2.2;
    const bounds = {
      south: p.lat - latSpan,
      north: p.lat + latSpan,
      west: p.lng - lonSpan,
      east: p.lng + lonSpan,
    };

    setTimeout(() => {
      detectFootprints(bounds, p.zoom);
    }, 450);
  };

  const handleSelectMode = (mode: 'viewport' | 'roi-box' | 'point-tap') => {
    setDetectionMode(mode);
    if (mode === 'roi-box' && onRequestDrawRoi) {
      onRequestDrawRoi();
    }
  };

  const handleSelectBuilding = (b: BuildingFootprint) => {
    setSelectedFootprintId(b.id);
    if (onFocusCoordinates) {
      onFocusCoordinates(b.centroid[1], b.centroid[0], Math.min(18, Math.max(currentZoom, 18)));
    }
  };

  const colorThemes = [
    { label: 'AI Red (Reference)', value: '#ef4444' },
    { label: 'Cyan', value: '#00f0ff' },
    { label: 'Coral', value: '#ff3366' },
    { label: 'Gold', value: '#ffcc00' },
    { label: 'Emerald', value: '#10b981' },
    { label: 'Purple', value: '#a855f7' },
  ];

  return (
    <aside className="bld-panel" id="bld-footprint-panel" aria-label="AI Building Footprint Detection">
      {/* Top Header */}
      <div className="bld-header">
        <div className="bld-title-group">
          <div className="bld-icon-glow">
            <span className="icon">apartment</span>
          </div>
          <div>
            <div className="bld-title-row">
              <h2 className="bld-title">AI Building Footprints</h2>
              {indiaMode && <span className="bld-india-pill">🇮🇳 India High-Precision</span>}
            </div>
            <div className="bld-subtitle">Satellite Rooftop & Cadastral Vectorization</div>
          </div>
        </div>

        <div className="bld-header-actions">
          {footprints.length > 0 && (
            <button
              type="button"
              className="bld-clear-btn"
              onClick={clearDetections}
              title="Clear detected footprints"
            >
              <span className="icon">delete_sweep</span>
            </button>
          )}
          <button
            type="button"
            className="bld-close-btn"
            onClick={closePanel}
            title="Close Building Footprint Panel"
          >
            <span className="icon">close</span>
          </button>
        </div>
      </div>

      {/* India Quick Jump & Calibration Bar */}
      <div className="bld-india-bar">
        <button
          type="button"
          className={`bld-india-mode-btn ${indiaMode ? 'active' : ''}`}
          onClick={toggleIndiaMode}
          title="Toggle India High-Density Mode (Party-wall separation, RCC terraces, tin sheets, and Gaj measurements)"
        >
          <span className="icon">tune</span>
          <span>{indiaMode ? '🇮🇳 India Calibration: ON' : 'Global Mode'}</span>
        </button>

        <button
          type="button"
          className={`bld-presets-toggle-btn ${isPresetsExpanded ? 'active' : ''}`}
          onClick={() => setIsPresetsExpanded(!isPresetsExpanded)}
          title="Quick jump to Indian cities (Bengaluru, Delhi, Mumbai, Hyderabad, Pune, Ahmedabad)"
        >
          <span className="icon">explore</span>
          <span>India Presets</span>
          <span className="icon arrow-icon">{isPresetsExpanded ? 'expand_less' : 'expand_more'}</span>
        </button>
      </div>

      {/* India City Presets Drawer */}
      {isPresetsExpanded && (
        <div className="bld-presets-drawer">
          <div className="bld-presets-title">
            <span className="icon">travel_explore</span>
            <span>Select Indian City to Test High Accuracy:</span>
          </div>
          <div className="bld-presets-grid">
            {INDIA_CITY_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="bld-preset-chip"
                onClick={() => handleSelectPreset(p)}
                title={p.description}
              >
                <strong>{p.city}</strong>
                <span className="preset-area">{p.name.split('(')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detection Mode & Engine Selector */}
      <div className="bld-controls-section">
        <div className="bld-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={detectionMode === 'viewport'}
            className={`bld-mode-tab ${detectionMode === 'viewport' ? 'active' : ''}`}
            onClick={() => handleSelectMode('viewport')}
            title="Detect footprints across current map viewport"
          >
            <span className="icon">crop_free</span>
            <span>Current View</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detectionMode === 'roi-box'}
            className={`bld-mode-tab ${detectionMode === 'roi-box' ? 'active' : ''}`}
            onClick={() => handleSelectMode('roi-box')}
            title="Click and drag on the map to draw a custom bounding box"
          >
            <span className="icon">highlight_alt</span>
            <span>Draw ROI Box</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detectionMode === 'point-tap'}
            className={`bld-mode-tab ${detectionMode === 'point-tap' ? 'active' : ''}`}
            onClick={() => handleSelectMode('point-tap')}
            title="Click directly on any building on the map to segment its footprint"
          >
            <span className="icon">touch_app</span>
            <span>Point & Tap</span>
          </button>
        </div>

        <div className="bld-engine-row">
          <label htmlFor="bld-engine-select" className="bld-engine-label">
            <span className="icon">psychology</span>
            <span>AI Engine:</span>
          </label>
          <select
            id="bld-engine-select"
            className="bld-engine-select"
            value={detectionEngine}
            onChange={(e) => setDetectionEngine(e.target.value as any)}
          >
            <option value="hybrid">⚡ Auto-Hybrid (ML + GIS + CV + Florence-2 Fusion)</option>
            <option value="florence2-neural">🧠 Florence-2 Neural (Microsoft Building Segmentation)</option>
            <option value="overture-ml">🎯 ML Precision (Microsoft/Overture ML Polygons)</option>
            <option value="osm-gis">🌐 OSM GIS Ground Truth (Hand-traced Cadastral)</option>
            <option value="cv-optical">🛰️ Optical Satellite AI (Party-Wall Decoupler)</option>
          </select>
        </div>

        {/* Geometry, Density & 3D Options */}
        <div className="bld-options-grid">
          <div className="bld-option-group">
            <span className="bld-opt-label">View 3D:</span>
            <div className="bld-pill-group">
              <button
                type="button"
                className={`bld-pill-btn ${!visualSettings.show3D ? 'active' : ''}`}
                onClick={() => setVisualSettings({ show3D: false, fillOpacity: 0.05 })}
                title="2D Cadastral Vector Outlines (Reference satellite style)"
              >
                📐 2D
              </button>
              <button
                type="button"
                className={`bld-pill-btn bld-3d-btn ${visualSettings.show3D ? 'active' : ''}`}
                onClick={() => setVisualSettings({ show3D: true, fillOpacity: 0.35 })}
                title="3D Building Extrusions with facade lighting and shadows"
              >
                🏢 3D
              </button>
            </div>
          </div>

          <div className="bld-option-group">
            <span className="bld-opt-label">Geometry:</span>
            <div className="bld-pill-group">
              <button
                type="button"
                className={`bld-pill-btn ${visualSettings.geometryMode === 'obb' ? 'active' : ''}`}
                onClick={() => setGeometryMode('obb')}
                title="Oriented Bounding Box: Rotated rectangular architectural footprints (Matches reference image)"
              >
                📐 OBB
              </button>
              <button
                type="button"
                className={`bld-pill-btn ${visualSettings.geometryMode === 'hybrid' ? 'active' : ''}`}
                onClick={() => setGeometryMode('hybrid')}
                title="Smart Hybrid: Rotated rectangles for buildings and regularized contours for complex shapes"
              >
                ⚡ Hybrid
              </button>
              <button
                type="button"
                className={`bld-pill-btn ${visualSettings.geometryMode === 'contour' ? 'active' : ''}`}
                onClick={() => setGeometryMode('contour')}
                title="Polygonal Contours: Multi-vertex contours conforming to complex L/T structures"
              >
                🔷 Poly
              </button>
            </div>
          </div>

          <div className="bld-option-group">
            <span className="bld-opt-label">Coverage:</span>
            <div className="bld-pill-group">
              <button
                type="button"
                className={`bld-pill-btn ${visualSettings.detectionDensity === 'ultra-dense' ? 'active' : ''}`}
                onClick={() => setDetectionDensity('ultra-dense')}
                title="Ultra-Dense: Captures all roofs, sheds, terrace mumties, and warehouses (Matches reference image)"
              >
                🔥 Dense
              </button>
              <button
                type="button"
                className={`bld-pill-btn ${visualSettings.detectionDensity === 'standard' ? 'active' : ''}`}
                onClick={() => setDetectionDensity('standard')}
                title="Standard: Focus on primary residential & commercial dwellings"
              >
                Std
              </button>
            </div>
          </div>
        </div>

        {/* 3D Extrusion Sub-Controls Bar (Visible when 3D is active) */}
        {visualSettings.show3D && (
          <div className="bld-3d-subcontrols">
            <div className="bld-3d-sub-row">
              <span className="bld-3d-label">
                <span className="icon" style={{ fontSize: 13, color: '#00f0ff' }}>view_in_ar</span>
                <span>3D Height:</span>
              </span>
              <div className="bld-pill-group">
                {[1.0, 1.5, 2.0, 3.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`bld-pill-btn-sm ${visualSettings.heightScale === s ? 'active' : ''}`}
                    onClick={() => setHeightScale(s)}
                    title={`Set building extrusion height scale to ${s}x`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              <label className="bld-3d-toggle-label" title="Render architectural floor banding lines on building facades">
                <input
                  type="checkbox"
                  checked={visualSettings.showFloorBands}
                  onChange={toggleFloorBands}
                />
                <span className="bld-toggle-box" />
                <span className="bld-toggle-text">Floors</span>
              </label>
            </div>
          </div>
        )}

        {/* Story/Floor Selector (Visible when a building is selected in 3D mode) */}
        {visualSettings.show3D && selectedBuilding && (selectedBuilding.estimated_floors || 1) >= 2 && (
          <div className="bld-story-selector" id="bld-story-selector">
            <div className="bld-story-header">
              <span className="icon" style={{ fontSize: 14, color: '#00f0ff' }}>layers</span>
              <span className="bld-story-title">Select Floor — {selectedBuilding.name || selectedBuilding.id}</span>
              {selectedStoryIndex && (
                <button
                  type="button"
                  className="bld-story-clear-btn"
                  onClick={() => setSelectedStoryIndex(null)}
                  title="Clear floor selection (show whole building)"
                >
                  <span className="icon" style={{ fontSize: 13 }}>close</span>
                </button>
              )}
            </div>
            <div className="bld-story-floors">
              {Array.from({ length: Math.min(10, selectedBuilding.estimated_floors || 1) }, (_, i) => {
                const floorNum = i + 1;
                const isActive = selectedStoryIndex === floorNum;
                const floorLabel = floorNum === 1 ? 'G' : `${floorNum - 1}F`;
                return (
                  <button
                    key={floorNum}
                    type="button"
                    className={`bld-story-floor-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedStoryIndex(isActive ? null : floorNum)}
                    title={`${isActive ? 'Deselect' : 'Select'} Floor ${floorNum} (${floorLabel})`}
                  >
                    <span className="bld-story-floor-num">{floorLabel}</span>
                    <span className="bld-story-floor-sub">Floor {floorNum}</span>
                  </button>
                );
              })}
            </div>
            {selectedStoryIndex && (
              <div className="bld-story-info">
                <span className="icon" style={{ fontSize: 12, color: '#00f0ff' }}>info</span>
                <span>
                  Floor {selectedStoryIndex} of {selectedBuilding.estimated_floors} •{' '}
                  ~{Math.round((selectedBuilding.area_sqm || 0))} m² per floor •{' '}
                  ~{Math.round(((selectedBuilding.estimated_height_m || 3.5) / (selectedBuilding.estimated_floors || 1)) * 10) / 10}m height
                </span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          id="bld-run-scan-btn"
          className={`bld-scan-action-btn ${isDetecting ? 'scanning' : ''}`}
          onClick={handleScanCurrentView}
          disabled={isDetecting}
        >
          <span className="icon">{isDetecting ? 'hourglass_top' : 'satellite_alt'}</span>
          <span>{isDetecting ? 'Extracting Footprints...' : 'Detect Building Footprints'}</span>
          {isDetecting && <span className="bld-pulse-wave" />}
        </button>

        {detectionMode === 'roi-box' && (
          <div className="bld-mode-instruction">
            <span className="icon">info</span>
            <span>Drag a rectangle on the map with your cursor to analyze that specific parcel.</span>
          </div>
        )}

        {detectionMode === 'point-tap' && (
          <div className="bld-mode-instruction">
            <span className="icon">info</span>
            <span>Click on any rooftop in the satellite map to extract its footprint polygon.</span>
          </div>
        )}
      </div>

      {detectionError && (
        <div className="bld-alert-box">
          <span className="icon">info</span>
          <span>{detectionError}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="bld-body-scrollable">
        {footprints.length > 0 ? (
          <>
            {/* KPI Cards Grid */}
            <div className="bld-kpi-grid">
              {/* Total Buildings Card */}
              <div className="bld-kpi-card">
                <div className="bld-kpi-header">
                  <span className="icon">domain</span>
                  <span className="bld-kpi-label">Buildings</span>
                </div>
                <div className="bld-kpi-value">
                  {metrics.totalCount}
                  <span className="bld-kpi-sub">plots</span>
                </div>
                <div className="bld-kpi-footer">
                  <span>Avg {metrics.avgAreaGaj.toLocaleString()} Gaj</span>
                  <span>•</span>
                  <span>{metrics.avgFloors} fl</span>
                </div>
              </div>

              {/* Total Rooftop Area Card */}
              <div className="bld-kpi-card">
                <div className="bld-kpi-header">
                  <span className="icon">square_foot</span>
                  <span className="bld-kpi-label">Total Built Area</span>
                </div>
                <div className="bld-kpi-value">
                  {metrics.totalAreaGaj.toLocaleString()}
                  <span className="bld-kpi-sub">Gaj</span>
                </div>
                <div className="bld-kpi-footer">
                  <span>{metrics.totalAreaSqm.toLocaleString()} m²</span>
                </div>
              </div>

              {/* Lot Coverage Ratio */}
              <div className="bld-kpi-card">
                <div className="bld-kpi-header">
                  <span className="icon">pie_chart</span>
                  <span className="bld-kpi-label">Lot Coverage</span>
                </div>
                <div className="bld-kpi-value">
                  {metrics.lotCoveragePct}%
                  <span className="bld-kpi-sub">density</span>
                </div>
                <div className="bld-kpi-footer">
                  <span>Built-up ratio</span>
                </div>
              </div>
            </div>

            {/* Source Breakdown */}
            {footprints.length > 0 && (
              <div className="bld-source-breakdown" style={{ display: 'flex', gap: '8px', padding: '4px 12px', fontSize: '11px', color: 'rgba(255,255,255,0.55)', flexWrap: 'wrap' }}>
                <span>📊 Sources:</span>
                {footprints.filter(f => f.source === 'overture-ml').length > 0 && (
                  <span style={{ color: '#a78bfa' }}>🎯 ML: {footprints.filter(f => f.source === 'overture-ml').length}</span>
                )}
                {footprints.filter(f => f.source === 'florence2-neural').length > 0 && (
                  <span style={{ color: '#f472b6' }}>🧠 Florence-2: {footprints.filter(f => f.source === 'florence2-neural').length}</span>
                )}
                {footprints.filter(f => f.source === 'osm-gis').length > 0 && (
                  <span style={{ color: '#34d399' }}>🌐 OSM: {footprints.filter(f => f.source === 'osm-gis').length}</span>
                )}
                {footprints.filter(f => f.source === 'cv-optical').length > 0 && (
                  <span style={{ color: '#fbbf24' }}>🛰️ CV: {footprints.filter(f => f.source === 'cv-optical').length}</span>
                )}
              </div>
            )}
            {/* Structure Classification Filters */}
            <div className="bld-categories-bar">
              <span className="bld-cat-title">Filter Structure:</span>
              <div className="bld-cat-chips">
                <button
                  type="button"
                  className={`bld-cat-chip ${filterCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterCategory('all')}
                >
                  All ({metrics.totalCount})
                </button>
                {metrics.categoryCounts.independentHouse > 0 && (
                  <button
                    type="button"
                    className={`bld-cat-chip residential ${filterCategory === 'independent house' ? 'active' : ''}`}
                    onClick={() => setFilterCategory('independent house')}
                  >
                    🏡 Kothi/House ({metrics.categoryCounts.independentHouse})
                  </button>
                )}
                {metrics.categoryCounts.builderFloor > 0 && (
                  <button
                    type="button"
                    className={`bld-cat-chip builder-floor ${filterCategory === 'builder floor' ? 'active' : ''}`}
                    onClick={() => setFilterCategory('builder floor')}
                  >
                    🏢 Builder Floor ({metrics.categoryCounts.builderFloor})
                  </button>
                )}
                {metrics.categoryCounts.residential > 0 && (
                  <button
                    type="button"
                    className={`bld-cat-chip residential ${filterCategory === 'residential' ? 'active' : ''}`}
                    onClick={() => setFilterCategory('residential')}
                  >
                    🏠 Res ({metrics.categoryCounts.residential})
                  </button>
                )}
                {metrics.categoryCounts.commercial > 0 && (
                  <button
                    type="button"
                    className={`bld-cat-chip commercial ${filterCategory === 'commercial' ? 'active' : ''}`}
                    onClick={() => setFilterCategory('commercial')}
                  >
                    🏪 Com ({metrics.categoryCounts.commercial})
                  </button>
                )}
                {metrics.categoryCounts.industrial > 0 && (
                  <button
                    type="button"
                    className={`bld-cat-chip industrial ${filterCategory === 'industrial' ? 'active' : ''}`}
                    onClick={() => setFilterCategory('industrial')}
                  >
                    🏭 Godown/Shed ({metrics.categoryCounts.industrial})
                  </button>
                )}
                {metrics.categoryCounts.highRise > 0 && (
                  <button
                    type="button"
                    className={`bld-cat-chip highrise ${filterCategory === 'high-rise' ? 'active' : ''}`}
                    onClick={() => setFilterCategory('high-rise')}
                  >
                    🏙️ Tower ({metrics.categoryCounts.highRise})
                  </button>
                )}
              </div>
            </div>

            {/* Visual Styling Toolbar */}
            <div className="bld-visual-toolbar">
              <div className="bld-ref-style-banner">
                <button
                  type="button"
                  className="bld-match-ref-btn"
                  onClick={applyReferenceStyle}
                  title="Apply AI Cadastral Red 2D vector outlines matching the reference satellite image"
                >
                  <span className="icon" style={{ color: '#ef4444' }}>auto_awesome</span>
                  <span>Match Reference View (AI Red 2D Outlines)</span>
                </button>
              </div>

              <div className="bld-visual-row">
                <span className="bld-visual-label">
                  <span className="icon">palette</span>
                  <span>Color:</span>
                </span>
                <div className="bld-color-pickers">
                  {colorThemes.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`bld-color-dot ${visualSettings.strokeColor === c.value ? 'selected' : ''}`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setVisualSettings({ strokeColor: c.value })}
                      title={c.label}
                    />
                  ))}
                </div>

                <label className="bld-3d-toggle-label" title="Render 3D isometric building block extrusions">
                  <input
                    type="checkbox"
                    checked={visualSettings.show3D}
                    onChange={(e) => setVisualSettings({ show3D: e.target.checked })}
                  />
                  <span className="bld-toggle-box" />
                  <span className="bld-toggle-text">3D Extrude</span>
                </label>

                <label className="bld-labels-toggle-label" title="Show roof area labels over footprints">
                  <input
                    type="checkbox"
                    checked={visualSettings.showLabels}
                    onChange={(e) => setVisualSettings({ showLabels: e.target.checked })}
                  />
                  <span className="bld-toggle-box" />
                  <span className="bld-toggle-text">Labels</span>
                </label>
              </div>

              <div className="bld-weight-and-opacity-row">
                <div className="bld-weight-group">
                  <span className="bld-slider-label">Weight:</span>
                  <div className="bld-weight-pills">
                    {[1.2, 1.8, 2.5].map((w) => (
                      <button
                        key={w}
                        type="button"
                        className={`bld-weight-pill ${visualSettings.strokeWeight === w ? 'active' : ''}`}
                        onClick={() => setVisualSettings({ strokeWeight: w })}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bld-opacity-group">
                  <span className="bld-slider-label">Fill:</span>
                  <input
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.05"
                    value={visualSettings.fillOpacity}
                    onChange={(e) => setVisualSettings({ fillOpacity: parseFloat(e.target.value) })}
                    className="bld-opacity-slider"
                  />
                  <span className="bld-slider-val">{Math.round(visualSettings.fillOpacity * 100)}%</span>
                </div>
              </div>
            </div>

            {/* Search & Sort Controls */}
            <div className="bld-filter-row">
              <div className="bld-search-wrap">
                <span className="icon">search</span>
                <input
                  type="text"
                  placeholder="Search by ID, name, or roof material..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bld-search-input"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="bld-clear-search">
                    <span className="icon">close</span>
                  </button>
                )}
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bld-sort-select"
              >
                <option value="area-desc">Largest Plot</option>
                <option value="area-asc">Smallest Plot</option>
                <option value="conf-desc">Highest Confidence</option>
              </select>
            </div>

            {/* List of Detected Building Footprints */}
            <div className="bld-cards-list">
              {filteredFootprints.slice(0, 100).map((b) => {
                const isSelected = selectedFootprintId === b.id;
                return (
                  <div
                    key={b.id}
                    className={`bld-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectBuilding(b)}
                  >
                    <div className="bld-card-top">
                      <div className="bld-card-title">
                        <span className="icon bld-card-icon">
                          {b.classification === 'Commercial'
                            ? 'storefront'
                            : b.classification === 'Industrial'
                            ? 'factory'
                            : b.classification === 'High-Rise'
                            ? 'location_city'
                            : b.classification === 'Builder Floor'
                            ? 'domain'
                            : 'cottage'}
                        </span>
                        <strong>{b.name || b.id}</strong>
                      </div>
                      <span className={`bld-type-badge ${b.classification.toLowerCase().replace(/\s+/g, '-')}`}>
                        {b.classification}
                      </span>
                    </div>

                    <div className="bld-card-details">
                      <div className="bld-metric-item">
                        <span className="bld-metric-k">Plot Size:</span>
                        <span className="bld-metric-v">
                          {b.area_gaj} Gaj ({b.area_sqm} m²)
                        </span>
                      </div>
                      <div className="bld-metric-item">
                        <span className="bld-metric-k">Perimeter:</span>
                        <span className="bld-metric-v">{b.perimeter_m} m</span>
                      </div>
                      <div className="bld-metric-item">
                        <span className="bld-metric-k">Stories:</span>
                        <span className="bld-metric-v">
                          {b.estimated_floors} fl (~{b.estimated_height_m}m)
                          {isSelected && selectedStoryIndex && (
                            <span className="bld-story-indicator"> • Floor {selectedStoryIndex} selected</span>
                          )}
                        </span>
                      </div>
                      <div className="bld-metric-item">
                        <span className="bld-metric-k">Confidence:</span>
                        <span className="bld-metric-v">{Math.round(b.confidence * 100)}%</span>
                      </div>
                    </div>

                    <div className="bld-tags-row">
                      {b.roof_material && (
                        <span className="bld-roof-tag">
                          <span className="icon">roofing</span>
                          <span>{b.roof_material}</span>
                        </span>
                      )}
                      {b.has_mumty_tank && (
                        <span className="bld-tank-tag">
                          <span>🚰 Overhead Tank / Mumty</span>
                        </span>
                      )}
                    </div>

                    <div className="bld-card-footer">
                      <span className="bld-gps-coords">
                        {b.centroid[1].toFixed(5)}°N, {b.centroid[0].toFixed(5)}°E
                      </span>
                      <button
                        type="button"
                        className="bld-focus-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectBuilding(b);
                        }}
                      >
                        <span className="icon">filter_center_focus</span>
                        <span>View</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredFootprints.length > 100 && (
                <div className="bld-list-overflow">
                  Showing first 100 of {filteredFootprints.length} buildings. Use search to refine.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bld-empty-state">
            <div className="bld-empty-icon">
              <span className="icon">satellite_alt</span>
            </div>
            <h3>India High-Precision Building Detection</h3>
            <p>
              Click <strong>"Detect Building Footprints"</strong> or choose an <strong>India Preset</strong> above
              (Bengaluru, Delhi, Mumbai, Hyderabad, Pune) to resolve conjoined row-houses, flat RCC terraces, and
              industrial sheds with zero-setback party-wall separation.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Export Action Footer */}
      {footprints.length > 0 && (
        <div className="bld-export-footer">
          <button
            type="button"
            className="bld-export-btn"
            onClick={exportGeoJSON}
            title="Download GeoJSON FeatureCollection with Indian property tags"
          >
            <span className="icon">download</span>
            <span>GeoJSON</span>
          </button>
          <button
            type="button"
            className="bld-export-btn"
            onClick={exportCSV}
            title="Download CSV spreadsheet with Gaj, m², and story height"
          >
            <span className="icon">table_chart</span>
            <span>CSV (Gaj)</span>
          </button>
          <button
            type="button"
            className="bld-copy-btn"
            onClick={async () => {
              const ok = await copyGeoJSONToClipboard();
              if (ok) alert('GeoJSON copied to clipboard!');
            }}
            title="Copy GeoJSON to clipboard"
          >
            <span className="icon">content_copy</span>
            <span>Copy</span>
          </button>
        </div>
      )}
    </aside>
  );
};
