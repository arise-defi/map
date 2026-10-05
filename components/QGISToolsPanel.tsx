import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCustomDataStore } from '../lib/custom-data';

/* ─────────────────────────────────────────────────────────────────
   QGISToolsPanel – QGIS-like GIS exploration tools
   Features:
   - Measure distance / area
   - Identify / query features 
   - Coordinate inspection
   - Band visualization for rasters
   - Attribute table viewer
   - Feature statistics
   - Drawing / annotation tools
   - Export tools
   ───────────────────────────────────────────────────────────────── */

// Types
interface MeasurementPoint {
  lat: number;
  lng: number;
}

type GISTool = 'none' | 'measure-distance' | 'measure-area' | 'identify' | 'draw-point' | 'draw-line' | 'draw-polygon';

interface DrawnFeature {
  id: string;
  type: 'Point' | 'LineString' | 'Polygon';
  coordinates: number[][] | number[][][];
  color: string;
  label: string;
}

// Zustand store for GIS tools state
import { create } from 'zustand';

interface GISToolsState {
  isOpen: boolean;
  activeTool: GISTool;
  measurePoints: MeasurementPoint[];
  measureResult: string;
  identifyResult: any | null;
  drawnFeatures: DrawnFeature[];
  showAttributeTable: boolean;
  showStats: boolean;
  showBandViz: boolean;
  cursorCoords: { lat: number; lng: number; } | null;
  // Actions
  toggle: () => void;
  setTool: (tool: GISTool) => void;
  addMeasurePoint: (pt: MeasurementPoint) => void;
  clearMeasure: () => void;
  setIdentifyResult: (result: any) => void;
  addDrawnFeature: (f: DrawnFeature) => void;
  removeDrawnFeature: (id: string) => void;
  setCursorCoords: (coords: { lat: number; lng: number; } | null) => void;
  toggleAttributeTable: () => void;
  toggleStats: () => void;
  toggleBandViz: () => void;
}

export const useGISToolsStore = create<GISToolsState>((set, get) => ({
  isOpen: false,
  activeTool: 'none',
  measurePoints: [],
  measureResult: '',
  identifyResult: null,
  drawnFeatures: [],
  showAttributeTable: false,
  showStats: false,
  showBandViz: false,
  cursorCoords: null,

  toggle: () => set(s => ({ isOpen: !s.isOpen })),
  setTool: (tool) => set({ activeTool: tool, measurePoints: [], measureResult: '', identifyResult: null }),
  addMeasurePoint: (pt) => {
    const pts = [...get().measurePoints, pt];
    let result = '';
    if (get().activeTool === 'measure-distance') {
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        total += haversineDistance(pts[i - 1], pts[i]);
      }
      result = total < 1000 ? `${total.toFixed(1)} m` : `${(total / 1000).toFixed(3)} km`;
    } else if (get().activeTool === 'measure-area' && pts.length >= 3) {
      const area = computePolygonArea(pts);
      result = area < 10000 ? `${area.toFixed(1)} m²` : `${(area / 10000).toFixed(3)} ha (${(area / 1e6).toFixed(4)} km²)`;
    }
    set({ measurePoints: pts, measureResult: result });
  },
  clearMeasure: () => set({ measurePoints: [], measureResult: '' }),
  setIdentifyResult: (result) => set({ identifyResult: result }),
  addDrawnFeature: (f) => set(s => ({ drawnFeatures: [...s.drawnFeatures, f] })),
  removeDrawnFeature: (id) => set(s => ({ drawnFeatures: s.drawnFeatures.filter(f => f.id !== id) })),
  setCursorCoords: (coords) => set({ cursorCoords: coords }),
  toggleAttributeTable: () => set(s => ({ showAttributeTable: !s.showAttributeTable })),
  toggleStats: () => set(s => ({ showStats: !s.showStats })),
  toggleBandViz: () => set(s => ({ showBandViz: !s.showBandViz })),
}));

// Haversine distance in meters
function haversineDistance(a: MeasurementPoint, b: MeasurementPoint): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Spherical polygon area in m²
function computePolygonArea(pts: MeasurementPoint[]): number {
  const R = 6371000;
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = pts[i].lat * Math.PI / 180;
    const lat2 = pts[j].lat * Math.PI / 180;
    const dLon = (pts[j].lng - pts[i].lng) * Math.PI / 180;
    area += dLon * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(area * R * R / 2);
}

// Color picker for drawing
const DRAW_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#ffffff'];

