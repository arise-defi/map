/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// Added FC to the React import.
import React, { FC } from 'react';
import './PopUp.css';

interface PopUpProps {
  onClose: () => void;
}

const PopUp: React.FC<PopUpProps> = ({ onClose }) => {
  return (
    <div className="popup-overlay">
      <div className="popup-content">
        <h2>Welcome to the Interactive Day Planner</h2>
        <div className="popup-scrollable-content">
          <p>
            Experience real-time voice and text planning powered by <strong><a href="https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Gemini Flash Live</a></strong>, grounded with live Google Maps data on a 3D Map.
          </p>
          <p><strong>To get started:</strong></p>
          <ol>
            <li>
              <span className="icon">play_circle</span>
              <div>
                <strong>Talk or Type: &nbsp;</strong>Press the <span style={{ background: '#3b82f6', color: '#ffffff', padding: '2px 10px', borderRadius: '16px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', boxShadow: '0 2px 6px rgba(59, 130, 246, 0.4)', margin: '0 4px' }}>▶ Play</span> button to start speaking naturally with <a href="https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline', fontWeight: 'bold' }}>Gemini Flash Live</a>, or type in the search bar.
              </div>
            </li>
            <li>
              <span className="icon">place</span>
              <div>
                <strong>Explore <span className="capability-badge places" style={{ fontSize: '11px', margin: '0 2px' }}>Places</span> and <span className="capability-badge routing" style={{ fontSize: '11px', margin: '0 2px' }}>Routing</span> Grounding with Google Maps: &nbsp;</strong>Ask for spots, travel times, multi-stop directions, and search along route to watch the 3D map dynamically fly and interactive popovers appear.
              </div>
            </li>
            <li>
              <span className="icon">tune</span>
              <div>
                <strong>System Settings: &nbsp;</strong>Choose between <strong><a href="https://cloud.google.com/products/gemini-enterprise-agent-platform" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Gemini Enterprise</a></strong> (supports <span className="capability-badge places" style={{ fontSize: '10px' }}>Places</span> and <span className="capability-badge routing" style={{ fontSize: '10px' }}>Routing</span> grounding with <strong>gemini-2.5</strong>) and standard <strong><a href="https://ai.google.dev/gemini-api/docs" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Gemini API</a></strong> (supports <span className="capability-badge places" style={{ fontSize: '10px' }}>Places</span> grounding).
              </div>
            </li>
          </ol>
        </div>
        <button onClick={onClose}>Got It, Let's Plan!</button>
      </div>
    </div>
  );
};

export default PopUp;