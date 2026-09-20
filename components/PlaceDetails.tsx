/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { useMapStore } from '@/lib/state';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gmp-place-details-compact': any;
      'gmp-place-details-place-request': any;
      'gmp-place-content-config': any;
      'gmp-place-media': any;
      'gmp-place-rating': any;
      'gmp-place-type': any;
      'gmp-place-price': any;
      'gmp-place-open-now-status': any;
      'gmp-place-accessible-entrance-icon': any;
      'gmp-place-attribution': any;
      'gmp-place-reviews': any;
      'gmp-place-search': any;
      'gmp-place-text-search-request': any;
      'gmp-place-all-content': any;
    }
  }
}



export function PlaceDetails({
  query,
  placeIds = [],
  matchedQuote,
}: {
  query?: string;
  placeIds?: string[];
  matchedQuote?: { text: string; uri?: string };
}) {
  const placesLibrary = useMapsLibrary('places');
  const { highlightedPlaceId, setHighlightedPlaceId } = useMapStore();

  useEffect(() => {
    if (!highlightedPlaceId) return;

    const cleanId = highlightedPlaceId.replace('places/', '');
    const element = document.getElementById(`container-${cleanId}`) || document.querySelector(`[data-place-id="${cleanId}"]`);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      setHighlightedPlaceId(null); // Clear after handling
    }
  }, [highlightedPlaceId, setHighlightedPlaceId]);

  if (!placesLibrary || (placeIds.length === 0 && !matchedQuote?.text)) {
    return null;
  }

  const uniquePlaceIds = Array.from(new Set(placeIds || []));

  const placeContentConfig = React.createElement('gmp-place-content-config', {},
    React.createElement('gmp-place-media'),
    React.createElement('gmp-place-rating'),
    React.createElement('gmp-place-type'),
    React.createElement('gmp-place-price'),
    React.createElement('gmp-place-accessible-entrance-icon'),
    React.createElement('gmp-place-open-now-status'),
    React.createElement('gmp-place-attribution', { 
      'light-scheme-color': 'gray',
      'dark-scheme-color': 'white'
    })
  );

  const handlePlaceClick = async (id: string) => {
    if (!placesLibrary) return;
    try {
      const cleanId = id.replace('places/', '');
      const placeObj = new placesLibrary.Place({ id: cleanId });
      
      await placeObj.fetchFields({ fields: ['location'] });
      
      if (placeObj.location) {
        useMapStore.getState().setCameraTarget({
          center: {
            lat: placeObj.location.lat(),
            lng: placeObj.location.lng(),
            altitude: 200
          } as any
        } as any);
      }
    } catch (err) {
      console.error('Error in handlePlaceClick panning camera:', err);
    }
  };

  const createCompactDetailsElement = (id: string, keyVal?: string) => {
    const cleanId = id.replace('places/', '');
    const compactElement = React.createElement('gmp-place-details-compact', { 
      key: `gmp-compact-${keyVal || id}`,
      ref: (element: any) => {
        if (element && placesLibrary && id) {
          try {
            element.setAttribute('orientation', 'horizontal');
            element.place = new placesLibrary.Place({ id: cleanId });
          } catch (e) {}
        }
      },
      style: {
        width: '100%',
        maxWidth: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        colorScheme: 'light',
        cursor: 'pointer',
        flexShrink: 0
      }
    }, 
      React.createElement('gmp-place-details-place-request', { place: id, key: `req-${keyVal || id}` }),
      placeContentConfig
    );

    return (
      <div 
        key={`wrapper-${keyVal || id}`} 
        id={keyVal?.startsWith('single') ? `container-${cleanId}` : `item-${cleanId}-${keyVal || id}`}
        data-place-id={cleanId}
        onClick={() => handlePlaceClick(id)} 
        style={{ width: '100%', cursor: 'pointer', flexShrink: 0, borderRadius: '12px' }}
      >
        {compactElement}
      </div>
    );
  };

  return (
    <div className="places-ui-kit-container" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      
      {/* 1. RENDER THE EXACT MATCHED QUOTE */}
      {matchedQuote?.text && (
        <div className="ai-insight-quote-card" style={quoteCardStyle}>
          <span className="material-symbols-outlined" style={iconStyle}>
            format_quote
          </span>
          <p style={textStyle}>
            "{matchedQuote.text}"
            {matchedQuote.uri && (
              <a href={matchedQuote.uri} target="_blank" rel="noreferrer" style={linkStyle}>
                View Source
              </a>
            )}
          </p>
        </div>
      )}

      {/* 2. RENDER THE COMPACT COMPONENT LAYOUT */}
      {uniquePlaceIds.length === 1 ? (
        createCompactDetailsElement(uniquePlaceIds[0], `single-${uniquePlaceIds[0]}`)
      ) : uniquePlaceIds.length > 1 ? (
        <div 
          className="compact-details-list" 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '10px', 
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            maxHeight: '330px',
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: '4px'
          }}
        >
          {uniquePlaceIds.map((id, index) => {
            const cleanId = id.replace('places/', '');
            return (
              <div 
                key={`container-${id}-${index}`} 
                id={`container-${cleanId}`}
                data-place-id={cleanId}
                style={{ 
                  width: '100%', 
                  minHeight: '86px', 
                  flexShrink: 0,
                  borderRadius: '12px'
                }}
              >
                {createCompactDetailsElement(id, `${id}-${index}`)}
              </div>
            );
          })}
        </div>
      ) : query ? (
        React.createElement('gmp-place-search', {},
          React.createElement('gmp-place-text-search-request', {
            query: query,
            ref: (el: any) => {
              if (el && query) {
                try {
                  el.setAttribute('query', query);
                  el.query = query;
                } catch (e) {}
              }
            }
          }),
          React.createElement('gmp-place-all-content')
        )
      ) : null}
      
    </div>
  );
}

// Inline Style Tokens for Visual WOW factor
const quoteCardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  borderLeft: '4px solid #3b82f6',
  padding: '12px 16px',
  borderRadius: '8px',
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
};

const iconStyle: React.CSSProperties = {
  color: '#3b82f6',
  fontSize: '24px',
};

const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  lineHeight: '1.5',
  color: '#e2e8f0',
};

const linkStyle: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: '10px',
  color: '#60a5fa',
  textDecoration: 'none',
  fontSize: '13px',
  fontWeight: 500,
};
