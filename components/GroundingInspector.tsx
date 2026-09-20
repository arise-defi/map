/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { useGroundingLogStore } from '@/lib/state';

export default function GroundingInspector() {
  const { logs, clearLogs } = useGroundingLogStore();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<{ [key: string]: boolean }>({});

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedId(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };

  const formatJSON = (obj: any) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return String(obj);
    }
  };

  const getQueryText = (log: any) => {
    try {
      if (typeof log.requestBody?.contents === 'string') {
        return log.requestBody.contents;
      } else if (Array.isArray(log.requestBody?.contents)) {
        return log.requestBody.contents[0]?.parts?.[0]?.text || '';
      } else if (log.requestBody?.prompt) {
        return log.requestBody.prompt;
      }
    } catch (e) {}
    return '';
  };

  return (
    <div className="grounding-inspector sidebar-section" style={{ borderTop: '1px solid var(--gray-800)', paddingTop: '16px' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)} 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <span className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none', letterSpacing: '0.2px' }}>
          <span className="icon" style={{ fontSize: '16px', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
            chevron_right
          </span>
          Grounding with Google Maps Inspector ({logs.length})
        </span>
        {logs.length > 0 && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              clearLogs();
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              borderRadius: '4px'
            }}
          >
            Clear
          </button>
        )}
      </div>

      {isOpen && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
          {logs.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--gray-500)', fontStyle: 'italic', padding: '8px 0' }}>
              No grounding calls made in this session yet.
            </div>
          ) : (
            [...logs].reverse().map((log) => {
              const isExpanded = expandedLogId === log.id;
              const hasError = !!log.error;
              const isPending = !log.responseBody && !log.error;
              const queryText = getQueryText(log);

              return (
                <div 
                  key={log.id} 
                  style={{ 
                    background: 'var(--gray-1000)', 
                    border: `1px solid ${hasError ? 'rgba(239, 68, 68, 0.3)' : 'var(--gray-800)'}`,
                    borderRadius: '8px', 
                    padding: '10px',
                    fontSize: '13px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ 
                        background: hasError ? 'rgba(239, 68, 68, 0.15)' : isPending ? 'rgba(234, 179, 8, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: hasError ? '#ef4444' : isPending ? '#eab308' : '#10b981',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        {log.method}
                      </span>
                      <span style={{ color: 'var(--gray-400)', fontSize: '11px' }}>
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <button 
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#1F94FF',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      {isExpanded ? 'Collapse' : 'Inspect'}
                    </button>
                  </div>

                  {queryText && (
                    <div style={{ color: 'var(--gray-200)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                      "{queryText}"
                    </div>
                  )}

                  {log.url && (
                    <div style={{ color: 'var(--gray-500)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                      Endpoint: {log.url}
                    </div>
                  )}

                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px', borderTop: '1px solid var(--gray-800)', paddingTop: '8px' }}>
                      {/* Request Section */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--gray-400)', fontSize: '11px' }}>REQUEST BODY</span>
                          <button 
                            onClick={() => handleCopy(formatJSON(log.requestBody), `${log.id}-req`)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--gray-500)', fontSize: '11px', cursor: 'pointer' }}
                          >
                            {copiedId[`${log.id}-req`] ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <pre style={{ 
                          background: 'var(--gray-900)', 
                          padding: '8px', 
                          borderRadius: '6px', 
                          overflowX: 'auto', 
                          maxHeight: '150px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: 'var(--gray-300)',
                          margin: 0,
                          textAlign: 'left'
                        }}>
                          {formatJSON(log.requestBody)}
                        </pre>
                      </div>

                      {/* Response/Error Section */}
                      {hasError ? (
                        <div>
                          <div style={{ fontWeight: 'bold', color: '#ef4444', fontSize: '11px', marginBottom: '4px' }}>ERROR</div>
                          <pre style={{ 
                            background: 'rgba(239, 68, 68, 0.1)', 
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            padding: '8px', 
                            borderRadius: '6px', 
                            overflowX: 'auto', 
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: '#f87171',
                            margin: 0,
                            textAlign: 'left'
                          }}>
                            {log.error}
                          </pre>
                        </div>
                      ) : log.responseBody ? (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 'bold', color: 'var(--gray-400)', fontSize: '11px' }}>RESPONSE BODY</span>
                            <button 
                              onClick={() => handleCopy(formatJSON(log.responseBody), `${log.id}-res`)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--gray-500)', fontSize: '11px', cursor: 'pointer' }}
                            >
                              {copiedId[`${log.id}-res`] ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <pre style={{ 
                            background: 'var(--gray-900)', 
                            padding: '8px', 
                            borderRadius: '6px', 
                            overflowX: 'auto', 
                            maxHeight: '200px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: 'var(--gray-300)',
                            margin: 0,
                            textAlign: 'left'
                          }}>
                            {formatJSON(log.responseBody)}
                          </pre>
                        </div>
                      ) : (
                        <div style={{ color: 'var(--gray-500)', fontStyle: 'italic', fontSize: '11px', textAlign: 'left' }}>
                          Awaiting response...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
