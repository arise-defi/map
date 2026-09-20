/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import cn from 'classnames';
// Added missing React imports.
import React, { memo, useEffect, useRef, useState, FormEvent, Ref } from 'react';
import { AudioRecorder } from '../lib/audio-recorder';
import { useLogStore, useUI, useSettings } from '@/lib/state';

import { useLiveAPIContext } from '../contexts/LiveAPIContext';
import { Autopilot } from './Autopilot';

// Hook to detect screen size for responsive component rendering
const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => {
      setMatches(media.matches);
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);

  return matches;
};

export type ControlTrayProps = {
  trayRef?: Ref<HTMLElement>;
};

function ControlTray({trayRef}: ControlTrayProps) {
  const { muted, setMuted, speakerMuted, setSpeakerMuted, toggleSidebar } = useUI();
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [textPrompt, setTextPrompt] = useState('');
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const { activateEasterEggMode, actionBubble, setActionBubble } = useSettings();
  const settingsClickTimestamps = useRef<number[]>([]);
  const isMobile = useMediaQuery('(max-width: 768px), (orientation: landscape) and (max-height: 768px)');
  const [isTextEntryVisible, setIsTextEntryVisible] = useState(false);
  const isLandscape = useMediaQuery('(orientation: landscape) and (max-height: 768px)');
  const turns = useLogStore(state => state.turns);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      if (!textPrompt) {
        textarea.style.height = '20px'; // Exact single-line height
      } else {
        textarea.style.height = '20px';
        const scrollHeight = textarea.scrollHeight;
        textarea.style.height = `${Math.min(scrollHeight, 120)}px`;
      }
    }
  }, [textPrompt]);

  useEffect(() => {
    if (actionBubble) {
      const timer = setTimeout(() => {
        setActionBubble(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [actionBubble, setActionBubble]);

  const { client, connected, connect, disconnect, audioStreamer } =
    useLiveAPIContext();

  useEffect(() => {
    if (audioStreamer.current) {
      audioStreamer.current.setGain(speakerMuted ? 0 : 1);
    }
  }, [speakerMuted, audioStreamer]);

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };

    const onError = (error: any) => {
      console.error('Audio recorder error:', error);
      useLogStore.getState().addTurn({
        role: 'system',
        text: `Microphone error: ${error.message || 'Permission denied'}. Please ensure your microphone is connected and permissions are granted.`,
        isFinal: true,
      });
      setMuted(true);
    };
    
    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData);
      audioRecorder.on('error', onError);
      audioRecorder.start().catch(onError);
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off('data', onData);
      audioRecorder.off('error', onError);
    };
  }, [connected, client, muted, audioRecorder]);

  const handleMicClick = () => {
    setMuted(!muted);
  };

  const sendTextPrompt = async () => {
    if (!textPrompt.trim()) return;

    useLogStore.getState().addTurn({
      role: 'user',
      text: textPrompt,
      isFinal: true,
    });
    const currentPrompt = textPrompt;
    setTextPrompt(''); // Clear input immediately

    if (!connected) {
      console.warn("Cannot send text message: not connected to live stream.");
      useLogStore.getState().addTurn({
        role: 'system',
        text: `Cannot send message. Please connect to the stream first.`,
        isFinal: true,
      });
      return;
    }
    // Interrupt current turn on new prompt
    client.interrupt();
    client.sendRealtimeText(currentPrompt);
  };

  const handleTextSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await sendTextPrompt();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextPrompt();
    }
  };

  const handleSettingsClick = () => {
    toggleSidebar();

    const now = Date.now();
    settingsClickTimestamps.current.push(now);

    // Filter out clicks older than 3 seconds
    settingsClickTimestamps.current = settingsClickTimestamps.current.filter(
        timestamp => now - timestamp < 3000
    );

    if (settingsClickTimestamps.current.length >= 6) {
        activateEasterEggMode();
        useLogStore.getState().addTurn({
            role: 'system',
            text: "You've unlocked Scavenger Hunt mode!.",
            isFinal: true,
        });
        
        // Reset after triggering
        settingsClickTimestamps.current = [];
    }
  };

  const micButtonTitle = muted ? 'Unmute microphone' : 'Mute microphone';

  const connectButtonTitle = connected ? 'Stop streaming' : 'Start streaming';

  return (
    <section className="control-tray" ref={trayRef}>
      <nav className={cn('actions-nav', { 'text-entry-visible-landscape': isLandscape && isTextEntryVisible })}>
        <button
          className={cn('action-button')}
          onClick={handleSettingsClick}
          title="Settings"
          aria-label="Settings"
        >
          <span className="icon">tune</span>
        </button>
        <Autopilot />
        <div className="connect-button-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            ref={connectButtonRef}
            className={cn('action-button connect-toggle', { connected })}
            onClick={() => {
              setActionBubble(null);
              if (connected) disconnect(); else connect();
            }}
            title={connectButtonTitle}
            style={{ width: '100%', height: '100%' }}
          >
            <span className="material-symbols-outlined filled">
              {connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
          {(actionBubble || (!connected && turns.length === 0)) && (
            <div
              className="start-here-bubble animate-bounce"
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '-12px',
                marginBottom: '20px',
                background: actionBubble?.includes('pause') ? '#f59e0b' : '#3b82f6',
                color: '#ffffff',
                padding: '10px 18px',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: '0 6px 16px rgba(59, 130, 246, 0.6)',
                pointerEvents: 'none',
                zIndex: 1000,
              }}
            >
              {actionBubble || 'Start here 👆'}
              <div
                className="start-here-bubble-arrow"
                style={{
                  position: 'absolute',
                  top: '100%',
                  borderWidth: '8px',
                  borderStyle: 'solid',
                  borderColor: `${actionBubble?.includes('pause') ? '#f59e0b' : '#3b82f6'} transparent transparent transparent`,
                }}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={
            !speakerMuted ? 'Audio output on' : 'Audio output off'
          }
          className={cn('action-button', {
            'speaker-on': !speakerMuted,
            'speaker-off': speakerMuted,
          })}
          onClick={() => setSpeakerMuted(!speakerMuted)}
          title={!speakerMuted ? 'Mute audio output' : 'Unmute audio output'}
        >
          <span className="material-symbols-outlined">
            {!speakerMuted ? 'volume_up' : 'volume_off'}
          </span>
        </button>
        <button
          className={cn('action-button mic-button', {
            'mic-on': !muted,
            'mic-off': muted,
          })}
          onClick={handleMicClick}
          title={micButtonTitle}
        >
          {!muted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>
        <button
          className={cn('action-button keyboard-toggle-button')}
          onClick={() => setIsTextEntryVisible(!isTextEntryVisible)}
          title="Toggle text input"
        >
          <span className="icon">
            {isTextEntryVisible ? 'keyboard_hide' : 'keyboard'}
          </span>
        </button>
        {(!isMobile || isTextEntryVisible) && (
          <form className="prompt-form" onSubmit={handleTextSubmit}>
            <textarea
              ref={textareaRef}
              className="prompt-input"
              placeholder={
                connected ? 'Type a message...' : 'Connect to start typing...'
              }
              value={textPrompt}
              onChange={e => setTextPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Text prompt"
              disabled={!connected}
              style={{
                background: 'rgba(0, 0, 0, 0)',
                border: 'none',
                resize: 'none',
                overflowY: 'auto',
                fontFamily: 'inherit',
                fontSize: '15px',
                padding: '2px 0 0 0',
              }}
            />
            <button
              type="submit"
              className="send-button"
              disabled={!textPrompt.trim() || !connected}
              aria-label="Send message"
              title={
                !connected
                  ? 'Connect to the stream to send messages'
                  : !textPrompt.trim()
                  ? 'Type a message to send'
                  : 'Send message'
              }
            >
              <span className="icon">send</span>
            </button>
          </form>
        )}
      </nav>
    </section>
  );
}

export default memo(ControlTray);