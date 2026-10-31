import React, { useMemo, useState } from 'react';
import {
  useBuildingFootprintStore,
  computeBuildingMetrics,
  BuildingFootprint,
  INDIA_CITY_PRESETS,
  IndiaCityPreset,
} from '../lib/building-footprint';
import { getCadastralDataForFloor } from '../lib/cadastral-model';

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
    cancelDetection,
    detectFootprints,
    exportGeoJSON,
    exportCSV,
    copyGeoJSONToClipboard,
    applyReferenceStyle,
    setHeightScale,
    toggleFloorBands,
    setGeometryMode,
    setDetectionDensity,
  } = useBuildingFootprintStore();

  const [isPresetsExpanded, setIsPresetsExpanded] = useState(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [isStyleExpanded, setIsStyleExpanded] = useState(false);
  const [floorDataTab, setFloorDataTab] = useState<'datamodel' | 'cards' | 'spatial'>('datamodel');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

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

  const floorDetail = useMemo(() => {
    if (!selectedBuilding || !selectedStoryIndex) return null;
    const totalFloors = Math.min(10, selectedBuilding.estimated_floors || 1);
    const floorNum = selectedStoryIndex;
    const floorLabel = floorNum === 1 ? 'G' : `${floorNum - 1}F`;
    const totalHeight = selectedBuilding.estimated_height_m || totalFloors * 3.5;
    const storyHeight = Math.round((totalHeight / totalFloors) * 10) / 10;
    const baseElevation = Math.round((floorNum - 1) * storyHeight * 10) / 10;
    const ceilingElevation = Math.round(floorNum * storyHeight * 10) / 10;
    const areaSqm = Math.round(selectedBuilding.area_sqm || 0);
    const areaSqft = Math.round(selectedBuilding.area_sqft || areaSqm * 10.7639);
    const areaGaj = Math.round(selectedBuilding.area_gaj || areaSqm * 1.196);

    const usablePct = 84;
    const corePct = 12;
    const utilPct = 4;
    const usableSqm = Math.round((areaSqm * usablePct) / 100);
    const coreSqm = Math.round((areaSqm * corePct) / 100);
    const utilSqm = Math.max(1, areaSqm - usableSqm - coreSqm);
    const perimeterM = Math.round(selectedBuilding.perimeter_m || Math.sqrt(areaSqm) * 4);

    let funcName = `Building Level ${floorNum} (${floorLabel})`;
    let funcSubtitle = 'Standard tenant floorplate with 360° perimeter natural lighting';
    let funcIcon = 'apartment';
    let capacityText = `~${Math.max(2, Math.round(usableSqm / 15))} occupants`;
    let subCapacity = 'Estimated density @ 15 m² per person';

    if (floorNum === 1) {
      funcName = 'Ground Level (G) — Main Entrance & Public Realm';
      funcSubtitle = 'Pedestrian lobby, reception desk, security gates, vehicle drop-off & utility core';
      funcIcon = 'meeting_room';
      capacityText = 'High-Traffic Entrance Core';
      subCapacity = 'Public access, elevator banks & service bay';
    } else if (floorNum === totalFloors) {
      funcName = `Rooftop & Penthouse Level (${floorLabel})`;
      funcSubtitle = 'Executive suites, private panoramic terrace, mechanical HVAC access & mumty feed';
      funcIcon = 'roofing';
      capacityText = 'Penthouse & Terrace Lounge';
      subCapacity = 'Skyline panoramic exposure, stairhead core';
    } else if (selectedBuilding.classification === 'Commercial') {
      funcName = `Corporate Commercial Office (${floorLabel})`;
      funcSubtitle = 'Open-plan agile workstations, executive boardrooms, breakout lounge & server pantry';
      funcIcon = 'corporate_fare';
      const desks = Math.round(usableSqm / 9.5);
      capacityText = `~${desks} Workstations`;
      subCapacity = 'Standard BOMA office density (~9.5 m²/desk)';
    } else if (selectedBuilding.classification === 'Industrial') {
      funcName = `Industrial Production & Logistics (${floorLabel})`;
      funcSubtitle = 'Reinforced load-bearing concrete floor, freight elevator access, staging area';
      funcIcon = 'precision_manufacturing';
      capacityText = `~${Math.max(4, Math.round(usableSqm / 30))} Industrial Staff`;
      subCapacity = 'Heavy machinery & freight corridor rating';
    } else if (
      selectedBuilding.classification === 'Residential' ||
      selectedBuilding.classification === 'Builder Floor' ||
      selectedBuilding.classification === 'Independent House'
    ) {
      funcName = `Residential Living Floorplate (${floorLabel})`;
      funcSubtitle = 'Private residential living quarters, balconies, bedrooms, kitchen & dining suites';
      funcIcon = 'holiday_village';
      const units = Math.max(1, Math.round(usableSqm / 110));
      const residents = Math.max(2, Math.round(usableSqm / 32));
      capacityText = `~${units} Apt ${units === 1 ? 'Unit' : 'Units'} (~${residents} Residents)`;
      subCapacity = `Spacious ${Math.round(usableSqm / units)} m² floorplan per unit`;
    }

    const cadastral = getCadastralDataForFloor(selectedBuilding, floorNum, totalFloors);

    return {
      floorNum,
      floorLabel,
      totalFloors,
      storyHeight,
      baseElevation,
      ceilingElevation,
      areaSqm,
      areaSqft,
      areaGaj,
      usableSqm,
      coreSqm,
      utilSqm,
      usablePct,
      corePct,
      utilPct,
      perimeterM,
      funcName,
      funcSubtitle,
      funcIcon,
      capacityText,
      subCapacity,
      cadastral,
    };
  }, [selectedBuilding, selectedStoryIndex]);

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
  };

  const handleSelectMode = (mode: 'viewport' | 'roi-box' | 'point-tap') => {
    setDetectionMode(mode);
    if (mode === 'roi-box' && onRequestDrawRoi) {
      onRequestDrawRoi();
    }
  };

  const handleSelectBuilding = (b: BuildingFootprint) => {
    setSelectedFootprintId(b.id);
    if (onFocusCoordinates && b.centroid && typeof b.centroid[1] === 'number') {
      onFocusCoordinates(b.centroid[1], b.centroid[0], Math.min(18, Math.max(currentZoom, 18)));
    }
  };

  const handleSelectFloor = (floorNum: number) => {
    const isDeselecting = selectedStoryIndex === floorNum;
    const nextStory = isDeselecting ? null : floorNum;
    setSelectedStoryIndex(nextStory);

    if (nextStory && selectedBuilding && selectedBuilding.centroid && onFocusCoordinates) {
      const heightScale = visualSettings.heightScale || 1.5;
      const h = Math.max(3.0, selectedBuilding.estimated_height_m || 3.5) * heightScale;
      const totalFloors = Math.min(10, selectedBuilding.estimated_floors || 1);
      const fracMid = (nextStory - 0.5) / totalFloors;
      const offsetLat = h * 0.000009 * fracMid;
      const offsetLng = h * 0.000006 * fracMid;

      const floorLat = selectedBuilding.centroid[1] + offsetLat;
      const floorLng = selectedBuilding.centroid[0] + offsetLng;

      onFocusCoordinates(floorLat, floorLng, 20);
    }
  };

  const handleFlyToFloor = (zoomLevel: number = 20) => {
    if (!selectedBuilding || !selectedBuilding.centroid || !selectedStoryIndex || !onFocusCoordinates) return;
    const heightScale = visualSettings.heightScale || 1.5;
    const h = Math.max(3.0, selectedBuilding.estimated_height_m || 3.5) * heightScale;
    const totalFloors = Math.min(10, selectedBuilding.estimated_floors || 1);
    const fracMid = (selectedStoryIndex - 0.5) / totalFloors;
    const offsetLat = h * 0.000009 * fracMid;
    const offsetLng = h * 0.000006 * fracMid;

    onFocusCoordinates(selectedBuilding.centroid[1] + offsetLat, selectedBuilding.centroid[0] + offsetLng, zoomLevel);
  };

  const handleNextFloor = () => {
    if (!selectedBuilding) return;
    const totalFloors = Math.min(10, selectedBuilding.estimated_floors || 1);
    const current = selectedStoryIndex || 1;
    if (current < totalFloors) {
      handleSelectFloor(current + 1);
    }
  };

  const handlePrevFloor = () => {
    if (!selectedBuilding) return;
    const current = selectedStoryIndex || 1;
    if (current > 1) {
      handleSelectFloor(current - 1);
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

  if (!isPanelOpen) return null;

  const cleanPtinDisplay = floorDetail?.cadastral?.unit?.ptin
    ? floorDetail.cadastral.unit.ptin.replace(/^PTIN-/i, '')
    : '';

  const shortUnitDisplay = floorDetail?.cadastral?.unit?.unit_no
    ? floorDetail.cadastral.unit.unit_no.split('-').slice(-2).join('-')
    : 'U0101';

  return (
    <aside className="bld-panel" id="bld-footprint-panel" aria-label="AI Building Footprint Detection">
      {/* Sticky Top Header */}
      <div className="bld-header">
        <div className="bld-title-group">
          <div className="bld-icon-glow">
            <span className="icon">apartment</span>
          </div>
          <div className="bld-title-text-col">
            <div className="bld-title-row">
              <h2 className="bld-title">AI Building Footprints</h2>
              {indiaMode && <span className="bld-india-pill">🇮🇳 India High-Precision</span>}
            </div>
            <div className="bld-subtitle">Satellite Rooftop &amp; Cadastral Vectorization</div>
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

      {/* Sticky Detect Button Bar */}
      <div className="bld-detect-bar">
        <button
          type="button"
          id="bld-run-scan-btn"
          className={`bld-scan-action-btn ${isDetecting ? 'scanning' : ''}`}
          onClick={isDetecting ? cancelDetection : handleScanCurrentView}
        >
          <span className="icon">{isDetecting ? 'stop_circle' : 'satellite_alt'}</span>
          <span>{isDetecting ? 'Stop Detection' : 'Detect Building Footprints'}</span>
          {isDetecting && <span className="bld-pulse-wave" />}
        </button>

        {detectionMode === 'roi-box' && (
          <div className="bld-mode-instruction" style={{ marginTop: 6 }}>
            <span className="icon">info</span>
            <span>Drag a rectangle on the map with your cursor to analyze that specific parcel.</span>
          </div>
        )}

        {detectionMode === 'point-tap' && (
          <div className="bld-mode-instruction" style={{ marginTop: 6 }}>
            <span className="icon">info</span>
            <span>Click on any rooftop in the satellite map to extract its footprint polygon.</span>
          </div>
        )}
      </div>

      {/* Collapsible Settings & Detection Options */}
      <button
        type="button"
        className="bld-settings-toggle"
        onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
      >
        <span className="bld-settings-toggle-left">
          <span className="icon">tune</span>
          <span>Settings &amp; Detection Options</span>
        </span>
        <span className="icon arrow-icon">{isSettingsExpanded ? 'expand_less' : 'expand_more'}</span>
      </button>

      {/* Unified Scrollable Body (Contains Settings Drawer, Floor Explorer, Data Model, and Footprint List) */}
      <div className="bld-body-scrollable">
        {isSettingsExpanded && (
          <div className="bld-settings-content">
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
                  <span>Point &amp; Tap</span>
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
                      title="Oriented Bounding Box: Rotated rectangular architectural footprints"
                    >
                      📐 OBB
                    </button>
                    <button
                      type="button"
                      className={`bld-pill-btn ${visualSettings.geometryMode === 'hybrid' ? 'active' : ''}`}
                      onClick={() => setGeometryMode('hybrid')}
                      title="Smart Hybrid: Rotated rectangles for buildings and regularized contours"
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
                      title="Ultra-Dense: Captures all roofs, sheds, terrace mumties, and warehouses"
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

              {/* 3D Extrusion Sub-Controls Bar */}
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
            </div>
          </div>
        )}

        {detectionError && (
          <div className="bld-alert-box">
            <span className="icon">info</span>
            <span>{detectionError}</span>
          </div>
        )}

        {/* Story/Floor Selector & Inspection Studio (Now smoothly scrollable inside .bld-body-scrollable) */}
        {visualSettings.show3D && selectedBuilding && (selectedBuilding.estimated_floors || 1) >= 2 && (
          <div className="bld-story-selector" id="bld-story-selector">
            <div className="bld-story-header">
              <div className="bld-story-header-left">
                <span className="icon" style={{ fontSize: 16, color: '#00f0ff' }}>layers</span>
                <div className="bld-story-title-box">
                  <span className="bld-story-title">
                    Floor Explorer — {selectedBuilding.name || selectedBuilding.id}
                  </span>
                  <span className="bld-story-subtitle">
                    {selectedBuilding.estimated_floors} Floors • ~{selectedBuilding.estimated_height_m}m Total Height
                  </span>
                </div>
              </div>
              {selectedStoryIndex && (
                <div className="bld-story-header-actions">
                  <button
                    type="button"
                    className="bld-story-step-btn"
                    onClick={handlePrevFloor}
                    disabled={selectedStoryIndex <= 1}
                    title="Step down to lower floor"
                  >
                    <span className="icon">keyboard_arrow_down</span>
                  </button>
                  <button
                    type="button"
                    className="bld-story-step-btn"
                    onClick={handleNextFloor}
                    disabled={selectedStoryIndex >= Math.min(10, selectedBuilding.estimated_floors || 1)}
                    title="Step up to higher floor"
                  >
                    <span className="icon">keyboard_arrow_up</span>
                  </button>
                  <button
                    type="button"
                    className="bld-story-clear-btn"
                    onClick={() => setSelectedStoryIndex(null)}
                    title="Clear floor selection (show whole building)"
                  >
                    <span className="icon" style={{ fontSize: 13 }}>close</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Floor Selector Buttons */}
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
                    onClick={() => handleSelectFloor(floorNum)}
                    title={`${isActive ? 'Deselect' : 'Select & Fly into'} Floor ${floorNum} (${floorLabel})`}
                  >
                    <span className="bld-story-floor-num">{floorLabel}</span>
                    <span className="bld-story-floor-sub">L{floorNum}</span>
                    {isActive && <span className="bld-floor-active-dot" />}
                  </button>
                );
              })}
            </div>

            {/* Detailed Floor Inspection Card */}
            {floorDetail ? (
              <div className="bld-floor-detail-card" id="bld-floor-detail-card">
                {/* Floor Header & Functional Identity */}
                <div className="bld-floor-hero">
                  <div className="bld-floor-hero-badge">
                    <span className="floor-badge-text">{floorDetail.floorLabel}</span>
                    <span className="floor-badge-sub">Level {floorDetail.floorNum}</span>
                  </div>
                  <div className="bld-floor-hero-info">
                    <div className="bld-floor-hero-title">
                      <span className="icon" style={{ fontSize: 15, color: '#00f0ff' }}>{floorDetail.funcIcon}</span>
                      <strong>{floorDetail.funcName}</strong>
                    </div>
                    <div className="bld-floor-hero-sub">{floorDetail.funcSubtitle}</div>
                  </div>
                </div>

                {/* 3D Camera Controls Bar */}
                <div className="bld-floor-cam-bar">
                  <button
                    type="button"
                    className="bld-floor-cam-btn primary"
                    onClick={() => handleFlyToFloor(20)}
                    title="Smoothly fly 3D camera into this floor at 20x zoom"
                  >
                    <span className="icon">videocam</span>
                    <span>3D Camera: Fly into Floor {floorDetail.floorNum}</span>
                  </button>
                  <div className="bld-floor-zoom-presets">
                    <button
                      type="button"
                      className="bld-floor-zoom-pill"
                      onClick={() => handleFlyToFloor(21)}
                      title="Ultra close-up interior view (21x)"
                    >
                      21x Interior
                    </button>
                    <button
                      type="button"
                      className="bld-floor-zoom-pill"
                      onClick={() => handleFlyToFloor(19)}
                      title="Street level view (19x)"
                    >
                      19x Street
                    </button>
                  </div>
                </div>

                {/* Cadastral Key Identifiers Strip (3-Column Single Row, Deduplicated PTIN) */}
                <div className="bld-floor-cadastral-strip">
                  <button
                    type="button"
                    className="bld-cad-badge-pill"
                    onClick={() => handleCopy(floorDetail.cadastral.parcel.ulpin, 'ulpin')}
                    title="Click to copy Unique Land Parcel Identification Number (ULPIN)"
                  >
                    <span className="cad-label">ULPIN</span>
                    <span className="cad-val">{floorDetail.cadastral.parcel.ulpin}</span>
                    <span className="icon cad-copy-icon">
                      {copiedKey === 'ulpin' ? 'check' : 'content_copy'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="bld-cad-badge-pill"
                    onClick={() => handleCopy(floorDetail.cadastral.unit.ptin, 'ptin')}
                    title={`Click to copy Property Tax Identification Number (${floorDetail.cadastral.unit.ptin})`}
                  >
                    <span className="cad-label">PTIN</span>
                    <span className="cad-val">{cleanPtinDisplay}</span>
                    <span className="icon cad-copy-icon">
                      {copiedKey === 'ptin' ? 'check' : 'content_copy'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="bld-cad-badge-pill"
                    onClick={() => handleCopy(floorDetail.cadastral.unit.unit_no, 'unit')}
                    title={`Click to copy Unit Number (${floorDetail.cadastral.unit.unit_no})`}
                  >
                    <span className="cad-label">UNIT NO</span>
                    <span className="cad-val">{shortUnitDisplay}</span>
                    <span className="icon cad-copy-icon">
                      {copiedKey === 'unit' ? 'check' : 'content_copy'}
                    </span>
                  </button>
                </div>

                {/* 3-Segmented Switcher */}
                <div className="bld-dm-segmented-control" role="tablist">
                  <button
                    type="button"
                    className={`bld-dm-seg-btn ${floorDataTab === 'datamodel' ? 'active' : ''}`}
                    onClick={() => setFloorDataTab('datamodel')}
                    title="View complete 9-table cadastral & property tax data model"
                  >
                    <span className="icon">table_chart</span>
                    <span>Data Model (9)</span>
                  </button>
                  <button
                    type="button"
                    className={`bld-dm-seg-btn ${floorDataTab === 'cards' ? 'active' : ''}`}
                    onClick={() => setFloorDataTab('cards')}
                    title="View individual detail cards (Unit, Parcel, Tax, Owner, Legal)"
                  >
                    <span className="icon">dashboard</span>
                    <span>Cards View</span>
                  </button>
                  <button
                    type="button"
                    className={`bld-dm-seg-btn ${floorDataTab === 'spatial' ? 'active' : ''}`}
                    onClick={() => setFloorDataTab('spatial')}
                    title="View spatial areas, elevation, and space utilization"
                  >
                    <span className="icon">straighten</span>
                    <span>Spatial &amp; MEP</span>
                  </button>
                </div>

                {/* TAB 1: Complete 9-Table Data Model (Sidebar-Optimized Stacked Rows) */}
                {floorDataTab === 'datamodel' && (
                  <div className="bld-datamodel-table-wrap">
                    <div className="bld-dm-table-header-row">
                      <div className="bld-dm-title-left">
                        <span className="icon" style={{ fontSize: 14, color: '#00f0ff' }}>account_tree</span>
                        <strong className="bld-dm-head-title">Data Model — Land Parcel &amp; Floor Tax Record</strong>
                      </div>
                      <span className="bld-dm-records-badge">9 Tables Linked</span>
                    </div>

                    <div className="bld-dm-rows-list">
                      {/* 1. PARCEL */}
                      <div className="bld-dm-row-card">
                        <div className="bld-dm-row-top">
                          <span className="bld-table-tag parcel">parcel</span>
                          <span className="bld-note-text">One per land parcel; ULPIN from state registry or provisional</span>
                        </div>
                        <div className="bld-dm-schema-spec">
                          ulpin (PK, business key), provisional_flag, survey_no, ward_id, locality_id, geom (MultiPolygon, 4326), road_id, road_class, corner_plot
                        </div>
                        <div className="bld-dm-live-section">
                          <span className="bld-dm-live-badge">Live Record</span>
                          <div className="bld-dm-field-row">
                            <span className="col-name">ulpin:</span>
                            <strong className="col-val mono highlight">{floorDetail.cadastral.parcel.ulpin}</strong>
                            <span className="col-flag">
                              {floorDetail.cadastral.parcel.provisional_flag ? 'Provisional' : 'PK (State Registry)'}
                            </span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">survey_no:</span>
                            <span className="col-val">{floorDetail.cadastral.parcel.survey_no}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>ward_id:</span>
                            <span className="col-val">{floorDetail.cadastral.parcel.ward_id}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">locality_id:</span>
                            <span className="col-val">{floorDetail.cadastral.parcel.locality_id}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>road_id:</span>
                            <span className="col-val">
                              {floorDetail.cadastral.parcel.road_id} ({floorDetail.cadastral.parcel.road_class})
                            </span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">corner_plot:</span>
                            <span className="col-val">
                              {floorDetail.cadastral.parcel.corner_plot ? 'true (Corner Plot)' : 'false'}
                            </span>
                            <span className="col-name" style={{ marginLeft: 6 }}>geom:</span>
                            <span className="col-val mono">{floorDetail.cadastral.parcel.geom}</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. BUILDING */}
                      <div className="bld-dm-row-card">
                        <div className="bld-dm-row-top">
                          <span className="bld-table-tag building">building</span>
                          <span className="bld-note-text">Height cross-checked with nDSM</span>
                        </div>
                        <div className="bld-dm-schema-spec">
                          building_no (ULPIN-Bnn), parcel_id, floors, height_m, footprint geom, dsm_height_m, oc_ref
                        </div>
                        <div className="bld-dm-live-section">
                          <span className="bld-dm-live-badge">Live Record</span>
                          <div className="bld-dm-field-row">
                            <span className="col-name">building_no:</span>
                            <strong className="col-val mono">{floorDetail.cadastral.building.building_no}</strong>
                            <span className="col-tag">ULPIN-Bnn</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">parcel_id:</span>
                            <span className="col-val mono">{floorDetail.cadastral.building.parcel_id}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>floors:</span>
                            <span className="col-val">{floorDetail.cadastral.building.floors} fl</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>height_m:</span>
                            <span className="col-val">{floorDetail.cadastral.building.height_m}m</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">dsm_height_m:</span>
                            <strong className="col-val" style={{ color: '#38bdf8' }}>
                              {floorDetail.cadastral.building.dsm_height_m}m
                            </strong>
                            <span className="col-name" style={{ marginLeft: 6 }}>oc_ref:</span>
                            <span className="col-val mono">{floorDetail.cadastral.building.oc_ref}</span>
                          </div>
                        </div>
                      </div>

                      {/* 3. UNIT */}
                      <div className="bld-dm-row-card bld-dm-row-active-unit">
                        <div className="bld-dm-row-top">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="bld-table-tag unit">unit</span>
                            <span className="bld-dm-active-pill">Active Floor</span>
                          </div>
                          <span className="bld-note-text">Assessable unit; PTIN from state platform</span>
                        </div>
                        <div className="bld-dm-schema-spec">
                          ptin, unit_no (ULPIN-Bnn-Unnnn), building_id, usage, occupancy, plinth_area, carpet_area, legacy_no[]
                        </div>
                        <div className="bld-dm-live-section">
                          <span className="bld-dm-live-badge">Active Floor Unit Record</span>
                          <div className="bld-dm-field-row">
                            <span className="col-name">ptin:</span>
                            <strong className="col-val mono highlight">{floorDetail.cadastral.unit.ptin}</strong>
                            <span className="col-name" style={{ marginLeft: 6 }}>unit_no:</span>
                            <strong className="col-val mono">{floorDetail.cadastral.unit.unit_no}</strong>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">usage:</span>
                            <span className="col-val">{floorDetail.cadastral.unit.usage}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>occupancy:</span>
                            <span className="col-val">{floorDetail.cadastral.unit.occupancy}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">plinth_area:</span>
                            <span className="col-val">
                              <strong>{floorDetail.cadastral.unit.plinth_area_sqm} m²</strong> (
                              {floorDetail.cadastral.unit.plinth_area_sqft.toLocaleString()} sq ft)
                            </span>
                            <span className="col-name" style={{ marginLeft: 6 }}>carpet_area:</span>
                            <span className="col-val">
                              <strong>{floorDetail.cadastral.unit.carpet_area_sqm} m²</strong>
                            </span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">legacy_no[]:</span>
                            <span className="col-val mono">
                              [{Array.isArray(floorDetail.cadastral?.unit?.legacy_no)
                                ? floorDetail.cadastral.unit.legacy_no.join(', ')
                                : ''}]
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 4. SEGMENT */}
                      <div className="bld-dm-row-card">
                        <div className="bld-dm-row-top">
                          <span className="bld-table-tag segment">segment</span>
                          <span className="bld-note-text">Part-area use taxed on its own area</span>
                        </div>
                        <div className="bld-dm-schema-spec">
                          unit_id, segment_type (ATM, kiosk, tower, hoarding), area_sqm, licence_ref
                        </div>
                        <div className="bld-dm-live-section">
                          <span className="bld-dm-live-badge">Live Record</span>
                          <div className="bld-dm-field-row">
                            <span className="col-name">unit_id:</span>
                            <span className="col-val mono">{floorDetail.cadastral.segment.unit_id}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">segment_type:</span>
                            <strong className="col-val" style={{ color: '#fbbf24' }}>
                              {floorDetail.cadastral.segment.segment_type}
                            </strong>
                            <span className="col-name" style={{ marginLeft: 6 }}>area_sqm:</span>
                            <span className="col-val">
                              <strong>{floorDetail.cadastral.segment.area_sqm} m²</strong>
                            </span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">licence_ref:</span>
                            <span className="col-val mono">{floorDetail.cadastral.segment.licence_ref}</span>
                          </div>
                        </div>
                      </div>

                      {/* 5. OWNER_LINK */}
                      <div className="bld-dm-row-card">
                        <div className="bld-dm-row-top">
                          <span className="bld-table-tag owner">owner_link</span>
                          <span className="bld-note-text">Ownership history; party in citizen master</span>
                        </div>
                        <div className="bld-dm-schema-spec">
                          unit_id, party_id, share_pct, from_date, to_date, source (deed, mutation)
                        </div>
                        <div className="bld-dm-live-section">
                          <span className="bld-dm-live-badge">Live Record</span>
                          <div className="bld-dm-field-row">
                            <span className="col-name">party_id:</span>
                            <span className="col-val mono">{floorDetail.cadastral.owner_link.party_id}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>name:</span>
                            <strong className="col-val">{floorDetail.cadastral.owner_link.party_name}</strong>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">share_pct:</span>
                            <span className="col-val">{floorDetail.cadastral.owner_link.share_pct}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>validity:</span>
                            <span className="col-val">
                              {floorDetail.cadastral.owner_link.from_date} to {floorDetail.cadastral.owner_link.to_date}
                            </span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">source:</span>
                            <span className="col-val">{floorDetail.cadastral.owner_link.source}</span>
                          </div>
                        </div>
                      </div>

                      {/* 6. ASSESSMENT */}
                      <div className="bld-dm-row-card">
                        <div className="bld-dm-row-top">
                          <span className="bld-table-tag assessment">assessment</span>
                          <span className="bld-note-text">Calculated by rules engine DMN</span>
                        </div>
                        <div className="bld-dm-schema-spec">
                          unit_id, type (new, re, back, self, revision), arv, tax_rates_version, effective_from, status, workflow_id
                        </div>
                        <div className="bld-dm-live-section">
                          <span className="bld-dm-live-badge">Live Record</span>
                          <div className="bld-dm-field-row">
                            <span className="col-name">arv:</span>
                            <strong className="col-val" style={{ color: '#34d399' }}>
                              ₹ {floorDetail.cadastral.assessment.arv.toLocaleString()} / annum
                            </strong>
                            <span className="col-name" style={{ marginLeft: 6 }}>type:</span>
                            <span className="col-val">{floorDetail.cadastral.assessment.type}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">tax_rates_version:</span>
                            <span className="col-val mono">{floorDetail.cadastral.assessment.tax_rates_version}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>effective_from:</span>
                            <span className="col-val">{floorDetail.cadastral.assessment.effective_from}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">status:</span>
                            <span className="col-val" style={{ color: '#34d399' }}>
                              {floorDetail.cadastral.assessment.status}
                            </span>
                            <span className="col-name" style={{ marginLeft: 6 }}>workflow_id:</span>
                            <span className="col-val mono">{floorDetail.cadastral.assessment.workflow_id}</span>
                          </div>
                        </div>
                      </div>

                      {/* 7. DEMAND */}
                      <div className="bld-dm-row-card">
                        <div className="bld-dm-row-top">
                          <span className="bld-table-tag demand">demand</span>
                          <span className="bld-note-text">Immutable lines; corrections by adjustment</span>
                        </div>
                        <div className="bld-dm-schema-spec">
                          unit_id, period (H1/H2 yyyy), head (tax, cess, penalty, interest, arrear), amount, rebate, due_date, status
                        </div>
                        <div className="bld-dm-live-section">
                          <span className="bld-dm-live-badge">Live Record</span>
                          <div className="bld-dm-field-row">
                            <span className="col-name">period:</span>
                            <span className="col-val font-semibold">{floorDetail.cadastral.demand.period}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>due_date:</span>
                            <span className="col-val">{floorDetail.cadastral.demand.due_date}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">head:</span>
                            <span className="col-val">{floorDetail.cadastral.demand.head}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">amount:</span>
                            <strong className="col-val">₹ {floorDetail.cadastral.demand.amount.toLocaleString()}</strong>
                            <span className="col-name" style={{ marginLeft: 6 }}>rebate:</span>
                            <span className="col-val" style={{ color: '#34d399' }}>
                              -₹ {floorDetail.cadastral.demand.rebate.toLocaleString()}
                            </span>
                            <span className="col-name" style={{ marginLeft: 6 }}>status:</span>
                            <span className="col-tag-paid">{floorDetail.cadastral.demand.status}</span>
                          </div>
                        </div>
                      </div>

                      {/* 8. RECEIPT / ADJUSTMENT */}
                      <div className="bld-dm-row-card">
                        <div className="bld-dm-row-top">
                          <span className="bld-table-tag receipt">receipt / adjustment</span>
                          <span className="bld-note-text">Maker-checker on adjustments</span>
                        </div>
                        <div className="bld-dm-schema-spec">
                          {'receipt_no, payment_ref, lines[{demand_id, amount}], channel, realised_at / adj_type, reason, approver'}
                        </div>
                        <div className="bld-dm-live-section">
                          <span className="bld-dm-live-badge">Live Record</span>
                          <div className="bld-dm-field-row">
                            <span className="col-name">receipt_no:</span>
                            <strong className="col-val mono highlight">
                              {floorDetail.cadastral.receipt_adjustment.receipt_no}
                            </strong>
                            <span className="col-name" style={{ marginLeft: 6 }}>channel:</span>
                            <span className="col-val">{floorDetail.cadastral.receipt_adjustment.channel}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">payment_ref:</span>
                            <span className="col-val mono">{floorDetail.cadastral.receipt_adjustment.payment_ref}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>realised_at:</span>
                            <span className="col-val">{floorDetail.cadastral.receipt_adjustment.realised_at}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">approver:</span>
                            <span className="col-val mono">{floorDetail.cadastral.receipt_adjustment.approver}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>adj_type:</span>
                            <span className="col-val">{floorDetail.cadastral.receipt_adjustment.adj_type}</span>
                          </div>
                        </div>
                      </div>

                      {/* 9. NOTICE / PETITION */}
                      <div className="bld-dm-row-card">
                        <div className="bld-dm-row-top">
                          <span className="bld-table-tag notice">notice / petition</span>
                          <span className="bld-note-text">Petitions become Legal cases (I-17)</span>
                        </div>
                        <div className="bld-dm-schema-spec">
                          notice_type, served_at, served_by, geo_point / petition_no, grounds, lgl_case_ref
                        </div>
                        <div className="bld-dm-live-section">
                          <span className="bld-dm-live-badge">Live Record</span>
                          <div className="bld-dm-field-row">
                            <span className="col-name">notice_type:</span>
                            <strong className="col-val">{floorDetail.cadastral.notice_petition.notice_type}</strong>
                            <span className="col-name" style={{ marginLeft: 6 }}>served_at:</span>
                            <span className="col-val">{floorDetail.cadastral.notice_petition.served_at}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">served_by:</span>
                            <span className="col-val">{floorDetail.cadastral.notice_petition.served_by}</span>
                            <span className="col-name" style={{ marginLeft: 6 }}>geo_point:</span>
                            <span className="col-val mono">{floorDetail.cadastral.notice_petition.geo_point}</span>
                          </div>
                          <div className="bld-dm-field-row">
                            <span className="col-name">petition_no:</span>
                            <span className="col-val" style={{ color: '#34d399' }}>
                              {floorDetail.cadastral.notice_petition.petition_no}
                            </span>
                            <span className="col-name" style={{ marginLeft: 6 }}>lgl_case_ref:</span>
                            <span className="col-val">{floorDetail.cadastral.notice_petition.lgl_case_ref}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: ALL DETAILED CARDS VIEW */}
                {floorDataTab === 'cards' && (
                  <div className="bld-dm-cards-stack">
                    <div className="bld-cadastral-card">
                      <div className="bld-cad-card-head">
                        <span className="icon" style={{ color: '#00f0ff' }}>apartment</span>
                        <strong>Assessable Unit Record — {floorDetail.cadastral.unit.unit_no}</strong>
                      </div>
                      <div className="bld-cad-card-grid">
                        <div className="cad-field">
                          <span className="field-k">PTIN (State Platform):</span>
                          <span className="field-v mono highlight">{floorDetail.cadastral.unit.ptin}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Unit Number:</span>
                          <span className="field-v mono">{floorDetail.cadastral.unit.unit_no}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Usage / Zone:</span>
                          <span className="field-v">{floorDetail.cadastral.unit.usage}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Occupancy Status:</span>
                          <span className="field-v">{floorDetail.cadastral.unit.occupancy}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Plinth Area:</span>
                          <span className="field-v">
                            {floorDetail.cadastral.unit.plinth_area_sqm} m² (
                            {floorDetail.cadastral.unit.plinth_area_sqft.toLocaleString()} sq ft)
                          </span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Carpet Area:</span>
                          <span className="field-v">
                            {floorDetail.cadastral.unit.carpet_area_sqm} m² (
                            {floorDetail.cadastral.unit.carpet_area_sqft.toLocaleString()} sq ft)
                          </span>
                        </div>
                        <div className="cad-field full">
                          <span className="field-k">Legacy Numbers:</span>
                          <span className="field-v mono">
                            {Array.isArray(floorDetail.cadastral?.unit?.legacy_no)
                              ? floorDetail.cadastral.unit.legacy_no.join(' • ')
                              : 'None'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bld-cadastral-card">
                      <div className="bld-cad-card-head">
                        <span className="icon" style={{ color: '#38bdf8' }}>terrain</span>
                        <strong>Land Parcel Record — {floorDetail.cadastral.parcel.ulpin}</strong>
                      </div>
                      <div className="bld-cad-card-grid">
                        <div className="cad-field">
                          <span className="field-k">Survey Number:</span>
                          <span className="field-v">{floorDetail.cadastral.parcel.survey_no}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Ward &amp; Zone:</span>
                          <span className="field-v">{floorDetail.cadastral.parcel.ward_id}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Locality:</span>
                          <span className="field-v">{floorDetail.cadastral.parcel.locality_id}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Road Class:</span>
                          <span className="field-v">{floorDetail.cadastral.parcel.road_class}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Corner Plot:</span>
                          <span className="field-v">
                            {floorDetail.cadastral.parcel.corner_plot ? 'Yes (Corner Advantage)' : 'Standard Mid-Block'}
                          </span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Registry Status:</span>
                          <span className="field-v" style={{ color: '#34d399' }}>Verified (Non-Provisional)</span>
                        </div>
                      </div>
                    </div>

                    <div className="bld-cadastral-card">
                      <div className="bld-cad-card-head">
                        <span className="icon" style={{ color: '#fbbf24' }}>storefront</span>
                        <strong>Part-Area Taxable Segment (Floor {floorDetail.floorNum})</strong>
                      </div>
                      <div className="bld-cad-card-grid">
                        <div className="cad-field">
                          <span className="field-k">Segment Type:</span>
                          <span className="field-v font-bold">{floorDetail.cadastral.segment.segment_type}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Segment Area:</span>
                          <span className="field-v">{floorDetail.cadastral.segment.area_sqm} m²</span>
                        </div>
                        <div className="cad-field full">
                          <span className="field-k">Municipal Licence Ref:</span>
                          <span className="field-v mono">{floorDetail.cadastral.segment.licence_ref}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bld-cadastral-card">
                      <div className="bld-cad-card-head">
                        <span className="icon" style={{ color: '#34d399' }}>calculate</span>
                        <strong>DMN Rules Engine Assessment — {floorDetail.cadastral.assessment.workflow_id}</strong>
                      </div>
                      <div className="bld-cad-card-grid">
                        <div className="cad-field">
                          <span className="field-k">Annual Rateable Value (ARV):</span>
                          <span className="field-v highlight font-bold">
                            ₹ {floorDetail.cadastral.assessment.arv.toLocaleString()} / yr
                          </span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Assessment Model:</span>
                          <span className="field-v mono">{floorDetail.cadastral.assessment.tax_rates_version}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Effective From:</span>
                          <span className="field-v">{floorDetail.cadastral.assessment.effective_from}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Approval Status:</span>
                          <span className="field-v" style={{ color: '#34d399' }}>
                            {floorDetail.cadastral.assessment.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bld-cadastral-card">
                      <div className="bld-cad-card-head">
                        <span className="icon" style={{ color: '#f59e0b' }}>receipt_long</span>
                        <strong>Property Tax Demand — {floorDetail.cadastral.demand.period}</strong>
                      </div>
                      <div className="bld-cad-card-grid">
                        <div className="cad-field full">
                          <span className="field-k">Itemized Heads:</span>
                          <span className="field-v">{floorDetail.cadastral.demand.head}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Gross Demand:</span>
                          <span className="field-v">₹ {floorDetail.cadastral.demand.amount.toLocaleString()}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Rebate (Early Bird 5%):</span>
                          <span className="field-v" style={{ color: '#34d399' }}>
                            -₹ {floorDetail.cadastral.demand.rebate.toLocaleString()}
                          </span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Net Amount Realized:</span>
                          <span className="field-v highlight font-bold">
                            ₹ {floorDetail.cadastral.demand.net_amount.toLocaleString()}
                          </span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Payment Status:</span>
                          <span className="col-tag-paid">{floorDetail.cadastral.demand.status}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bld-cadastral-card">
                      <div className="bld-cad-card-head">
                        <span className="icon" style={{ color: '#38bdf8' }}>verified</span>
                        <strong>Payment Realization Receipt — {floorDetail.cadastral.receipt_adjustment.receipt_no}</strong>
                      </div>
                      <div className="bld-cad-card-grid">
                        <div className="cad-field">
                          <span className="field-k">Payment Ref:</span>
                          <span className="field-v mono">{floorDetail.cadastral.receipt_adjustment.payment_ref}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Gateway Channel:</span>
                          <span className="field-v">{floorDetail.cadastral.receipt_adjustment.channel}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Realized Timestamp:</span>
                          <span className="field-v">{floorDetail.cadastral.receipt_adjustment.realised_at}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Maker-Checker Approver:</span>
                          <span className="field-v mono">{floorDetail.cadastral.receipt_adjustment.approver}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bld-cadastral-card">
                      <div className="bld-cad-card-head">
                        <span className="icon" style={{ color: '#00f0ff' }}>person</span>
                        <strong>Owner Link &amp; Title Record — {floorDetail.cadastral.owner_link.party_id}</strong>
                      </div>
                      <div className="bld-cad-card-grid">
                        <div className="cad-field full">
                          <span className="field-k">Registered Owner(s):</span>
                          <span className="field-v font-bold" style={{ fontSize: 13, color: '#ffffff' }}>
                            {floorDetail.cadastral.owner_link.party_name}
                          </span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Citizen Master Party ID:</span>
                          <span className="field-v mono">{floorDetail.cadastral.owner_link.party_id}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Ownership Share:</span>
                          <span className="field-v">{floorDetail.cadastral.owner_link.share_pct}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Ownership Period:</span>
                          <span className="field-v">
                            {floorDetail.cadastral.owner_link.from_date} to {floorDetail.cadastral.owner_link.to_date}
                          </span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Legal Title Source:</span>
                          <span className="field-v">{floorDetail.cadastral.owner_link.source}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bld-cadastral-card">
                      <div className="bld-cad-card-head">
                        <span className="icon" style={{ color: '#34d399' }}>policy</span>
                        <strong>Notices &amp; Legal Petitions (I-17 Compliance)</strong>
                      </div>
                      <div className="bld-cad-card-grid">
                        <div className="cad-field">
                          <span className="field-k">Notice Served:</span>
                          <span className="field-v">{floorDetail.cadastral.notice_petition.notice_type}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Served Date:</span>
                          <span className="field-v">{floorDetail.cadastral.notice_petition.served_at}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Inspecting Officer:</span>
                          <span className="field-v">{floorDetail.cadastral.notice_petition.served_by}</span>
                        </div>
                        <div className="cad-field">
                          <span className="field-k">Geo-Point:</span>
                          <span className="field-v mono">{floorDetail.cadastral.notice_petition.geo_point}</span>
                        </div>
                        <div className="cad-field full">
                          <span className="field-k">Petition / Grounds:</span>
                          <span className="field-v" style={{ color: '#34d399' }}>
                            {floorDetail.cadastral.notice_petition.grounds}
                          </span>
                        </div>
                        <div className="cad-field full">
                          <span className="field-k">Dispute Case Reference:</span>
                          <span className="field-v">{floorDetail.cadastral.notice_petition.lgl_case_ref}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: SPATIAL & MEP METRICS */}
                {floorDataTab === 'spatial' && (
                  <>
                    <div className="bld-floor-kpi-grid">
                      <div className="bld-floor-kpi">
                        <div className="kpi-label">
                          <span className="icon">aspect_ratio</span>
                          <span>Plinth Area</span>
                        </div>
                        <div className="kpi-val">
                          {floorDetail.areaSqm.toLocaleString()} <span className="kpi-unit">m²</span>
                        </div>
                        <div className="kpi-sub">
                          {indiaMode
                            ? `${floorDetail.areaGaj.toLocaleString()} Gaj`
                            : `${floorDetail.areaSqft.toLocaleString()} sq ft`}
                        </div>
                      </div>

                      <div className="bld-floor-kpi">
                        <div className="kpi-label">
                          <span className="icon">height</span>
                          <span>Floor Elevation</span>
                        </div>
                        <div className="kpi-val">
                          +{floorDetail.baseElevation} <span className="kpi-unit">m</span>
                        </div>
                        <div className="kpi-sub">
                          Ceiling: +{floorDetail.ceilingElevation}m • {floorDetail.storyHeight}m clr
                        </div>
                      </div>

                      <div className="bld-floor-kpi">
                        <div className="kpi-label">
                          <span className="icon">groups</span>
                          <span>Est. Capacity</span>
                        </div>
                        <div className="kpi-val-text">{floorDetail.capacityText}</div>
                        <div className="kpi-sub">{floorDetail.subCapacity}</div>
                      </div>

                      <div className="bld-floor-kpi">
                        <div className="kpi-label">
                          <span className="icon">straighten</span>
                          <span>Envelope &amp; Perimeter</span>
                        </div>
                        <div className="kpi-val">
                          ~{floorDetail.perimeterM} <span className="kpi-unit">m</span>
                        </div>
                        <div className="kpi-sub">
                          {selectedBuilding.orientation_deg
                            ? `${selectedBuilding.orientation_deg}° Orientation`
                            : '4 Natural Light Facades'}
                        </div>
                      </div>
                    </div>

                    <div className="bld-floor-space-section">
                      <div className="bld-floor-space-header">
                        <span>Space Utilization Breakdown</span>
                        <span className="bld-floor-space-eff">{floorDetail.usablePct}% Usable Efficiency</span>
                      </div>
                      <div className="bld-floor-space-bar">
                        <div
                          className="bld-space-seg carpet"
                          style={{ width: `${floorDetail.usablePct}%` }}
                          title={`Carpet / Usable Area: ${floorDetail.usableSqm} m² (${floorDetail.usablePct}%)`}
                        />
                        <div
                          className="bld-space-seg core"
                          style={{ width: `${floorDetail.corePct}%` }}
                          title={`Core & Circulation: ${floorDetail.coreSqm} m² (${floorDetail.corePct}%)`}
                        />
                        <div
                          className="bld-space-seg util"
                          style={{ width: `${floorDetail.utilPct}%` }}
                          title={`Utilities & Services: ${floorDetail.utilSqm} m² (${floorDetail.utilPct}%)`}
                        />
                      </div>
                      <div className="bld-floor-space-legend">
                        <div className="legend-item">
                          <span className="legend-dot carpet" />
                          <span>
                            Carpet: <strong>{floorDetail.usableSqm}m²</strong>
                          </span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-dot core" />
                          <span>
                            Circulation / Core: <strong>{floorDetail.coreSqm}m²</strong>
                          </span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-dot util" />
                          <span>
                            Utilities: <strong>{floorDetail.utilSqm}m²</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bld-floor-badges">
                      <span className="bld-floor-feature-badge">
                        <span className="icon" style={{ fontSize: 11, color: '#38bdf8' }}>bolt</span>
                        Sub-Metered Power
                      </span>
                      <span className="bld-floor-feature-badge">
                        <span className="icon" style={{ fontSize: 11, color: '#34d399' }}>elevator</span>
                        Core Lift Access
                      </span>
                      <span className="bld-floor-feature-badge">
                        <span className="icon" style={{ fontSize: 11, color: '#fbbf24' }}>wb_sunny</span>
                        360° Daylight
                      </span>
                      {selectedBuilding.has_mumty_tank && (
                        <span className="bld-floor-feature-badge">
                          <span className="icon" style={{ fontSize: 11, color: '#60a5fa' }}>water_drop</span>
                          Overhead Tank Feed
                        </span>
                      )}
                      <span className="bld-floor-feature-badge">
                        <span className="icon" style={{ fontSize: 11, color: '#f87171' }}>local_fire_department</span>
                        Fire Egress Zone
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="bld-story-hint">
                <span className="icon" style={{ fontSize: 13, color: '#00f0ff' }}>touch_app</span>
                <span>
                  Select any floor above to inspect its floorplate metrics and fly the 3D camera into that level.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Detected Footprints Summary & List */}
        {footprints.length > 0 ? (
          <>
            <div className="bld-kpi-compact">
              <div className="bld-kpi-stat">
                <span className="icon">domain</span>
                <strong>{metrics.totalCount}</strong>
                <span>plots</span>
                <span className="bld-kpi-detail">
                  Avg {metrics.avgAreaGaj.toLocaleString()} Gaj &bull; {metrics.avgFloors} fl
                </span>
              </div>
              <div className="bld-kpi-divider" />
              <div className="bld-kpi-stat">
                <span className="icon">square_foot</span>
                <strong>{metrics.totalAreaGaj.toLocaleString()}</strong>
                <span>Gaj</span>
              </div>
              <div className="bld-kpi-divider" />
              <div className="bld-kpi-stat">
                <span className="icon">pie_chart</span>
                <strong>{metrics.lotCoveragePct}%</strong>
                <span>coverage</span>
              </div>
            </div>

            <div
              className="bld-source-breakdown"
              style={{
                display: 'flex',
                gap: '8px',
                padding: '4px 10px',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.6)',
                flexWrap: 'wrap',
              }}
            >
              <span>📊 Sources:</span>
              {footprints.filter((f) => f.source === 'overture-ml').length > 0 && (
                <span style={{ color: '#a78bfa' }}>
                  🎯 ML: {footprints.filter((f) => f.source === 'overture-ml').length}
                </span>
              )}
              {footprints.filter((f) => f.source === 'florence2-neural').length > 0 && (
                <span style={{ color: '#f472b6' }}>
                  🧠 Florence-2: {footprints.filter((f) => f.source === 'florence2-neural').length}
                </span>
              )}
              {footprints.filter((f) => f.source === 'osm-gis').length > 0 && (
                <span style={{ color: '#34d399' }}>
                  🌐 OSM: {footprints.filter((f) => f.source === 'osm-gis').length}
                </span>
              )}
              {footprints.filter((f) => f.source === 'cv-optical').length > 0 && (
                <span style={{ color: '#fbbf24' }}>
                  🛰️ CV: {footprints.filter((f) => f.source === 'cv-optical').length}
                </span>
              )}
            </div>

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

            <button
              type="button"
              className="bld-style-toggle"
              onClick={() => setIsStyleExpanded(!isStyleExpanded)}
            >
              <span className="bld-style-toggle-left">
                <span className="icon">palette</span>
                <span>Visual Style</span>
              </span>
              <span className="icon arrow-icon">{isStyleExpanded ? 'expand_less' : 'expand_more'}</span>
            </button>

            {isStyleExpanded && (
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
            )}

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
                        {b.centroid && typeof b.centroid[1] === 'number'
                          ? `${b.centroid[1].toFixed(5)}°N, ${b.centroid[0].toFixed(5)}°E`
                          : 'Coordinates active'}
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

      {/* Sticky Bottom Export Action Footer */}
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
