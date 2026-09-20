/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { itineraryPlannerTools } from './tools/itinerary-planner';

export type Template = 'itinerary-planner';

const toolsets: Record<Template, FunctionCall[]> = {
  'itinerary-planner': itineraryPlannerTools,
};

import { ScenarioStep, ITINERARY_SCENARIO } from './autopilot-config';

import {
  SYSTEM_INSTRUCTIONS,
  SCAVENGER_HUNT_PROMPT,
} from './constants.ts';
const systemPrompts: Record<Template, string> = {
  'itinerary-planner': SYSTEM_INSTRUCTIONS,
};

import { DEFAULT_LIVE_API_MODEL, DEFAULT_VOICE } from './constants';
import {
  GenerateContentResponse,
  FunctionResponse,
  FunctionResponseScheduling,
  LiveServerToolCall,
  GroundingChunk,
} from '@google/genai';
import { Map3DCameraProps } from '@/components/map-3d';

/**
 * Personas
 */
export const SCAVENGER_HUNT_PERSONA =
  'ClueMaster Cory, the Scavenger Hunt Creator';

export const personas: Record<string, { prompt: string; voice: string }> = {
  [SCAVENGER_HUNT_PERSONA]: {
    prompt: SCAVENGER_HUNT_PROMPT,
    voice: 'Puck',
  },
};

/**
 * Settings
 */
