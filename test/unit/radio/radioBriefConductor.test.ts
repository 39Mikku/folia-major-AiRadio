import { describe, expect, it, vi } from 'vitest';
import { runRadioBriefTurn } from '@/services/radio/radioBriefConductor';
import type { SongResult } from '@/types';
import type { RadioBriefCacheEntry } from '@/types/radioBrief';
import type { RadioVoiceNodes } from '@/services/radio/voiceBus';

// test/unit/radio/radioBriefConductor.test.ts

const song = (id: string): SongResult => ({
    id,
    name: id,
    artists: [{ id: 1, name: 'A' }],
    album: { id: 1, name: 'Al' },
    durationMs: 180000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: id },
});

const entryFor = (id: string): RadioBriefCacheEntry => ({
    songKey: id,
    brief: `brief-${id}`,
    audio: {} as AudioBuffer,
});

const fakeNodes = { musicDuck: {}, voiceGain: {} } as unknown as RadioVoiceNodes;

const host = (queue: SongResult[], fading = false) => ({
    getAudioContext: () => ({}) as AudioContext,
    getDisplayElement: () => ({ currentTime: 12 } as HTMLAudioElement),
    isBlendFading: () => fading,
    getVoiceNodes: () => fakeNodes,
    getMix: () => ({ duckLevel: 0.1, duckRampMs: 600, unduckRampMs: 600, voiceLevel: 1 }),
    getQueue: () => queue,
});

describe('runRadioBriefTurn', () => {
    it('plays the current song before prefetching later songs', async () => {
        const current = song('now');
        const queue = [current, song('next-1'), song('next-2')];
        const order: string[] = [];
        const prepare = vi.fn(async (item: SongResult) => {
            order.push(`prepare:${String(item.id)}`);
            return entryFor(String(item.id));
        });
        const play = vi.fn((...args: unknown[]) => {
            order.push('play');
            const onEnded = args[3];
            if (typeof onEnded === 'function') onEnded();
            return { stop() { /* noop */ } };
        });

        const result = await runRadioBriefTurn({
            song: current,
            force: true,
            prefetchEnabled: true,
            prefetchCount: 2,
            previousBrief: null,
            signal: new AbortController().signal,
            host: host(queue),
            hooks: {
                prepare: prepare as never,
                play: play as never,
                unduck: vi.fn() as never,
                sleep: async () => undefined,
                now: () => 0,
            },
        });

        expect(result.result).toBe('spoke');
        expect(order[0]).toBe('prepare:now');
        expect(order[1]).toBe('play');
        await vi.waitFor(() => {
            expect(order).toContain('prepare:next-1');
            expect(order).toContain('prepare:next-2');
        });
        expect(order.indexOf('play')).toBeLessThan(order.indexOf('prepare:next-1'));
        expect(play).toHaveBeenCalledTimes(1);
    });

    it('still plays when automix is only armed, not fading', async () => {
        const current = song('armed');
        const play = vi.fn((...args: unknown[]) => {
            const onEnded = args[3];
            if (typeof onEnded === 'function') onEnded();
            return { stop() { /* noop */ } };
        });
        const result = await runRadioBriefTurn({
            song: current,
            force: true,
            prefetchEnabled: false,
            prefetchCount: 1,
            previousBrief: null,
            signal: new AbortController().signal,
            host: host([current], false),
            hooks: {
                prepare: vi.fn(async () => entryFor('armed')) as never,
                play: play as never,
                unduck: vi.fn() as never,
                sleep: async () => undefined,
                now: () => 0,
            },
        });
        expect(result.result).toBe('spoke');
        expect(play).toHaveBeenCalledTimes(1);
    });

    it('plays after a fading wait instead of skipping speech', async () => {
        const current = song('fade');
        const play = vi.fn((...args: unknown[]) => {
            const onEnded = args[3];
            if (typeof onEnded === 'function') onEnded();
            return { stop() { /* noop */ } };
        });
        let fading = true;
        let clock = 0;
        const result = await runRadioBriefTurn({
            song: current,
            force: true,
            prefetchEnabled: false,
            prefetchCount: 1,
            previousBrief: null,
            signal: new AbortController().signal,
            host: {
                ...host([current]),
                isBlendFading: () => fading,
            },
            hooks: {
                prepare: vi.fn(async () => entryFor('fade')) as never,
                play: play as never,
                unduck: vi.fn() as never,
                sleep: async () => { clock += 25; if (clock >= 50) fading = false; },
                now: () => clock,
            },
        });
        expect(result.result).toBe('spoke');
        expect(play).toHaveBeenCalledTimes(1);
    });

    it('waits for the audio graph instead of failing on the first play click', async () => {
        const current = song('late-graph');
        let ctx: AudioContext | null = null;
        let clock = 0;
        const play = vi.fn((...args: unknown[]) => {
            const onEnded = args[3];
            if (typeof onEnded === 'function') onEnded();
            return { stop() { /* noop */ } };
        });
        const result = await runRadioBriefTurn({
            song: current,
            force: true,
            prefetchEnabled: false,
            prefetchCount: 1,
            previousBrief: null,
            signal: new AbortController().signal,
            host: {
                ...host([current]),
                getAudioContext: () => ctx,
            },
            hooks: {
                prepare: vi.fn(async () => entryFor('late-graph')) as never,
                play: play as never,
                unduck: vi.fn() as never,
                sleep: async () => {
                    clock += 25;
                    if (clock >= 50) ctx = {} as AudioContext;
                },
                now: () => clock,
            },
        });
        expect(result.result).toBe('spoke');
        expect(play).toHaveBeenCalledTimes(1);
    });
});
