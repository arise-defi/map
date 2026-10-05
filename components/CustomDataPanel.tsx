import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useCustomDataStore, parseUploadedFile, type UploadedLayer, type UploadedFeature } from '../lib/custom-data';

interface CustomDataPanelProps {
  currentLat: number;
  currentLng: number;
  currentZoom: number;
  onFocusCoordinates?: (lat: number, lng: number, zoom?: number) => void;
}

const FORMAT_ICONS: Record<string, string> = {
  geojson: 'data_object',
  kml: 'public',
  gpx: 'route',
  csv: 'table_chart',
  topojson: 'hub',
  geotiff: 'image',
  shapefile: 'layers',
  dxf: 'architecture',
  las: 'scatter_plot',
  laz: 'scatter_plot',
};

const FORMAT_LABELS: Record<string, string> = {
  geojson: 'GeoJSON',
  kml: 'KML',
  gpx: 'GPX',
  csv: 'CSV',
  topojson: 'TopoJSON',
  geotiff: 'GeoTIFF',
  shapefile: 'Shapefile',
  dxf: 'DXF',
  las: 'LiDAR LAS',
  laz: 'LiDAR COPC LAZ',
};

export const CustomDataPanel: React.FC<CustomDataPanelProps> = ({
  currentLat,
  currentLng,
  currentZoom,
  onFocusCoordinates,
}) => {
  const {
    isPanelOpen,
    layers,
    selectedLayerId,
    selectedFeatureId,
    selectedFloorIndex,
    show3D,
    heightScale,
    isUploading,
    uploadError,
    editMode,
    addLayer,
    removeLayer,
    toggleLayerVisibility,
    setLayerColor,
    setLayerOpacity,
    selectLayer,
    selectFeature,
    setSelectedFloor,
    setShow3D,
    setHeightScale,
    setEditMode,
    setUploadError,
    setIsUploading,
    updateFeatureProperty,
    detectBuildingsOnLayer,
    tifOnlyMode,
    toggleTifOnlyMode,
    inferenceUrl,
    inferenceStatus,
    inferenceLatencyMs,
    inferenceUptime,
    inferenceGpu,
    inferenceModel,
    inferenceError,
    setInferenceUrl,
    testInferenceConnection,
  } = useCustomDataStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'layers' | 'features' | 'properties'>('layers');
  const [isDragOver, setIsDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState(inferenceUrl);

  // Live health-check polling when connected — keeps uptime display current
  useEffect(() => {
    if (inferenceStatus !== 'connected') return;
    const interval = setInterval(() => { testInferenceConnection(); }, 30000);
    return () => clearInterval(interval);
  }, [inferenceStatus, testInferenceConnection]);

  const selectedLayer = useMemo(
    () => layers.find(l => l.id === selectedLayerId) || null,
    [layers, selectedLayerId]
  );

  const selectedFeature = useMemo(() => {
    if (!selectedLayer || !selectedFeatureId) return null;
    return selectedLayer.features.find(f => f.id === selectedFeatureId) || null;
  }, [selectedLayer, selectedFeatureId]);

  const buildingFeatures = useMemo(() => {
    if (!selectedLayer) return [];
    return selectedLayer.features.filter(f => f.isBuilding);
  }, [selectedLayer]);

  // Raster layers that can actually be drawn on the map (geo-referenced + preview)
  const rasterLayers = useMemo(
    () => layers.filter(l => l.layerType === 'raster' && !!l.rasterDataUrl && !!l.bounds),
    [layers]
  );

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);

    for (const file of Array.from(files)) {
      try {
        const layer = await parseUploadedFile(file);
        addLayer(layer);

        // Automatically detect building footprints for uploaded raster / GeoTIFF layers
        if (layer.layerType === 'raster') {
          detectBuildingsOnLayer(layer.id);
        }

        // Auto-zoom to uploaded data
        if (layer.bounds && onFocusCoordinates) {
          const centerLat = (layer.bounds.north + layer.bounds.south) / 2;
          const centerLon = (layer.bounds.east + layer.bounds.west) / 2;
          // Calculate zoom from extent — larger spans get lower zoom
          const latSpan = Math.abs(layer.bounds.north - layer.bounds.south);
          const lonSpan = Math.abs(layer.bounds.east - layer.bounds.west);
          const maxSpan = Math.max(latSpan, lonSpan);
          let zoom = 18;
          if (maxSpan > 0.0001) zoom = Math.round(Math.log2(360 / maxSpan));
          zoom = Math.max(2, Math.min(20, zoom));
          console.log(`[CustomData] Auto-zoom to [${centerLat.toFixed(5)}, ${centerLon.toFixed(5)}] zoom=${zoom} (span=${maxSpan.toFixed(6)})`);
          onFocusCoordinates(centerLat, centerLon, zoom);
        }
      } catch (err: any) {
        setUploadError(err.message || 'Failed to parse file');
      }
    }
    setIsUploading(false);
  }, [addLayer, detectBuildingsOnLayer, onFocusCoordinates, setIsUploading, setUploadError]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  // Export layer as GeoJSON
  const handleExportGeoJSON = useCallback(() => {
    if (!selectedLayer) return;
    const geojson = {
      type: 'FeatureCollection',
      features: selectedLayer.features.map(f => ({
        type: 'Feature',
        id: f.id,
        geometry: { type: f.type, coordinates: f.coordinates },
        properties: {
          ...f.properties,
          area_sqm: f.area_sqm,
          estimated_floors: f.estimated_floors,
          estimated_height_m: f.estimated_height_m,
          isBuilding: f.isBuilding,
        },
      })),
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedLayer.name}_export.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedLayer]);

  // Load Ground-Truth LiDAR Footprints (Sample.las / Sample.copc.laz)
  const handleLoadSampleLidar = useCallback(async () => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await fetch('/api/lidar/detect-buildings');
      if (!res.ok) throw new Error('Failed to load LiDAR dataset');
      const gj = await res.json();
      const features: UploadedFeature[] = (gj.features || []).map((f: any, idx: number) => {
        const coords = f.geometry?.coordinates || [];
        const ring = coords[0] || [];
        const props = f.properties || {};
        return {
          id: props.id || `lidar-bld-${idx + 1}`,
          type: 'Polygon' as const,
          coordinates: coords,
          properties: {
            name: props.name || `Building ${idx + 1}`,
            classification: props.classification || 'Industrial',
            confidence: 1.0,
            source: 'lidar-pointcloud',
            roof_material: props.roof_material || 'Corrugated Tin Sheet',
            has_mumty_tank: props.has_mumty_tank || false,
            estimated_height_m: props.estimated_height_m || 6.5,
            ground_z_m: props.ground_z_m || 22.14,
            roof_z_m: props.roof_z_m,
            estimated_floors: props.estimated_floors || 2,
            area_sqm: props.area_sqm,
            area_gaj: props.area_gaj,
            lidar_point_count: props.lidar_point_count,
            color: props.color || '#22c55e',
          },
          area_sqm: props.area_sqm,
          estimated_floors: props.estimated_floors || 2,
          estimated_height_m: props.estimated_height_m || 6.5,
          center: props.center,
          isBuilding: true,
        };
      });

      const layer: UploadedLayer = {
        id: `lidar-sample-${Date.now()}`,
        name: 'Tripura Ground-Truth LiDAR Footprints',
        filename: 'Sample.copc.laz',
        format: 'laz',
        layerType: 'vector',
        visible: true,
        color: '#a855f7',
        opacity: 0.85,
        features,
        buildingDetections: features,
        bounds: { west: 91.27004, south: 23.81175, east: 91.27038, north: 23.81250 },
        uploadedAt: Date.now(),
        featureCount: features.length,
        detectionStatus: 'done',
      };

      addLayer(layer);
      setShow3D(true);
      if (onFocusCoordinates) {
        onFocusCoordinates(23.81212, 91.27022, 19);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to load LiDAR sample');
    } finally {
      setIsUploading(false);
    }
  }, [addLayer, onFocusCoordinates, setIsUploading, setShow3D, setUploadError]);

  if (!isPanelOpen) return null;

  return (
    <aside
      className="custom-data-panel"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="custom-data-drag-overlay">
          <span className="icon" style={{ fontSize: '48px' }}>cloud_upload</span>
          <p>Drop files here</p>
          <p style={{ fontSize: '11px', opacity: 0.7 }}>GeoJSON, KML, GPX, CSV, GeoTIFF, LiDAR (.las/.laz)...</p>
        </div>
      )}

      {/* Header */}
      <div className="custom-data-header">
        <div className="custom-data-title-row">
          <span className="icon" style={{ color: '#60a5fa' }}>folder_open</span>
          <span className="custom-data-title">Custom Data</span>
          <span className="custom-data-badge">{layers.length} layers</span>
        </div>
        <div className="custom-data-subtitle">
          Upload, view, edit & detect buildings in your geospatial data
        </div>
      </div>

      {/* Upload Zone */}
      <div className="custom-data-upload-zone">
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <button
            type="button"
            className="custom-data-upload-btn"
            style={{ flex: 1 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <span className="icon">{isUploading ? 'hourglass_empty' : 'upload_file'}</span>
            <span>{isUploading ? 'Processing...' : 'Upload (.tif, .las, .laz)'}</span>
          </button>
          <button
            type="button"
            className="custom-data-upload-btn"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              borderColor: '#8b5cf6',
              color: '#ffffff',
              whiteSpace: 'nowrap',
              padding: '0 12px',
            }}
            onClick={handleLoadSampleLidar}
            disabled={isUploading}
            title="Load calibrated ground-truth 3D/2D footprints from Sample.las / Sample.copc.laz"
          >
            <span className="icon">view_in_ar</span>
            <span>LiDAR 3D/2D</span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".geojson,.json,.kml,.gpx,.csv,.topojson,.tif,.tiff,.dxf,.zip,.shp,.las,.laz"
          style={{ display: 'none' }}
          onChange={e => handleFileUpload(e.target.files)}
        />
        <div className="upload-formats-row">
          {['GeoJSON', 'GeoTIFF', 'LiDAR (.las/.laz)', 'KML', 'GPX', 'CSV', 'SHP', 'DXF'].map(fmt => (
            <span key={fmt} className="upload-format-tag">{fmt}</span>
          ))}
        </div>
      </div>

      {/* Inference Server Connection */}
      <div className="cd-inference-block">
        <div className="cd-inference-label">
          <span className="icon" style={{ fontSize: '13px' }}>dns</span>
          <span>Inference Server</span>
          <span className={`cd-inference-dot cd-inference-dot--${inferenceStatus}`} />
        </div>
        <div className="cd-inference-row">
          <input
            type="text"
            className="cd-inference-input"
            placeholder="https://your-server.trycloudflare.com"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setInferenceUrl(urlInput);
                testInferenceConnection();
              }
            }}
          />
          <button
            type="button"
            className={`cd-inference-connect-btn cd-inference-connect-btn--${inferenceStatus}`}
            disabled={inferenceStatus === 'connecting'}
            onClick={() => {
              setInferenceUrl(urlInput);
              testInferenceConnection();
            }}
          >
            {inferenceStatus === 'connecting' ? (
              <span className="icon cd-spin">sync</span>
            ) : inferenceStatus === 'connected' ? (
              <span className="icon">check_circle</span>
            ) : (
              <span className="icon">power_settings_new</span>
            )}
            <span>{inferenceStatus === 'connecting' ? 'Connecting' : inferenceStatus === 'connected' ? 'Connected' : 'Connect'}</span>
          </button>
        </div>

        {/* Live status readouts */}
        {inferenceStatus === 'connected' && (
          <div className="cd-inference-stats">
            <div className="cd-inference-stat">
              <span className="cd-inference-stat-label">Latency</span>
              <span className="cd-inference-stat-value">{inferenceLatencyMs ?? '—'}ms</span>
            </div>
            <div className="cd-inference-stat">
              <span className="cd-inference-stat-label">Uptime</span>
              <span className="cd-inference-stat-value cd-inference-stat-value--live">
                <span className="cd-live-dot" />
                {inferenceUptime || 'active'}
              </span>
            </div>
            {inferenceModel && (
              <div className="cd-inference-stat">
                <span className="cd-inference-stat-label">Model</span>
                <span className="cd-inference-stat-value">{inferenceModel}</span>
              </div>
            )}
            {inferenceGpu && (
              <div className="cd-inference-stat">
                <span className="cd-inference-stat-label">GPU</span>
                <span className="cd-inference-stat-value">{inferenceGpu}</span>
              </div>
            )}
          </div>
        )}

        {inferenceError && (
          <div className="cd-inference-error">
            <span className="icon" style={{ fontSize: '12px' }}>warning</span>
            <span>{inferenceError}</span>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="custom-data-error">
          <span className="icon">error</span>
          <span>{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)}>
            <span className="icon">close</span>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="custom-data-tabs">
        <button
          type="button"
          className={`custom-data-tab ${activeTab === 'layers' ? 'active' : ''}`}
          onClick={() => setActiveTab('layers')}
        >
          <span className="icon">layers</span> Layers ({layers.length})
        </button>
        <button
          type="button"
          className={`custom-data-tab ${activeTab === 'features' ? 'active' : ''}`}
          onClick={() => setActiveTab('features')}
          disabled={!selectedLayer}
        >
          <span className="icon">category</span> Features {selectedLayer ? `(${selectedLayer.featureCount})` : ''}
        </button>
        <button
          type="button"
          className={`custom-data-tab ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => setActiveTab('properties')}
          disabled={!selectedFeature}
        >
          <span className="icon">tune</span> Properties
        </button>
      </div>

      {/* Scrollable content */}
      <div className="custom-data-scrollable">
        {/* LAYERS TAB */}
        {activeTab === 'layers' && (
          <>
            {/* TIF-Only mode toggle — only meaningful once a geo-referenced raster exists */}
            {rasterLayers.length > 0 && (
              <button
                type="button"
                id="cd-tif-only-toggle"
                className={`cd-tif-only-toggle ${tifOnlyMode ? 'active' : ''}`}
                onClick={toggleTifOnlyMode}
                aria-pressed={tifOnlyMode}
                title={
                  tifOnlyMode
                    ? 'TIF Only is ON: the Esri satellite/basemap is hidden. Click to bring it back.'
                    : 'Hide the satellite basemap and display only your uploaded TIF data'
                }
              >
                <span className="icon">{tifOnlyMode ? 'image' : 'hide_image'}</span>
                <span className="cd-tif-only-text">
                  <strong>TIF Only view</strong>
                  <small>
                    {tifOnlyMode
                      ? `Base map hidden — showing ${rasterLayers.length} uploaded raster layer${rasterLayers.length > 1 ? 's' : ''}`
                      : 'Show only uploaded TIF data (hide satellite view)'}
                  </small>
                </span>
                <span className={`cd-switch ${tifOnlyMode ? 'on' : ''}`} />
              </button>
            )}

            {layers.length === 0 ? (
              <div className="custom-data-empty">
                <span className="icon" style={{ fontSize: '40px', opacity: 0.3 }}>cloud_upload</span>
                <p>No data loaded</p>
                <p style={{ fontSize: '11px', opacity: 0.5 }}>
                  Upload or drag & drop geospatial files
                </p>
              </div>
            ) : (
              <div className="custom-data-layer-list">
                {layers.map(layer => (
                  <div
                    key={layer.id}
                    className={`custom-data-layer-card ${selectedLayerId === layer.id ? 'selected' : ''}`}
                    onClick={() => { selectLayer(layer.id); setActiveTab('features'); }}
                  >
                    <div className="layer-card-header">
                      <button
                        type="button"
                        className="layer-visibility-btn"
                        onClick={e => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
                        title={layer.visible ? 'Hide layer' : 'Show layer'}
                      >
                        <span className="icon">{layer.visible ? 'visibility' : 'visibility_off'}</span>
                      </button>
                      <span className="icon layer-format-icon" style={{ color: layer.color }}>
                        {FORMAT_ICONS[layer.format] || 'insert_drive_file'}
                      </span>
                      <div className="layer-card-info">
                        <span className="layer-card-name">{layer.name}</span>
                        <span className="layer-card-meta">
                          {FORMAT_LABELS[layer.format] || layer.format} · {layer.featureCount} features
                        </span>
                      </div>
                      <button
                        type="button"
                        className="layer-remove-btn"
                        onClick={e => { e.stopPropagation(); removeLayer(layer.id); }}
                        title="Remove layer"
                      >
                        <span className="icon">close</span>
                      </button>
                    </div>

                    {/* Raster Preview Thumbnail */}
                    {layer.rasterDataUrl && (
                      <div className="cd-raster-preview" onClick={e => e.stopPropagation()}>
                        <img
                          src={layer.rasterDataUrl}
                          alt={`${layer.name} preview`}
                          className="cd-raster-thumb"
                        />
                        {layer.bounds && (
                          <div className="cd-raster-bounds">
                            <span>W: {layer.bounds.west.toFixed(4)}°</span>
                            <span>S: {layer.bounds.south.toFixed(4)}°</span>
                            <span>E: {layer.bounds.east.toFixed(4)}°</span>
                            <span>N: {layer.bounds.north.toFixed(4)}°</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Layer controls */}
                    {selectedLayerId === layer.id && (
                      <div className="layer-card-controls">
                        <div className="layer-control-row">
                          <label>Color:</label>
                          <input
                            type="color"
                            value={layer.color}
                            onChange={e => setLayerColor(layer.id, e.target.value)}
                            onClick={e => e.stopPropagation()}
                          />
                          <label>Opacity:</label>
                          <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.05"
                            value={layer.opacity}
                            onChange={e => { e.stopPropagation(); setLayerOpacity(layer.id, parseFloat(e.target.value)); }}
                            onClick={e => e.stopPropagation()}
                            style={{ width: '60px', accentColor: layer.color }}
                          />
                          <span>{Math.round(layer.opacity * 100)}%</span>
                        </div>

                        {/* Detect buildings button */}
                        <div className="layer-control-row" style={{ marginTop: '4px' }}>
                          <button
                            type="button"
                            className="layer-detect-btn"
                            onClick={e => { e.stopPropagation(); detectBuildingsOnLayer(layer.id); }}
                            disabled={layer.detectionStatus === 'detecting'}
                          >
                            <span className="icon">
                              {layer.detectionStatus === 'detecting' ? 'hourglass_empty' :
                               layer.detectionStatus === 'done' ? 'check_circle' : 'apartment'}
                            </span>
                            <span>
                              {layer.detectionStatus === 'detecting' ? 'Detecting...' :
                               layer.detectionStatus === 'done' ? `${layer.buildingDetections?.length || 0} Buildings Found` :
                               'Detect Buildings'}
                            </span>
                          </button>
                          {layer.bounds && (
                            <button
                              type="button"
                              className="layer-zoom-btn"
                              onClick={e => {
                                e.stopPropagation();
                                if (layer.bounds && onFocusCoordinates) {
                                  const lat = (layer.bounds.north + layer.bounds.south) / 2;
                                  const lon = (layer.bounds.east + layer.bounds.west) / 2;
                                  onFocusCoordinates(lat, lon, 17);
                                }
                              }}
                              title="Zoom to layer"
                            >
                              <span className="icon">zoom_in_map</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="layer-export-btn"
                            onClick={e => { e.stopPropagation(); handleExportGeoJSON(); }}
                            title="Export as GeoJSON"
                          >
                            <span className="icon">download</span>
                          </button>
                        </div>

                        {layer.detectionError && (
                          <div className="layer-detect-error">
                            <span className="icon">warning</span> {layer.detectionError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* FEATURES TAB */}
        {activeTab === 'features' && selectedLayer && (
          <>
            {/* 3D / 2D Toggle */}
            <div className="custom-data-3d-controls">
              <button
                type="button"
                className={`cd-view-btn ${!show3D ? 'active' : ''}`}
                onClick={() => setShow3D(false)}
              >
                <span className="icon">map</span> 2D
              </button>
              <button
                type="button"
                className={`cd-view-btn ${show3D ? 'active' : ''}`}
                onClick={() => setShow3D(true)}
              >
                <span className="icon">view_in_ar</span> 3D
              </button>
              <button
                type="button"
                className={`cd-view-btn ${editMode ? 'active' : ''}`}
                onClick={() => setEditMode(!editMode)}
                title="Toggle edit mode"
              >
                <span className="icon">edit</span> Edit
              </button>
              {show3D && (
                <div className="cd-height-slider">
                  <span>H:</span>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={heightScale}
                    onChange={e => setHeightScale(parseFloat(e.target.value))}
                    style={{ width: '50px', accentColor: selectedLayer.color }}
                  />
                  <span>{heightScale.toFixed(1)}x</span>
                </div>
              )}
            </div>

            {/* Feature list */}
            <div className="custom-data-feature-list">
              {selectedLayer.features.map(feat => (
                <button
                  key={feat.id}
                  type="button"
                  className={`cd-feature-chip ${selectedFeatureId === feat.id ? 'selected' : ''} ${feat.isBuilding ? 'is-building' : ''}`}
                  onClick={() => {
                    selectFeature(feat.id);
                    setActiveTab('properties');
                    if (feat.center && onFocusCoordinates) {
                      onFocusCoordinates(feat.center[1], feat.center[0], 19);
                    }
                  }}
                  style={{ borderLeftColor: feat.isBuilding ? selectedLayer.color : 'transparent' }}
                >
                  <span className="icon cd-feat-icon">
                    {feat.type === 'Point' ? 'location_on' :
                     feat.type === 'LineString' ? 'timeline' :
                     feat.isBuilding ? 'apartment' : 'pentagon'}
                  </span>
                  <span className="cd-feat-name">
                    {feat.properties?.name || feat.id}
                  </span>
                  {feat.isBuilding && feat.estimated_floors && (
                    <span className="cd-feat-floors">{feat.estimated_floors}F</span>
                  )}
                  {feat.area_sqm ? (
                    <span className="cd-feat-area">{feat.area_sqm > 1000 ? `${(feat.area_sqm / 1000).toFixed(1)}k` : feat.area_sqm} m²</span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        )}

        {/* PROPERTIES TAB — Feature detail with floor selection */}
        {activeTab === 'properties' && selectedFeature && selectedLayer && (
          <div className="custom-data-properties">
            {/* Feature header */}
            <div className="cd-prop-header" style={{ borderLeftColor: selectedLayer.color }}>
              <span className="icon" style={{ color: selectedLayer.color }}>
                {selectedFeature.isBuilding ? 'apartment' : selectedFeature.type === 'Point' ? 'location_on' : 'pentagon'}
              </span>
              <div>
                <div className="cd-prop-title">{selectedFeature.properties?.name || selectedFeature.id}</div>
                <div className="cd-prop-subtitle">
                  {selectedFeature.type} · {selectedFeature.area_sqm || 0} m²
                  {selectedFeature.isBuilding && ` · ${selectedFeature.properties?.classification || 'Building'}`}
                </div>
              </div>
            </div>

            {/* Building Info & Floor Selection */}
            {selectedFeature.isBuilding && (
              <div className="cd-building-detail">
                <div className="cd-building-stats">
                  <div className="cd-stat">
                    <span className="cd-stat-label">Floors</span>
                    <span className="cd-stat-value" style={{ color: selectedLayer.color }}>
                      {selectedFeature.estimated_floors || 2}
                    </span>
                  </div>
                  <div className="cd-stat">
                    <span className="cd-stat-label">Height</span>
                    <span className="cd-stat-value" style={{ color: selectedLayer.color }}>
                      {selectedFeature.estimated_height_m || 6.4}m
                    </span>
                  </div>
                  <div className="cd-stat">
                    <span className="cd-stat-label">Area/Floor</span>
                    <span className="cd-stat-value">
                      {Math.round((selectedFeature.area_sqm || 0) / (selectedFeature.estimated_floors || 2))} m²
                    </span>
                  </div>
                  <div className="cd-stat">
                    <span className="cd-stat-label">Type</span>
                    <span className="cd-stat-value" style={{ fontSize: '11px' }}>
                      {selectedFeature.properties?.classification || 'Building'}
                    </span>
                  </div>
                </div>

                {/* Floor Selector */}
                <div className="cd-floor-selector">
                  <span className="cd-floor-label">Select Floor:</span>
                  <div className="cd-floor-btns">
                    <button
                      type="button"
                      className={`cd-floor-btn ${selectedFloorIndex === null ? 'active' : ''}`}
                      onClick={() => setSelectedFloor(null)}
                      style={selectedFloorIndex === null ? { background: selectedLayer.color, color: '#000' } : undefined}
                    >
                      All
                    </button>
                    {Array.from({ length: selectedFeature.estimated_floors || 2 }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`cd-floor-btn ${selectedFloorIndex === i ? 'active' : ''}`}
                        onClick={() => setSelectedFloor(i)}
                        style={selectedFloorIndex === i ? { background: selectedLayer.color, color: '#000' } : undefined}
                      >
                        F{i + 1}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedFloorIndex !== null && (
                  <div className="cd-floor-detail">
                    <span>Floor {selectedFloorIndex + 1} of {selectedFeature.estimated_floors || 2}</span>
                    <span>Height: {(selectedFloorIndex * 3.2).toFixed(1)}m — {((selectedFloorIndex + 1) * 3.2).toFixed(1)}m</span>
                    <span>Area: {Math.round((selectedFeature.area_sqm || 0) / (selectedFeature.estimated_floors || 2))} m²</span>
                  </div>
                )}
              </div>
            )}

            {/* Editable Properties Table */}
            <div className="cd-prop-table">
              <div className="cd-prop-table-header">
                <span>Property</span>
                <span>Value</span>
              </div>
              {Object.entries(selectedFeature.properties || {}).map(([key, value]) => (
                <div key={key} className="cd-prop-row">
                  <span className="cd-prop-key">{key}</span>
                  {editMode ? (
                    <input
                      type="text"
                      className="cd-prop-input"
                      value={String(value ?? '')}
                      onChange={e => updateFeatureProperty(selectedLayer.id, selectedFeature.id, key, e.target.value)}
                    />
                  ) : (
                    <span className="cd-prop-val">{String(value ?? '—')}</span>
                  )}
                </div>
              ))}
              {/* Extra computed properties */}
              <div className="cd-prop-row computed">
                <span className="cd-prop-key">area_sqm</span>
                <span className="cd-prop-val">{selectedFeature.area_sqm || '—'}</span>
              </div>
              {selectedFeature.estimated_floors && (
                <div className="cd-prop-row computed">
                  <span className="cd-prop-key">estimated_floors</span>
                  <span className="cd-prop-val">{selectedFeature.estimated_floors}</span>
                </div>
              )}
              {selectedFeature.center && (
                <div className="cd-prop-row computed">
                  <span className="cd-prop-key">center</span>
                  <span className="cd-prop-val">{selectedFeature.center[1].toFixed(5)}, {selectedFeature.center[0].toFixed(5)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
