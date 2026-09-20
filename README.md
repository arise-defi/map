# Introduction

This sample app is for illustration only. It uses both Gemini (including Grounding with Google Maps) and Google Maps Platform services.  It is your responsibility to review the relevant Terms of Service applicable to your region, and you must confirm that your integration will comply with those terms.  This sample app may show products or functionality that are not available in your region under the Terms of Service for that region.

# Setting Up Your Google Maps API Key

**IMPORTANT:** This demo uses several Google Maps Platform APIs to function correctly. The API key included in the sample code is for demonstration purposes only and is subject to restrictive quotas that may cause the application to fail. To ensure a stable experience and to explore the full capabilities of the application, you **must obtain and use your own API key**.

### 1. Get Your API Key

Follow the instructions in the official documentation to create a new API key. You will need a Google Cloud project with billing enabled.

**[Get an API Key](https://developers.google.com/maps/documentation/javascript/get-api-key)**

### 2. Enable Required APIs

In your Google Cloud project's dashboard, navigate to the "APIs & Services" section and enable the following APIs:

*   **Geocoding API**: Converts addresses into geographic coordinates.
*   **Places API (New)**: Fetches detailed information about points of interest.
*   **Maps Elevation API**: Gets altitude data for 3D map views.
*   **Maps Grounding API**: Allows the Gemini model to access real-time Maps data.
*   **Maps JavaScript API**: Loads and displays the map.

### 3. Configure the API Key in the Application

Once you have your key, replace the placeholder key in the code.

1.  Open the file `App.tsx`.
2.  Find the `<APIProvider>` component.
3.  Replace the value of the `apiKey` prop with your own key.

This application requires **two distinct API keys** to function correctly due to service-level restrictions. Using a single key for both will result in 403 Forbidden errors.

### 1. The "Agent" (Gemini / Generative AI)
**Variable:** `VITE_GEMINI_API_KEY`
*   **Purpose**: Manages the Gemini Live sessions and the "Maps Grounding" tool's logic.
*   **Source**: [Google AI Studio](https://aistudio.google.com/) or Cloud Console.
*   **Requirements**: Must have the **Generative Language API** enabled.

### 2. The "Frontend" (Google Maps)
**Variable:** `VITE_GOOGLE_MAPS_API_KEY`
*   **Purpose**: Renders the 3D map, marker placement, and interactive UI widgets.
*   **Source**: [Google Cloud Console](https://console.cloud.google.com/).
*   **Requirements**: Must have **Maps JavaScript API**, **Places API**, and **Elevation API** enabled.

Create a `.env` file in the root directory:
```bash
# Agent (Gemini)
VITE_GEMINI_API_KEY=YOUR_GEMINI_KEY
# Frontend (Maps)
VITE_GOOGLE_MAPS_API_KEY=YOUR_MAPS_KEY

VITE_ENABLE_AUTOPILOT=true
```

> Failure to use your own key may result in the map failing to load or grounding features being unavailable due to quota limits on the shared demo key.

# Grounding Configuration (Gemini Enterprise vs Gemini API)

The application supports grounding using two different backends, which can be dynamically configured in the **Settings** sidebar (gear/tune icon):

### 1. Gemini Enterprise - Default
*   **Availability**: Automatically enabled out of the box.
*   **Authentication & Proxying (`server.js`)**: Runs securely through our local backend proxy (`server.js:L48-L65`), which automatically handles IAM OAuth 2.0 Bearer token authentication (`GoogleAuth` via Application Default Credentials) and regionalized `aiplatform.googleapis.com` REST endpoint construction using your `GCP_PROJECT_ID` and `GCP_LOCATION`.
*   **Custom Client-Side Override**: If developers prefer to supply credentials directly in the browser, toggle **Custom GCP Credentials** in the **Settings** sidebar to provide a custom `projectId`, `location`, and OAuth `accessToken`.
*   **Capabilities**:
    *   **Places Grounding**: Fetches place details, ratings, reviews, and interactive place cards (`[search_nearby]` / `[search_along_route]`).
    *   **Routing Grounding (`[find_directions](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-google-maps#routing-find-directions)`)**: Resolves driving directions and navigation itineraries with real-time distance, duration, and encoded polylines (`encodedPolyline`). The frontend dynamically extracts, decodes (`decodePolyline`), and renders native 3D route paths directly on the globe via `Polyline3DElement`.
    *   **Exact Place ID Coordinate Substitution**: When exploring nearby places around an active venue (`"parks near The Parthenon"`), the frontend extracts the venue's exact `lat, lng` from its `placeId` marker and substitutes those physical coordinates (`"parks near 37.788740, -122.408720"`) into the prompt. This eliminates text-keyword overindexing on distant namesake national monuments (such as Centennial Park in Tennessee).
    *   **Venue Review & Details Preservation**: For queries asking about a venue's details or reviews (`"reviews for The Parthenon"`), the engine binds exact `retrievalConfig.latLng` location bias while preserving the venue's physical name, ensuring accurate review retrieval without address-lookup errors.
    *   **Intelligent Outlier Filtering**: Automatically enforces strict neighborhood distance bounding (`~15 km` for local queries, `~150 km` for route corridors) inside `fetchPlaceDetailsFromChunks` to discard distant false-positive matches and prevent wide continent-level camera zooming.
*   **Models**: Supports `gemini-2.5-pro` (recommended), `gemini-2.5-flash`, etc. You can also specify any custom model identifier.

### 2. Gemini API (AI Studio)
*   **Credentials**: Uses your developer `VITE_GEMINI_API_KEY` configured in your `.env` file or supplied in the settings sidebar.
*   **Capabilities**:
    *   **Places Grounding**: Supports full places search, POI discovery, and place details.
    *   **Routing Grounding**: Not supported natively under AI Studio's public Maps Grounding preview.
*   **Models**: Supports `gemini-3.5-flash` (default), `gemini-3.5-pro`, `gemini-3.1-flash`, `gemini-3.1-pro`, etc. You can also enter custom model names.

# Application Architecture: Interactive Day Planner

This document outlines the architecture of the Interactive Day Planner, a web application built with React that showcases a real-time, voice-driven conversational experience using the Gemini API, grounded with data from Google Maps and visualized on a Photorealistic 3D Map.

## 1. Overall Structure & Core Technologies

The application is a **React-based Single Page Application (SPA)**. The architecture is modular, separating concerns into distinct components, hooks, contexts, and utility libraries.

-   **`index.html` & `index.tsx`**: The entry point of the application. It uses an `importmap` to manage modern JavaScript modules and renders the main `App` component into the DOM.
-   **`App.tsx`**: The root component that orchestrates the entire user experience. It initializes context providers, defines the default Chicago initial camera (`INITIAL_VIEW_PROPS`), and manages the reactive state for map markers, 3D route polylines, and camera framing.
-   **`/components`**: Contains all the reusable React components that make up the UI, such as the `ControlTray` for user input, the `StreamingConsole` for displaying the conversation, `PlaceDetails` for venue reviews/attributes, and the `Sidebar` for configuration.
-   **`/contexts`**: Uses React's Context API to provide global state and functionality. The `LiveAPIContext` is crucial, making the Gemini Live session available throughout the app.
-   **`/hooks`**: Home to custom React hooks, with `use-live-api.ts` being the most significant. This hook encapsulates the logic for managing the connection to the Gemini Live API.
-   **`/lib`**: A collection of client-side libraries and helper functions. This includes `tool-registry.ts` (handling `mapsGrounding`, spatial coordinate substitution, and polyline extraction), `map-controller.ts` (`gmp-map-3d` wrapper), `genai-live-client.ts`, and state management (Zustand).
-   **State Management**: The app uses **Zustand**, a lightweight state management library, to handle global UI state, conversation logs, route polylines, active markers, and settings (`lib/state.ts`).

## 2. Codebase Tour

## 🤖 Developer Autopilot

The application includes an **Autopilot** feature (robot icon in the top navigation) designed to help developers test tool-adherence and conversational flow consistency without manual typing.

### Configuration
You can customize the Autopilot behavior in `lib/autopilot-config.ts`. Here, you can define:
- **Scenarios**: An array of `ScenarioStep` objects containing text to send and which tool/role to wait for.
- **Enabled State**: The visibility of the robot icon is controlled by:
  ```bash
  VITE_ENABLE_AUTOPILOT=true
  ```
  *(Defaults to `true` in development mode and `false` in production).*

### Usage
1. Select a **Scenario** from the dropdown next to the robot icon (e.g., SF: Itinerary, SF: Cuisine, Chicago).
2. Click the **Robot Icon** in the top-right console header to start.
3. The agent will automatically progress through the defined steps.
4. Use the **Skip Arrow** in the overlay to force the next step if the model deviates from the expected tool call.

## 📊 Evaluations & Benchmarking

The application provides a built-in framework for evaluating the performance and reliability of the Gemini Live agent, specifically designed for validating **Autopilot** scenario adherence.

### Automated Evals (Autopilot Mode)
When running the **Autopilot**, the agent's performance is automatically scored against its scenario.
- **Pass/Fail**: Each step is marked as `pass` if the model correctly triggers the `expectedTool`.
- **Scorecard**: A summary is logged in the console upon completion.

### Offline Benchmarking (Scenario Validation)
You can perform detailed analysis by exporting session logs and running the standalone evaluator. 

**IMPORTANT:** The evaluator is optimized for **Autopilot Scenario Validation Mode**. It relies on `expectedTool` tags embedded in the log during an automated run. If run against a manual log, it will explicitly warn you.

1. **Export Logs**: Click **Export Logs** in Settings after an Autopilot run.
2. **Run Evaluator**:
   ```bash
   npx tsx scripts/evaluator.ts path/to/exported-log.json
   ```
3. **Metrics Captured**:
   - **Mode Indicator**: Explicitly states if the log is being validated against a scenario.
   - **Scenario Adherence**: Percentage of steps where the model called the correct tool.
   - **Argument Precision**: Verification of critical arguments (e.g., `enableWidget: true`).
   - **Actionability**: A 100% score indicates the model perfectly follows the "Golden Path".

### Troubleshooting
If the model fails a step:
1.  Check `lib/constants.ts` (System Instructions) for missing rules.
2.  Use the autopilot's **Skip Arrow** to skip a stuck step.
3.  Check `lib/state.ts` to ensure widget tokens aren't being overwritten.

---

To help you navigate the project, here’s a tour of the most important files and directories:

-   **`App.tsx`**: The main application component. It acts as the primary view controller, orchestrating the layout of all UI components and, most importantly, reacting to global state changes (for markers, routes, and camera targets) to update the 3D map via the `MapController`. It's the central hub that wires everything together.
-   **`hooks/use-live-api.ts`**: The heart of the Gemini Live integration. This custom hook encapsulates all the logic for connecting to the Gemini Live API, managing the session, and handling real-time events like incoming audio, transcriptions, and tool call requests from the model.
-   **`lib/genai-live-client.ts`**: A low-level wrapper around the `@google/genai` SDK. This class simplifies the connection lifecycle and uses an event-emitter pattern to broadcast server messages, providing a clean interface for the `use-live-api` hook to consume.
-   **`lib/tools/tool-registry.ts`**: This is where the application's function-calling capabilities are defined and implemented. It contains the logic for tools like `mapsGrounding` (for searching and discovering places), `frameEstablishingShot` (for wide, establishing views of a city), and the versatile `frameLocations` tool (for displaying specific, known points of interest). These tools are invoked by the Gemini model to interact with Google Maps and update the application's state.
-   **`lib/map-controller.ts`**: An abstraction layer for all interactions with the Photorealistic 3D Map. This class provides a clean, imperative API (e.g., `addMarkers`, `flyTo`, `frameEntities`) that decouples the rest of the application from the specific implementation details of the `<gmp-map-3d>` web component.

### Advanced Concepts

For developers looking for a deeper dive, the following files and methods use advanced syntax or architectural patterns that are worth studying:

-   **`hooks/use-live-api.ts` - The `onToolCall` Handler**
    -   **Concept:** This asynchronous function is the central dispatcher for all function calls requested by the Gemini model.
    -   **Why it's advanced:** It orchestrates multiple complex operations: managing UI loading states (`isAwaitingFunctionResponse`), dynamically looking up and executing functions from the `toolRegistry`, passing a shared `toolContext` object to decouple tools from the UI, and packaging results to send back to the API. This demonstrates a sophisticated event-driven, function-calling pattern.

-   **`lib/tools/tool-registry.ts` - The `mapsGrounding` Implementation**
    -   **Concept:** This function is a self-contained "tool" that the AI can use. It handles a user query, gets grounded data from Google Maps, and updates the application's state.
    -   **Why it's advanced:** It showcases a complex asynchronous workflow. It makes an initial API call to get grounding data, processes that data to extract Place IDs, makes a *second* set of parallel API calls to the Places library to get location details, and finally updates a global Zustand store (`useMapStore`). This multi-step process that interacts with multiple services and updates state from outside the React component tree is a powerful pattern.

-   **`lib/look-at.ts` - The `lookAtWithPadding` Function**
    -   **Concept:** This utility calculates the precise camera position (`center`, `range`, `tilt`) needed to frame a set of geographic points within the map's visible area, accounting for UI elements that cover parts of the screen.
    -   **Why it's advanced:** The implementation involves non-trivial mathematics, including trigonometric calculations (sine, cosine, tangent) and geometric transformations to convert screen-space UI padding into a geographical camera offset. The logic also accounts for the camera's heading, requiring it to rotate the offset vector, which adds another layer of complexity.

-   **`lib/audio-streamer.ts` - The `scheduleNextBuffer` Method**
    -   **Concept:** This method manages the seamless playback of incoming raw audio chunks from the Gemini API.
    -   **Why it's advanced:** It uses the low-level Web Audio API, which is inherently complex. The method manually manages a queue of audio buffers, calculates precise scheduling times (`scheduledTime`) to avoid gaps or overlaps in playback, and uses timers (`setTimeout`) to ensure the queue is processed efficiently without blocking the main thread.

-   **The `components/map-3d/` Directory**
    -   **Concept:** This set of files creates a robust React component wrapper around the `<gmp-map-3d>` web component.
    -   **Why it's advanced:** It combines several advanced React and TypeScript features:
        -   **Type Augmentation (`map-3d-types.ts`):** It uses TypeScript's `declare module` to add type definitions for the experimental Maps 3D library directly to the `@vis.gl/react-google-maps` package, a technique known as declaration merging.
        -   **Ref Forwarding (`map-3d.tsx`):** It uses `forwardRef` and `useImperativeHandle` to give parent components controlled access to the underlying web component's DOM element and its methods.
        -   **Microtask Batching (`use-map-3d-camera-events.ts`):** It uses `queueMicrotask` to batch multiple camera change events that fire in quick succession into a single state update, which is a sophisticated performance optimization technique.

## 3. Key Concepts Explained

This application brings together several powerful technologies. Here’s a brief overview of each:

-   **Gemini Live API**: This is the core technology for the real-time, bidirectional voice conversation. It processes streams of audio input from the user's microphone and returns human-like spoken audio responses from the model, creating a natural conversational experience. The primary integration point is the **`hooks/use-live-api.ts`** file.
-   **Maps Grounding**: This feature allows the Gemini model to access Google Maps' vast, real-time information to provide accurate and relevant answers to location-based questions. When the model needs information about a place, it invokes the **`mapsGrounding`** tool (implemented in **`lib/tools/tool-registry.ts`**), which makes a grounded call to the Gemini API and processes the results.
-   **`@vis.gl/react-google-maps`**: This library simplifies the integration of Google Maps into a React application. It provides the **`<APIProvider>`** component, which handles loading the Google Maps JavaScript API, and the **`useMapsLibrary`** hook, which allows components to safely access specific Maps libraries (like `places` or `maps3d`) only after they are loaded and ready.
-   **Photorealistic 3D Maps**: The immersive map view is powered by the **`<gmp-map-3d>`** web component, an experimental feature of the Google Maps JavaScript API. To make it easier to use in a declarative React environment, a custom wrapper component is provided in **`components/map-3d/`**.

## 4. Gemini Live API Integration

The core of the conversational experience is powered by the Gemini Live API, which enables real-time, low-latency, bidirectional audio streaming.

-   **Connection Management**: The `GenAILiveClient` class (`lib/genai-live-client.ts`) is a custom wrapper around the `@google/genai` SDK. It simplifies the connection lifecycle and uses an event-emitter pattern to broadcast server messages (e.g., `open`, `close`, `audio`, `toolcall`, `inputTranscription`).
-   **`useLiveApi` Hook**: This hook (`hooks/use-live-api.ts`) manages the instance of `GenAILiveClient`. It exposes functions to `connect` and `disconnect` and handles incoming events from the API. Crucially, it contains the `onToolCall` handler that processes function call requests from the model.
-   **Audio Handling**:
    -   **Input**: The `AudioRecorder` class (`lib/audio-recorder.ts`) captures microphone input, processes it using an `AudioWorklet`, and sends PCM audio data to the Gemini Live API via the `sendRealtimeInput` method.
    -   **Output**: The `AudioStreamer` class (`lib/audio-streamer.ts`) receives PCM audio data from the API, queues it, and plays it back seamlessly using the Web Audio API, providing the AI's voice response.
-   **Real-time Transcription**: The application listens for `inputTranscription` and `outputTranscription` events to display the conversation text in the `StreamingConsole` component as it happens, including interim results for a more responsive feel.

## 5. Grounding with Google Maps

To provide accurate, real-world information, the application uses Gemini's ability to ground its responses with Google Maps data (`places` and `routing`).

-   **Tool-Based Invocation**: The model is configured with a `mapsGrounding` tool definition. When the user asks a question that requires location-based information (e.g., "Find some good pizza places in Chicago"), the Gemini model intelligently decides to call this function.
-   **Tool Call Handling**: The `onToolCall` handler in the `useLiveApi` hook intercepts this request. It calls `tool-registry.ts:mapsGrounding`, which makes a *separate* REST request to the Gemini API (`fetchMapsGroundedResponseREST`), explicitly invoking Google Maps Grounding (`googleMaps`).
-   **Spatial Coordinate Substitution (`tool-registry.ts`)**: To prevent text-keyword overindexing on distant namesake national monuments during local queries (`"parks near The Parthenon"`), our code extracts the exact `lat, lng` from the active marker (`placeId`) and substitutes those exact physical coordinates (`"parks near 37.788740, -122.408720"`) into the prompt. Conversely, for venue details or reviews queries (`"reviews for The Parthenon"`), our code binds `retrievalConfig.latLng` for exact spatial location bias while preserving the venue's name in the prompt string.
-   **Data Processing & Outlier Filtering**: The response from this grounding call is a `GenerateContentResponse` containing structured `groundingMetadata`. The implementation extracts place IDs and route polylines. When converting `groundingChunks` into map markers, `fetchPlaceDetailsFromChunks` enforces intelligent distance bounds (`~15 km` for local queries, `~150 km` for route corridors) to discard false-positive distant landmarks and keep the camera focused on your target city.
-   **UI & 3D Route Updates**: Once place details (coordinates and display names) or route corridors are resolved, the application updates its Zustand state (`useMapStore`), causing interactive 3D markers and native 3D polylines (`Polyline3DElement`) to render directly on the Photorealistic 3D Map.

## 6. Google Maps Photorealistic 3D Maps

The visual centerpiece of the application is the Photorealistic 3D Map (`<gmp-map-3d>`), which provides an immersive and detailed view of the locations and itineraries being discussed.

-   **Web Component Integration**: The map is implemented using the `<gmp-map-3d>` web component, part of the Google Maps JavaScript API's alpha channel.
-   **React Wrapper**: A custom React component, `Map3D` (`components/map-3d/map-3d.tsx`), wraps the web component, forwarding refs (`MapController`) and managing properties reactively via props.
-   **Native 3D Polylines (`Polyline3DElement`)**: Whenever Google Maps Grounding (`[find_directions]`) returns an encoded polyline for driving directions or walking paths, `MapController` decodes the corridor and renders a native 3D polyline (`gmp-polyline-3d`) clamped directly along the 3D terrain and roads (`altitudeMode: "RELATIVE_TO_GROUND"`).
-   **Camera Control & Reactive Auto-Framing**: The application controls the map's camera in two main ways:
    1.  **Direct Tool Commands**: Tools like `frameEstablishingShot` and `frameLocations` (when called with `markers: false`) directly command the camera (`flyTo`) to smoothly animate to a wide view of a city or region.
    2.  **Reactive State-Driven Framing (`lookAtWithPadding`)**: When `mapsGrounding` or `frameLocations` update the global `markers` and `routePolyline` arrays in `useMapStore`, `App.tsx` reacts by passing those coordinates into `lookAtWithPadding`. This calculates the optimal 3D camera bounds (`center`, `range`, `tilt`, and `heading`) to frame all entities within the visible viewport while accounting for UI sidebars and control overlays.

## 7. `@vis.gl/react-google-maps` Library

This library acts as a foundational layer for integrating Google Maps into the React application.

-   **API Loading**: The `<APIProvider>` component is wrapped around the entire app. It handles the asynchronous loading of the Google Maps JavaScript API script, ensuring all necessary libraries are available before they are used.
-   **Library Access**: The `useMapsLibrary` hook is used extensively to gain access to specific Maps libraries when needed. For instance, `useMapsLibrary('places')` is used to fetch place details and render the `GroundingWidget`, while `useMapsLibrary('maps3d')` is used to interact with the 3D map custom elements. This hook-based approach ensures that components only render after their required map libraries are loaded and ready.

## 8. Making This Demo Your Own

This demo is designed as an interactive sandbox. You can easily customize it to explore different personas, conversational flows, and application logic. Here are two ways to get started.

### Basic Customization: Crafting a New Persona and Use Case

The easiest way to change the demo's behavior is by editing the **system instructions**. The AI's personality, goals, and conversational flow are all defined in this prompt. You can edit it live in the **Settings** sidebar or more permanantely in the `lib/constants.ts` file. 

A great example of this is the hidden **"Scavenger Hunt"** persona. By rapidly clicking the settings icon six times, you activate a completely different system prompt (`SCAVENGER_HUNT_PROMPT` in `lib/constants.ts`). This prompt transforms the helpful itinerary planner into a playful game master named "ClueMaster Cory." It uses the **exact same tools** but in a creative new way to create a totally different user experience, guiding the user through a series of riddles to find famous landmarks.

Try crafting your own persona! You could create a formal hotel concierge, a laid-back local guide, or a historical expert.

### Advanced Customization: Adding New Tools and Logic

For more significant changes, you can define entirely new tools and write a system prompt that tells the AI how to use them. This lets you build completely new application behaviors. Tools are defined in `lib/tools/itinerary-planner.ts`, and their implementations (the code that actually runs) are in `lib/tools/tool-registry.ts`.

Here are a couple of sample prompts to get you started on creating a simple "City Explorer" experience:

1.  **Prompt to modify an existing tool:**

    > "I want to add a new feature to the `frameLocations` tool. It should accept an optional `zoomLevel` parameter, which can be 'close', 'medium', or 'far'. This will adjust the camera's `range` accordingly. Please update the tool's definition in `lib/tools/itinerary-planner.ts` and its implementation in `lib/tools/tool-registry.ts`."

2.  **Prompt to create a new system instruction that uses the new feature:**

    > "Now, create a new system instruction for a 'City Explorer' persona. This persona should ask the user for a few places they want to see. Then, it MUST use the `frameLocations` tool to show all places on the map. It should then ask the user if they want a closer look and use the new `zoomLevel` parameter if they say yes."