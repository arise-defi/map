
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Added missing React imports.
import React, { useEffect, useMemo, useState } from 'react';
import { useSettings, useUI, useLogStore, useTools, personas, useMapStore, useGroundingLogStore } from '@/lib/state';
import c from 'classnames';
import {
  AVAILABLE_VOICES_FULL,
  AVAILABLE_VOICES_LIMITED,
  MODELS_WITH_LIMITED_VOICES,
  DEFAULT_VOICE,
} from '@/lib/constants';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import GroundingInspector from './GroundingInspector';
// Check available models here https://ai.google.dev/gemini-api/docs/models
const AVAILABLE_MODELS = [
  'gemini-3.1-flash-live-preview',
];

const VERTEX_SUPPORTED_MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'];
const GEMINI_SUPPORTED_MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'];

const STANDARD_VERTEX_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
];

const STANDARD_GEMINI_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3.5-pro',
  'gemini-3.5-flash',
  'gemini-3.1-pro',
  'gemini-3.1-flash',
];

export default function Sidebar() {
  const {
    isSidebarOpen,
    toggleSidebar,
    showSystemMessages,
    toggleShowSystemMessages,
  } = useUI();
  const {
    systemPrompt,
    model,
    voice,
    setSystemPrompt,
    setModel,
    setVoice,
    isEasterEggMode,
    activePersona,
    setPersona,
    useVertexAI,
    useCustomGcp,
    gcpProjectId,
    gcpLocation,
    gcpAccessToken,
    customGeminiApiKey,
    customGoogleMapsApiKey,
    useCustomCredentials,
    customGroundingModel,
    defaultVertexModel,
    defaultGeminiModel,
    thinkingEnabled,
    setUseVertexAI,
    setUseCustomGcp,
    setGcpProjectId,
    setGcpLocation,
    setGcpAccessToken,
    setCustomGeminiApiKey,
    setCustomGoogleMapsApiKey,
    setUseCustomCredentials,
    setCustomGroundingModel,
    setDefaultVertexModel,
    setDefaultGeminiModel,
    setThinkingEnabled,
    setActionBubble,
    theme,
    setTheme,
  } = useSettings();
  const { connected, connect, disconnect } = useLiveAPIContext();
  const [isCustom, setIsCustom] = useState(() => !AVAILABLE_MODELS.includes(model));

  const availableVoices = useMemo(() => {
    const isLimited =
      MODELS_WITH_LIMITED_VOICES.includes(model) ||
      !AVAILABLE_MODELS.includes(model) ||
      model.includes('flash') ||
      model.includes('live');
    return isLimited ? AVAILABLE_VOICES_LIMITED : AVAILABLE_VOICES_FULL;
  }, [model]);

  useEffect(() => {
    if (!availableVoices.some(v => v.name === voice)) {
      setVoice(DEFAULT_VOICE);
    }
  }, [availableVoices, voice, setVoice]);

  const handleExportLogs = () => {
    const { turns, sessionMetadata } = useLogStore.getState();
    const config = useSettings.getState();
    const { tools } = useTools.getState();

    const logData = {
      metadata: sessionMetadata,
      configuration: {
        model: config.model,
        systemPrompt: config.systemPrompt,
      },
      tools,
      conversation: turns.map(turn => ({
        ...turn,
        timestamp: turn.timestamp.toISOString(),
      })),
    };

    const jsonString = JSON.stringify(logData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `live-api-logs-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <aside className={c('sidebar', { open: isSidebarOpen })}>
        <div className="sidebar-header">
          <h3>Settings</h3>
          <button onClick={toggleSidebar} className="close-button">
            <span className="icon">close</span>
          </button>
        </div>
        <div className="sidebar-content">
          {connected && (
            <div className="sidebar-warning-banner" style={{
              background: '#f59e0b',
              color: '#ffffff',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>warning</span>
              <span>Pause the session to modify configuration.</span>
            </div>
          )}
          <div className="sidebar-section">
            <fieldset disabled={connected} title={connected ? "Pause the session to modify settings" : undefined}>
              {isEasterEggMode && (
                <label>
                  Persona
                  <select
                    value={activePersona}
                    onChange={e => setPersona(e.target.value)}
                  >
                    {Object.keys(personas).map(personaName => (
                      <option key={personaName} value={personaName}>
                        {personaName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                System Prompt
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={10}
                  placeholder="Describe the role and personality of the AI..."
                  disabled={isEasterEggMode}
                />
              </label>

              <div className="settings-subsection-card" style={{
                background: 'var(--gray-1000)',
                border: '1px solid var(--gray-800)',
                borderRadius: '8px',
                padding: '12px',
                marginTop: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gray-400)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Voice Session Configuration
                </span>
                
                <label style={{ margin: 0 }}>
                  Voice Streaming Model (WebSocket)
                  <select
                    value={isCustom ? 'custom' : model}
                    onChange={e => {
                      if (e.target.value === 'custom') {
                        setIsCustom(true);
                        setModel('gemini-3.1-flash-live-preview');
                      } else {
                        setIsCustom(false);
                        setModel(e.target.value);
                      }
                    }}
                  >
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="custom">Custom Model...</option>
                  </select>
                </label>

                {isCustom && (
                  <label className="custom-model-label animate-fade-in" style={{ margin: 0 }}>
                    Custom Model Endpoint
                    <input
                      type="text"
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      placeholder="e.g. gemini-3.1-flash-live-preview"
                      className="custom-model-input"
                    />
                  </label>
                )}

                <label style={{ margin: 0 }}>
                  Voice
                  <select
                    value={voice}
                    onChange={e => setVoice(e.target.value)}
                  >
                    {availableVoices.map(v => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.description})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <div className="provider-selection-wrapper">
              <span className="info-label select-label-title">Grounding with Google Maps via:</span>
              
              {/* Radio 1: Vertex AI Default */}
              <label
                className={`provider-radio-option ${!useCustomCredentials && useVertexAI ? 'active' : ''}`}
                onClickCapture={() => { if (connected) setActionBubble('Need to pause the session 👇'); }}
                title={connected ? "Pause the session to modify settings" : undefined}
              >
                <input
                  type="radio"
                  name="grounding-provider"
                  checked={!useCustomCredentials && useVertexAI}
                  disabled={connected}
                  onChange={() => {
                    setUseCustomCredentials(false);
                    setUseVertexAI(true);
                    setUseCustomGcp(false);
                    if (connected) setActionBubble('Need to pause the session 👇'); else setActionBubble('Restart Session 👇');
                  }}
                />
                <span className="radio-label-text">
                  <strong className="provider-title"><a href="https://cloud.google.com/products/gemini-enterprise-agent-platform" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }} onClick={e => e.stopPropagation()}>Gemini Enterprise</a></strong>
                  <div className="badge-row" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <a
                      href="https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-google-maps#place-properties"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="capability-badge places"
                      onClick={e => e.stopPropagation()}
                    >
                      Places
                    </a>
                    <a
                      href="https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-google-maps#routing-find-directions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="capability-badge routing"
                      onClick={e => e.stopPropagation()}
                    >
                      Routing
                    </a>
                  </div>
                  
                  <div className="provider-model-select-wrapper" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="radio-subtext" style={{ fontWeight: 500, color: 'var(--gray-300)' }}>Grounding Model</span>
                    <select
                      value={STANDARD_VERTEX_MODELS.includes(defaultVertexModel) ? defaultVertexModel : 'custom'}
                      disabled={connected || useCustomCredentials || !useVertexAI}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setDefaultVertexModel('');
                        } else {
                          setDefaultVertexModel(val);
                        }
                        if (connected) setActionBubble('Need to pause the session 👇'); else setActionBubble('Restart Session 👇');
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (connected) setActionBubble('Need to pause the session 👇');
                      }}
                      className="provider-model-dropdown"
                    >
                      {STANDARD_VERTEX_MODELS.map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="custom">Custom...</option>
                    </select>
                    {!STANDARD_VERTEX_MODELS.includes(defaultVertexModel) && (
                      <input
                        type="text"
                        value={defaultVertexModel}
                        disabled={connected || useCustomCredentials || !useVertexAI}
                        onChange={(e) => setDefaultVertexModel(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Enter custom model name..."
                        className="provider-model-dropdown"
                        style={{ marginTop: '4px' }}
                      />
                    )}
                    {defaultVertexModel.includes('2.5') && (
                      <span className="radio-subtext animate-fade-in" style={{ marginTop: '4px', display: 'block', fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic', lineHeight: 1.3 }}>
                        * July 2026 status: Places & Routing Grounding fully supported (us-central1 / global).
                      </span>
                    )}
                    {defaultVertexModel === 'gemini-3.5-flash' && (
                      <span className="radio-subtext animate-fade-in" style={{ marginTop: '4px', display: 'block', fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic', lineHeight: 1.3 }}>
                        * July 2026 status: Places Grounding is active on gemini-3.5-flash (region 'global'). Routing requires gemini-2.5.
                      </span>
                    )}
                    {(defaultVertexModel === 'gemini-3.5-pro' || defaultVertexModel.includes('3.1')) && (
                      <span className="radio-subtext animate-fade-in" style={{ marginTop: '4px', display: 'block', fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic', lineHeight: 1.3 }}>
                        * July 2026 status: Model '{defaultVertexModel}' is not published for Places/Routing on Gemini Enterprise. We recommend gemini-2.5-pro or gemini-3.5-flash.
                      </span>
                    )}
                  </div>
                  <span className="radio-subtext" style={{ marginTop: '6px', display: 'block' }}>Testing endpoint - No credentials required.</span>
                </span>
              </label>

              {/* Radio 2: Gemini API Default */}
              <label
                className={`provider-radio-option ${!useCustomCredentials && !useVertexAI ? 'active' : ''}`}
                onClickCapture={() => { if (connected) setActionBubble('Need to pause the session 👇'); }}
                title={connected ? "Pause the session to modify settings" : undefined}
              >
                <input
                  type="radio"
                  name="grounding-provider"
                  checked={!useCustomCredentials && !useVertexAI}
                  disabled={connected}
                  onChange={() => {
                    setUseCustomCredentials(false);
                    setUseVertexAI(false);
                    setUseCustomGcp(false);
                    if (connected) setActionBubble('Need to pause the session 👇'); else setActionBubble('Restart Session 👇');
                  }}
                />
                <span className="radio-label-text">
                  <strong className="provider-title"><a href="https://ai.google.dev/gemini-api/docs" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }} onClick={e => e.stopPropagation()}>Gemini API</a></strong>
                  <div className="badge-row" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <a
                      href="https://ai.google.dev/gemini-api/docs/maps-grounding"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="capability-badge places"
                      onClick={e => e.stopPropagation()}
                    >
                      Places
                    </a>
                  </div>
                  
                  <div className="provider-model-select-wrapper" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="radio-subtext" style={{ fontWeight: 500, color: 'var(--gray-300)' }}>Grounding Model</span>
                    <select
                      value={STANDARD_GEMINI_MODELS.includes(defaultGeminiModel) ? defaultGeminiModel : 'custom'}
                      disabled={connected || useCustomCredentials || useVertexAI}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setDefaultGeminiModel('');
                        } else {
                          setDefaultGeminiModel(val);
                        }
                        if (connected) setActionBubble('Need to pause the session 👇'); else setActionBubble('Restart Session 👇');
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (connected) setActionBubble('Need to pause the session 👇');
                      }}
                      className="provider-model-dropdown"
                    >
                      {STANDARD_GEMINI_MODELS.map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="custom">Custom...</option>
                    </select>
                    {!STANDARD_GEMINI_MODELS.includes(defaultGeminiModel) && (
                      <input
                        type="text"
                        value={defaultGeminiModel}
                        disabled={connected || useCustomCredentials || useVertexAI}
                        onChange={(e) => setDefaultGeminiModel(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Enter custom model name..."
                        className="provider-model-dropdown"
                        style={{ marginTop: '4px' }}
                      />
                    )}
                  </div>
                  <span className="radio-subtext" style={{ marginTop: '6px', display: 'block' }}>Uses your developer API key.</span>
                </span>
              </label>
            </div>

            {!useCustomCredentials && useVertexAI && (
              <div className="proxy-connected-status animate-fade-in" style={{ marginBottom: '16px' }}>
                <span className="status-dot-green"></span>
                <span className="status-text">Connected securely. No setup required.</span>
              </div>
            )}

            <div className="settings-toggle-item" style={{ marginTop: '16px', borderTop: '1px solid var(--gray-800)', paddingTop: '16px' }} title={connected ? "Pause the session to modify settings" : undefined}>
              <label htmlFor="thinking-toggle" className="settings-toggle-label" style={{ flex: 1 }}>
                Model Thinking (Reasoning)
                <span className="radio-subtext" style={{ display: 'block', marginTop: '2px' }}>
                  Enable reasoning steps for search calls on supported models.{' '}
                  <a
                    href="https://ai.google.dev/gemini-api/docs/thinking"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#60a5fa', textDecoration: 'underline' }}
                    onClick={e => e.stopPropagation()}
                  >
                    Gemini API Docs
                  </a>
                  {' / '}
                  <a
                    href="https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#60a5fa', textDecoration: 'underline' }}
                    onClick={e => e.stopPropagation()}
                  >
                    Gemini Enterprise (thinking_budget)
                  </a>
                </span>
              </label>
              <select
                id="thinking-toggle"
                value={thinkingEnabled ? 'auto' : 'disabled'}
                disabled={connected}
                onChange={(e) => setThinkingEnabled(e.target.value === 'auto')}
                style={{ width: '130px', padding: '6px', borderRadius: '6px', background: 'var(--gray-900)', border: '1px solid var(--gray-800)', color: 'var(--white)' }}
              >
                <option value="auto">Automatic</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            <div className="settings-toggle-item custom-credentials-toggle-wrapper" style={{ marginTop: '12px', borderTop: '1px solid var(--gray-850)', paddingTop: '12px' }} title={connected ? "Pause the session to modify settings" : undefined}>
              <label
                className="tool-checkbox-wrapper"
                onClickCapture={() => { if (connected) setActionBubble('Need to pause the session 👇'); }}
              >
                <input
                  type="checkbox"
                  id="custom-credentials-toggle"
                  checked={useCustomCredentials}
                  disabled={connected}
                  onChange={(e) => {
                    setUseCustomCredentials(e.target.checked);
                    if (e.target.checked) {
                      setUseCustomGcp(true);
                    } else {
                      setUseCustomGcp(false);
                    }
                    if (connected) setActionBubble('Need to pause the session 👇'); else setActionBubble('Restart Session 👇');
                  }}
                />
                <span className="checkbox-visual"></span>
              </label>
              <label htmlFor="custom-credentials-toggle" className="settings-toggle-label">
                Use Custom / Developer Credentials
              </label>
            </div>

            {useCustomCredentials && (
              <div className="custom-credentials-section animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }} title={connected ? "Pause the session to modify settings" : undefined}>
                <label>
                  Grounding API Type
                  <select
                    value={useVertexAI ? 'vertex' : 'gemini'}
                    disabled={connected}
                    onChange={(e) => {
                      setUseVertexAI(e.target.value === 'vertex');
                      setUseCustomGcp(true);
                    }}
                  >
                    <option value="vertex">Gemini Enterprise</option>
                    <option value="gemini">Gemini API</option>
                  </select>
                </label>

                <label className="custom-model-label">
                  Grounding Model
                  <select
                    value={(useVertexAI ? STANDARD_VERTEX_MODELS : STANDARD_GEMINI_MODELS).includes(customGroundingModel) ? customGroundingModel : 'custom'}
                    disabled={connected}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setCustomGroundingModel('');
                      } else {
                        setCustomGroundingModel(val);
                      }
                      if (connected) setActionBubble('Need to pause the session 👇'); else setActionBubble('Restart Session 👇');
                    }}
                    onClick={() => {
                      if (connected) setActionBubble('Need to pause the session 👇');
                    }}
                  >
                    {(useVertexAI ? STANDARD_VERTEX_MODELS : STANDARD_GEMINI_MODELS).map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="custom">Custom...</option>
                  </select>
                  {!(useVertexAI ? STANDARD_VERTEX_MODELS : STANDARD_GEMINI_MODELS).includes(customGroundingModel) && (
                    <input
                      type="text"
                      value={customGroundingModel}
                      disabled={connected}
                      onChange={(e) => setCustomGroundingModel(e.target.value)}
                      placeholder="Enter custom model name..."
                      className="custom-model-input"
                      style={{ marginTop: '6px' }}
                    />
                  )}
                  {(useVertexAI && customGroundingModel.includes('2.5')) && (
                    <span className="radio-subtext animate-fade-in" style={{ marginTop: '4px', display: 'block', fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic', lineHeight: 1.3 }}>
                      * July 2026 status: Places & Routing Grounding fully supported (us-central1 / global).
                    </span>
                  )}
                  {(useVertexAI && customGroundingModel === 'gemini-3.5-flash') && (
                    <span className="radio-subtext animate-fade-in" style={{ marginTop: '4px', display: 'block', fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic', lineHeight: 1.3 }}>
                      * July 2026 status: Places Grounding is active on gemini-3.5-flash (region 'global'). Routing requires gemini-2.5.
                    </span>
                  )}
                  {(useVertexAI && (customGroundingModel === 'gemini-3.5-pro' || customGroundingModel.includes('3.1'))) && (
                    <span className="radio-subtext animate-fade-in" style={{ marginTop: '4px', display: 'block', fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic', lineHeight: 1.3 }}>
                      * July 2026 status: Model '{customGroundingModel}' is not published for Places/Routing on Gemini Enterprise. We recommend gemini-2.5-pro or gemini-3.5-flash.
                    </span>
                  )}
                </label>

                {useVertexAI ? (
                  <fieldset disabled={connected} className="vertex-fields" style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label className="custom-model-label">
                      GCP Project ID
                      <input
                        type="text"
                        value={gcpProjectId}
                        onChange={e => setGcpProjectId(e.target.value)}
                        placeholder="e.g. my-gcp-project-id"
                        className="custom-model-input"
                      />
                    </label>
                    <label className="custom-model-label">
                      GCP Region / Location
                      <input
                        type="text"
                        value={gcpLocation}
                        onChange={e => setGcpLocation(e.target.value)}
                        placeholder="e.g. us-central1"
                        className="custom-model-input"
                      />
                    </label>
                    <label className="custom-model-label">
                      GCP Access Token
                      <input
                        type="password"
                        value={gcpAccessToken}
                        onChange={e => setGcpAccessToken(e.target.value)}
                        placeholder="Paste ya29.a0AcfU23..."
                        className="custom-model-input"
                      />
                    </label>
                  </fieldset>
                ) : (
                  <fieldset disabled={connected} className="vertex-fields" style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label className="custom-model-label">
                      Developer Gemini API Key (Optional)
                      <input
                        type="password"
                        value={customGeminiApiKey}
                        onChange={e => setCustomGeminiApiKey(e.target.value)}
                        placeholder="Enter key to override .env..."
                        className="custom-model-input"
                      />
                    </label>
                    <label className="custom-model-label">
                      Google Maps API Key (Optional)
                      <input
                        type="password"
                        value={customGoogleMapsApiKey}
                        onChange={e => setCustomGoogleMapsApiKey(e.target.value)}
                        placeholder="Enter key to override .env..."
                        className="custom-model-input"
                      />
                    </label>
                  </fieldset>
                )}
              </div>
            )}

            <div className="settings-toggle-item">
              <label className="tool-checkbox-wrapper">
                <input
                  type="checkbox"
                  id="system-message-toggle"
                  checked={showSystemMessages}
                  onChange={toggleShowSystemMessages}
                />
                <span className="checkbox-visual"></span>
              </label>
              <label
                htmlFor="system-message-toggle"
                className="settings-toggle-label"
              >
                Show system messages
              </label>
            </div>
            <div className="settings-toggle-item" style={{ marginTop: '16px', borderTop: '1px solid var(--gray-850)', paddingTop: '16px' }}>
              <label htmlFor="theme-select" className="settings-toggle-label" style={{ flex: 1 }}>
                Color Theme
                <span className="radio-subtext" style={{ display: 'block', marginTop: '2px' }}>
                  Select the applet color theme mode.
                </span>
              </label>
              <select
                id="theme-select"
                value={theme}
                onChange={e => setTheme(e.target.value as 'dark' | 'light')}
                style={{ width: '110px', padding: '6px', borderRadius: '6px', background: 'var(--gray-1000)', border: '1px solid var(--gray-800)', color: 'var(--text)' }}
              >
                <option value="dark">Dark Mode</option>
                <option value="light">Light Mode</option>
              </select>
            </div>
          </div>
          
          <GroundingInspector />

          <div className="sidebar-actions">
            <button onClick={handleExportLogs} title="Export session logs">
              <span className="icon">download</span>
              Export Logs
            </button>
            <button
              onClick={() => {
                useLogStore.getState().clearTurns();
                useGroundingLogStore.getState().clearLogs();
                // Clear map state
                const mapStore = useMapStore.getState();
                mapStore.clearMarkers();
                mapStore.setCameraTarget(null);

                if (connected) {
                  disconnect();
                  setTimeout(connect, 500);
                }
              }}
              title="Reset session logs"
            >
              <span className="icon">refresh</span>
              Reset Session
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
