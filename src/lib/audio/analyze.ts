/**
 * Compatibility shim. Routes pick the correct env-specific entry point:
 *   - browser components → '@/lib/audio/analyze.client'
 *   - server / API routes → '@/lib/audio/analyze.server'
 *
 * This module re-exports the SERVER variant so any straggler import that
 * lands here in a Node context still works. Importing this file from a
 * client component is now an error at build time (server-only marker).
 */

export { analyzeAudio, type AudioFeatures } from './analyze.server';
