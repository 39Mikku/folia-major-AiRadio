import type { SongResult } from '../../types';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { RADIO_PREFETCH_COUNT_MAX, RADIO_PREFETCH_COUNT_MIN } from '../../types/radioBrief';

// src/services/radio/prefetchWindow.ts
// Folia's playable grouping is `playQueue` (usePlaybackStore). Upcoming briefs walk that array.

export const clampRadioPrefetchCount = (value: number): number => (
    Math.min(RADIO_PREFETCH_COUNT_MAX, Math.max(RADIO_PREFETCH_COUNT_MIN, Math.round(value)))
);

export const radioUpcomingSongs = (
    queue: SongResult[],
    current: SongResult,
    count: number,
): SongResult[] => {
    const key = getPlaybackSongKey(current);
    const index = queue.findIndex(song => getPlaybackSongKey(song) === key);
    if (index < 0) return [];
    return queue.slice(index + 1, index + 1 + clampRadioPrefetchCount(count));
};
