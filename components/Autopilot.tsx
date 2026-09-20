/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState, useRef } from 'react';
import cn from 'classnames';
import { useLogStore, useSettings } from '@/lib/state';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { AUTOPILOT_CONFIG } from '@/lib/autopilot-config';

export function Autopilot() {
  const [status, setStatus] = useState<string>('Ready');
  const [isProcessing, setIsProcessing] = useState(false);

  // Check if Autopilot should be shown in this environment
  if (!AUTOPILOT_CONFIG.enabled) return null;

  const { client, connected } = useLiveAPIContext();
  const turns = useLogStore(state => state.turns);
  const isAwaitingFunction = useLogStore(state => state.isAwaitingFunctionResponse);
  const useVertexAI = useSettings(state => state.useVertexAI);

  const {
    isAutopilotActive: active,
    autopilotStepIndex: stepIndex,
    autopilotResults: results,
    autopilotScenario: scenario,
    setAutopilotState
  } = useLogStore();

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Filter out route/itinerary related scenarios when not using Gemini Enterprise
  const availableScenarios = Object.entries(AUTOPILOT_CONFIG.scenarios).filter(([name]) => {
    if (!useVertexAI) {
      return name !== 'SF: Itinerary' && name !== 'France TV';
    }
    return true;
  });

  // Fallback to SF: Cuisine if the currently active scenario is filtered out
  useEffect(() => {
    if (!useVertexAI) {
      if (scenario === AUTOPILOT_CONFIG.scenarios['SF: Itinerary'] || scenario === AUTOPILOT_CONFIG.scenarios['France TV']) {
        setAutopilotState({
          autopilotScenario: AUTOPILOT_CONFIG.scenarios['SF: Cuisine'],
          autopilotStepIndex: -1,
          autopilotResults: {},
          isAutopilotActive: false
        });
      }
    }
  }, [useVertexAI, scenario, setAutopilotState]);

  useEffect(() => {
    if (!connected) {
      setAutopilotState({ isAutopilotActive: false, autopilotStepIndex: -1, autopilotResults: {} });
    }
  }, [connected, setAutopilotState]);

  useEffect(() => {
    if (!active || !connected || isProcessing) return;

    if (stepIndex === -1) {
      setAutopilotState({ autopilotStepIndex: 0 });
      return;
    }

    const currentStep = scenario[stepIndex];
    if (!currentStep) return;

    const currentTurns = turns;
    const lastTurn = currentTurns[currentTurns.length - 1];

    const checkProgress = async () => {
      const isAgentFinished = lastTurn?.role === 'agent' && lastTurn.isFinal;
      let conditionMet = false;

      if (currentStep.waitForTool) {
        const recentTurns = currentTurns.slice(-8);
        const toolTriggered = recentTurns.some(t =>
          t.role === 'system' && t.text && t.text.includes(currentStep.waitForTool!)
        );

        // Mitigation: If the tool was triggered, we must wait for it to finish (isAwaitingFunction === false).
        // BUT we can move to the next step even if the agent is still talking (isAgentFinished === false)
        // because client.interrupt() will handle that.
        if (toolTriggered && !isAwaitingFunction) {
          conditionMet = true;
          // Mark as passed if the expected tool was hit
          setAutopilotState({ autopilotResults: { ...results, [currentStep.id]: 'pass' } });
        } else {
          // Map technical tool names to human-readable statuses
          const toolLabels: Record<string, string> = {
            'frameEstablishingShot': 'Finalizing navigation...',
            'mapsGrounding': 'Checking Google Maps...',
            'frameLocations': 'Summarizing itinerary...'
          };
          setStatus(toolLabels[currentStep.waitForTool] || `Wait: ${currentStep.waitForTool}...`);
        }
      } else if (currentStep.waitForRole === 'agent') {
        // Allow moving to next step as soon as the agent starts responding (or is finished)
        if (lastTurn?.role === 'agent') {
          conditionMet = true;
        } else {
          setStatus('Waiting for agent...');
        }
      } else if (!currentStep.waitForTool && !currentStep.waitForRole) {
        conditionMet = true;
      }

      if (conditionMet) {
        handleNextStep();
      }
    };

    const handleNextStep = () => {
      // SAFETY GUARD: Do not send the next prompt if we are still waiting for a tool response.
      // This prevents the model from "ignoring" the next step if it's still busy processing grounding results.
      if (isAwaitingFunction) {
        setStatus(`Buffering: Waiting for ${scenario[stepIndex]?.waitForTool || 'agent'} to finish...`);
        // We'll re-check on the next turns/isAwaitingFunction update in the useEffect
        return;
      }

      const nextIndex = stepIndex + 1;
      if (nextIndex >= scenario.length) {
        // Log final evaluation results
        const passedCount = Object.values(results).filter(v => v === 'pass').length;
        const totalCount = scenario.filter(s => s.waitForTool).length;

        useLogStore.getState().addTurn({
          role: 'system',
          text: `**Autopilot Evaluation Complete**\nScore: ${passedCount}/${totalCount} tools triggered correctly.`,
          isFinal: true
        });

        setStatus('Finished!');
        setAutopilotState({ isAutopilotActive: false });
        return;
      }

      setIsProcessing(true);
      const nextStep = scenario[nextIndex];
      setStatus(`Sending: ${nextStep.description}`);

      // 1.5 second buffer delay for better model stability
      timerRef.current = setTimeout(() => {
        if (nextStep.sendText) {
          useLogStore.getState().addTurn({
            role: 'user',
            text: nextStep.sendText,
            isFinal: true,
            expectedTool: nextStep.waitForTool // Tag the turn for evaluation
          });
          client.interrupt();
          client.sendRealtimeText(nextStep.sendText);
        }
        setAutopilotState({ autopilotStepIndex: nextIndex });
        setIsProcessing(false);
      }, 1500);
    };

    checkProgress();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, connected, turns, stepIndex, isAwaitingFunction, isProcessing, client, results, setAutopilotState, scenario]);

  const toggleAutopilot = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!active) {
      // Reopen without resetting the step if it's already in progress
      setAutopilotState({ isAutopilotActive: true });
    } else {
      setAutopilotState({ isAutopilotActive: false });
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const forceNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!active) return;

    // SAFETY GUARD: If we are already waiting for a tool, "Force Next" should wait for the tool to finish
    // before sending the next one, otherwise the prompt is likely to be dropped by the model.
    if (isAwaitingFunction) {
      setStatus(`Forced: Waiting for tool...`);
      // The useEffect will catch the completion and move to next step automatically
      // if we mark the current step as "done" or just wait.
      // Better yet, let's just wait for the current one to finish.
      return;
    }

    // Clear any pending timers
    if (timerRef.current) clearTimeout(timerRef.current);

    const nextIndex = stepIndex + 1;
    if (nextIndex < scenario.length) {
      const nextStep = scenario[nextIndex];
      setStatus(`Forced: ${nextStep.description}`);
      setIsProcessing(true);

      // Apply the same buffer delay as handleNextStep
      timerRef.current = setTimeout(() => {
        if (nextStep.sendText) {
          useLogStore.getState().addTurn({
            role: 'user',
            text: nextStep.sendText,
            isFinal: true,
            expectedTool: nextStep.waitForTool
          });
          client.interrupt();
          client.sendRealtimeText(nextStep.sendText);
        }
        setAutopilotState({ autopilotStepIndex: nextIndex });
        setIsProcessing(false);
      }, 1000);
    } else {
      setAutopilotState({ isAutopilotActive: false });
    }
  };

  const handleScenarioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const scenarioName = e.target.value;
    const nextScenario = AUTOPILOT_CONFIG.scenarios[scenarioName as keyof typeof AUTOPILOT_CONFIG.scenarios];
    if (nextScenario) {
      setAutopilotState({
        autopilotScenario: nextScenario,
        autopilotStepIndex: -1,
        autopilotResults: {},
        isAutopilotActive: false
      });
    }
  };

  if (!connected) return null;

  return (
    <>
      <div className="autopilot-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <select
          className="autopilot-select"
          onChange={handleScenarioChange}
          disabled={active}
          value={Object.keys(AUTOPILOT_CONFIG.scenarios).find(key => AUTOPILOT_CONFIG.scenarios[key as keyof typeof AUTOPILOT_CONFIG.scenarios] === scenario) || ''}
        >
          {availableScenarios.map(([name]) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <button
          className={cn("action-button autopilot-toggle-nav", { active })}
          onClick={toggleAutopilot}
          title={active ? "Stop Autopilot" : "Start Autopilot"}
        >
          <span className="material-symbols-outlined">
            {active ? 'smart_toy' : 'smart_toy'}
          </span>
        </button>
      </div>

      {active && (
        <div className="autopilot-overlay">
          <div className="autopilot-step-badge">Auto Step {stepIndex + 1}</div>
          <div className="autopilot-description">{status}</div>
          <div className="autopilot-actions">
            <div className="auto-progress">
              <div className="auto-bar" style={{ width: `${Math.max(5, ((stepIndex + 1) / scenario.length) * 100)}%` }} />
            </div>
            <button className="auto-skip-btn" onClick={forceNext}>
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
