import type { SongResult } from '../types';

// src/types/radioBrief.ts
// Contracts for the radio-brief engine: materials, cache entries, and ducking constants taken
// from cyberradio/user-data/config.json.

export interface RadioHotComment {
    content: string;
    likes: number;
}

export interface RadioWebHit {
    title: string;
    content: string;
}

export interface RadioBriefMaterials {
    song: SongResult;
    title: string;
    artist: string;
    album: string;
    lyricsText: string;
    instrumental: boolean;
    comments: RadioHotComment[];
    webAnswer: string;
    webHits: RadioWebHit[];
}

export interface RadioBriefCacheEntry {
    songKey: string;
    brief: string;
    audio: AudioBuffer;
}

/** cyberradio/user-data/config.json mix.duck_level */
export const RADIO_DUCK_LEVEL = 0.1;
/** cyberradio/user-data/config.json mix.duck_ramp_ms */
export const RADIO_DUCK_RAMP_MS = 600;
/** cyberradio/user-data/config.json mix.unduck_ramp_ms */
export const RADIO_UNDUCK_RAMP_MS = 600;
export const RADIO_DUCK_LEVEL_MIN = 0.02;
export const RADIO_DUCK_LEVEL_MAX = 0.5;
export const RADIO_DUCK_RAMP_MS_MIN = 100;
export const RADIO_DUCK_RAMP_MS_MAX = 3000;
export const RADIO_VOICE_LEVEL = 1;
export const RADIO_VOICE_LEVEL_MIN = 0;
export const RADIO_VOICE_LEVEL_MAX = 1.5;
export const RADIO_BRIEF_CACHE_PREFIX = 'radio_brief_';
export const RADIO_HOT_COMMENT_COUNT = 5;
export const RADIO_PREFETCH_COUNT_MIN = 1;
export const RADIO_PREFETCH_COUNT_MAX = 8;
export const RADIO_DEFAULT_PREFETCH_COUNT = 2;