// ──────── Main Component ────────
export default function QGISToolsPanel() {
  const {
    isOpen, activeTool, measurePoints, measureResult,
    identifyResult, drawnFeatures, showAttributeTable,
    showStats, showBandViz, cursorCoords,
    toggle, setTool, clearMeasure, toggleAttributeTable,
    toggleStats, toggleBandViz, removeDrawnFeature,
  } = useGISToolsStore();

  const { layers } = useCustomDataStore();
  const activeLayer = layers.find(l => l.visible);
  const [drawColor, setDrawColor] = useState('#3b82f6');
  const [bandWeights, setBandWeights] = useState({ r: 1, g: 1, b: 1 });

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute', top: 56, left: 12, width: 340,
      maxHeight: 'calc(100vh - 80px)', overflow: 'auto',
      background: 'linear-gradient(135deg, rgba(15,23,42,0.97), rgba(30,41,59,0.97))',
      borderRadius: 14, border: '1px solid rgba(100,150,255,0.15)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 1200,
      backdropFilter: 'blur(20px)', color: '#e2e8f0',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px', borderBottom: '1px solid rgba(100,150,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🗺️</span>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.3 }}>GIS Tools</span>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 6,
            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
            color: '#fff', fontWeight: 600, letterSpacing: 0.5,
          }}>QGIS-STYLE</span>
        </div>
        <button onClick={toggle} style={{
          background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18,
        }}>✕</button>
      </div>

      {/* ── Tool Buttons ── */}
      <div style={{ padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {[
          { id: 'measure-distance' as GISTool, icon: '📏', label: 'Distance' },
          { id: 'measure-area' as GISTool, icon: '📐', label: 'Area' },
          { id: 'identify' as GISTool, icon: '🔍', label: 'Identify' },
          { id: 'draw-point' as GISTool, icon: '📍', label: 'Point' },
          { id: 'draw-line' as GISTool, icon: '✏️', label: 'Line' },
          { id: 'draw-polygon' as GISTool, icon: '⬡', label: 'Polygon' },
        ].map(t => (
          <button key={t.id} onClick={() => setTool(activeTool === t.id ? 'none' : t.id)}
            style={{
              flex: '1 0 30%', padding: '7px 4px', borderRadius: 8, border: 'none',
              background: activeTool === t.id
                ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'rgba(255,255,255,0.06)',
              color: activeTool === t.id ? '#fff' : '#94a3b8',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s ease', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2,
            }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Coordinate Display ── */}
      {cursorCoords && (
        <div style={{
          margin: '0 12px', padding: '6px 10px', borderRadius: 8,
          background: 'rgba(0,0,0,0.3)', fontSize: 11, fontFamily: 'monospace',
          color: '#94a3b8', display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Lat: <b style={{ color: '#22c55e' }}>{cursorCoords.lat.toFixed(6)}°</b></span>
          <span>Lng: <b style={{ color: '#3b82f6' }}>{cursorCoords.lng.toFixed(6)}°</b></span>
        </div>
      )}

      {/* ── Measurement Result ── */}
      {(activeTool === 'measure-distance' || activeTool === 'measure-area') && (
        <div style={{ margin: '8px 12px', padding: '10px 12px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
            {activeTool === 'measure-distance' ? '📏 Distance Measurement' : '📐 Area Measurement'}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>
            {measureResult || '0'}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            {measurePoints.length} point{measurePoints.length !== 1 ? 's' : ''} — Click map to add
          </div>
          {measurePoints.length > 0 && (
            <button onClick={clearMeasure} style={{
              marginTop: 6, padding: '4px 10px', borderRadius: 6, border: 'none',
              background: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 10,
              cursor: 'pointer', fontWeight: 600,
            }}>Clear</button>
          )}
        </div>
      )}

      {/* ── Identify Result ── */}
      {activeTool === 'identify' && identifyResult && (
        <div style={{ margin: '8px 12px', padding: '10px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', maxHeight: 200, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginBottom: 6 }}>🔍 Feature Info</div>
          {Object.entries(identifyResult).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', fontSize: 11, padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#94a3b8', minWidth: 90 }}>{key}:</span>
              <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{String(val)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Draw Color Picker ── */}
      {(activeTool === 'draw-point' || activeTool === 'draw-line' || activeTool === 'draw-polygon') && (
        <div style={{ margin: '8px 12px', padding: '8px 10px', borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 700, marginBottom: 6 }}>🎨 Draw Color</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {DRAW_COLORS.map(c => (
              <button key={c} onClick={() => setDrawColor(c)} style={{
                width: 22, height: 22, borderRadius: '50%', border: drawColor === c ? '2px solid #fff' : '2px solid transparent',
                background: c, cursor: 'pointer',
              }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Drawn Features List ── */}
      {drawnFeatures.length > 0 && (
        <div style={{ margin: '8px 12px', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>✏️ Annotations ({drawnFeatures.length})</div>
          {drawnFeatures.map(f => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 11 }}>
              <span><span style={{ color: f.color }}>●</span> {f.label} <span style={{ color: '#64748b' }}>({f.type})</span></span>
              <button onClick={() => removeDrawnFeature(f.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 4, borderTop: '1px solid rgba(100,150,255,0.08)' }}>
        <button onClick={toggleAttributeTable} style={{
          flex: '1 0 45%', padding: '7px 8px', borderRadius: 8, border: 'none',
          background: showAttributeTable ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
          color: showAttributeTable ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>📊 Attributes</button>
        <button onClick={toggleStats} style={{
          flex: '1 0 45%', padding: '7px 8px', borderRadius: 8, border: 'none',
          background: showStats ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
          color: showStats ? '#22c55e' : '#94a3b8', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>📈 Statistics</button>
        <button onClick={toggleBandViz} style={{
          flex: '1 0 45%', padding: '7px 8px', borderRadius: 8, border: 'none',
          background: showBandViz ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
          color: showBandViz ? '#f59e0b' : '#94a3b8', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>🌈 Bands</button>
        <button onClick={() => {
          const data = JSON.stringify({
            type: 'FeatureCollection',
            features: drawnFeatures.map(f => ({
              type: 'Feature',
              geometry: { type: f.type, coordinates: f.coordinates },
              properties: { label: f.label, color: f.color },
            })),
          }, null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'annotations.geojson'; a.click();
          URL.revokeObjectURL(url);
        }} style={{
          flex: '1 0 45%', padding: '7px 8px', borderRadius: 8, border: 'none',
          background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>💾 Export</button>
      </div>

      {/* ── Attribute Table ── */}
      {showAttributeTable && activeLayer && activeLayer.features.length > 0 && (
        <div style={{
          margin: '8px 12px 12px', padding: '8px', borderRadius: 10,
          background: 'rgba(0,0,0,0.3)', maxHeight: 250, overflow: 'auto',
        }}>
          <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, marginBottom: 6 }}>
            📊 Attribute Table — {activeLayer.filename} ({activeLayer.features.length} features)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ padding: '4px 6px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>ID</th>
                <th style={{ padding: '4px 6px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '4px 6px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Area m²</th>
                <th style={{ padding: '4px 6px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Floors</th>
                <th style={{ padding: '4px 6px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {activeLayer.features.map((f, i) => (
                <tr key={f.id} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                }}>
                  <td style={{ padding: '3px 6px', color: '#64748b', fontFamily: 'monospace' }}>{i + 1}</td>
                  <td style={{ padding: '3px 6px', color: '#e2e8f0' }}>{f.properties?.name || '-'}</td>
                  <td style={{ padding: '3px 6px', color: '#22c55e', textAlign: 'right', fontFamily: 'monospace' }}>{f.area_sqm?.toFixed(1) || '-'}</td>
                  <td style={{ padding: '3px 6px', color: '#f59e0b', textAlign: 'right' }}>{f.estimated_floors || '-'}</td>
                  <td style={{ padding: '3px 6px', color: '#94a3b8' }}>{f.properties?.classification || f.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Statistics Panel ── */}
      {showStats && activeLayer && activeLayer.features.length > 0 && (
        <div style={{
          margin: '0 12px 12px', padding: '10px', borderRadius: 10,
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.1)',
        }}>
          <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginBottom: 8 }}>📈 Layer Statistics</div>
          {(() => {
            const feats = activeLayer.features;
            const areas = feats.map(f => f.area_sqm || 0).filter(a => a > 0);
            const floors = feats.map(f => f.estimated_floors || 0).filter(f => f > 0);
            const totalArea = areas.reduce((s, a) => s + a, 0);
            const avgArea = areas.length > 0 ? totalArea / areas.length : 0;
            const maxArea = Math.max(...areas, 0);
            const minArea = areas.length > 0 ? Math.min(...areas) : 0;
            const classes: Record<string, number> = {};
            feats.forEach(f => { const c = f.properties?.classification || 'Unknown'; classes[c] = (classes[c] || 0) + 1; });

            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  {[
                    { label: 'Features', value: feats.length, color: '#3b82f6' },
                    { label: 'Buildings', value: feats.filter(f => f.isBuilding).length, color: '#22c55e' },
                    { label: 'Total Area', value: totalArea > 10000 ? `${(totalArea / 10000).toFixed(2)} ha` : `${totalArea.toFixed(0)} m²`, color: '#f59e0b' },
                    { label: 'Avg Area', value: `${avgArea.toFixed(1)} m²`, color: '#8b5cf6' },
                    { label: 'Max Area', value: `${maxArea.toFixed(1)} m²`, color: '#ef4444' },
                    { label: 'Min Area', value: `${minArea.toFixed(1)} m²`, color: '#06b6d4' },
                    { label: 'Avg Floors', value: floors.length > 0 ? (floors.reduce((s, f) => s + f, 0) / floors.length).toFixed(1) : '-', color: '#f43f5e' },
                    { label: 'Max Floors', value: Math.max(...floors, 0), color: '#e11d48' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>
                      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {/* Classification breakdown */}
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Classification Breakdown</div>
                {Object.entries(classes).sort((a, b) => b[1] - a[1]).map(([cls, count]) => (
                  <div key={cls} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                    <span style={{ color: '#e2e8f0' }}>{cls}</span>
                    <span style={{ color: '#3b82f6', fontWeight: 600 }}>{count}</span>
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Band Visualization (Raster) ── */}
      {showBandViz && activeLayer?.rasterDataUrl && (
        <div style={{
          margin: '0 12px 12px', padding: '10px', borderRadius: 10,
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.1)',
        }}>
          <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginBottom: 8 }}>🌈 Band Visualization</div>
          {['R', 'G', 'B'].map((band, i) => (
            <div key={band} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: ['#ef4444', '#22c55e', '#3b82f6'][i], fontWeight: 700, width: 16 }}>{band}</span>
              <input type="range" min="0" max="2" step="0.1"
                value={band === 'R' ? bandWeights.r : band === 'G' ? bandWeights.g : bandWeights.b}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setBandWeights(prev => ({ ...prev, [band.toLowerCase()]: val }));
                }}
                style={{ flex: 1, accentColor: ['#ef4444', '#22c55e', '#3b82f6'][i] }}
              />
              <span style={{ fontSize: 10, color: '#64748b', width: 28, textAlign: 'right' }}>
                {(band === 'R' ? bandWeights.r : band === 'G' ? bandWeights.g : bandWeights.b).toFixed(1)}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {[
              { label: 'Natural', r: 1, g: 1, b: 1 },
              { label: 'NDVI', r: 0, g: 2, b: 0 },
              { label: 'Urban', r: 2, g: 0.5, b: 0.5 },
              { label: 'Thermal', r: 2, g: 0, b: 2 },
            ].map(preset => (
              <button key={preset.label} onClick={() => setBandWeights({ r: preset.r, g: preset.g, b: preset.b })}
                style={{
                  flex: 1, padding: '4px 2px', borderRadius: 6, border: 'none',
                  background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                  fontSize: 9, fontWeight: 600, cursor: 'pointer',
                }}>
                {preset.label}
              </button>
            ))}
          </div>
          {/* Preview with band filter applied via CSS */}
          <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', height: 100, position: 'relative' }}>
            <img src={activeLayer.rasterDataUrl} alt="Band preview"
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                filter: `saturate(${(bandWeights.r + bandWeights.g + bandWeights.b) / 3}) hue-rotate(${(bandWeights.r - bandWeights.b) * 30}deg) brightness(${Math.max(bandWeights.r, bandWeights.g, bandWeights.b)})`,
              }} />
          </div>
        </div>
      )}

      {/* ── QGIS-JS WebAssembly ── */}
      <div style={{
        margin: '0 12px 12px', padding: '10px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(100,150,255,0.08)',
      }}>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🖥️</span> QGIS WebAssembly
          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>BETA</span>
        </div>
        <button onClick={() => {
          window.open('https://qgis.github.io/qgis-js/', '_blank');
        }} style={{
          width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none',
          background: 'linear-gradient(135deg, #2d6a4f, #40916c)',
          color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          🌐 Open QGIS-JS in Browser
        </button>
        <div style={{ fontSize: 9, color: '#475569', marginTop: 4, textAlign: 'center' }}>
          Opens QGIS WebAssembly port — experimental, ~100MB download
        </div>
      </div>
    </div>
  );
}
