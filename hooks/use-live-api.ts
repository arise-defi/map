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


import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient } from '../lib/genai-live-client';
import { LiveConnectConfig, LiveServerToolCall } from '@google/genai';
import { AudioStreamer } from '../lib/audio-streamer';
import { audioContext } from '../lib/utils';
import VolMeterWorket from '../lib/worklets/vol-meter';
import { useLogStore, useMapStore, useSettings, useGroundingLogStore } from '@/lib/state';
import { GenerateContentResponse, GroundingChunk } from '@google/genai';
import { ToolContext, toolRegistry } from '@/lib/tools/tool-registry';


export type UseLiveApiResults = {
 client: GenAILiveClient;
 setConfig: (config: LiveConnectConfig) => void;
 config: LiveConnectConfig;
 audioStreamer: MutableRefObject<AudioStreamer | null>;


 connect: () => Promise<void>;
 disconnect: () => void;
 connected: boolean;


 volume: number;
 heldGroundingChunks: GroundingChunk[] | undefined;
 clearHeldGroundingChunks: () => void;
 heldGroundedResponse: GenerateContentResponse | undefined;
 clearHeldGroundedResponse: () => void;
};


export function useLiveApi({
 apiKey,
 map,
 placesLib,
 elevationLib,
 geocoder,
 padding,
}: {
 apiKey: string;
 map: google.maps.maps3d.Map3DElement | null;
 placesLib: google.maps.PlacesLibrary | null;
 elevationLib: google.maps.ElevationLibrary | null;
 geocoder: google.maps.Geocoder | null;
 padding: [number, number, number, number];
}): UseLiveApiResults {
 const { model } = useSettings();
 const client = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);


 const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const pendingInputQueue = useRef<string[]>([]);


 const [volume, setVolume] = useState(0);
 const [connected, setConnected] = useState(false);
 const [streamerReady, setStreamerReady] = useState(false);
 const [config, setConfig] = useState<LiveConnectConfig>({});
 const [heldGroundingChunks, setHeldGroundingChunks] = useState<
    GroundingChunk[] | undefined
  >(undefined);
 const [heldGroundedResponse, setHeldGroundedResponse] = useState<
    GenerateContentResponse | undefined
  >(undefined);

  const clearHeldGroundingChunks = useCallback(() => {
    setHeldGroundingChunks(undefined);
  }, []);

 const clearHeldGroundedResponse = useCallback(() => {
    setHeldGroundedResponse(undefined);
  }, []);

 // register audio for streaming server -> speakers
 useEffect(() => {
   if (!audioStreamerRef.current) {
     audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
       audioStreamerRef.current = new AudioStreamer(audioCtx);
       setStreamerReady(true);
       audioStreamerRef.current
         .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
           setVolume(ev.data.volume);
         })
         .catch(err => {
           console.error('Error adding worklet:', err);
         });
     });
   }
 }, []);

  // Main Event Handlers
 useEffect(() => {
   const onOpen = () => {
     setConnected(true);
   };

   const onSetupComplete = () => {
     client.sendRealtimeText('hello');
   };

   const onClose = (event: CloseEvent) => {
     setConnected(false);
     stopAudioStreamer();
     let reason = "Session ended. Press 'Play' to start a new session. "+ event.reason;
     useLogStore.getState().addTurn({
         role: 'agent',
         text: reason,
         isFinal: true,
       });
   };

   const stopAudioStreamer = () => {
     if (audioStreamerRef.current) {
       audioStreamerRef.current.stop();
     }
   };

   const onInterrupted = () => {
    stopAudioStreamer();
    const { updateLastTurn, turns } = useLogStore.getState();
    const lastTurn = turns[turns.length - 1];
    if (lastTurn && !lastTurn.isFinal) {
      updateLastTurn({ isFinal: true });
    }
   };

   const onAudio = (data: ArrayBuffer) => {
     if (audioStreamerRef.current) {
       audioStreamerRef.current.addPCM16(new Uint8Array(data));
     }
   };
   
   const onGenerationComplete = () => {
   };

   const onToolCall = async (toolCall: LiveServerToolCall) => {
     const { setIsAwaitingFunctionResponse } = useLogStore.getState();
     setIsAwaitingFunctionResponse(true, 'batch');

     try {
       const functionResponses: any[] = [];
       const toolContext: ToolContext = {
         map,
         placesLib,
         elevationLib,
         geocoder,
         padding,
         setHeldGroundedResponse,
         setHeldGroundingChunks,
       };

       for (const fc of toolCall.functionCalls) {
         setIsAwaitingFunctionResponse(true, fc.name);
         useLogStore.getState().mergeIntoLastAgentTurn({
           actualToolCalls: [{ name: fc.name, args: fc.args }]
         });
         useLogStore.getState().addTurn({
           role: 'system',
           text: `Triggering tool: ${fc.name}(${JSON.stringify(fc.args)})`,
           isFinal: true,
         });

         let toolResponse: GenerateContentResponse | string | object = 'ok';
         try {
           const toolImplementation = toolRegistry[fc.name];
           if (toolImplementation) {
             toolResponse = await toolImplementation(fc.args, toolContext);
           } else {
             toolResponse = `Unknown tool called: ${fc.name}.`;
             console.warn(toolResponse);
           }

           functionResponses.push({
             id: fc.id,
             name: fc.name,
             response: { result: toolResponse },
           });
         } catch (error) {
            const errorMessage = `Error executing tool ${fc.name}: ${error instanceof Error ? error.message : String(error)}`;
            console.error(error);
            useLogStore.getState().addTurn({
              role: 'system',
              text: errorMessage,
              isFinal: true,
            });
            functionResponses.push({
              id: fc.id,
              name: fc.name,
              response: { result: errorMessage },
            });
          }
       }

       if (functionResponses.length > 0) {
         const responseMessage = `Function call response:\n\`\`\`json\n${JSON.stringify(
           functionResponses,
           null,
           2,
         )}\n\`\`\``;
         useLogStore.getState().addTurn({
           role: 'system',
           text: responseMessage,
           isFinal: true,
         });
       }

       client.sendToolResponse({ functionResponses: functionResponses });

       // DRAIN QUEUE: Send any user input that was buffered during the tool call
       if (pendingInputQueue.current.length > 0) {

         pendingInputQueue.current.forEach(text => {
           client.sendRealtimeText(text);
         });
         pendingInputQueue.current = [];
       }

     } finally {
       useLogStore.getState().setIsAwaitingFunctionResponse(false);
     }
   };

   // Bind event listeners
   client.on('open', onOpen);
   client.on('setupcomplete', onSetupComplete);
   client.on('close', onClose);
   client.on('interrupted', onInterrupted);
   client.on('audio', onAudio);
   client.on('toolcall', onToolCall);
   client.on('generationcomplete', onGenerationComplete);

   return () => {
     // Clean up event listeners
     client.off('open', onOpen);
     client.off('setupcomplete', onSetupComplete);
     client.off('close', onClose);
     client.off('interrupted', onInterrupted);
     client.off('audio', onAudio);
     client.off('toolcall', onToolCall);
     client.off('generationcomplete', onGenerationComplete);
   };
 }, [client, map, placesLib, elevationLib, geocoder, padding, setHeldGroundedResponse, setHeldGroundingChunks]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }
     useLogStore.getState().clearTurns();
     useMapStore.getState().clearMarkers();
     useMapStore.getState().setRoutePolyline(null);
     useGroundingLogStore.getState().clearLogs();
    client.disconnect();
    if (audioStreamerRef.current) {
      await audioStreamerRef.current.resume();
    }
    await client.connect(config);
  }, [client, config]);

 const disconnect = useCallback(async () => {
   client.disconnect();
   setConnected(false);
 }, [setConnected, client]);

  // WRAP: Smart send that buffers if busy
  const sendRealtimeTextBuffered = useCallback((text: string) => {
    const { isAwaitingFunctionResponse } = useLogStore.getState();
    if (isAwaitingFunctionResponse) {
      pendingInputQueue.current.push(text);
      useLogStore.getState().addTurn({
        role: 'user',
        text: `(Buffered) ${text}`,
        isFinal: true
      });
    } else {
      client.sendRealtimeText(text);
    }
  }, [client]);

  // Use a Proxy to wrap the client without losing prototype methods or causing recursion
  const smartClient = useMemo(() => {
    return new Proxy(client, {
      get(target, prop, receiver) {
        if (prop === 'sendRealtimeText') {
          return sendRealtimeTextBuffered;
        }
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }
    });
  }, [client, sendRealtimeTextBuffered]);

  // Heartbeat to prevent idle timeout disconnects
  useEffect(() => {
    if (!connected) return;

    const interval = setInterval(() => {
      const rawWs = (client as any).session?.conn;
      if (rawWs && rawWs.readyState === WebSocket.OPEN) {
        try {
          rawWs.send(JSON.stringify({ clientContent: { turnComplete: false } }));
        } catch (err) {
          console.warn('Failed to send WebSocket heartbeat:', err);
        }
      }
    }, 30000); // 30 seconds heartbeat

    return () => clearInterval(interval);
  }, [connected, client]);

  return {
    client: smartClient as any,
    config,
    setConfig,
    connect,
    connected,
    disconnect,
    volume,
    heldGroundingChunks,
    clearHeldGroundingChunks,
    heldGroundedResponse,
    clearHeldGroundedResponse,
    audioStreamer: audioStreamerRef,
  };
}