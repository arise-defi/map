/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import React from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

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
      'gmp-place-search': any;
      'gmp-place-text-search-request': any;
      'gmp-place-all-content': any;
    }
  }
}

export function GroundingWidget({
  query,
  placeIds = [],
  matchedQuote,
}: {
  query?: string;
  placeIds?: string[];
  matchedQuote?: { text: string; uri?: string };
}) {
  const placesLibrary = useMapsLibrary('places');

  // Format IDs by stripping 'places/' prefix if provided
  const cleanPlaceIds = (placeIds || []).map((id) => id.replace('places/', ''));

  if (!placesLibrary || (cleanPlaceIds.length === 0 && !matchedQuote?.text)) {
    return null;
  }

  // Pure declarative configuration with address EXCLUDED to avoid bloat
  const placeContentConfig = React.createElement('gmp-place-content-config', {},
    React.createElement('gmp-place-media', { 'lightbox-preferred': true }),
    React.createElement('gmp-place-rating'),
    React.createElement('gmp-place-type'),
    React.createElement('gmp-place-price'),
    React.createElement('gmp-place-open-now-status'),
    React.createElement('gmp-place-accessible-entrance-icon'),
    React.createElement('gmp-place-reviews')
  );

  return (
    <div className="places-ui-kit-container" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      
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
      {cleanPlaceIds.length === 1 ? (
        React.createElement('gmp-place-details-compact', { 
          ref: (element: any) => {
            if (element) {
              try {
                element.setAttribute('orientation', 'horizontal');
                element.setAttribute('truncation-preferred', '');
              } catch (e) {}
            }
          },
          style: {
            width: '100%',
            borderRadius: '12px',
            overflow: 'hidden',
            backgroundColor: '#ffffff',
            colorScheme: 'light'
          }
        }, 
          React.createElement('gmp-place-details-place-request', { place: cleanPlaceIds[0] }),
          placeContentConfig
        )
      ) : cleanPlaceIds.length > 1 ? (
        <div 
          className="compact-details-list" 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '10px', 
            width: '100%',
            maxHeight: '440px',
            overflowY: 'auto',
            paddingRight: '6px'
          }}
        >
          {cleanPlaceIds.map((id) => (
            React.createElement('gmp-place-details-compact', { 
              key: id,
              ref: (element: any) => {
                if (element) {
                  try {
                    element.setAttribute('orientation', 'horizontal');
                    element.setAttribute('truncation-preferred', '');
                  } catch (e) {}
                }
              },
              style: {
                width: '100%',
                borderRadius: '12px',
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                colorScheme: 'light'
              }
            },
              React.createElement('gmp-place-details-place-request', { place: id }),
              placeContentConfig
            )
          ))}
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