/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

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

import { GenerateContentResponse, GroundingChunk } from '@google/genai';
import { fetchMapsGroundedResponseSDK, fetchMapsGroundedResponseREST } from '@/lib/maps-grounding';
import { MapMarker, useLogStore, useMapStore, useSettings } from '@/lib/state';
import { lookAtWithPadding } from '../look-at';

/**
 * Context object containing shared resources and setters that can be passed
 * to any tool implementation.
 */
export interface ToolContext {
  map: google.maps.maps3d.Map3DElement | null;
  placesLib: google.maps.PlacesLibrary | null;
  elevationLib: google.maps.ElevationLibrary | null;
  geocoder: google.maps.Geocoder | null;
  padding: [number, number, number, number];
  setHeldGroundedResponse: (
    response: GenerateContentResponse | undefined,
  ) => void;
  setHeldGroundingChunks: (chunks: GroundingChunk[] | undefined) => void;
}

/**
 * Defines the signature for any tool's implementation function.
 * @param args - The arguments for the function call, provided by the model.
 * @param context - The shared context object.
 * @returns A promise that resolves to either a string or a GenerateContentResponse
 *          to be sent back to the model.
 */
export type ToolImplementation = (
  args: any,
  context: ToolContext,
) => Promise<GenerateContentResponse | string | object>;

/**
 * Fetches and processes place details from grounding chunks.
 * @param groundingChunks - The grounding chunks from the model's response.
 * @param placesLib - The Google Maps Places library instance.
 * @param responseText - The model's text response to filter relevant places.
 * @param markerBehavior - Controls whether to show all markers or only mentioned ones.
 * @returns A promise that resolves to an array of MapMarker objects.
 */
