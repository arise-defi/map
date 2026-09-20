/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useRef, useState, useCallback } from 'react';
// Import LiveServerContent to correctly type the content handler.
import { LiveConnectConfig, Modality, LiveServerContent } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import cn from 'classnames';

import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import {
  useSettings,
  useLogStore,
  useTools,
  ConversationTurn,
  useUI,
} from '@/lib/state';
import { AUTOPILOT_CONFIG } from '@/lib/autopilot-config';
import { SourcesPopover } from '../sources-popover/sources-popover';
import { PlaceDetails } from '../PlaceDetails';

const formatTimestamp = (date: Date) => {
  const pad = (num: number, size = 2) => num.toString().padStart(size, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = pad(date.getMilliseconds(), 3);
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

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


export default function StreamingConsole() {
  const {
    client,
    connected,
    connect,
    setConfig,
    heldGroundingChunks,
    clearHeldGroundingChunks,
    heldGroundedResponse,
    clearHeldGroundedResponse,
  } = useLiveAPIContext();
  const { systemPrompt, voice, model } = useSettings();
  const { tools } = useTools();
  const turns = useLogStore(state => state.turns);
  const { showSystemMessages } = useUI();
  const { isAwaitingFunctionResponse, awaitingToolType } = useLogStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastResponseRef = useRef<HTMLDivElement>(null);
  const lastUserTurnRef = useRef<HTMLDivElement>(null);
  const lastScrolledTurnRef = useRef<string | null>(null);
  const lastInterruptionTime = useRef(0);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const displayedTurns = showSystemMessages
    ? turns
    : turns.filter(turn => turn.role !== 'system');

  // Set the configuration for the Live API
  useEffect(() => {
    const enabledTools = [
      {
        functionDeclarations: tools
          .filter(tool => tool.isEnabled)
          .map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })),
      },
    ];
    // Using `any` for config to accommodate `speechConfig`, which is not in the
    // current TS definitions but is used in the working reference example.
    const config: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: systemPrompt,
      tools: enabledTools,
    };

    const { initSession } = useLogStore.getState();
    initSession({ systemPrompt, model });

    setConfig(config);
  }, [setConfig, systemPrompt, tools, voice, model]);

  useEffect(() => {
    const { addTurn, updateLastTurn, mergeIntoLastAgentTurn } =
      useLogStore.getState();

    const handleInputTranscription = (text: string, isFinal: boolean) => {
      const { turns, updateLastTurn, addTurn } = useLogStore.getState();
      const last = turns[turns.length - 1];

      // Filter out unwanted artifacts and fragments from the user
      const trimmedText = text.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const unwanted = ['googleawesome', 'tomute'];
      if (unwanted.includes(trimmedText)) return;
      if (text.trim() && !trimmedText) return; // Filter out standalone punctuation

      if (last && last.role === 'user' && !last.isFinal) {
        updateLastTurn({
          text: last.text + text,
          isFinal,
        });
      } else {
        addTurn({ role: 'user', text, isFinal });
      }
    };

    const handleOutputTranscription = (text: string, isFinal: boolean) => {
      const { turns, updateLastTurn, addTurn, mergeIntoLastAgentTurn } =
        useLogStore.getState();
      const last = turns[turns.length - 1];

      // Filter out unwanted artifacts and fragments from the model
      const trimmedText = text.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const unwanted = ['googleawesome', 'tomute'];
      if (unwanted.includes(trimmedText)) return;
      if (text.trim() && !trimmedText) return; // Filter out standalone punctuation


      // HARD CUT: Discard leftover fragments that arrive late after an interruption.
      const timeSinceInterruption = Date.now() - lastInterruptionTime.current;
      if (timeSinceInterruption < 1500) {
        // If it's a new turn, only split if it really looks like a messy fragment
        if (last?.role === 'user') {
          const match = text.match(/^([a-z\s]{1,10})([A-Z].*)/);
          if (match) {
            text = match[2];
          } 
        }
        // Removed aggressive agent turn cutting to allow alert phrases to stay
      }

      const turnData: Omit<ConversationTurn, 'timestamp' | 'role'> = {
        text,
        isFinal,
      };
      if (heldGroundingChunks) {
        turnData.groundingChunks = heldGroundingChunks;
        clearHeldGroundingChunks();
      }
      if (heldGroundedResponse) {
        turnData.toolResponse = heldGroundedResponse;
        clearHeldGroundedResponse();
      }

      mergeIntoLastAgentTurn(turnData);
    };

    const handleContent = (serverContent: LiveServerContent) => {
      const { turns, mergeIntoLastAgentTurn } =
        useLogStore.getState();
      let text =
        serverContent.modelTurn?.parts
          ?.map((p: any) => p.text)
          .filter(Boolean)
          .join('') ?? '';
      
      // Filter out unwanted artifacts and fragments from the model
      const trimmedText = text.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const unwanted = ['googleawesome', 'tomute'];
      if (unwanted.includes(trimmedText)) return;
      if (text.trim() && !trimmedText) return; // Filter out standalone punctuation

      const groundingChunks = serverContent.groundingMetadata?.groundingChunks;
      const widgetToken = serverContent.groundingMetadata?.googleMapsWidgetContextToken;

      if (!text && !groundingChunks && !widgetToken) return;

      const last = turns[turns.length - 1];

      // HARD CUT: Discard leftover fragments that arrive late after an interruption.
      const timeSinceInterruption = Date.now() - lastInterruptionTime.current;
      if (timeSinceInterruption < 1500) {
        // If it's a new turn, only split if it really looks like a messy fragment
        if (last?.role === 'user') {
          const match = text.match(/^([a-z\s]{1,10})([A-Z].*)/);
          if (match) {
            text = match[2];
          } 
        }
        // Removed aggressive agent turn cutting to allow alert phrases to stay
      }


      const turnData: Omit<ConversationTurn, 'timestamp' | 'role'> = {
        text,
        isFinal: false,
        groundingChunks,
        googleMapsWidgetContextToken: widgetToken,
      };
      if (heldGroundingChunks) {
        turnData.groundingChunks = [
          ...(heldGroundingChunks || []),
          ...(turnData.groundingChunks || []),
        ];
        clearHeldGroundingChunks();
      }
      if (heldGroundedResponse) {
        turnData.toolResponse = heldGroundedResponse;
        clearHeldGroundedResponse();
      }

      mergeIntoLastAgentTurn(turnData);
    };

    const handleTurnComplete = () => {
      const { mergeIntoLastAgentTurn } = useLogStore.getState();
      mergeIntoLastAgentTurn({ text: '', isFinal: true });
    };

    const handleInterrupted = () => {
      const { turns, updateLastTurn, setIsAwaitingFunctionResponse } = useLogStore.getState();
      const last = turns[turns.length - 1];
      if (last && last.role === 'agent' && !last.isFinal) {
        updateLastTurn({ isFinal: true });
      }
      lastInterruptionTime.current = Date.now();
      setIsAwaitingFunctionResponse(false);
      clearHeldGroundingChunks();
      clearHeldGroundedResponse();
    };

    client.on('inputTranscription', handleInputTranscription);
    client.on('outputTranscription', handleOutputTranscription);
    client.on('content', handleContent);
    client.on('turncomplete', handleTurnComplete);
    client.on('generationcomplete', handleTurnComplete);
    client.on('interrupted', handleInterrupted);

    return () => {
      client.off('inputTranscription', handleInputTranscription);
      client.off('outputTranscription', handleOutputTranscription);
      client.off('content', handleContent);
      client.off('turncomplete', handleTurnComplete);
      client.off('generationcomplete', handleTurnComplete);
      client.off('interrupted', handleInterrupted);
    };
  }, [
    client,
    heldGroundingChunks,
    clearHeldGroundingChunks,
    heldGroundedResponse,
    clearHeldGroundedResponse,
  ]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      const lastDisplayedTurn = displayedTurns[displayedTurns.length - 1];

      // Check if the current visible agent response has or is getting a widget
      const hasWidget = lastDisplayedTurn?.role === 'agent' && !!(lastDisplayedTurn.googleMapsWidgetContextToken || (
        (typeof lastDisplayedTurn.toolResponse === 'object' && lastDisplayedTurn.toolResponse !== null && 'candidates' in lastDisplayedTurn.toolResponse)
          ? (lastDisplayedTurn.toolResponse as any).candidates?.[0]?.groundingMetadata?.googleMapsWidgetContextToken
          : undefined
      ));

      const lastTurnId = lastDisplayedTurn?.timestamp.toISOString();

      // If we have a widget, we align to the TOP of the prompt/agent block
      // ONLY trigger this once per turn so the user can still scroll manually
      if (hasWidget) {
        if (lastScrolledTurnRef.current !== lastTurnId) {
          const targetElement = lastUserTurnRef.current || lastResponseRef.current;
          if (targetElement) {
            scrollContainer.scrollTop = targetElement.offsetTop - 20;
            lastScrolledTurnRef.current = lastTurnId; // Mark as handled
          }
        }
      }
    }
  }, [displayedTurns, turns]);

  // Helper to find the next suggested steps based on the current conversation
  const getSuggestions = () => {
    if (turns.length === 0) return [];

    const lastUserTurn = [...turns].reverse().find(t => t.role === 'user');

    // Find the last non-system turn to determine if we should show suggestions
    const lastNonSystemTurn = [...turns].reverse().find(t => t.role !== 'system');
    if (!lastNonSystemTurn || lastNonSystemTurn.role !== 'agent' || !lastNonSystemTurn.isFinal) return [];


    // Aggressive normalization (remove everything except letters and numbers)
    const normalize = (text: string) => text.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();

    const lastUserText = lastUserTurn ? normalize(lastUserTurn.text) : '';
    const results: any[] = [];

    // 1. If we find a match in a scenario, suggest the NEXT step from THAT scenario
    for (const [scenarioName, steps] of Object.entries(AUTOPILOT_CONFIG.scenarios)) {
      const currentStepIndex = steps.findIndex(s => s.sendText && normalize(s.sendText) === lastUserText);
      if (currentStepIndex !== -1 && currentStepIndex < steps.length - 1) {
        const nextStep = steps[currentStepIndex + 1];
        if (nextStep.sendText) {
          results.push({
            name: `${scenarioName}: Next Step`,
            text: nextStep.sendText,
            label: nextStep.description
          });
        }
      }
    }

    // 2. If no "next step" match, only suggest starters if the conversation is fresh
    // Increases turn limit to 6 to be more permissive with initial greetings/setups
    if (results.length === 0 && turns.length <= 6) {
      Object.entries(AUTOPILOT_CONFIG.scenarios).forEach(([name, steps]) => {
        const firstAction = steps.find(s => s.sendText);
        if (firstAction) {
          results.push({ name, text: firstAction.sendText, label: firstAction.description });
        }
      });
    }

    const { useVertexAI, defaultVertexModel, customGroundingModel, useCustomCredentials, defaultGeminiModel } = useSettings.getState();
    const currentModel = useCustomCredentials
      ? customGroundingModel
      : (useVertexAI ? defaultVertexModel : defaultGeminiModel);
    const supportsRouting = currentModel.includes('2.5');

    // Deduplicate by label to avoid "Going to SF" showing twice
    const seen = new Set();
    return results.filter(item => {
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      if (!supportsRouting) {
        const lower = `${item.name} ${item.text} ${item.label || ''}`.toLowerCase();
        if (lower.includes('route') || lower.includes('navigate') || lower.includes('driving') || lower.includes('directions') || lower.includes('sf to la')) {
          return false;
        }
      }
      return true;
    });
  };

  const suggestions = getSuggestions();

  const lastUserIndexInDisplayed = [...displayedTurns].reverse().findIndex(t => t.role === 'user');
  const lastUserTurnIndex = lastUserIndexInDisplayed !== -1
    ? displayedTurns.length - 1 - lastUserIndexInDisplayed
    : -1;

  return (
    <div className="transcription-container">
      <div className="transcription-view" ref={scrollRef}>
        {displayedTurns.length === 0 && !isAwaitingFunctionResponse ? (
          <div className="empty-state">
            <div className="suggested-actions">
              <p className="suggested-actions-label">Start the conversation by pressing the Play button</p>
            </div>
          </div>
        ) : (
          <>
              {displayedTurns.map((t, index) => {
              if (t.role === 'system') {
                const isFailureTurn = t.text.includes('Error') || t.text.includes('failed') || t.text.includes('Cannot') || t.text.includes('not published') || t.text.includes('Could not');
                const precedingUserTurn = isFailureTurn ? [...displayedTurns.slice(0, index)].reverse().find(turn => turn.role === 'user') : undefined;

                return (
                  <div
                    key={t.timestamp.toISOString()}
                    className={`transcription-entry system`}
                  >
                    <div className="transcription-header">
                      <div className="transcription-source">System</div>
                      <div className="transcription-timestamp">
                        {formatTimestamp(t.timestamp)}
                      </div>
                    </div>
                    <div className="transcription-text-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
                    </div>
                    {isFailureTurn && precedingUserTurn?.text && !precedingUserTurn.text.startsWith('(Buffered)') && (
                      <div className="suggested-actions-inline" style={{ padding: '8px 0 2px 0', margin: 0, width: '100%' }}>
                        <button
                          className="suggested-button retry-button"
                          style={{ borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 600 }}
                          onClick={async () => {
                            if (!connected) await connect();
                            const text = precedingUserTurn.text;
                            client.sendRealtimeText(text);
                            useLogStore.getState().addTurn({
                              role: 'user',
                              text: text,
                              isFinal: true
                            });
                          }}
                        >
                          <span className="icon">refresh</span>
                          <span>🔄 Retry "{precedingUserTurn.text.slice(0, 28)}{precedingUserTurn.text.length > 28 ? '...' : ''}"</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              }
              const placeIds: string[] = [];
              let matchedQuote: { text: string; uri?: string } | undefined = undefined;
              let groundingQuery: string | undefined = undefined;

              if (t.groundingChunks) {
                t.groundingChunks.forEach(chunk => {
                  const pId = chunk.maps?.placeId || (chunk.maps as any)?.place_id;
                  if (pId && !placeIds.includes(pId)) {
                    placeIds.push(pId);
                  }
                });

                const chunkWithSources = t.groundingChunks.find(c => (c.maps as any)?.placeAnswerSources || (c.maps as any)?.place_answer_sources);
                if (chunkWithSources) {
                  const placeAnswerSources = (chunkWithSources.maps as any)?.placeAnswerSources || (chunkWithSources.maps as any)?.place_answer_sources;
                  const reviewSnippets = placeAnswerSources?.reviewSnippets || placeAnswerSources?.review_snippets;
                  if (Array.isArray(reviewSnippets) && reviewSnippets.length > 0) {
                    const snippet = reviewSnippets[0];
                    if (snippet?.text || snippet?.title) {
                      matchedQuote = {
                        text: snippet.text || snippet.title,
                        uri: snippet.googleMapsUri || snippet.google_maps_uri
                      };
                    }
                  }
                }
              }

              if (placeIds.length === 0 && t.toolResponse && typeof t.toolResponse === 'object' && 'candidates' in t.toolResponse) {
                const candidate = (t.toolResponse as any).candidates?.[0];
                const metadata = candidate?.groundingMetadata || candidate?.grounding_metadata;
                const chunks = metadata?.groundingChunks || metadata?.grounding_chunks;
                if (Array.isArray(chunks)) {
                  chunks.forEach((chunk: any) => {
                    const pId = chunk.maps?.placeId || chunk.maps?.place_id;
                    if (pId && !placeIds.includes(pId)) {
                      placeIds.push(pId);
                    }
                  });

                  const chunkWithSources = chunks.find((c: any) => c.maps?.placeAnswerSources || c.maps?.place_answer_sources);
                  if (chunkWithSources) {
                    const placeAnswerSources = chunkWithSources.maps.placeAnswerSources || chunkWithSources.maps.place_answer_sources;
                    const reviewSnippets = placeAnswerSources.reviewSnippets || placeAnswerSources.review_snippets;
                    if (Array.isArray(reviewSnippets) && reviewSnippets.length > 0) {
                      const snippet = reviewSnippets[0];
                      if (snippet?.text || snippet?.title) {
                        matchedQuote = {
                          text: snippet.text || snippet.title,
                          uri: snippet.googleMapsUri || snippet.google_maps_uri
                        };
                      }
                    }
                  }
                }
              }

              if (Array.isArray(t.actualToolCalls)) {
                const mapsCall = t.actualToolCalls.find(call => call.name === 'mapsGrounding');
                if (mapsCall?.args?.query) {
                  groundingQuery = mapsCall.args.query;
                }
              }
            
            let sources: { uri: string; title: string }[] = [];
            if (t.groundingChunks) {
              sources =
                t.groundingChunks
                  .map(chunk => {
                    const source = chunk.web || chunk.maps;
                    if (source && source.uri) {
                      return {
                        uri: source.uri,
                        title: source.title || source.uri,
                      };
                    }
                    return null;
                  })
                  .filter((s): s is { uri: string; title: string } => s !== null);

              if (t.groundingChunks.length === 1) {
                const chunk = t.groundingChunks[0];
                // The type for `placeAnswerSources` might be missing or incomplete. Use `any` for safety.
                const placeAnswerSources = (chunk.maps as any)?.placeAnswerSources;
                if (
                  placeAnswerSources &&
                  Array.isArray(placeAnswerSources.reviewSnippets)
                ) {
                  const reviewSources = placeAnswerSources.reviewSnippets
                    .map((review: any) => {
                      if (review.googleMapsUri && review.title) {
                        return {
                          uri: review.googleMapsUri,
                          title: review.title,
                        };
                      }
                      return null;
                    })
                    .filter((s): s is { uri: string; title: string } => s !== null);
                  sources.push(...reviewSources);
                }
              }
            }

            const hasSources = sources.length > 0;

                const isLastTurn = index === displayedTurns.length - 1;
                const isLastUserTurn = index === lastUserTurnIndex;

            return (
              <div
                key={t.timestamp.toISOString()}
                ref={isLastTurn ? lastResponseRef : (isLastUserTurn ? lastUserTurnRef : null)}
                className={`transcription-entry ${t.role} ${!t.isFinal ? 'interim' : ''
                  }`}
              >
                <div className="avatar">
                  <span className="icon">{t.role === 'user' ? 'person' : 'auto_awesome'}</span>
                </div>
                <div className="message-bubble">
                  <div className="transcription-text-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {t.text}
                    </ReactMarkdown>
                  </div>
                  {hasSources && (
                    <SourcesPopover
                      className="grounding-chunks"
                      sources={sources}
                    />
                  )}
                  {(placeIds.length > 0 || !!matchedQuote?.text) && (
                    <PlaceDetails
                      query={groundingQuery}
                      placeIds={placeIds}
                      matchedQuote={matchedQuote}
                    />
                  )}
                  {(() => {
                    const isFailureTurn = t.role === 'agent' && (
                      t.text.includes('Error') || t.text.includes('failed') || t.text.includes('Cannot') || t.text.includes('not published') || t.text.includes('Could not')
                    );
                    const precedingUserTurn = isFailureTurn ? [...displayedTurns.slice(0, index)].reverse().find(turn => turn.role === 'user') : undefined;
                    if (!isFailureTurn || !precedingUserTurn?.text || precedingUserTurn.text.startsWith('(Buffered)')) return null;
                    return (
                      <div className="suggested-actions-inline" style={{ padding: '10px 0 2px 0', margin: 0, width: '100%' }}>
                        <button
                          className="suggested-button retry-button"
                          style={{ borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 600 }}
                          onClick={async () => {
                            if (!connected) await connect();
                            const text = precedingUserTurn.text;
                            client.sendRealtimeText(text);
                            useLogStore.getState().addTurn({
                              role: 'user',
                              text: text,
                              isFinal: true
                            });
                          }}
                        >
                          <span className="icon">refresh</span>
                          <span>🔄 Retry "{precedingUserTurn.text.slice(0, 28)}{precedingUserTurn.text.length > 28 ? '...' : ''}"</span>
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
              {isAwaitingFunctionResponse && awaitingToolType !== 'frameEstablishingShot' && (
            <div className="spinner-container">
              <div className="spinner"></div>
              <p>Calling tool...</p>
            </div>
          )}

              {/* Suggested Activity Chips */}
              {!isAwaitingFunctionResponse && suggestions.length > 0 && (
                <div className="suggested-actions-inline">
                  {suggestions.map((s: any) => (
                    <button
                      key={s.name}
                      className={cn('suggested-button', { 'retry-button': s.isRetry })}
                      style={s.isRetry ? { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 600 } : {}}
                      onClick={async () => {
                        if (!connected) await connect();

                        const text = s.text;
                        client.sendRealtimeText(text);
                        useLogStore.getState().addTurn({
                          role: 'user',
                          text: text,
                          isFinal: true
                        });
                      }}
                    >
                      <span className="icon">{s.isRetry ? 'refresh' : 'explore'}</span>
                      <span>{s.label || s.name}</span>
                    </button>
                  ))}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
} 