import { describe, expect, it } from 'vitest';
import { audioSrc, publicAudioSrc } from './url';

describe('audioSrc (dashboard, session-gated proxy)', () => {
  it('returns empty string for missing input', () => {
    expect(audioSrc(null)).toBe('');
    expect(audioSrc(undefined)).toBe('');
    expect(audioSrc('')).toBe('');
  });

  it('leaves same-origin paths alone', () => {
    expect(audioSrc('/uploads/beat.mp3')).toBe('/uploads/beat.mp3');
    expect(audioSrc('/api/audio?src=x')).toBe('/api/audio?src=x');
  });

  it('proxies external URLs', () => {
    expect(audioSrc('https://cdn.example.com/a.mp3')).toBe(
      '/api/audio?src=https%3A%2F%2Fcdn.example.com%2Fa.mp3',
    );
  });
});

describe('publicAudioSrc (share + storefront, anonymous visitors)', () => {
  it('returns empty string for missing input', () => {
    expect(publicAudioSrc(null)).toBe('');
    expect(publicAudioSrc(undefined)).toBe('');
    expect(publicAudioSrc('')).toBe('');
  });

  it('passes a signed share grant through untouched', () => {
    const signed = '/api/share/tok123/preview/track-1?expires=1780000000&sig=abc';
    expect(publicAudioSrc(signed)).toBe(signed);
  });

  it('passes a signed peaks grant through untouched', () => {
    const signed = '/api/share/tok123/peaks/track-1?expires=1780000000&sig=abc';
    expect(publicAudioSrc(signed)).toBe(signed);
  });

  it('does NOT wrap a public clip in the session-gated /api/audio proxy', () => {
    // This is the regression: /api/audio 401s for share-link recipients, so
    // wrapping a public preview clip killed both the waveform and playback.
    const clip = 'https://cdn.uche-beatstore.com/previews/track-1.mp3';
    expect(publicAudioSrc(clip)).toBe(clip);
    expect(publicAudioSrc(clip)).not.toContain('/api/audio');
  });

  it('unwraps a legacy /api/audio wrapper around a public source', () => {
    const clip = 'https://cdn.uche-beatstore.com/previews/track-1.mp3';
    expect(publicAudioSrc(`/api/audio?src=${encodeURIComponent(clip)}`)).toBe(clip);
  });

  it('keeps the proxy for a private r2:// ref rather than leaking it', () => {
    const wrapped = `/api/audio?src=${encodeURIComponent('r2://private-bucket/masters/x.wav')}`;
    expect(publicAudioSrc(wrapped)).toBe(wrapped);
  });

  it('returns a malformed proxy URL unchanged', () => {
    expect(publicAudioSrc('/api/audio')).toBe('/api/audio');
  });
});
