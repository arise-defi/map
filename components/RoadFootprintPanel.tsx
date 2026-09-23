import React, { useMemo, useState } from 'react';
import {
  useRoadFootprintStore,
  computeRoadMetrics,
  RoadFootprint,
  INDIA_ROAD_PRESETS,
  IndiaCityPreset,
  ROAD_CLASSIFICATION_STYLES,
} from '../lib/road-footprint';
import { useBuildingFootprintStore } from '../lib/building-footprint';

interface RoadFootprintPanelProps {
  currentLat: number;
  currentLng: number;
  currentZoom: number;
  onFocusCoordinates?: (lat: number, lng: number, zoom?: number) => void;
}

export const RoadFootprintPanel: React.FC<RoadFootprintPanelProps> = ({
  currentLat,
  currentLng,
  currentZoom,
  onFocusCoordinates,
}) => {
  const {
    isPanelOpen,
    isDetecting,
    detectionEngine,
    roads,
    selectedRoadId,
    visualSettings,
    searchQuery,
    filterClass,
    detectionError,
    closePanel,
    setDetectionEngine,
    setSelectedRoadId,
    setVisualSettings,
    setSearchQuery,
    setFilterClass,
    clearDetections,
    detectRoads,
    exportGeoJSON,
    exportCSV,
  } = useRoadFootprintStore();

  const [isPresetsExpanded, setIsPresetsExpanded] = useState(false);

  const metrics = useMemo(() => computeRoadMetrics(roads), [roads]);

  const filteredRoads = useMemo(() => {
    let list = [...roads];

    if (filterClass !== 'all') {
      list = list.filter((r) => r.highway_class === filterClass);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.ref && r.ref.toLowerCase().includes(q)) ||
          r.highway_class.includes(q)
      );
    }

    // Sort by length descending
    list.sort((a, b) => b.length_m - a.length_m);
    return list;
  }, [roads, filterClass, searchQuery]);

  if (!isPanelOpen) return null;

  const handleScanCurrentView = () => {
    const bldBounds = useBuildingFootprintStore.getState().currentMapBounds;
    if (bldBounds) {
      detectRoads(bldBounds);
    } else {
      const latSpan = (180 / Math.pow(2, currentZoom)) * 1.5;
      const lonSpan = (360 / Math.pow(2, currentZoom)) * 2.2;
      detectRoads({
        south: Math.max(-85, currentLat - latSpan),
        north: Math.min(85, currentLat + latSpan),
        west: currentLng - lonSpan,
        east: currentLng + lonSpan,
      });
    }
  };

  const handleSelectPreset = (p: IndiaCityPreset) => {
    if (onFocusCoordinates) {
      onFocusCoordinates(p.lat, p.lng, p.zoom);
    }
    const latSpan = (180 / Math.pow(2, p.zoom)) * 1.5;
    const lonSpan = (360 / Math.pow(2, p.zoom)) * 2.2;
    setTimeout(() => {
      detectRoads({
        south: p.lat - latSpan,
        north: p.lat + latSpan,
        west: p.lng - lonSpan,
        east: p.lng + lonSpan,
      });
    }, 450);
  };

  const handleSelectRoad = (r: RoadFootprint) => {
    setSelectedRoadId(r.id);
    if (onFocusCoordinates) {
      onFocusCoordinates(r.centroid[1], r.centroid[0], Math.min(18, Math.max(currentZoom, 17)));
    }
  };

  // Get top classification categories for filter chips
  const topClasses = Object.entries(metrics.classificationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <aside className="road-panel" id="road-footprint-panel" aria-label="AI Road Footprint Detection">
      {/* Header */}
      <div className="bld-header" style={{ borderBottom: '1px solid rgba(249, 115, 22, 0.2)' }}>
        <div className="bld-title-group">
          <div className="bld-icon-glow" style={{ background: 'rgba(249, 115, 22, 0.15)' }}>
            <span className="icon" style={{ color: '#f97316' }}>route</span>
          </div>
          <div>
            <div className="bld-title-row">
              <h2 className="bld-title" style={{ color: '#f97316' }}>AI Road Footprints</h2>
              <span className="bld-india-pill" style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#f97316' }}>🇮🇳 India</span>
            </div>
            <div className="bld-subtitle">Road Network Vectorization & Classification</div>
          </div>
        </div>
        <div className="bld-header-actions">
          {roads.length > 0 && (
            <button type="button" className="bld-clear-btn" onClick={clearDetections} title="Clear road detections">
              <span className="icon">delete_sweep</span>
            </button>
          )}
          <button type="button" className="bld-close-btn" onClick={closePanel} title="Close Road Footprint Panel">
            <span className="icon">close</span>
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="bld-india-bar">
        <button
          type="button"
          className={`bld-presets-toggle-btn ${isPresetsExpanded ? 'active' : ''}`}
          onClick={() => setIsPresetsExpanded(!isPresetsExpanded)}
          title="Quick jump to Indian cities for road network testing"
        >
          <span className="icon">explore</span>
          <span>India Road Presets</span>
          <span className="icon arrow-icon">{isPresetsExpanded ? 'expand_less' : 'expand_more'}</span>
        </button>
      </div>

      {isPresetsExpanded && (
        <div className="bld-presets-drawer">
          <div className="bld-presets-title">
            <span className="icon">travel_explore</span>
            <span>Select City for Road Network Analysis:</span>
          </div>
          <div className="bld-presets-grid">
            {INDIA_ROAD_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="bld-preset-chip"
                onClick={() => handleSelectPreset(p)}
                title={p.description}
              >
                <strong>{p.city}</strong>
                <span className="preset-area">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bld-controls-section">
        <div className="bld-engine-row">
          <label htmlFor="road-engine-select" className="bld-engine-label">
            <span className="icon">psychology</span>
            <span>AI Engine:</span>
          </label>
          <select
            id="road-engine-select"
            className="bld-engine-select"
            value={detectionEngine}
            onChange={(e) => setDetectionEngine(e.target.value as any)}
          >
            <option value="hybrid">⚡ Auto-Hybrid (OSM + ML Fusion)</option>
            <option value="osm-gis">🌐 OSM GIS Ground Truth (Hand-traced)</option>
            <option value="overture-ml">🎯 ML Precision (All Roads)</option>
          </select>
        </div>

        {/* Color Mode */}
        <div className="bld-options-grid">
          <div className="bld-option-group">
            <span className="bld-opt-label">Colors:</span>
            <div className="bld-pill-group">
              <button
                type="button"
                className={`bld-pill-btn ${visualSettings.colorMode === 'classification' ? 'active' : ''}`}
                onClick={() => setVisualSettings({ colorMode: 'classification' })}
                title="Color roads by classification (Motorway=red, Primary=orange, etc.)"
              >
                🎨 Type
              </button>
              <button
                type="button"
                className={`bld-pill-btn ${visualSettings.colorMode === 'surface' ? 'active' : ''}`}
                onClick={() => setVisualSettings({ colorMode: 'surface' })}
                title="Color roads by surface material (Asphalt, Concrete, Unpaved, etc.)"
              >
                🛤️ Surface
              </button>
              <button
                type="button"
                className={`bld-pill-btn ${visualSettings.colorMode === 'uniform' ? 'active' : ''}`}
                onClick={() => setVisualSettings({ colorMode: 'uniform' })}
                title="All roads in a single color"
              >
                🔶 Uniform
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          id="road-run-scan-btn"
          className={`bld-scan-action-btn ${isDetecting ? 'scanning' : ''}`}
          onClick={handleScanCurrentView}
          disabled={isDetecting}
          style={{ background: isDetecting ? undefined : 'linear-gradient(135deg, #f97316, #ea580c)' }}
        >
          <span className="icon">{isDetecting ? 'hourglass_top' : 'route'}</span>
          <span>{isDetecting ? 'Extracting Road Network...' : 'Detect Road Footprints'}</span>
          {isDetecting && <span className="bld-pulse-wave" />}
        </button>
      </div>

      {detectionError && (
        <div className="bld-alert-box">
          <span className="icon">info</span>
          <span>{detectionError}</span>
        </div>
      )}

      {/* Results */}
      <div className="bld-body-scrollable">
        {roads.length > 0 ? (
          <>
            {/* KPI Cards */}
            <div className="bld-kpi-grid">
              <div className="bld-kpi-card">
                <div className="bld-kpi-header">
                  <span className="icon">route</span>
                  <span className="bld-kpi-label">Road Segments</span>
                </div>
                <div className="bld-kpi-value">
                  {metrics.totalCount}
                  <span className="bld-kpi-sub">roads</span>
                </div>
                <div className="bld-kpi-footer">
                  <span>{metrics.namedRoadsCount} named</span>
                  <span>•</span>
                  <span>{metrics.oneWayCount} one-way</span>
                </div>
              </div>

              <div className="bld-kpi-card">
                <div className="bld-kpi-header">
                  <span className="icon">straighten</span>
                  <span className="bld-kpi-label">Total Length</span>
                </div>
                <div className="bld-kpi-value">
                  {metrics.totalLengthKm}
                  <span className="bld-kpi-sub">km</span>
                </div>
                <div className="bld-kpi-footer">
                  <span>Avg {metrics.avgLengthM}m</span>
                </div>
              </div>

              <div className="bld-kpi-card">
                <div className="bld-kpi-header">
                  <span className="icon">swap_calls</span>
                  <span className="bld-kpi-label">Avg Lanes</span>
                </div>
                <div className="bld-kpi-value">
                  {metrics.avgLanes}
                  <span className="bld-kpi-sub">lanes</span>
                </div>
                <div className="bld-kpi-footer">
                  <span>{metrics.bridgeCount} bridges</span>
                </div>
              </div>
            </div>

            {/* Classification Filters */}
            <div className="bld-categories-bar">
              <span className="bld-cat-title">Filter Road Type:</span>
              <div className="bld-cat-chips">
                <button
                  type="button"
                  className={`bld-cat-chip ${filterClass === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterClass('all')}
                >
                  All ({metrics.totalCount})
                </button>
                {topClasses.map(([cls, count]) => {
                  const style = ROAD_CLASSIFICATION_STYLES[cls];
                  return (
                    <button
                      key={cls}
                      type="button"
                      className={`bld-cat-chip ${filterClass === cls ? 'active' : ''}`}
                      onClick={() => setFilterClass(cls)}
                      style={filterClass === cls ? { borderColor: style?.color } : undefined}
                    >
                      {style?.emoji || '🛣️'} {cls} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search */}
            <div className="bld-search-bar">
              <span className="icon" style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>search</span>
              <input
                type="text"
                className="bld-search-input"
                placeholder="Search road by name, ref, or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Export */}
            <div className="bld-export-bar">
              <button type="button" className="bld-export-btn" onClick={exportGeoJSON} title="Export as GeoJSON">
                <span className="icon" style={{ fontSize: 13 }}>download</span>
                <span>GeoJSON</span>
              </button>
              <button type="button" className="bld-export-btn" onClick={exportCSV} title="Export as CSV">
                <span className="icon" style={{ fontSize: 13 }}>table_chart</span>
                <span>CSV</span>
              </button>
            </div>

            {/* Road List */}
            <div className="bld-list-wrapper">
              {filteredRoads.slice(0, 200).map((r) => {
                const isSelected = selectedRoadId === r.id;
                const style = ROAD_CLASSIFICATION_STYLES[r.highway_class];
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`bld-list-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectRoad(r)}
                    style={isSelected ? { borderLeftColor: style?.color || '#f97316' } : undefined}
                  >
                    <div className="bld-item-head">
                      <span
                        className="bld-item-dot"
                        style={{ background: style?.color || '#f97316' }}
                      />
                      <span className="bld-item-id">{r.name || r.ref || r.id}</span>
                      <span className="bld-item-conf">{Math.round(r.length_m)}m</span>
                    </div>
                    <div className="bld-item-details">
                      <span>{style?.emoji} {style?.label || r.highway_class}</span>
                      <span>•</span>
                      <span>{r.width_m}m wide</span>
                      {r.lanes && <><span>•</span><span>{r.lanes} lanes</span></>}
                      {r.surface && r.surface !== 'unknown' && <><span>•</span><span>{r.surface}</span></>}
                      {r.one_way && <span style={{ color: '#f59e0b' }}>→ One-way</span>}
                      {r.bridge && <span style={{ color: '#38bdf8' }}>🌉 Bridge</span>}
                    </div>
                  </button>
                );
              })}
              {filteredRoads.length > 200 && (
                <div className="bld-list-overflow">
                  + {filteredRoads.length - 200} more road segments...
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bld-empty-state">
            <span className="icon" style={{ fontSize: 48, color: 'rgba(249, 115, 22, 0.3)' }}>route</span>
            <p>Click <strong>"Detect Road Footprints"</strong> to analyze the road network in the current viewport.</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              Supports all road types: Motorways, Primary, Secondary, Residential, Service roads, Footways
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
