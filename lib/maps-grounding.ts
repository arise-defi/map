/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, GenerateContentResponse, ThinkingLevel } from '@google/genai';
import { useSettings, useGroundingLogStore } from '@/lib/state';

const API_KEY = process.env.GEMINI_API_KEY;

const SYS_INSTRUCTIONS = "You are a helpful assistant that provides concise and accurate answers based on the user's query using Google Maps data. Your primary goal is to answer specific questions about places (e.g., menu items, services, attributes). You MUST be extremely thorough in checking the provided data, especially the 'reviewSnippets' and 'snippets' fields, for the specific answer. If the data explicitly confirms the item or service, state it clearly. If you cannot find the specific item or service mentioned in the data, state that it is not explicitly mentioned in the available reviews or snippets. DO NOT guess or provide 'likely' or 'probable' answers based on the type of establishment. For example, if asked about California rolls at a sushi restaurant and they aren't in the data, say 'California rolls are not explicitly mentioned in the reviews or snippets for this restaurant' rather than 'They likely have them because it's a sushi restaurant.' Always include the name of the place in your answer."

/**
 * Calls the Gemini API with the googleSearch tool to get a grounded response.
 * @param prompt The user's text prompt.
 * @returns An object containing the model's text response and grounding sources.
 */
export async function fetchMapsGroundedResponseSDK({
  prompt,
  lat,
  lng,
  systemInstruction,
}: {
  prompt: string;
  lat?: number;
  lng?: number;
  systemInstruction?: string;
}): Promise<GenerateContentResponse> {
  const {
    useVertexAI,
    gcpProjectId,
    gcpLocation,
    gcpAccessToken,
    model,
    customGeminiApiKey,
    thinkingEnabled,
  } = useSettings.getState();

  const supportsThinking = (modelName: string) => {
    return modelName.includes('2.5-pro') || modelName.includes('2.5-flash') || modelName.includes('3.1-pro') || modelName.includes('3.1-flash');
  };

  const requestId = Math.random().toString(36).substring(7);

  try {
    let ai: GoogleGenAI;
    let request: any;

    if (useVertexAI) {
      const activeLocation = gcpLocation || 'us-central1';
      const activeModel = (model.includes('live') || model.includes('3.1') || model.includes('3.5')) ? 'gemini-2.5-pro' : (model || 'gemini-2.5-pro');

      if (!gcpAccessToken) {
        throw new Error('Missing required GCP Access Token for Vertex AI');
      }

      ai = new GoogleGenAI({
        apiKey: gcpAccessToken,
        vertexai: true,
        apiVersion: 'v1beta1',
        httpOptions: {
          baseUrl: `https://${activeLocation}-aiplatform.googleapis.com/`,
        }
      });

      const fullModelPath = `projects/${gcpProjectId}/locations/${activeLocation}/publishers/google/models/${activeModel}`;

      const config: any = {
        tools: [{
          googleMaps: {
            groundingTypes: {
              places: {},
              routing: {}
            }
          }
        }],
        systemInstruction: systemInstruction || SYS_INSTRUCTIONS,
      };

      if (supportsThinking(activeModel)) {
        config.thinkingConfig = {
          thinkingBudget: thinkingEnabled ? -1 : 0,
        };
      }

      request = {
        model: fullModelPath,
        contents: prompt,
        config,
      };
    } else {
      const activeApiKey = customGeminiApiKey || API_KEY;
      if (!activeApiKey) {
        throw new Error('Missing required Gemini API Key. Please configure it in the Sidebar settings.');
      }

      ai = new GoogleGenAI({ apiKey: activeApiKey });

      const activeModel = model ? (model.includes('live') ? 'gemini-3.5-flash' : model) : 'gemini-3.1-pro-preview';

      const config: any = {
        tools: [{ googleMaps: {} }],
        systemInstruction: systemInstruction || SYS_INSTRUCTIONS,
      };

      if (supportsThinking(activeModel)) {
        config.thinkingConfig = {
          thinkingBudget: thinkingEnabled ? -1 : 0,
        };
      }

      request = {
        model: activeModel,
        contents: prompt,
        config,
      };
    }

    if (lat !== undefined && lng !== undefined) {
      request.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng,
          },
          languageCode: 'en_US',
        },
      };
    }

    const activeModelName = useVertexAI
      ? ((model.includes('live') || model.includes('3.1') || model.includes('3.5')) ? 'gemini-2.5-pro' : (model || 'gemini-2.5-pro'))
      : (model ? (model.includes('live') ? 'gemini-3.5-flash' : model) : 'gemini-3.1-pro-preview');

    useGroundingLogStore.getState().addRequest(
      requestId,
      useVertexAI ? 'SDK (Vertex)' : 'SDK (Gemini)',
      useVertexAI ? `Vertex AI Model: ${activeModelName}` : `Gemini API Model: ${activeModelName}`,
      request
    );

    const response = await ai.models.generateContent(request);
    useGroundingLogStore.getState().addResponse(requestId, response);
    return response;
  } catch (error) {
    useGroundingLogStore.getState().addError(requestId, String(error));
    console.error(`Error calling grounding: ${error}\n   With prompt: ${prompt}`);
    throw error;
  }
}

/**
 * Calls the Google AI Platform REST API to get a Maps-grounded response.
 * @param options The request parameters.
 * @returns A promise that resolves to the API's GenerateContentResponse.
 */
