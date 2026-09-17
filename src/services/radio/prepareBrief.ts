import type { SongResult } from '../../types';
import type { RadioBriefCacheEntry } from '../../types/radioBrief';
import type { RadioBriefPhase } from '../../stores/useRadioBriefRuntimeStore';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { gatherRadioBriefMaterials } from './gatherMaterials';
import { buildRadioBriefSourcePrompt, buildRadioBriefSystemPrompt } from './briefPrompt';
import { radioSynthesizeSpeech, radioWriteBrief } from './radioIpc';
import { createRadioBriefDebugRunId, dumpRadioBriefStep, hamsterParamsSnapshot } from './radioBriefDebug';
import { savePersistedRadioBrief } from './radioBriefPersist';

// src/services/radio/prepareBrief.ts
// One song: four-piece materials → brief JSON → MiniMax buffer, decoded on the playback context.

const cache = new Map<string, RadioBriefCacheEntry>();
const inFlight = new Map<string, Promise<RadioBriefCacheEntry>>();

export const getPreparedRadioBrief = (song: SongResult): RadioBriefCacheEntry | undefined => (
    cache.get(getPlaybackSongKey(song))
);

export const dropPreparedRadioBriefsOutside = (keep: ReadonlySet<string>): void => {
    Array.from(cache.keys()).forEach(key => {
        if (!keep.has(key)) cache.delete(key);
    });
};

export const forgetPreparedRadioBrief = (song: SongResult): void => {
    cache.delete(getPlaybackSongKey(song));
};

export const prepareRadioBrief = (
    song: SongResult,
    context: AudioContext,
    previousBrief: string | null,
    onStep?: (phase: RadioBriefPhase) => void,
    force = false,
): Promise<RadioBriefCacheEntry> => {
    const songKey = getPlaybackSongKey(song);
    if (force) cache.delete(songKey);
    const hit = cache.get(songKey);
    if (hit) return Promise.resolve(hit);
    const pending = inFlight.get(songKey);
    if (pending) return pending;

    const work = (async () => {
        const debugRunId = createRadioBriefDebugRunId(song);
        await dumpRadioBriefStep(debugRunId, '00-hamster.json', {
            songKey,
            previousBrief,
            force,
            hamster: hamsterParamsSnapshot(),
        });

        const materials = await gatherRadioBriefMaterials(song, onStep, debugRunId);
        const systemPrompt = buildRadioBriefSystemPrompt();
        const sourcePrompt = buildRadioBriefSourcePrompt(materials, previousBrief);
        onStep?.('writing');
        await dumpRadioBriefStep(debugRunId, '04-write-request.json', { systemPrompt, sourcePrompt });
        const brief = await radioWriteBrief(systemPrompt, sourcePrompt);
        await dumpRadioBriefStep(debugRunId, '04-write-response.json', { brief });
        onStep?.('tts');
        await dumpRadioBriefStep(debugRunId, '05-tts-request.json', { text: brief });
        const raw = await radioSynthesizeSpeech(brief);
        await savePersistedRadioBrief({
            songKey,
            brief,
            title: materials.title,
            artist: materials.artist,
            album: materials.album,
            audio: raw.slice(0),
            createdAt: Date.now(),
        });
        const audio = await context.decodeAudioData(raw.slice(0));
        const entry: RadioBriefCacheEntry = {
            songKey,
            brief,
            audio,
        };
        cache.set(songKey, entry);
        return entry;
    })();

    inFlight.set(songKey, work);
    return work.finally(() => { inFlight.delete(songKey); });
};
