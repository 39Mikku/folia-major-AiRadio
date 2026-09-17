import type { SongResult } from '../../types';
import type { RadioBriefMaterials } from '../../types/radioBrief';
import { RADIO_HOT_COMMENT_COUNT } from '../../types/radioBrief';
import type { RadioBriefPhase } from '../../stores/useRadioBriefRuntimeStore';
import { omni } from '../onlineMusic/omni';
import { lyricTextForBrief } from './lyricText';
import { radioWebSearch } from './radioIpc';
import { dumpRadioBriefStep } from './radioBriefDebug';

// src/services/radio/gatherMaterials.ts
// Three of the four-piece set from cyberradio/SKILL.md: lyrics, hot comments, web search.
// Structure (sectionStart) is read at speak time from automix TrackProfile.

const onceRetry = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
        return await run();
    } catch {
        return run();
    }
};

const artistLine = (song: SongResult): string => (
    (song.artists ?? []).map(artist => artist.name).filter(Boolean).join(' / ')
);

export const gatherRadioBriefMaterials = async (
    song: SongResult,
    onStep?: (phase: RadioBriefPhase) => void,
    debugRunId: string | null = null,
): Promise<RadioBriefMaterials> => {
    onStep?.('lyrics');
    const lyrics = await onceRetry(async () => {
        const result = await omni.getLyrics(song);
        const text = lyricTextForBrief(result.lyrics);
        if (!text) {
            throw new Error('lyrics empty after credit-block filter');
        }
        return text;
    });
    await dumpRadioBriefStep(debugRunId, '01-lyrics.json', { lyrics });

    onStep?.('comments');
    const comments = await onceRetry(async () => {
        const picked = await omni.getHotComments(song, RADIO_HOT_COMMENT_COUNT);
        if (picked.length === 0) {
            throw new Error('no cleaned hot comments');
        }
        return picked;
    });
    await dumpRadioBriefStep(debugRunId, '02-comments.json', { comments });

    onStep?.('web');
    const query = `${song.name} ${artistLine(song)} 创作背景`;
    const web = await onceRetry(async () => {
        const payload = await radioWebSearch(query);
        if (!payload.answer && payload.results.length === 0) {
            throw new Error('web search returned no hits');
        }
        return payload;
    });
    await dumpRadioBriefStep(debugRunId, '03-web.json', { query, answer: web.answer, webHits: web.results });

    return {
        song,
        title: song.name,
        artist: artistLine(song),
        album: song.album?.name ?? '',
        lyricsText: lyrics,
        comments,
        webAnswer: web.answer,
        webHits: web.results,
    };
};
