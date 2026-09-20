# Changelog
Track of modifications and new feature implementation on branch `routing-sar`.

## [2026-05-29]
### Added
- **Maps Grounding Routing Capabilities**: Support for finding and displaying 3D polyline routes from origin to destination.
- **Zustand Store Updates**: Added `routePolyline` and `setRoutePolyline` actions to `useMapStore` to coordinate route paths.
- **Maps 3D Polyline Renderer**: Integrated `<gmp-polyline-3d>` support through safe `React.createElement` directives on `App.tsx` and forward-declared React children for the 3D canvas.
- **DirectionsService Integration**: Migrated to modern REST Routes API V2 and implemented an imperative `addRoutePolyline` method natively within the `MapController` implementation to coordinate the 3D Polyline renderer seamlessly alongside standard marker rendering.
- **Autopilot Additions**: Registered a new "Paris to Lyon" routing scenario to support automated end-to-end traversal testing.
- **Polyline3D Fix**: Removed the unsupported `drawsWhenOccluded` property parameter from the `Polyline3DElement` constructor options to prevent runtime InvalidValueError crashes.
