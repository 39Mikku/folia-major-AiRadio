import { getFromCache, saveToCache } from '../db';
import { RADIO_BRIEF_CACHE_PREFIX } from '../../types/radioBrief';

// src/services/radio/radioBriefPersist.ts
// Per-song brief text + TTS bytes, same IndexedDB cache as AI themes.

export type PersistedRadioBrief = {
    songKey: string;
    brief: string;
    title: string;
    artist: string;
    album: string;
    audio: ArrayBuffer;
    createdAt: number;
};

export const radioBriefCacheKey = (songKey: string): string => `${RADIO_BRIEF_CACHE_PREFIX}${songKey}`;

export const savePersistedRadioBrief = async (entry: PersistedRadioBrief): Promise<void> => {
    await saveToCache(radioBriefCacheKey(entry.songKey), entry);
};

export const loadPersistedRadioBrief = async (songKey: string): Promise<PersistedRadioBrief | null> => (
    getFromCache<PersistedRadioBrief>(radioBriefCacheKey(songKey))
);
