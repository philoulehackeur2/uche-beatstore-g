'use client';

import { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface AudioGradientProps {
  analyserNode: AnalyserNode | null;
  /**
   * Accent color from creator_profile or default #D4BFA0
   */
  accentColor?: string;
  className?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [212, 191, 160]; // Default accent #D4BFA0
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

/**
 * AudioGradient — a canvas overlay that reacts to audio frequencies.
 *
 * Renders two layers:
 * 1. A radial gradient centered on the canvas with accent color pulsing on bass
 * 2. A linear gradient (top to bottom) for edge fade, also bass-reactive
 *
 * When analyserNode is null, renders a static fallback gradient matching the
 * store's existing overlay: linear-gradient(to bottom, transparent, #0a0907 80%)
 */
export function AudioGradient({
  analyserNode,
  accentColor = '#D4BFA0',
  className,
}: AudioGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const prefersReducedMotion = useRef(false);

  // Check for reduced motion preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }, []);

  const renderStatic = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Static fallback: linear-gradient(to bottom, transparent, #0a0907 80%)
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.8, 'rgba(10, 9, 7, 0.9)');
    gradient.addColorStop(1, 'rgba(10, 9, 7, 1)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, []);

  const animate = useCallback(() => {
    if (!analyserNode || prefersReducedMotion.current) {
      renderStatic();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize data array if needed
    if (!dataArrayRef.current) {
      dataArrayRef.current = new Uint8Array(analyserNode.frequencyBinCount);
    }

    const dataArray = dataArrayRef.current;
    analyserNode.getByteFrequencyData(dataArray);

    // Compute energy bands (same as DitherShader)
    // Bass: bins 0-10 (low frequencies)
    let bassSum = 0;
    for (let i = 0; i < 10; i++) {
      bassSum += dataArray[i];
    }
    const bassEnergy = bassSum / (10 * 255);

    // Mids: bins 10-100
    let midSum = 0;
    for (let i = 10; i < 100; i++) {
      midSum += dataArray[i];
    }
    const midEnergy = midSum / (90 * 255);

    const { width, height } = canvas;
    const [r, g, b] = hexToRgb(accentColor);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Layer 1: Radial gradient — accent color pulsing on bass
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.sqrt(centerX ** 2 + centerY ** 2);

    const radialGradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      maxRadius
    );

    // Inner color: accent at opacity bassEnergy * 0.6
    const innerOpacity = bassEnergy * 0.6;
    radialGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${innerOpacity})`);
    // Mid ring: transparent
    radialGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    // Outer color: #0a0907 at opacity 0.4 + (1 - midEnergy) * 0.4
    const outerOpacity = 0.4 + (1 - midEnergy) * 0.4;
    radialGradient.addColorStop(1, `rgba(10, 9, 7, ${outerOpacity})`);

    ctx.fillStyle = radialGradient;
    ctx.fillRect(0, 0, width, height);

    // Layer 2: Linear gradient (top-to-bottom) for edge darkening
    const linearGradient = ctx.createLinearGradient(0, 0, 0, height);
    // Top: fully transparent
    linearGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    // Bottom: #0a0907 at opacity 0.7 + bassEnergy * 0.3
    const bottomOpacity = 0.7 + bassEnergy * 0.3;
    linearGradient.addColorStop(1, `rgba(10, 9, 7, ${bottomOpacity})`);

    ctx.fillStyle = linearGradient;
    ctx.fillRect(0, 0, width, height);

    frameRef.current = requestAnimationFrame(animate);
  }, [analyserNode, accentColor, renderStatic]);

  // Handle canvas sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      // Re-render after resize
      if (analyserNode && !prefersReducedMotion.current) {
        // Animation loop will handle it
      } else {
        renderStatic();
      }
    };

    resizeCanvas();

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas.parentElement!);

    return () => observer.disconnect();
  }, [analyserNode, renderStatic]);

  // Start/stop animation based on analyserNode
  useEffect(() => {
    if (analyserNode && !prefersReducedMotion.current) {
      animate();
    } else {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      renderStatic();
    }

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [analyserNode, animate, renderStatic]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 pointer-events-none', className)}
      aria-hidden="true"
    />
  );
}
