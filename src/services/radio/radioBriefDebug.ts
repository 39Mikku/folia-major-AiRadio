import { useRadioBriefSettingsStore } from '../../stores/useRadioBriefSettingsStore';
import { DEFAULT_RADIO_BRIEF_SYSTEM_PROMPT } from './briefPrompt';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import type { SongResult } from '../../types';

// src/services/radio/radioBriefDebug.ts
// Developer-mode dumps: one folder per run, one JSON file per step.

export const createRadioBriefDebugRunId = (song: SongResult): string => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = getPlaybackSongKey(song).replace(/[^\w.-]+/g, '_').slice(0, 80);
    return `${stamp}_${key}`;
};

export const dumpRadioBriefStep = async (runId: string | null, fileName: string, payload: unknown): Promise<void> => {
    if (!runId) return;
    if (!useRadioBriefSettingsStore.getState().developerMode) return;
    const api = typeof window === 'undefined' ? null : window.electron;
    if (!api?.radioBriefWriteDebug) return;
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    await api.radioBriefWriteDebug(runId, fileName, body);
};

export const hamsterParamsSnapshot = () => {
    const mix = useRadioBriefSettingsStore.getState();
    return {
        enabled: mix.enabled,
        prefetchEnabled: mix.prefetchEnabled,
        prefetchCount: mix.prefetchCount,
        duckLevel: mix.duckLevel,
        duckRampMs: mix.duckRampMs,
        unduckRampMs: mix.unduckRampMs,
        voiceLevel: mix.voiceLevel,
        developerMode: mix.developerMode,
        customSystemPrompt: mix.systemPrompt.trim() !== DEFAULT_RADIO_BRIEF_SYSTEM_PROMPT,
    };
};
