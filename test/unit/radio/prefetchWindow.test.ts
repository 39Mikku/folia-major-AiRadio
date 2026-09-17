import { describe, expect, it } from 'vitest';
import { radioUpcomingSongs, clampRadioPrefetchCount } from '@/services/radio/prefetchWindow';
import type { SongResult } from '@/types';

// test/unit/radio/prefetchWindow.test.ts

const song = (id: string): SongResult => ({
    id,
    name: id,
    artists: [{ id: 1, name: 'A' }],
    album: { id: 1, name: 'Al' },
    durationMs: 1000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: id },
});

describe('radioUpcomingSongs', () => {
    it('takes the next N songs after the current playQueue index', () => {
        const queue = [song('a'), song('b'), song('c'), song('d')];
        expect(radioUpcomingSongs(queue, queue[1], 2).map(item => item.id)).toEqual(['c', 'd']);
    });

    it('clamps prefetch count to 1..8', () => {
        expect(clampRadioPrefetchCount(0)).toBe(1);
        expect(clampRadioPrefetchCount(99)).toBe(8);
    });
});
