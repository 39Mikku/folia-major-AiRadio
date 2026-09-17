import type { SongResult } from '../../types';
import type { RadioBriefCacheEntry } from '../../types/radioBrief';
import type { RadioBriefPhase } from '../../stores/useRadioBriefRuntimeStore';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { getTrackProfile } from '../automix/profileService';
import { getPreparedRadioBrief, prepareRadioBrief } from './prepareBrief';
import { radioUpcomingSongs } from './prefetchWindow';
import { radioSpeakAtSec } from './speakAt';

import {
    playBriefBuffer,
    unduckMusicAfterBrief,
    type RadioMixSettings,
    type RadioVoiceNodes,
} from './voiceBus';

// src/services/radio/radioBriefConductor.ts
// One turn: prepare the current song, play it, then prefetch later songs in the background.
// Automix `armed` is not a reason to skip speech; only `fading` waits briefly.

const POLL_MS = 25;
const GRAPH_WAIT_MS = 20000;
const FADE_WAIT_MS = 4000;

export type RadioBriefTurnHost = {
    getAudioContext: () => AudioContext | null;
    getDisplayElement: () => HTMLAudioElement | null;
    isBlendFading: () => boolean;
    getVoiceNodes: () => RadioVoiceNodes | null;
    getMix: () => RadioMixSettings;
    getQueue: () => SongResult[];
};

export type RadioBriefTurnHooks = {
    prepare?: typeof prepareRadioBrief;
    play?: typeof playBriefBuffer;
    unduck?: typeof unduckMusicAfterBrief;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
};

export type RadioBriefTurnInput = {
    song: SongResult;
    force: boolean;
    prefetchEnabled: boolean;
    prefetchCount: number;
    previousBrief: string | null;
    signal: AbortSignal;
    host: RadioBriefTurnHost;
    onStep?: (phase: RadioBriefPhase) => void;
    hooks?: RadioBriefTurnHooks;
};

export type RadioBriefTurnResult = 'spoke' | 'skipped' | 'aborted' | 'error';

let liveSource: { stop: () => void } | null = null;

export const stopLiveRadioBrief = (): void => {
    const source = liveSource;
    liveSource = null;
    if (!source) return;
    try { source.stop(); } catch { /* already stopped */ }
};

const defaultSleep = (ms: number) => new Promise<void>(resolve => { window.setTimeout(resolve, ms); });

const aborted = (signal: AbortSignal) => signal.aborted;

const waitUntil = async (
    predicate: () => boolean,
    timeoutMs: number,
    signal: AbortSignal,
    sleep: (ms: number) => Promise<void>,
    now: () => number,
): Promise<boolean> => {
    const deadline = now() + timeoutMs;
    while (!aborted(signal) && !predicate()) {
        if (now() >= deadline) return false;
        await sleep(POLL_MS);
    }
    return !aborted(signal);
};

export const runRadioBriefTurn = async ({
    song,
    force,
    prefetchEnabled,
    prefetchCount,
    previousBrief,
    signal,
    host,
    onStep,
    hooks = {},
}: RadioBriefTurnInput): Promise<{ result: RadioBriefTurnResult; entry: RadioBriefCacheEntry | null }> => {
    const prepare = hooks.prepare ?? prepareRadioBrief;
    const play = hooks.play ?? playBriefBuffer;
    const unduck = hooks.unduck ?? unduckMusicAfterBrief;
    const sleep = hooks.sleep ?? defaultSleep;
    const now = hooks.now ?? (() => Date.now());

    onStep?.('waiting');
    await waitUntil(() => Boolean(host.getAudioContext()), GRAPH_WAIT_MS, signal, sleep, now);
    if (aborted(signal)) return { result: 'aborted', entry: null };
    const context = host.getAudioContext();
    if (!context) return { result: 'error', entry: null };

    const entry = await prepare(song, context, previousBrief, onStep, force);
    if (aborted(signal)) return { result: 'aborted', entry };

    await waitUntil(() => Boolean(host.getVoiceNodes()), GRAPH_WAIT_MS, signal, sleep, now);
    if (aborted(signal)) return { result: 'aborted', entry };

    const nodes = host.getVoiceNodes();
    const ctx = host.getAudioContext();
    if (!ctx || !nodes) return { result: 'error', entry };

    const readyToSpeak = () => {
        if (host.isBlendFading()) return false;
        const element = host.getDisplayElement();
        if (!element) return true;
        const profile = getTrackProfile(song);
        if (!profile) return element.currentTime >= 3;
        return element.currentTime >= radioSpeakAtSec(profile);
    };
    await waitUntil(readyToSpeak, GRAPH_WAIT_MS, signal, sleep, now);
    if (aborted(signal)) return { result: 'aborted', entry };
    if (host.isBlendFading()) {
        await waitUntil(() => !host.isBlendFading(), FADE_WAIT_MS, signal, sleep, now);
        if (aborted(signal)) return { result: 'aborted', entry };
    }

    onStep?.('speaking');
    const mix = host.getMix();
    stopLiveRadioBrief();
    await new Promise<void>(resolve => {
        let source: { stop: () => void } | AudioBufferSourceNode | void;
        source = play(ctx, nodes, entry.audio, () => {
            if (liveSource === source) liveSource = null;
            unduck(ctx, nodes, mix);
            resolve();
        }, mix);
        if (source && typeof source.stop === 'function') liveSource = source;
        const onAbort = () => {
            stopLiveRadioBrief();
            unduck(ctx, nodes, mix);
            resolve();
        };
        if (aborted(signal)) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
    });
    if (aborted(signal)) return { result: 'aborted', entry };

    if (prefetchEnabled) {
        const upcoming = radioUpcomingSongs(host.getQueue(), song, prefetchCount);
        void Promise.all(upcoming.map(next => {
            if (getPreparedRadioBrief(next)) return Promise.resolve();
            return prepare(next, ctx, entry.brief).catch(error => {
                console.warn('[RadioBrief] prefetch failed', getPlaybackSongKey(next), error);
            });
        }));
    }

    return { result: 'spoke', entry };
};
