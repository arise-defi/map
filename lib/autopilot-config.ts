/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * Autopilot Scenarios Configuration
 * 
 * This file allows developers to define automated conversation scripts for testing
 * and demonstration purposes.
 */

export interface ScenarioStep {
  id: string;
  description: string;
  sendText: string | null;
  waitForTool?: string;
  waitForRole?: 'agent' | 'user';
}

/**
 * The standard 'Itinerary Planner' walkthrough.
 * Used for verifying tool adherence (Navigation -> Grounding -> Activities).
 */
export const ITINERARY_SCENARIO: ScenarioStep[] = [
  {
    id: 'start',
    description: 'Initial greeting',
    sendText: null,
    waitForRole: 'agent'
  },
  {
    id: 'city',
    description: 'Going to SF',
    sendText: 'I’d like to go to San Francisco',
    waitForTool: 'frameEstablishingShot'
  },
  {
    id: 'greek',
    description: 'Suggest Greek place',
    sendText: 'suggest some Greek places to me',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'parthenon',
    description: 'Ask about The Parthenon',
    sendText: 'What are people saying about The Parthenon?',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'parks',
    description: 'Nearby parks',
    sendText: 'That sounds great, tell me more about nearby parks',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'accessibility',
    description: 'Huntington Park accessibility',
    sendText: 'Is Huntington Park wheelchair accessible?',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'finalize',
    description: 'Finalize itinerary',
    sendText: 'That sounds great! Let\'s finalize this itinerary.',
    waitForTool: 'frameLocations'
  }
];

/**
 * A walkthrough focusing on Chicago's landmarks.
 */
export const CHICAGO_WALKTHROUGH: ScenarioStep[] = [
  {
    id: 'start',
    description: 'Initial greeting',
    sendText: null,
    waitForRole: 'agent'
  },
  {
    id: 'establishing_shot',
    description: 'Fly to Chicago',
    sendText: 'Let\'s start in Chicago',
    waitForTool: 'frameEstablishingShot'
  },
  {
    id: 'deep_dish',
    description: 'Search Lou Malnati\'s',
    sendText: 'Find Lou Malnati\'s Pizzeria in Lincoln Park Chicago',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'deep_dish_details',
    description: 'Check famous deep dish',
    sendText: 'Does Lou Malnati\'s have the best deep dish in Chicago?',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'millennium_park',
    description: 'Search Millennium Park',
    sendText: 'Let\'s head over to Millennium Park',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'bean_details',
    description: 'Check Cloud Gate sculpture',
    sendText: 'Can we walk inside or under Cloud Gate at Millennium Park?',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'architecture_cruise',
    description: 'Find River Cruise',
    sendText: 'Find the Chicago Architecture Center River Cruise on the Chicago River',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'finalize',
    description: 'Finalize itinerary',
    sendText: 'That sounds great! Let\'s finalize this itinerary.',
    waitForTool: 'frameLocations'
  }
];

/**
 * A walkthrough focusing on Tokyo's vibrant neighborhoods.
 */
export const TOKYO_WALKTHROUGH: ScenarioStep[] = [
  {
    id: 'start',
    description: 'Initial greeting',
    sendText: null,
    waitForRole: 'agent'
  },
  {
    id: 'establishing_shot',
    description: 'Fly to Tokyo',
    sendText: 'Let\'s start in Tokyo',
    waitForTool: 'frameEstablishingShot'
  },
  {
    id: 'sushi_search',
    description: 'Find Tsukiji outer market',
    sendText: 'Find Tsukiji Outer Market in Chuo City Tokyo',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'sushi_details',
    description: 'Check fresh sashimi',
    sendText: 'What are the best street food stalls for fresh sashimi at Tsukiji Outer Market?',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'shibuya_crossing',
    description: 'Search Shibuya Crossing',
    sendText: 'Let\'s check out Shibuya Crossing',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'crossing_details',
    description: 'Check Starbucks view',
    sendText: 'Is there a Starbucks directly overlooking Shibuya Crossing?',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'teamlab_borderless',
    description: 'Find teamLab Borderless',
    sendText: 'Find teamLab Borderless digital art museum in Azabudai Hills Tokyo',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'finalize',
    description: 'Finalize itinerary',
    sendText: 'That sounds great! Let\'s finalize this itinerary.',
    waitForTool: 'frameLocations'
  }
];

/**
 * A walkthrough focusing on food in San Francisco.
 */
export const SF_CUISINE_WALKTHROUGH: ScenarioStep[] = [
  {
    id: 'start',
    description: 'Initial greeting',
    sendText: null,
    waitForRole: 'agent'
  },
  {
    id: 'city',
    description: 'Going to SF',
    sendText: "Let's go to San Francisco",
    waitForTool: 'frameEstablishingShot'
  },
  {
    id: 'pizza',
    description: 'Pizza suggestions',
    sendText: 'Show me suggestions for pizza',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'sushi',
    description: 'Sushi suggestions',
    sendText: 'Show me suggestions for sushi',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'kuma',
    description: 'Kuma menu check',
    sendText: 'Does Kuma serve California rolls?',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'summary',
    description: 'Finalize',
    sendText: 'Thanks for the info!',
    waitForTool: 'frameLocations'
  }
];

/**
 * A walkthrough focusing on a scenic route from SF to San Bruno.
 */
export const ROUTING_SCENARIO: ScenarioStep[] = [
  {
    id: 'start',
    description: 'Initial greeting',
    sendText: null,
    waitForRole: 'agent'
  },
  {
    id: 'route_sf_san_bruno',
    description: 'Route: SF to San Bruno',
    sendText: 'navigate from san francisco to san bruno',
    waitForTool: 'mapsGrounding'
  },
  {
    id: 'along_route',
    description: 'restaurants along the way',
    sendText: 'find some great restaurants along the way',
    waitForTool: 'mapsGrounding'
  }
];

/**
 * Feature Toggles
 */
export const AUTOPILOT_CONFIG = {
  // Set this to true to enable the Autopilot (robot icon) in the UI.
  // We're enabling this for debug mode so you can step through with robot arrows.
  enabled: false,
  scenarios: {
    'SF: Itinerary': ITINERARY_SCENARIO,
    'Route: SF to San Bruno': ROUTING_SCENARIO,
    'SF: Cuisine': SF_CUISINE_WALKTHROUGH,
    'Chicago': CHICAGO_WALKTHROUGH
  },
  defaultScenario: ITINERARY_SCENARIO,
};
