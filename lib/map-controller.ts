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

import { Map3DCameraProps } from '@/components/map-3d';
import { lookAtWithPadding } from './look-at';
import { MapMarker, useMapStore } from './state';

type MapControllerDependencies = {
  map: google.maps.maps3d.Map3DElement;
  maps3dLib: google.maps.Maps3DLibrary;
  elevationLib: google.maps.ElevationLibrary;
};

/**
 * A controller class to centralize all interactions with the Google Maps 3D element.
 */
export class MapController {
  private map: google.maps.maps3d.Map3DElement;
  private maps3dLib: google.maps.Maps3DLibrary;
  private elevationLib: google.maps.ElevationLibrary;

  constructor(deps: MapControllerDependencies) {
    this.map = deps.map;
    this.maps3dLib = deps.maps3dLib;
    this.elevationLib = deps.elevationLib;
  }

  /**
   * Clears all child elements (like markers) from the map.
   */
  clearMap() {
    this.map.innerHTML = '';
  }

  /**
   * Adds a list of markers to the map.
   * @param markers - An array of marker data to be rendered.
   */
  addMarkers(markers: MapMarker[]) {
    const seenMarkers = new Set<string>();

    for (const markerData of markers) {
      const placeKey = markerData.placeId ? markerData.placeId.replace('places/', '').trim() : '';
      const coordKey = `${markerData.position.lat.toFixed(4)},${markerData.position.lng.toFixed(4)}`;
      const labelKey = markerData.label.toLowerCase().trim();

      if (placeKey && seenMarkers.has(`place:${placeKey}`)) continue;
      if (seenMarkers.has(`coord:${coordKey}`) && seenMarkers.has(`label:${labelKey}`)) continue;

      if (placeKey) seenMarkers.add(`place:${placeKey}`);
      seenMarkers.add(`coord:${coordKey}`);
      seenMarkers.add(`label:${labelKey}`);

      const marker = new this.maps3dLib.Marker3DInteractiveElement({
        position: markerData.position,
        altitudeMode: 'RELATIVE_TO_MESH',
        label: markerData.showLabel ? markerData.label : null,
        title: markerData.label,
        drawsWhenOccluded: true,
        collisionBehavior: (google.maps as any).CollisionBehavior?.REQUIRED_AND_HIDES_OPTIONAL || 'REQUIRED_AND_HIDES_OPTIONAL',
      });
      
      try {
        marker.addEventListener('gmp-click', () => {
          if (markerData.placeId) {
            useMapStore.getState().setHighlightedPlaceId(markerData.placeId);
          }
        });
      } catch (err) {
        console.error('Error attaching gmp-click to Marker3DInteractiveElement:', err);
      }

      this.map.appendChild(marker);
    }
  }

  /**
   * Adds a 3D Polyline route to the map.
   * @param path - An array of LatLngAltitudeLiteral points representing the route.
   */
  addRoutePolyline(path: any[]) {
    const maps3d = this.maps3dLib as any;
    if (maps3d && maps3d.Polyline3DElement) {
      const polyline = new maps3d.Polyline3DElement({
        path: path,
        strokeColor: '#1F94FF',
        strokeWidth: 8,
        altitudeMode: 'RELATIVE_TO_GROUND'
      });
      this.map.appendChild(polyline);
    } else {
      console.warn('Polyline3DElement is not available in maps3d library.');
    }
  }

  /**
   * Animate the camera to a specific set of camera properties.
   * @param cameraProps - The target camera position, range, tilt, etc.
   */
  flyTo(cameraProps: Map3DCameraProps) {
    // Read the current live camera attributes from the map to pan with ZERO zooming
    const liveMap = this.map as any;
    const currentRange = typeof cameraProps.range === 'number' ? cameraProps.range : (liveMap.range !== undefined ? liveMap.range : 3000);
    const currentTilt = typeof cameraProps.tilt === 'number' ? cameraProps.tilt : (liveMap.tilt !== undefined ? liveMap.tilt : 20);
    const currentHeading = typeof cameraProps.heading === 'number' ? cameraProps.heading : (liveMap.heading !== undefined ? liveMap.heading : 0);
    const currentRoll = typeof cameraProps.roll === 'number' ? cameraProps.roll : (liveMap.roll !== undefined ? liveMap.roll : 0);
    const currentAltitude = liveMap.center?.altitude !== undefined ? liveMap.center.altitude : 1000;

    this.map.flyCameraTo({
      durationMillis: 2000, // Make panning faster and smoother
      endCamera: {
        center: {
          lat: cameraProps.center.lat,
          lng: cameraProps.center.lng,
          altitude: cameraProps.center.altitude ?? currentAltitude,
        },
        range: currentRange,
        tilt: currentTilt,
        heading: currentHeading,
        roll: currentRoll,
      },
    });
  }

  /**
   * Calculates the optimal camera view to frame a set of entities and animates to it.
   * @param entities - An array of entities to frame (must have a `position` property).
   * @param padding - The padding to apply around the entities.
   */
  async frameEntities(
    entities: { position: { lat: number; lng: number } }[],
    padding: [number, number, number, number],
  ) {
    if (entities.length === 0) return;

    const elevator = new this.elevationLib.ElevationService();
    const cameraProps = await lookAtWithPadding(
      entities.map(e => e.position),
      elevator,
      0, // heading
      padding,
    );

    this.flyTo({
      center: {
        lat: cameraProps.lat,
        lng: cameraProps.lng,
        altitude: cameraProps.altitude,
      },
      range: cameraProps.range * 1.15, // Scale range for safety buffer
      heading: cameraProps.heading,
      tilt: cameraProps.tilt,
      roll: 0,
    });
  }
}