export const useSettings = create<{
  systemPrompt: string;
  model: string;
  voice: string;
  isEasterEggMode: boolean;
  activePersona: string;
  useVertexAI: boolean;
  useCustomGcp: boolean;
  gcpProjectId: string;
  gcpLocation: string;
  gcpAccessToken: string;
  customGeminiApiKey: string;
  customGoogleMapsApiKey: string;
  useCustomCredentials: boolean;
  customGroundingModel: string;
  defaultVertexModel: string;
  defaultGeminiModel: string;
  constrainToViewport: boolean;
  thinkingEnabled: boolean;
  actionBubble: string | null;
  theme: 'dark' | 'light';
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
  setPersona: (persona: string) => void;
  activateEasterEggMode: () => void;
  setUseVertexAI: (useVertex: boolean) => void;
  setUseCustomGcp: (useCustom: boolean) => void;
  setGcpProjectId: (id: string) => void;
  setGcpLocation: (loc: string) => void;
  setGcpAccessToken: (token: string) => void;
  setCustomGeminiApiKey: (key: string) => void;
  setCustomGoogleMapsApiKey: (key: string) => void;
  setUseCustomCredentials: (useCustom: boolean) => void;
  setCustomGroundingModel: (model: string) => void;
  setDefaultVertexModel: (model: string) => void;
  setDefaultGeminiModel: (model: string) => void;
  setConstrainToViewport: (constrain: boolean) => void;
  setThinkingEnabled: (enabled: boolean) => void;
  setActionBubble: (bubble: string | null) => void;
  setTheme: (theme: 'dark' | 'light') => void;
}>(set => ({
  systemPrompt: SYSTEM_INSTRUCTIONS,
  model: DEFAULT_LIVE_API_MODEL,
  voice: DEFAULT_VOICE,
  isEasterEggMode: false,
  activePersona: 'itinerary-planner',
  useVertexAI: typeof window !== 'undefined' ? (localStorage.getItem('use_vertex_ai') !== null ? localStorage.getItem('use_vertex_ai') === 'true' : true) : true,
  useCustomGcp: typeof window !== 'undefined' ? localStorage.getItem('use_custom_gcp') === 'true' : false,
  gcpProjectId: typeof window !== 'undefined' ? localStorage.getItem('gcp_project_id') || '' : '',
  gcpLocation: typeof window !== 'undefined' ? localStorage.getItem('gcp_location') || 'us-central1' : 'us-central1',
  gcpAccessToken: typeof window !== 'undefined' ? localStorage.getItem('gcp_access_token') || '' : '',
  useCustomCredentials: typeof window !== 'undefined' ? localStorage.getItem('use_custom_credentials') === 'true' : false,
  customGroundingModel: typeof window !== 'undefined' ? (localStorage.getItem('custom_grounding_model')?.includes('1.5') ? 'gemini-2.5-pro' : localStorage.getItem('custom_grounding_model') || 'gemini-2.5-pro') : 'gemini-2.5-pro',
  defaultVertexModel: typeof window !== 'undefined' ? (localStorage.getItem('default_vertex_model')?.includes('1.5') ? 'gemini-2.5-pro' : localStorage.getItem('default_vertex_model') || 'gemini-2.5-pro') : 'gemini-2.5-pro',
  defaultGeminiModel: typeof window !== 'undefined' ? (localStorage.getItem('default_gemini_model')?.includes('1.5') ? 'gemini-3.5-flash' : localStorage.getItem('default_gemini_model') || 'gemini-3.5-flash') : 'gemini-3.5-flash',
  actionBubble: null,
  setSystemPrompt: prompt => set({ systemPrompt: prompt }),
  setModel: model => set({ model }),
  setVoice: voice => set({ voice }),
  setPersona: (persona: string) => {
    if (personas[persona]) {
      set({
        activePersona: persona,
        systemPrompt: personas[persona].prompt,
        voice: personas[persona].voice,
      });
    }
  },
  activateEasterEggMode: () => {
    set(state => {
      if (!state.isEasterEggMode) {
        const persona = SCAVENGER_HUNT_PERSONA;
        return {
          isEasterEggMode: true,
          activePersona: persona,
          systemPrompt: personas[persona].prompt,
          voice: personas[persona].voice,
          // Use the recommended model for real-time audio conversation tasks.
          model: DEFAULT_LIVE_API_MODEL,
        };
      }
      return {};
    });
  },
  setUseVertexAI: useVertexAI => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('use_vertex_ai', String(useVertexAI));
    }
    set({ useVertexAI });
  },
  setUseCustomGcp: useCustomGcp => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('use_custom_gcp', String(useCustomGcp));
    }
    set({ useCustomGcp });
  },
  setGcpProjectId: gcpProjectId => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gcp_project_id', gcpProjectId);
    }
    set({ gcpProjectId });
  },
  setGcpLocation: gcpLocation => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gcp_location', gcpLocation);
    }
    set({ gcpLocation });
  },
  setGcpAccessToken: gcpAccessToken => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gcp_access_token', gcpAccessToken);
    }
    set({ gcpAccessToken });
  },
  customGeminiApiKey: typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_api_key') || '' : '',
  customGoogleMapsApiKey: typeof window !== 'undefined' ? localStorage.getItem('custom_google_maps_api_key') || '' : '',
  setCustomGeminiApiKey: customGeminiApiKey => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_gemini_api_key', customGeminiApiKey);
    }
    set({ customGeminiApiKey });
  },
  setCustomGoogleMapsApiKey: customGoogleMapsApiKey => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_google_maps_api_key', customGoogleMapsApiKey);
    }
    set({ customGoogleMapsApiKey });
  },
  setUseCustomCredentials: useCustomCredentials => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('use_custom_credentials', String(useCustomCredentials));
    }
    set({ useCustomCredentials });
  },
  setCustomGroundingModel: customGroundingModel => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_grounding_model', customGroundingModel);
    }
    set({ customGroundingModel });
  },
  setDefaultVertexModel: defaultVertexModel => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('default_vertex_model', defaultVertexModel);
    }
    set({ defaultVertexModel });
  },
  setDefaultGeminiModel: defaultGeminiModel => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('default_gemini_model', defaultGeminiModel);
    }
    set({ defaultGeminiModel });
  },
  constrainToViewport: typeof window !== 'undefined' ? (localStorage.getItem('constrain_to_viewport') === 'true') : false,
  setConstrainToViewport: constrain => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('constrain_to_viewport', String(constrain));
    }
    set({ constrainToViewport: constrain });
  },
  thinkingEnabled: typeof window !== 'undefined' ? (localStorage.getItem('thinking_enabled') !== 'false') : true,
  setThinkingEnabled: enabled => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('thinking_enabled', String(enabled));
    }
    set({ thinkingEnabled: enabled });
  },
  setActionBubble: bubble => set({ actionBubble: bubble }),
  theme: typeof window !== 'undefined' ? (localStorage.getItem('theme') || 'dark') as 'dark' | 'light' : 'dark',
  setTheme: theme => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', theme);
    }
    set({ theme });
  },
}));

/**
 * UI
 */
export const useUI = create<{
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  showSystemMessages: boolean;
  toggleShowSystemMessages: () => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  speakerMuted: boolean;
  setSpeakerMuted: (muted: boolean) => void;
}>(set => ({
  isSidebarOpen: false,
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
  showSystemMessages: false,
  toggleShowSystemMessages: () =>
    set(state => ({ showSystemMessages: !state.showSystemMessages })),
  muted: true, // Default to muted for microphone
  setMuted: (muted: boolean) => set({ muted }),
  speakerMuted: false, // Default to non-muted for speaker
  setSpeakerMuted: (speakerMuted: boolean) => set({ speakerMuted }),
}));

