/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { FunctionCall } from '../state';
import { FunctionResponseScheduling } from '@google/genai';

export const itineraryPlannerTools: FunctionCall[] = [
  {
    name: 'mapsGrounding',
    description: `
    A tool for deep exploration of SPECIFIC venues (restaurants, museums, etc.) WITHIN a city. You are STRICTLY FORBIDDEN from using this tool for general city-level navigation or geographic lookups (e.g., "go to Paris"). For cities, you MUST use 'frameEstablishingShot' instead. This tool is for places only.

    1.  **For Itinerary Planning:** Find and summarize information about places like restaurants, museums, or parks. Use a straightforward query to get factual summaries of top results. It can also be used to answer specific questions about a place (e.g., "Does Kuma serve California rolls?") by searching its reviews, snippets, and attributes.
        -   **Example Query:** "fun museums in Paris" or "best pizza in Brooklyn".

    2.  **For Creative Content:** Generate engaging narratives, riddles, or scavenger hunt clues based on real-world location data. Use a descriptive query combined with a custom 'systemInstruction' to guide the creative output.
        -   **Example Query:** "a famous historical restaurant in Paris".

    Args:
        query: A string describing the search parameters. You **MUST be as precise as possible**, include as much location data that you can such as city, state and/or country to reduce ambiguous results.
        markerBehavior: (Optional) Controls map markers. "mentioned" (default), "all", or "none".
        systemInstruction: (Optional) A string that provides a persona and instructions for the tool's output. Use this for creative tasks to ensure the response is formatted as a clue, riddle, etc.

    Returns:
        A response from the maps grounding agent. The content and tone of the response will be shaped by the query and the optional 'systemInstruction'.
    `,
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'A string describing the search parameters. You **MUST be as precise as possible**, include as much location data that you can such as city, state and/or country to reduce ambiguous results. For specific questions about a place (e.g., "Does Kuma serve California rolls?"), you MUST include both the place name and the specific detail in the query (e.g., "Kuma Sushi + Sake in San Francisco California rolls") to ensure the search results contain the relevant snippets and reviews.'
        },
        markerBehavior: {
          type: 'STRING',
          description:
            'Controls which results get markers. "mentioned" for places in the text response, "all" for all search results, or "none" for no markers.',
          enum: ['mentioned', 'all', 'none'],
        },
        systemInstruction: {
          type: 'STRING',
          description:
            "A string that provides a persona and instructions for the tool's output. Use this for creative tasks to ensure the response is formatted as a clue, riddle, etc.",
        },
      },
      required: ['query'],
    },
    isEnabled: true,
  },
  {
    name: 'frameEstablishingShot',
    description: 'The MANDATORY and EXCLUSIVE tool for navigating to a city or general area (e.g., "Paris", "San Francisco"). This tool uses Geocoding to fly the camera to a wide view. You MUST use this tool for ALL initial city selections. DO NOT use mapsGrounding for this.',
    parameters: {
      type: 'OBJECT',
      properties: {
        geocode: {
          type: 'STRING',
          description: 'The name of the location to look up (e.g., "Paris, France"). You **MUST be as precise as possible**, include as much location data that you can such as city, state and/or country to reduce ambiguous results.'
        },
        lat: {
          type: 'NUMBER',
          description: 'The latitude of the location.'
        },
        lng: {
          type: 'NUMBER',
          description: 'The longitude of the location.'
        },
      },
      required: ['geocode'],
    },
    isEnabled: true,
  },
  {
    name: 'frameLocations',
    description: 'Frames multiple locations on the map, ensuring all are visible. Provide either an array of location names to geocode, or an array of specific latitude/longitude points. Can optionally add markers for these locations. When relying on geocoding you **MUST be as precise as possible**, include as much location data that you can such as city, state and/or country to reduce ambiguous results.',
    parameters: {
      type: 'OBJECT',
      properties: {
        locations: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              lat: { type: 'NUMBER' },
              lng: { type: 'NUMBER' },
            },
            required: ['lat', 'lng'],
          },
        },
        geocode: {
          type: 'ARRAY',
          description: 'An array of location names to look up (e.g., ["Eiffel Tower", "Louvre Museum"]).',
          items: {
            type: 'STRING',
          },
        },
        markers: {
          type: 'BOOLEAN',
          description: 'If true, adds markers to the map for each location being framed.'
        }
      },
    },
    isEnabled: true,
  },
];