async function fetchPlaceDetailsFromChunks(
  groundingChunks: GroundingChunk[],
  placesLib: google.maps.PlacesLibrary,
  responseText?: string,
  markerBehavior: 'mentioned' | 'all' | 'none' = 'mentioned',
  context?: { map?: google.maps.maps3d.Map3DElement },
  groundingSupports?: any[],
): Promise<MapMarker[]> {
  if (markerBehavior === 'none' || !groundingChunks?.length) {
    return [];
  }

  let chunksToProcess = groundingChunks.filter(c => c.maps?.placeId);

  // 1. Deduplicate chunks by clean placeId before any processing to prevent duplicate requests & duplicate markers
  const seenPlaceIds = new Set<string>();
  const deduplicatedChunks: GroundingChunk[] = [];
  for (const chunk of chunksToProcess) {
    if (!chunk.maps?.placeId) continue;
    const cleanId = chunk.maps.placeId.replace('places/', '').trim();
    if (!seenPlaceIds.has(cleanId)) {
      seenPlaceIds.add(cleanId);
      deduplicatedChunks.push(chunk);
    }
  }
  chunksToProcess = deduplicatedChunks;

  if (markerBehavior === 'mentioned' && responseText) {
    // Filter the marker list to only what was mentioned in the grounding text or supported by groundingSupports.
    const normalizedResponse = responseText.toLowerCase().replace(/['"’‘`]/g, "'");
    const supportedIndices = new Set<number>();
    if (Array.isArray(groundingSupports)) {
      for (const support of groundingSupports) {
        if (Array.isArray(support.groundingChunkIndices)) {
          for (const idx of support.groundingChunkIndices) {
            supportedIndices.add(idx);
          }
        }
      }
    }

    chunksToProcess = chunksToProcess.filter((chunk, idx) => {
      if (!chunk.maps?.placeId) return false;
      if (supportedIndices.has(idx)) return true;
      if (chunk.maps?.title) {
        const normalizedTitle = chunk.maps.title.toLowerCase().replace(/['"’‘`]/g, "'");
        if (normalizedResponse.includes(normalizedTitle)) return true;
      }
      return false;
    });
  }

  if (!chunksToProcess.length) {
    return [];
  }

  // 2. Fetch place details for each unique place
  const placesRequests = chunksToProcess.map(chunk => {
    const placeId = chunk.maps!.placeId.replace('places/', '');
    const place = new placesLib.Place({ id: placeId });
    return place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
  });

  const locationResults = await Promise.allSettled(placesRequests);

  const newMarkers: MapMarker[] = locationResults
    .map((result, index) => {
      if (result.status !== 'fulfilled' || !result.value?.place?.location) {
        return null;
      }
      
      const { place } = result.value;
      const originalChunk = chunksToProcess[index];
      const originalPlaceId = originalChunk.maps?.placeId;

      // Extract label: prioritize place.displayName, fallback to chunk title or formattedAddress
      const rawName = place.displayName || (originalChunk.maps?.title && originalChunk.maps.title !== 'Origin' && originalChunk.maps.title !== 'Destination' ? originalChunk.maps.title : '') || (place as any).formattedAddress || originalChunk.maps?.title || '';
      let shortLabel = rawName;
      if (rawName) {
        const firstSegment = rawName.split(/[,|\-\–\(\[~]/)[0].trim();
        if (firstSegment.length > 0 && firstSegment.length <= 25) {
          shortLabel = firstSegment;
        } else {
          shortLabel = rawName.length > 25 ? `${rawName.substring(0, 22)}...` : rawName;
        }
      }

      // Always show labels on markers unless specifically configured to none
      const isOriginOrDest = originalChunk.maps?.title === 'Origin' || originalChunk.maps?.title === 'Destination';
      let showLabel = true;
      if (markerBehavior === 'all' && !isOriginOrDest && responseText && originalChunk.maps?.title) {
        showLabel = responseText.includes(originalChunk.maps.title);
      }

      const markerObj: MapMarker = {
        position: {
          lat: place.location.lat(),
          lng: place.location.lng(),
          altitude: 1,
        },
        label: shortLabel,
        showLabel,
        placeId: originalPlaceId
      };
      return markerObj;
    })
    .filter((marker): marker is MapMarker => marker !== null);

  // 3. Deduplicate final markers by place ID, location proximity, and label to guarantee zero duplicate markers
  const seenKeys = new Set<string>();
  const deduplicatedMarkers: MapMarker[] = [];

  for (const m of newMarkers) {
    const cleanId = m.placeId ? m.placeId.replace('places/', '').trim() : '';
    const coordKey = `${m.position.lat.toFixed(4)},${m.position.lng.toFixed(4)}`;
    const labelKey = m.label.toLowerCase().trim();

    if (cleanId && seenKeys.has(`place:${cleanId}`)) continue;
    if (seenKeys.has(`coord:${coordKey}`) && seenKeys.has(`label:${labelKey}`)) continue;

    if (cleanId) seenKeys.add(`place:${cleanId}`);
    seenKeys.add(`coord:${coordKey}`);
    seenKeys.add(`label:${labelKey}`);
    deduplicatedMarkers.push(m);
  }

  const store = useMapStore.getState();
  const hasRoutePolyline = !!(store.routePolyline && store.routePolyline.length > 0);
  const isRouteQuery =
    (typeof responseText === 'string' && (/\b(route|directions|along|between|from .* to)\b/i.test(responseText))) ||
    hasRoutePolyline;

  let refLat: number | undefined = undefined;
  let refLng: number | undefined = undefined;

  const existingMarkers = store.markers;
  if (existingMarkers && existingMarkers.length > 0) {
    const elats = existingMarkers.map(m => m.position.lat);
    const elngs = existingMarkers.map(m => m.position.lng);
    refLat = elats.reduce((a, b) => a + b, 0) / elats.length;
    refLng = elngs.reduce((a, b) => a + b, 0) / elngs.length;
  }

  if (refLat === undefined || refLng === undefined) {
    const cameraCenter = store.cameraTarget?.center;
    if (cameraCenter?.lat !== undefined && cameraCenter?.lng !== undefined) {
      refLat = cameraCenter.lat;
      refLng = cameraCenter.lng;
    }
  }

  if (refLat === undefined || refLng === undefined) {
    const mapElement = context?.map || (typeof document !== 'undefined' ? document.querySelector('gmp-map-3d') as any : undefined);
    const centerAny = mapElement?.center;
    if (centerAny) {
      if (typeof centerAny.toJSON === 'function') {
        const json = centerAny.toJSON();
        refLat = json.lat;
        refLng = json.lng;
      } else if (typeof centerAny.lat === 'number' && typeof centerAny.lng === 'number') {
        refLat = centerAny.lat;
        refLng = centerAny.lng;
      } else if (typeof centerAny.lat === 'function' && typeof centerAny.lng === 'function') {
        refLat = centerAny.lat();
        refLng = centerAny.lng();
      }
    }
  }

  if (refLat !== undefined && refLng !== undefined && deduplicatedMarkers.length > 0) {
    // If not a major route corridor query, enforce strict local neighborhood bounding (`dLat <= 0.15 && dLng <= 0.15`, ~15 km)
    // If a route polyline exists (e.g. minor walking path between nearby parks or driving route), ensure markers are within 1.5 degrees (~150 km) of either the reference point or any point on the route polyline.
    const maxDist = isRouteQuery ? 1.5 : 0.15;
    const filteredMarkers = deduplicatedMarkers.filter(m => {
      const dLatRef = Math.abs(m.position.lat - refLat!);
      const dLngRef = Math.abs(m.position.lng - refLng!);
      if (dLatRef <= maxDist && dLngRef <= maxDist) return true;

      if (isRouteQuery && store.routePolyline && store.routePolyline.length > 0) {
        return store.routePolyline.some(p => Math.abs(m.position.lat - p.lat) <= maxDist && Math.abs(m.position.lng - p.lng) <= maxDist);
      }
      return false;
    });
    return filteredMarkers;
  }

  return deduplicatedMarkers;
}

/**
 * Updates the global map state based on the provided markers and grounding data.
 * It decides whether to perform a special close-up zoom or a general auto-frame.
 * @param markers - An array of markers to display on the map.
 * @param groundingChunks - The original grounding chunks to check for metadata.
 */
function updateMapStateWithMarkers(
  markers: MapMarker[],
  groundingChunks: GroundingChunk[],
) {
  const hasPlaceAnswerSources = groundingChunks.some(
    chunk => chunk.maps?.placeAnswerSources,
  );

  if (hasPlaceAnswerSources && markers.length === 1) {
    // Special close-up zoom: prevent auto-framing and set a direct camera target.
    const { setPreventAutoFrame, setMarkers, setCameraTarget } =
      useMapStore.getState();

    setPreventAutoFrame(true);
    setMarkers(markers);
    setCameraTarget({
      center: { ...markers[0].position, altitude: 200 },
      range: 500, // A tighter range for a close-up
      tilt: 60, // A steeper tilt for a more dramatic view
      heading: 0,
      roll: 0,
    });
  } else {
    // Default behavior: just set the markers and let the App component auto-frame them.
    const { setPreventAutoFrame, setMarkers } = useMapStore.getState();
    setPreventAutoFrame(false);
    setMarkers(markers);
  }
}


/**
 * Tool implementation for grounding queries with Google Maps.
 *
 * This tool fetches a grounded response and then, in a non-blocking way,
 * processes the place data to update the markers and camera on the 3D map.
 */
const mapsGrounding: ToolImplementation = async (args, context) => {
  const { setHeldGroundedResponse, setHeldGroundingChunks, placesLib } = context;

  const findEncodedPolyline = (obj: any): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.encodedPolyline === 'string') return obj.encodedPolyline;
    if (typeof obj.encoded_polyline === 'string') return obj.encoded_polyline;
    if (typeof obj.polyline === 'string') return obj.polyline;
    if (typeof obj.polyline?.encodedPolyline === 'string') return obj.polyline.encodedPolyline;
    if (typeof obj.polyline?.encoded_polyline === 'string') return obj.polyline.encoded_polyline;
    for (const key of Object.keys(obj)) {
      const found = findEncodedPolyline(obj[key]);
      if (found) return found;
    }
    return null;
  };

  const decodePolyline = (str: string) => {
    let index = 0, len = str.length;
    let lat = 0, lng = 0;
    const coordinates = [];

    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      coordinates.push({
        lat: lat / 1e5,
        lng: lng / 1e5,
        altitude: 10
      });
    }
    return coordinates;
  };

  const {
    query,
    markerBehavior = 'mentioned',
    systemInstruction,
  } = args;

  // Extract current map center to provide location context for the grounding tool.
  const { constrainToViewport, useVertexAI } = useSettings.getState();
  
  const lowerQuery = typeof query === 'string' ? query.toLowerCase() : '';
  const hasLocationInQuery =
    lowerQuery.includes(' in ') ||
    lowerQuery.includes(' near ') ||
    lowerQuery.includes(' at ') ||
    lowerQuery.includes(' around ') ||
    lowerQuery.includes(' to ') ||
    (lowerQuery.includes('between') && lowerQuery.includes('and')) ||
    /\b(paris|lyon|london|new york|san francisco|tokyo|rome|berlin|barcelona|madrid|munich|chicago|los angeles|seattle|boston|miami|austin|denver|toronto|vancouver|sydney|melbourne|singapore|bangkok|delhi|mumbai|dubai|cairo|cape town|rio de janeiro|buenos aires|mexico city)\b/i.test(lowerQuery);

  let lat: number | undefined = undefined;
  let lng: number | undefined = undefined;

  let effectivePrompt = typeof query === 'string' ? query : '';
  const isAlongRouteQuery =
    lowerQuery.includes('along the way') ||
    lowerQuery.includes('along the route') ||
    lowerQuery.includes('on the way') ||
    lowerQuery.includes('along my route') ||
    lowerQuery.includes('along our route') ||
    lowerQuery.includes('along ') ||
    (useMapStore.getState().routePolyline && (lowerQuery.includes('restaurant') || lowerQuery.includes('stop') || lowerQuery.includes('food') || lowerQuery.includes('eat')));

  if (!isAlongRouteQuery) {
    const existingMarkers = useMapStore.getState().markers;
    let targetMarker: any = null;

    if (existingMarkers && existingMarkers.length > 0) {
      // First check if a specific marker name (e.g. "The Parthenon") is referenced in the query
      for (const m of existingMarkers) {
        if (m.label && m.label.length > 2 && lowerQuery.includes(m.label.toLowerCase())) {
          targetMarker = m;
          break;
        }
      }

      // If only one place is currently on the map/selected (e.g. user viewing details of one venue and asks "parks nearby"), use that exact marker
      if (!targetMarker && existingMarkers.length === 1) {
        targetMarker = existingMarkers[0];
      }

      if (targetMarker) {
        lat = targetMarker.position.lat;
        lng = targetMarker.position.lng;
        const isNearbyQuery = /\b(near|around|close to|nearby|surrounding|distance from)\b/i.test(lowerQuery);
        if (isNearbyQuery && targetMarker.label && effectivePrompt.toLowerCase().includes(targetMarker.label.toLowerCase())) {
          const escLabel = targetMarker.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          effectivePrompt = effectivePrompt.replace(new RegExp(escLabel, 'gi'), `${lat!.toFixed(6)}, ${lng!.toFixed(6)}`);
        }
      } else {
        const elats = existingMarkers.map(m => m.position.lat);
        const elngs = existingMarkers.map(m => m.position.lng);
        lat = elats.reduce((a, b) => a + b, 0) / elats.length;
        lng = elngs.reduce((a, b) => a + b, 0) / elngs.length;
      }
    }

    if (lat === undefined || lng === undefined) {
      const cameraCenter = useMapStore.getState().cameraTarget?.center;
      if (cameraCenter?.lat !== undefined && cameraCenter?.lng !== undefined) {
        lat = cameraCenter.lat;
        lng = cameraCenter.lng;
      }
    }

    if (lat === undefined || lng === undefined) {
      const mapElement = context?.map || (typeof document !== 'undefined' ? document.querySelector('gmp-map-3d') as any : undefined);
      const centerAny = mapElement?.center;
      if (centerAny) {
        if (typeof centerAny.toJSON === 'function') {
          const json = centerAny.toJSON();
          lat = json.lat;
          lng = json.lng;
        } else if (typeof centerAny.lat === 'number' && typeof centerAny.lng === 'number') {
          lat = centerAny.lat;
          lng = centerAny.lng;
        } else if (typeof centerAny.lat === 'function' && typeof centerAny.lng === 'function') {
          lat = centerAny.lat();
          lng = centerAny.lng();
        }
      }
    }
  }

  if (isAlongRouteQuery) {
    let originName = '';
    let destName = '';

    // First check if the query itself contains origin and destination
    const queryMatch = lowerQuery.match(/(?:from|between|along)\s+([^]+?)\s+(?:to|and)\s+([^]+?)(?:\s+to|\s+for|\s+in|\s*$)/i);
    if (queryMatch && queryMatch[1] && queryMatch[2]) {
      originName = queryMatch[1].replace(/^(driving directions|directions|navigate|route|restaurants|restaurant|find|search|great|good|best|some|along the way|on the way|along)\s*/i, '').trim();
      destName = queryMatch[2].replace(/\s+(passing|stopping|finding|searching|with|for|mc\s*do|mcdonald'?s|restaurants?|gas|hotels?|along|on the way).*$/i, '').trim();
    } else {
      const turns = useLogStore.getState().turns;
      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i];
        if (turn.actualToolCalls) {
          for (const call of turn.actualToolCalls) {
            if (call.name === 'mapsGrounding' && typeof call.args?.query === 'string') {
              const match = call.args.query.match(/(?:from|between)\s+([^]+?)\s+(?:to|and)\s+([^]+?)(?:\s+to|\s+for|\s+in|\s*$)/i);
              if (match && match[1] && match[2]) {
                originName = match[1].replace(/^(driving directions|directions|navigate|route)\s*/i, '').trim();
                destName = match[2].replace(/\s+(passing|stopping|finding|searching|with|for|mc\s*do|mcdonald'?s|restaurants?|gas|hotels?|along|on the way).*$/i, '').trim();
                break;
              }
            }
          }
        }
        if (originName && destName) break;
        if (turn.groundingChunks) {
          for (const chunk of turn.groundingChunks) {
            const title = chunk.maps?.title || '';
            const match = title.match(/^([^]+?)\s+to\s+([^]+?)(?:\s+-\s+Google Maps|\s*$)/i);
            if (match && match[1] && match[2] && match[1] !== 'Origin' && match[2] !== 'Destination') {
              originName = match[1].trim();
              destName = match[2].replace(/\s*-\s*Google Maps$/i, '').trim();
              break;
            }
          }
        }
        if (originName && destName) break;
        if (turn.role === 'user' && typeof turn.text === 'string') {
          const match = turn.text.match(/(?:from|between)\s+([^]+?)\s+(?:to|and)\s+([^]+?)(?:\s+to|\s+for|\s+in|\s*$)/i);
          if (match && match[1] && match[2]) {
            originName = match[1].replace(/^(driving directions|directions|navigate|route)\s*/i, '').trim();
            destName = match[2].replace(/\s+(passing|stopping|finding|searching|with|for|mc\s*do|mcdonald'?s|restaurants?|gas|hotels?|along|on the way).*$/i, '').trim();
            break;
          }
        }
        if (originName && destName) break;
      }
    }

    if (originName && destName) {
      // Clean up subjective qualifiers ("top rated", "great") and complex phrasing ("near X and Y along driving route") that cause Places Grounding to choke and return 0 results
      let cleanedCategory = effectivePrompt
        .replace(/^(find|search|show|get|some|great|top[\s-]?rated|best|popular|good|delicious|nice)\s+/gi, '')
        .replace(/\s+(near|around|between|from|along|on)\s+([^]+)$/i, '')
        .replace(/\s+(along the way|on the way|along the route|along my route|along our route|driving route|driving directions)/gi, '')
        .trim();

      if (effectivePrompt.toLowerCase().includes('mcdonald') || effectivePrompt.toLowerCase().includes('mc do')) {
        cleanedCategory = "McDonald's";
      } else if (!cleanedCategory || cleanedCategory.toLowerCase().includes('restaurant') || cleanedCategory.toLowerCase().includes('food') || cleanedCategory.toLowerCase().includes('stop') || cleanedCategory.toLowerCase().includes('eat')) {
        cleanedCategory = 'restaurants';
      }

      let originStr = originName;
      let destStr = destName;

      const polyline = useMapStore.getState().routePolyline;
      const markers = useMapStore.getState().markers;
      if (polyline && polyline.length >= 2) {
        const start = polyline[0];
        const end = polyline[polyline.length - 1];
        originStr = `${start.lat.toFixed(6)}, ${start.lng.toFixed(6)}`;
        destStr = `${end.lat.toFixed(6)}, ${end.lng.toFixed(6)}`;
      } else if (markers && markers.length >= 2) {
        const start = markers[0].position;
        const end = markers[markers.length - 1].position;
        originStr = `${start.lat.toFixed(6)}, ${start.lng.toFixed(6)}`;
        destStr = `${end.lat.toFixed(6)}, ${end.lng.toFixed(6)}`;
      } else {
        const initialRoutingPrompt = `driving directions from ${originName} to ${destName}`;
        const initialRoutingResponse = useVertexAI
          ? await fetchMapsGroundedResponseREST({ prompt: initialRoutingPrompt })
          : await fetchMapsGroundedResponseSDK({ prompt: initialRoutingPrompt });

        if (initialRoutingResponse) {
          const enc = findEncodedPolyline(initialRoutingResponse);
          if (enc) {
            const path = decodePolyline(enc);
            if (path.length >= 2) {
              useMapStore.getState().setRoutePolyline(path);
              const start = path[0];
              const end = path[path.length - 1];
              originStr = `${start.lat.toFixed(6)}, ${start.lng.toFixed(6)}`;
              destStr = `${end.lat.toFixed(6)}, ${end.lng.toFixed(6)}`;
            }
          }
        }
      }

      effectivePrompt = `Find ${cleanedCategory} on the way from ${originStr} to ${destStr}`;
    }
  }

  const groundedResponse = useVertexAI
    ? await fetchMapsGroundedResponseREST({
        prompt: effectivePrompt,
        systemInstruction: systemInstruction as string | undefined,
        lat,
        lng,
      })
    : await fetchMapsGroundedResponseSDK({
        prompt: effectivePrompt,
        systemInstruction: systemInstruction as string | undefined,
        lat,
        lng,
      });

  if (!groundedResponse) {
    return 'Failed to get a response from maps grounding.';
  }



  // Hold response data for display in the chat log
  setHeldGroundedResponse(groundedResponse);

  // PREVIEW FEATURE: Recursively search the restricted preview response for embedded encoded polylines.
  try {
    const encoded = findEncodedPolyline(groundedResponse);
    if (encoded) {
      const path = decodePolyline(encoded);
      if (path.length > 0) {
        useMapStore.getState().setRoutePolyline(path);
      }
    }
  } catch (err) {
    console.error('Error extracting GroundingMetadata polyline:', err);
  }

  const responseText = groundedResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
  const candidate = groundedResponse?.candidates?.[0];

  // Extract and append routing origin/destination place IDs to groundingChunks
  try {
    const findRoutingPlaceIds = (obj: any): { origin?: string; destination?: string } => {
      let result: { origin?: string; destination?: string } = {};
      const traverse = (current: any) => {
        if (!current || typeof current !== 'object') return;
        
        const orig = current.originPlaceId || current.origin_place_id;
        if (typeof orig === 'string') result.origin = orig;
        
        const dest = current.destinationPlaceId || current.destination_place_id;
        if (typeof dest === 'string') result.destination = dest;
        
        const uri = current.uri;
        if (typeof uri === 'string' && (uri.includes('maps/dir/') || uri.includes('maps.google.com/maps/dir/'))) {
          const matches = uri.match(/ChIJ[a-zA-Z0-9_-]+/g);
          if (matches && matches.length >= 2) {
            result.origin = matches[0];
            result.destination = matches[matches.length - 1]; // Pick last as destination
          }
        }
        
        for (const key of Object.keys(current)) {
          traverse(current[key]);
        }
      };
      traverse(obj);
      return result;
    };

    const routingPlaces = findRoutingPlaceIds(groundedResponse);
    if (routingPlaces.origin || routingPlaces.destination) {
      if (candidate) {
        if (!candidate.groundingMetadata && !(candidate as any).grounding_metadata) {
          candidate.groundingMetadata = { groundingChunks: [] };
        }
        const metadata = candidate.groundingMetadata || (candidate as any).grounding_metadata;
        const chunks = metadata.groundingChunks || metadata.grounding_chunks || [];
        
        if (routingPlaces.origin) {
          const originId = routingPlaces.origin.startsWith('places/') ? routingPlaces.origin : `places/${routingPlaces.origin}`;
          if (!chunks.some((c: any) => (c.maps?.placeId === originId || c.maps?.place_id === originId))) {
            chunks.push({
              maps: {
                placeId: originId,
                title: 'Origin'
              }
            });
          }
        }
        
        if (routingPlaces.destination) {
          const destId = routingPlaces.destination.startsWith('places/') ? routingPlaces.destination : `places/${routingPlaces.destination}`;
          if (!chunks.some((c: any) => (c.maps?.placeId === destId || c.maps?.place_id === destId))) {
            chunks.push({
              maps: {
                placeId: destId,
                title: 'Destination'
              }
            });
          }
        }
        
        if (metadata.groundingChunks) metadata.groundingChunks = chunks;
        if (metadata.grounding_chunks) metadata.grounding_chunks = chunks;
      }
    }
  } catch (err) {
    console.error('Error extracting routing place IDs:', err);
  }

  const metadata = candidate?.groundingMetadata || (candidate as any)?.grounding_metadata;
  const groundingChunks = metadata?.groundingChunks || metadata?.grounding_chunks;
  if (typeof window !== 'undefined') {
    (window as any).lastGroundedResponse = groundedResponse;
    (window as any).lastGroundedChunks = groundingChunks;
  }
  if (groundingChunks && groundingChunks.length > 0) {
    setHeldGroundingChunks(groundingChunks);
  } else {
    // If there are no grounding chunks, check if it was a routing query on a 3.x model and provide feedback
    const lowerQuery = typeof query === 'string' ? query.toLowerCase() : '';
    const isRoutingQuery = lowerQuery.includes(' to ') || (lowerQuery.includes('between') && lowerQuery.includes('and'));
    if (isRoutingQuery) {
      const currentModel = useSettings.getState().customGroundingModel || 'gemini-2.5-pro';
      if (currentModel.includes('3.1') || currentModel.includes('3.5')) {
        const feedbackMsg = `💡 **July 2026 status:** Places Grounding is active on **${currentModel}** (in region 'global'), while multi-stop Routing & Directions requires **gemini-2.5**. Try selecting **gemini-2.5** in Settings for live multi-stop routes!`;
        useLogStore.getState().addTurn({
          role: 'system',
          text: feedbackMsg,
          isFinal: true,
        });
      }
    }
    useMapStore.getState().setMarkers([]);
    return {
      text: responseText || 'No response from maps grounding.',
      groundingChunks: [],
    };
  }

  // Process place details and update the map state asynchronously.
  // This is done in a self-invoking async function so that the `mapsGrounding`
  // tool can return the response to the model immediately without waiting for
  // the map UI to update.
  if (placesLib && markerBehavior !== 'none') {
    (async () => {
      try {
        const groundingSupports = metadata?.groundingSupports || metadata?.grounding_supports;
        let markers = await fetchPlaceDetailsFromChunks(
          groundingChunks,
          placesLib,
          responseText,
          markerBehavior,
          context,
          groundingSupports,
        );

        const lowerQuery = typeof query === 'string' ? query.toLowerCase() : '';
        const isRoutingQuery = lowerQuery.includes(' to ') || (lowerQuery.includes('between') && lowerQuery.includes('and'));
        const isAlongRouteSearch =
          lowerQuery.includes('along the way') ||
          lowerQuery.includes('along the route') ||
          lowerQuery.includes('on the way') ||
          lowerQuery.includes('along my route') ||
          lowerQuery.includes('along our route') ||
          lowerQuery.includes('along ') ||
          (useMapStore.getState().routePolyline && (lowerQuery.includes('restaurant') || lowerQuery.includes('stop') || lowerQuery.includes('food') || lowerQuery.includes('eat')));

        if (!isRoutingQuery && !isAlongRouteSearch) {
          useMapStore.getState().setRoutePolyline(null);
        } else if (isRoutingQuery && !isAlongRouteSearch) {
          const hasPolyline = !!useMapStore.getState().routePolyline;
          if (!hasPolyline && markers.length < 2) {
            const currentModel = useSettings.getState().customGroundingModel || 'gemini-2.5-pro';
            if (currentModel.includes('3.1') || currentModel.includes('3.5')) {
              const feedbackMsg = `💡 **July 2026 status:** Places Grounding is active on **${currentModel}** (in region 'global'), while multi-stop Routing & Directions requires **gemini-2.5**. Try selecting **gemini-2.5** in Settings for live multi-stop routes!`;
              useLogStore.getState().addTurn({
                role: 'system',
                text: feedbackMsg,
                isFinal: true,
              });
            }
          }
        }

        updateMapStateWithMarkers(markers, groundingChunks);

      } catch (e) {
        console.error('Error processing place details and updating map:', e);
      }
    })();
  } else if (markerBehavior === 'none') {
    // If no markers are to be created, ensure the map is cleared.
    useMapStore.getState().setMarkers([]);
  }

  return {
    text: responseText || 'No response from maps grounding.',
    groundingChunks: groundingChunks || [],
  };
};

/**
 * Tool implementation for displaying a city on the 3D map.
 * This tool sets the `cameraTarget` in the global Zustand store. The main `App`
 * component has a `useEffect` hook that listens for changes to this state and
 * commands the `MapController` to fly to the new target.
 */
const frameEstablishingShot: ToolImplementation = async (args, context) => {
  let { lat, lng, geocode } = args;
  const { geocoder } = context;

  if (geocode && typeof geocode === 'string') {
    if (!geocoder) {
      const errorMessage = 'Geocoding service is not available.';
      useLogStore.getState().addTurn({
        role: 'system',
        text: errorMessage,
        isFinal: true,
      });
      return errorMessage;
    }
    try {
      const response = await geocoder.geocode({ address: geocode });
      if (response.results && response.results.length > 0) {
        const location = response.results[0].geometry.location;
        lat = location.lat();
        lng = location.lng();
      } else {
        const errorMessage = `Could not find a location for "${geocode}".`;
        useLogStore.getState().addTurn({
          role: 'system',
          text: errorMessage,
          isFinal: true,
        });
        return errorMessage;
      }
    } catch (error) {
      console.error(`Geocoding failed for "${geocode}":`, error);
      const errorMessage = `There was an error trying to find the location for "${geocode}". See browser console for details.`;
      useLogStore.getState().addTurn({
        role: 'system',
        text: errorMessage,
        isFinal: true,
      });
      return `There was an error trying to find the location for "${geocode}".`;
    }
  }

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return 'Invalid arguments for frameEstablishingShot. You must provide either a `geocode` string or numeric `lat` and `lng` values.';
  }

  // Instead of directly manipulating the map, we set a target in the global state.
  // The App component will observe this state and command the MapController to fly to the target.
  useMapStore.getState().setCameraTarget({
    center: { lat, lng, altitude: 100 },
    range: 15000,
    tilt: 45,
    heading: 0,
    roll: 0,
  });

  if (geocode) {
    return `Set camera target to ${geocode}.`;
  }
  return `Set camera target to latitude ${lat} and longitude ${lng}.`;
};


/**
 * Tool implementation for framing a list of locations on the map. It can either
 * fly the camera to view the locations or add markers for them, letting the
 * main app's reactive state handle the camera framing.
 */
const frameLocations: ToolImplementation = async (args, context) => {
  const {
    locations: explicitLocations,
    geocode,
    markers: shouldCreateMarkers,
  } = args;
  const { elevationLib, padding, geocoder } = context;

  const locationsWithLabels: { lat: number; lng: number; label?: string }[] =
    [];

  // 1. Collect all locations from explicit coordinates and geocoded addresses.
  if (Array.isArray(explicitLocations)) {
    locationsWithLabels.push(
      ...(explicitLocations.map((loc: { lat: number; lng: number }) => ({
        ...loc,
      })) || []),
    );
  }

  if (Array.isArray(geocode) && geocode.length > 0) {
    if (!geocoder) {
      const errorMessage = 'Geocoding service is not available.';
      useLogStore
        .getState()
        .addTurn({ role: 'system', text: errorMessage, isFinal: true });
      return errorMessage;
    }

    const geocodePromises = geocode.map(address =>
      geocoder.geocode({ address }).then(response => ({ response, address })),
    );
    const geocodeResults = await Promise.allSettled(geocodePromises);

    geocodeResults.forEach(result => {
      if (result.status === 'fulfilled') {
        const { response, address } = result.value;
        if (response.results && response.results.length > 0) {
          const location = response.results[0].geometry.location;
          locationsWithLabels.push({
            lat: location.lat(),
            lng: location.lng(),
            label: address,
          });
        } else {
          const errorMessage = `Could not find a location for "${address}".`;
          useLogStore
            .getState()
            .addTurn({ role: 'system', text: errorMessage, isFinal: true });
        }
      } else {
        const errorMessage = `Geocoding failed for an address.`;
        console.error(errorMessage, result.reason);
        useLogStore
          .getState()
          .addTurn({ role: 'system', text: errorMessage, isFinal: true });
      }
    });
  }

  // 2. Check if we have any valid locations.
  if (locationsWithLabels.length === 0) {
    return 'Could not find any valid locations to frame.';
  }

  // 3. Perform the requested action.
  if (shouldCreateMarkers) {
    // Deduplicate locations by coordinates
    const seenLocs = new Set<string>();
    const uniqueLocs: typeof locationsWithLabels = [];
    for (const loc of locationsWithLabels) {
      const key = `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`;
      if (!seenLocs.has(key)) {
        seenLocs.add(key);
        uniqueLocs.push(loc);
      }
    }

    // Create markers and update the global state. The App component will
    // reactively frame these new markers.
    const markersToSet = uniqueLocs.map((loc, index) => ({
      position: { lat: loc.lat, lng: loc.lng, altitude: 1 },
      label: loc.label || `Location ${index + 1}`,
      showLabel: true,
    }));

    const { setMarkers, setPreventAutoFrame } = useMapStore.getState();
    setPreventAutoFrame(false); // Ensure auto-framing is enabled
    setMarkers(markersToSet);

    return `Framed and added markers for ${markersToSet.length} locations.`;
  } else {
    // No markers requested. Clear existing markers and manually fly the camera.
    if (!elevationLib) {
      return 'Elevation library is not available.';
    }

    useMapStore.getState().clearMarkers();

    const elevator = new elevationLib.ElevationService();
    const cameraProps = await lookAtWithPadding(
      locationsWithLabels,
      elevator,
      0,
      padding,
    );

    useMapStore.getState().setCameraTarget({
      center: {
        lat: cameraProps.lat,
        lng: cameraProps.lng,
        altitude: cameraProps.altitude,
      },
      range: cameraProps.range * 1.15,
      heading: cameraProps.heading,
      tilt: cameraProps.tilt,
      roll: 0,
    });

    return `Framed ${locationsWithLabels.length} locations on the map.`;
  }
};

/**
 * A registry mapping tool names to their implementation functions.
 * The `onToolCall` handler uses this to dispatch function calls dynamically.
 */
export const toolRegistry: Record<string, ToolImplementation> = {
  mapsGrounding,
  frameEstablishingShot,
  frameLocations,
};