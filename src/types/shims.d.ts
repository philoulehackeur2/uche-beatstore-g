declare module 'music-tempo' {
  export default class MusicTempo {
    constructor(samples: number[] | Float32Array);
    tempo: number;
    beats: number[];
    tempoData: unknown;
  }
}

declare module 'audio-decode' {
  const decode: (buffer: Buffer | ArrayBuffer | Uint8Array) => Promise<{
    duration: number;
    numberOfChannels?: number;
    sampleRate?: number;
    getChannelData?: (channel: number) => Float32Array;
    _channelData?: Float32Array[];
  }>;
  export default decode;
}