export async function fetchMapsGroundedResponseREST({
  prompt,
  lat,
  lng,
  systemInstruction,
}: {
  prompt: string;
  lat?: number;
  lng?: number;
  systemInstruction?: string;
}): Promise<GenerateContentResponse> {
  const {
    useVertexAI,
    useCustomGcp,
    gcpProjectId,
    gcpLocation,
    gcpAccessToken,
    model,
    customGeminiApiKey,
    useCustomCredentials,
    customGroundingModel,
    defaultVertexModel,
    defaultGeminiModel,
  } = useSettings.getState();

  // Build the model names
  const activeModel = useCustomCredentials
    ? customGroundingModel
    : (useVertexAI ? defaultVertexModel : defaultGeminiModel);
  const rawLocation = gcpLocation || 'us-central1';
  const effectiveLocation = rawLocation;

  // Build the request body structure
  let requestBody: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    system_instruction: {
      parts: [{ text: systemInstruction || SYS_INSTRUCTIONS }]
    },
  };

  if (useVertexAI) {
    requestBody.tools = [
      {
        googleMaps: {
          groundingTypes: {
            places: {},
            routing: {}
          }
        },
      },
    ];
    if (gcpProjectId) {
      requestBody.model = `projects/${gcpProjectId}/locations/${effectiveLocation}/publishers/google/models/${activeModel}`;
    }
  } else {
    requestBody.tools = [
      {
        google_maps: {},
      },
    ];
  }

  if (lat !== undefined && lng !== undefined) {
    requestBody.toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: lat,
          longitude: lng,
        },
        languageCode: 'en_US',
      },
    };
  }



  const requestId = Math.random().toString(36).substring(7);

  try {
    // If using Vertex AI but custom GCP is disabled or no client token is configured, route via the secure backend proxy
    if (useVertexAI && (!useCustomGcp || !gcpAccessToken)) {
      useGroundingLogStore.getState().addRequest(
        requestId,
        'REST (Proxy)',
        '/api/maps-grounding',
        { useVertexAI: true, model: activeModel, requestBody }
      );

      const response = await fetch('/api/maps-grounding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          useVertexAI: true,
          model: activeModel,
          projectId: gcpProjectId,
          location: effectiveLocation,
          requestBody,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        let errMsg = typeof errBody.error === 'object' && errBody.error
          ? errBody.error.message
          : (errBody.error || errBody.message || `Proxy request failed with status ${response.status}`);
        if (response.status === 404 || errMsg.includes('was not found')) {
          errMsg = `Model '${activeModel}' is not published or available on Gemini Enterprise project '${gcpProjectId}' (${effectiveLocation}). Note: For Google Maps Grounding on Gemini Enterprise, gemini-2.5-pro and gemini-2.5-flash are fully supported. Details: ${errMsg}`;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();

      useGroundingLogStore.getState().addResponse(requestId, data);
      return data;
    }

    let endpoint: string;
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useVertexAI) {
      if (!gcpAccessToken) {
        throw new Error('Missing required GCP Access Token for Vertex AI. Please configure it in the Sidebar settings.');
      }
      // GCP Vertex AI Enterprise Endpoint & Header mapping
      const host = effectiveLocation === 'global' ? 'aiplatform.googleapis.com' : `${effectiveLocation}-aiplatform.googleapis.com`;
      endpoint = `https://${host}/v1beta1/projects/${gcpProjectId}/locations/${effectiveLocation}/publishers/google/models/${activeModel}:generateContent`;
      headers['Authorization'] = `Bearer ${gcpAccessToken}`;
    } else {
      // Google AI Studio Developer Endpoint & Header mapping
      const activeApiKey = customGeminiApiKey || API_KEY;
      if (!activeApiKey) {
        throw new Error('Missing required Gemini API Key. Please configure it in the Sidebar settings.');
      }
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent`;
      headers['x-goog-api-key'] = activeApiKey;
    }

    useGroundingLogStore.getState().addRequest(
      requestId,
      useVertexAI ? 'REST (Vertex)' : 'REST (Gemini)',
      endpoint,
      requestBody
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error from Generative AI REST API:', errorBody);
      let parsedError: any;
      try {
        parsedError = JSON.parse(errorBody);
      } catch (e) {
        // Not JSON
      }
      
      const details = parsedError?.error?.message || errorBody;
      let userFriendlyMessage = `API request failed with status ${response.status}: ${details}`;
      if (response.status === 401) {
        userFriendlyMessage = `Authentication failed (401). Your GCP Access Token may be missing, expired, or invalid. Please check the Sidebar settings. Details: ${details}`;
      } else if (response.status === 404 || details.includes('was not found')) {
        userFriendlyMessage = `Model '${activeModel}' is not published or available on Gemini Enterprise project '${gcpProjectId}' (${effectiveLocation}). Note: For Google Maps Grounding on Gemini Enterprise, gemini-2.5-pro and gemini-2.5-flash are fully supported. Details: ${details}`;
      }
      throw new Error(userFriendlyMessage);
    }

    const data = await response.json();

    if (typeof window !== 'undefined') {
      (window as any).lastGroundedResponse = data;
    }
    useGroundingLogStore.getState().addResponse(requestId, data);
    return data as GenerateContentResponse;
  } catch (error) {
    useGroundingLogStore.getState().addError(requestId, String(error));
    console.error(`Error calling Maps grounding REST API: ${error}`);
    throw error;
  }
}