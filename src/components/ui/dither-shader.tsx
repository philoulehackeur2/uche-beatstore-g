'use client';

import { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

/**
 * Dither mode types for different visual algorithms
 */
export type DitherMode = 'bayer' | 'halftone' | 'noise' | 'crosshatch';
export type ColorMode = 'original' | 'grayscale' | 'duotone';

export interface DitherShaderProps {
  src: string;
  alt?: string;
  className?: string;
  mode?: DitherMode;
  colorMode?: ColorMode;
  gridSize?: number;
  threshold?: number;
  brightness?: number;
  /**
   * Optional Web Audio AnalyserNode for audio-reactive effects.
   * When provided, the dither parameters will react to audio frequencies:
   * - Bass (0-10 bins) expands grid size
   * - Mids (10-100 bins) shift threshold
   * - Highs (100-255 bins) boost brightness
   */
  analyserNode?: AnalyserNode | null;
  /**
   * Accent color for duotone mode
   */
  duotoneColor?: string;
}

// Bayer dithering matrices
const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER_8X8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [212, 191, 160]; // Default accent #D4BFA0
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

function applyDithering(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: DitherMode,
  colorMode: ColorMode,
  gridSize: number,
  threshold: number,
  brightness: number,
  duotoneColor: string
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const duotoneRgb = hexToRgb(duotoneColor);

  // Clamp values
  const effectiveGridSize = Math.max(2, Math.min(16, Math.round(gridSize)));
  const effectiveThreshold = Math.max(0, Math.min(1, threshold));
  const effectiveBrightness = Math.max(0.5, Math.min(1.5, brightness));

  // Select Bayer matrix based on grid size
  const bayerMatrix = effectiveGridSize <= 2 ? BAYER_2X2 : effectiveGridSize <= 4 ? BAYER_4X4 : BAYER_8X8;
  const matrixSize = bayerMatrix.length;
  const matrixMax = matrixSize * matrixSize;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];

      // Apply brightness
      r = Math.min(255, r * effectiveBrightness);
      g = Math.min(255, g * effectiveBrightness);
      b = Math.min(255, b * effectiveBrightness);

      // Calculate luminance
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      let ditherValue: number;

      switch (mode) {
        case 'bayer': {
          const mx = x % matrixSize;
          const my = y % matrixSize;
          ditherValue = (bayerMatrix[my][mx] / matrixMax) - 0.5 + effectiveThreshold;
          break;
        }
        case 'halftone': {
          // Halftone pattern using distance from cell center
          const cellX = x % effectiveGridSize;
          const cellY = y % effectiveGridSize;
          const centerX = effectiveGridSize / 2;
          const centerY = effectiveGridSize / 2;
          const dist = Math.sqrt((cellX - centerX) ** 2 + (cellY - centerY) ** 2);
          const maxDist = Math.sqrt(2) * effectiveGridSize / 2;
          ditherValue = (dist / maxDist) * (1 - effectiveThreshold) + effectiveThreshold * 0.5;
          break;
        }
        case 'noise': {
          ditherValue = Math.random() * (1 - effectiveThreshold) + effectiveThreshold * 0.5;
          break;
        }
        case 'crosshatch': {
          // Crosshatch pattern
          const hatch1 = ((x + y) % effectiveGridSize) / effectiveGridSize;
          const hatch2 = ((x - y + effectiveGridSize * 100) % effectiveGridSize) / effectiveGridSize;
          ditherValue = Math.min(hatch1, hatch2) * (1 - effectiveThreshold) + effectiveThreshold * 0.5;
          break;
        }
        default:
          ditherValue = effectiveThreshold;
      }

      const output = luma > ditherValue ? 1 : 0;

      switch (colorMode) {
        case 'grayscale': {
          const gray = output * 255;
          data[idx] = gray;
          data[idx + 1] = gray;
          data[idx + 2] = gray;
          break;
        }
        case 'duotone': {
          if (output === 1) {
            data[idx] = duotoneRgb[0];
            data[idx + 1] = duotoneRgb[1];
            data[idx + 2] = duotoneRgb[2];
          } else {
            // Dark color (bg-page #0a0907)
            data[idx] = 10;
            data[idx + 1] = 9;
            data[idx + 2] = 7;
          }
          break;
        }
        case 'original':
        default: {
          // Preserve original colors but apply dither as brightness
          if (output === 0) {
            data[idx] = Math.round(r * 0.2);
            data[idx + 1] = Math.round(g * 0.2);
            data[idx + 2] = Math.round(b * 0.2);
          } else {
            data[idx] = Math.round(r);
            data[idx + 1] = Math.round(g);
            data[idx + 2] = Math.round(b);
          }
          break;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function DitherShader({
  src,
  alt = '',
  className,
  mode = 'bayer',
  colorMode = 'original',
  gridSize = 4,
  threshold = 0.5,
  brightness = 1,
  analyserNode,
  duotoneColor = '#D4BFA0',
}: DitherShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const prefersReducedMotion = useRef(false);

  // Check for reduced motion preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }, []);

  const renderDither = useCallback(
    (effectiveGridSize: number, effectiveThreshold: number, effectiveBrightness: number) => {
      const canvas = canvasRef.current;
      const image = imageRef.current;
      if (!canvas || !image || !image.complete) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Draw original image
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      // Apply dithering
      applyDithering(
        ctx,
        canvas.width,
        canvas.height,
        mode,
        colorMode,
        effectiveGridSize,
        effectiveThreshold,
        effectiveBrightness,
        duotoneColor
      );
    },
    [mode, colorMode, duotoneColor]
  );

  const animate = useCallback(() => {
    if (!analyserNode || prefersReducedMotion.current) {
      // Static render without audio reactivity
      renderDither(gridSize, threshold, brightness);
      return;
    }

    // Initialize data array if needed
    if (!dataArrayRef.current) {
      dataArrayRef.current = new Uint8Array(analyserNode.frequencyBinCount);
    }

    const dataArray = dataArrayRef.current;
    analyserNode.getByteFrequencyData(dataArray);

    // Compute energy bands
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

    // Highs: bins 100-255
    let highSum = 0;
    const highEnd = Math.min(255, dataArray.length);
    for (let i = 100; i < highEnd; i++) {
      highSum += dataArray[i];
    }
    const highEnergy = highSum / ((highEnd - 100) * 255);

    // Apply audio reactivity to parameters
    const effectiveGridSize = gridSize + bassEnergy * 6;
    const effectiveThreshold = threshold + (midEnergy - 0.5) * 0.3;
    const effectiveBrightness = brightness + highEnergy * 0.15;

    renderDither(effectiveGridSize, effectiveThreshold, effectiveBrightness);

    frameRef.current = requestAnimationFrame(animate);
  }, [analyserNode, gridSize, threshold, brightness, renderDither]);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;

    image.onload = () => {
      imageRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Set canvas size to match image aspect ratio
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      const containerWidth = canvas.parentElement?.clientWidth || 300;
      const containerHeight = canvas.parentElement?.clientHeight || 300;

      // Fill the container
      canvas.width = containerWidth;
      canvas.height = containerHeight;

      // Start animation loop or render static
      if (analyserNode && !prefersReducedMotion.current) {
        animate();
      } else {
        renderDither(gridSize, threshold, brightness);
      }
    };

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [src, analyserNode, animate, renderDither, gridSize, threshold, brightness]);

  // Re-render when mode or color mode changes
  useEffect(() => {
    if (imageRef.current?.complete && !analyserNode) {
      renderDither(gridSize, threshold, brightness);
    }
  }, [mode, colorMode, gridSize, threshold, brightness, analyserNode, renderDither]);

  // Start/stop animation when analyserNode changes
  useEffect(() => {
    if (analyserNode && !prefersReducedMotion.current) {
      animate();
    } else if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      // Render one static frame
      if (imageRef.current?.complete) {
        renderDither(gridSize, threshold, brightness);
      }
    }

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [analyserNode, animate, renderDither, gridSize, threshold, brightness]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('w-full h-full object-cover', className)}
      aria-label={alt || 'Dithered image'}
    />
  );
}