/**
 * Tools
 */
export interface FunctionCall {
  name: string;
  description?: string;
  parameters?: any;
  isEnabled: boolean;
  scheduling?: FunctionResponseScheduling;
}



export const useTools = create<{
  tools: FunctionCall[];
  template: Template;
  setTemplate: (template: Template) => void;
}>(set => ({
  tools: itineraryPlannerTools,
  template: 'itinerary-planner',
  setTemplate: (template: Template) => {
    set({ tools: toolsets[template], template });
    useSettings.getState().setSystemPrompt(systemPrompts[template]);
  },
}));

/**
 * Logs
 */
export interface LiveClientToolResponse {
  functionResponses?: FunctionResponse[];
}

export interface ConversationTurn {
  timestamp: Date;
  role: 'user' | 'agent' | 'system';
  text: string;
  isFinal: boolean;
  toolUseRequest?: LiveServerToolCall;
  toolUseResponse?: LiveClientToolResponse;
  groundingChunks?: GroundingChunk[];
  toolResponse?: GenerateContentResponse | string | object;
  googleMapsWidgetContextToken?: string;
  // Evals metadata
  expectedTool?: string;
  actualToolCalls?: { name: string; args: any }[];
}

export interface SessionMetadata {
  sessionId: string;
  startedAt: Date;
  systemPrompt: string;
  model: string;
}

export const useLogStore = create<{
  turns: ConversationTurn[];
  isAwaitingFunctionResponse: boolean;
  awaitingToolType: string | null;
  sessionMetadata: SessionMetadata | null;
  // Autopilot state
  isAutopilotActive: boolean;
  autopilotStepIndex: number;
  autopilotResults: Record<string, 'pass' | 'fail'>;
  autopilotScenario: ScenarioStep[];
  setAutopilotState: (state: Partial<{
    isAutopilotActive: boolean;
    autopilotStepIndex: number;
    autopilotResults: Record<string, 'pass' | 'fail'>;
    autopilotScenario: ScenarioStep[];
  }>) => void;
  initSession: (config: { systemPrompt: string; model: string }) => void;
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) => void;
  updateLastTurn: (update: Partial<ConversationTurn>) => void;
  mergeIntoLastAgentTurn: (
    update: Partial<Omit<ConversationTurn, 'timestamp' | 'role'>>,
  ) => void;
  clearTurns: () => void;
  setIsAwaitingFunctionResponse: (isAwaiting: boolean, toolName?: string) => void;
}>((set, get) => ({
  turns: [],
  isAwaitingFunctionResponse: false,
  awaitingToolType: null,
  sessionMetadata: null,
  isAutopilotActive: false,
  autopilotStepIndex: -1,
  autopilotResults: {},
  autopilotScenario: ITINERARY_SCENARIO,
  setAutopilotState: (state) => set(prev => ({ ...prev, ...state })),
  initSession: ({ systemPrompt, model }) => {
    if (!get().sessionMetadata) {
      set({
        sessionMetadata: {
          sessionId: Math.random().toString(36).substring(7),
          startedAt: new Date(),
          systemPrompt,
          model,
        },
      });
    }
  },
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) => {
    // Safety: ensure session is initialized when the first turn arrives.
    const { sessionMetadata, initSession } = get();
    if (!sessionMetadata) {
      const config = useSettings.getState();
      initSession({ systemPrompt: config.systemPrompt, model: config.model });
    }
    set(state => ({
      turns: [...state.turns, { ...turn, timestamp: new Date() }],
    }));
  },
  updateLastTurn: (update: Partial<Omit<ConversationTurn, 'timestamp'>>) => {
    set(state => {
      if (state.turns.length === 0) {
        return state;
      }
      const newTurns = [...state.turns];
      const lastTurn = { ...newTurns[newTurns.length - 1], ...update };
      newTurns[newTurns.length - 1] = lastTurn;
      return { turns: newTurns };
    });
  },
  mergeIntoLastAgentTurn: (
    update: Omit<ConversationTurn, 'timestamp' | 'role'>,
  ) => {
    set(state => {
      const turns = state.turns;
      const lastAgentTurnIndex = turns.map(t => t.role).lastIndexOf('agent');

      // Check if we need to create a new agent turn.
      if (lastAgentTurnIndex === -1 || turns[lastAgentTurnIndex].isFinal) {
        // Guard: Only add a new turn if there's actually something to add.
        const hasData = !!(
          update.text ||
          update.groundingChunks?.length ||
          update.toolResponse ||
          update.actualToolCalls?.length ||
          update.googleMapsWidgetContextToken
        );

        if (!hasData) return state;

        const newTurn: ConversationTurn = {
          role: 'agent',
          timestamp: new Date(),
          isFinal: false,
          text: '',
          ...update,
        };
        return { turns: [...turns, newTurn] };
      }

      // Merge into existing turn.
      const lastAgentTurn = turns[lastAgentTurnIndex];
      const lastText = lastAgentTurn.text || '';
      const newText = update.text || '';
      const needsSpace =
        lastText &&
        newText &&
        !lastText.endsWith(' ') &&
        !newText.startsWith(' ') &&
        !newText.startsWith('.') &&
        !newText.startsWith(',') &&
        !newText.startsWith('!') &&
        !newText.startsWith('?');

      const mergedTurn: ConversationTurn = {
        ...lastAgentTurn,
        ...update, // Basic properties
        text: lastText + (needsSpace ? ' ' : '') + newText,
        isFinal: update.isFinal ?? lastAgentTurn.isFinal,
        groundingChunks: [
          ...(lastAgentTurn.groundingChunks || []),
          ...(update.groundingChunks || []),
        ],
        actualToolCalls: (lastAgentTurn.actualToolCalls || update.actualToolCalls) ? [
          ...(lastAgentTurn.actualToolCalls || []),
          ...(update.actualToolCalls || []),
        ] : undefined,
        toolResponse: update.toolResponse || lastAgentTurn.toolResponse,
        googleMapsWidgetContextToken: update.googleMapsWidgetContextToken || lastAgentTurn.googleMapsWidgetContextToken
      };

      const newTurns = [...turns];
      newTurns[lastAgentTurnIndex] = mergedTurn;
      return { turns: newTurns };
    });
  },
  clearTurns: () => set({ turns: [], sessionMetadata: null, isAwaitingFunctionResponse: false, awaitingToolType: null }),
  setIsAwaitingFunctionResponse: (isAwaiting, toolName) =>
    set({ isAwaitingFunctionResponse: isAwaiting, awaitingToolType: toolName || null }),
}));

