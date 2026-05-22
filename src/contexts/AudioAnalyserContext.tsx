'use client';

import { createContext, useContext, useRef, useCallback, useState, useEffect, type ReactNode } from 'react';

interface AudioAnalyserContextValue {
  analyserNode: AnalyserNode | null;
  /**
   * Connect an audio element to the analyser. Returns a cleanup function.
   * Only one element can be connected at a time — calling this replaces any
   * previous connection.
   */
  connectAudioElement: (audioElement: HTMLAudioElement) => () => void;
  /**
   * Connect a WaveSurfer instance to the analyser. Returns a cleanup function.
   * Uses WaveSurfer's internal media element.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectWaveSurfer: (wavesurfer: any) => () => void;
}

const AudioAnalyserContext = createContext<AudioAnalyserContextValue | null>(null);

/**
 * AudioAnalyserProvider — manages a global Web Audio AnalyserNode for
 * audio-reactive visualizations.
 *
 * The provider creates a single AudioContext and AnalyserNode that can be
 * shared across components. Call `connectAudioElement` or `connectWaveSurfer`
 * to route audio through the analyser.
 *
 * The AnalyserNode is exposed via context so components like DitherShader
 * and AudioGradient can read FFT data for visual effects.
 */
export function AudioAnalyserProvider({ children }: { children: ReactNode }) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedElementRef = useRef<HTMLAudioElement | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // Initialize AudioContext lazily (must be triggered by user gesture)
  const ensureContext = useCallback(() => {
    if (audioContextRef.current) {
      // Resume if suspended
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      return audioContextRef.current;
    }

    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);

      // Connect analyser to destination so audio still plays
      analyser.connect(ctx.destination);

      return ctx;
    } catch (err) {
      console.warn('[AudioAnalyser] Failed to create AudioContext:', err);
      return null;
    }
  }, []);

  const disconnectCurrent = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {}
      sourceRef.current = null;
    }
    connectedElementRef.current = null;
  }, []);

  const connectAudioElement = useCallback(
    (audioElement: HTMLAudioElement) => {
      const ctx = ensureContext();
      if (!ctx || !analyserRef.current) {
        return () => {};
      }

      // Don't reconnect the same element
      if (connectedElementRef.current === audioElement && sourceRef.current) {
        return () => disconnectCurrent();
      }

      disconnectCurrent();

      try {
        // Check if this element already has a source node (can only create one per element)
        // We need to track this across re-renders
        const source = ctx.createMediaElementSource(audioElement);
        source.connect(analyserRef.current);
        sourceRef.current = source;
        connectedElementRef.current = audioElement;
      } catch (err) {
        // Element might already have a source — this is expected and fine
        console.warn('[AudioAnalyser] Could not create MediaElementSource:', err);
      }

      return () => disconnectCurrent();
    },
    [ensureContext, disconnectCurrent]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectWaveSurfer = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wavesurfer: any) => {
      if (!wavesurfer) return () => {};

      // WaveSurfer exposes its internal audio element
      const media = wavesurfer.mediaElement ?? wavesurfer.audio ?? wavesurfer.getMediaElement?.();
      if (!media) {
        console.warn('[AudioAnalyser] Could not find WaveSurfer media element');
        return () => {};
      }

      return connectAudioElement(media);
    },
    [connectAudioElement]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectCurrent();
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
      }
    };
  }, [disconnectCurrent]);

  return (
    <AudioAnalyserContext.Provider
      value={{
        analyserNode,
        connectAudioElement,
        connectWaveSurfer,
      }}
    >
      {children}
    </AudioAnalyserContext.Provider>
  );
}

export function useAudioAnalyser() {
  const ctx = useContext(AudioAnalyserContext);
  if (!ctx) {
    // Return a stub when outside provider — allows components to work
    // without the provider (they just won't have audio reactivity)
    return {
      analyserNode: null,
      connectAudioElement: () => () => {},
      connectWaveSurfer: () => () => {},
    };
  }
  return ctx;
}