/**
 * Map Entities
 */
export interface MapMarker {
  position: {
    lat: number;
    lng: number;
    altitude: number;
  };
  label: string;
  showLabel: boolean;
  placeId?: string;
  address?: string;
}

export const useMapStore = create<{
  markers: MapMarker[];
  cameraTarget: Map3DCameraProps | null;
  preventAutoFrame: boolean;
  setMarkers: (markers: MapMarker[]) => void;
  clearMarkers: () => void;
  setCameraTarget: (target: Map3DCameraProps | null) => void;
  setPreventAutoFrame: (prevent: boolean) => void;
  routePolyline: google.maps.LatLngAltitudeLiteral[] | null;
  setRoutePolyline: (polyline: google.maps.LatLngAltitudeLiteral[] | null) => void;
  highlightedPlaceId: string | null;
  setHighlightedPlaceId: (id: string | null) => void;
}>(set => ({
  markers: [],
  cameraTarget: null,
  preventAutoFrame: false,
  routePolyline: null,
  highlightedPlaceId: null,
  setMarkers: markers => set({ markers }),
  clearMarkers: () => set({ markers: [] }),
  setCameraTarget: target => set({ cameraTarget: target }),
  setPreventAutoFrame: prevent => set({ preventAutoFrame: prevent }),
  setRoutePolyline: polyline => set({ routePolyline: polyline }),
  setHighlightedPlaceId: highlightedPlaceId => set({ highlightedPlaceId }),
}));

/**
 * Grounding Call Logs
 */
export interface GroundingCall {
  id: string;
  timestamp: Date;
  method: string;
  url?: string;
  requestBody: any;
  responseBody?: any;
  error?: string;
}

export const useGroundingLogStore = create<{
  logs: GroundingCall[];
  addRequest: (id: string, method: string, url: string | undefined, requestBody: any) => void;
  addResponse: (id: string, responseBody: any) => void;
  addError: (id: string, errorMsg: string) => void;
  clearLogs: () => void;
}>(set => ({
  logs: [],
  addRequest: (id, method, url, requestBody) => set(state => ({
    logs: [...state.logs, { id, timestamp: new Date(), method, url, requestBody }]
  })),
  addResponse: (id, responseBody) => set(state => ({
    logs: state.logs.map(log => log.id === id ? { ...log, responseBody } : log)
  })),
  addError: (id, errorMsg) => set(state => ({
    logs: state.logs.map(log => log.id === id ? { ...log, error: errorMsg } : log)
  })),
  clearLogs: () => set({ logs: [] }),
}));