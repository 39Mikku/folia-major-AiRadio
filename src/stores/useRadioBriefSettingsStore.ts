import { create } from 'zustand';
import {
    RADIO_DEFAULT_PREFETCH_COUNT,
    RADIO_DUCK_LEVEL,
    RADIO_DUCK_LEVEL_MAX,
    RADIO_DUCK_LEVEL_MIN,
    RADIO_DUCK_RAMP_MS,
    RADIO_DUCK_RAMP_MS_MAX,
    RADIO_DUCK_RAMP_MS_MIN,
    RADIO_UNDUCK_RAMP_MS,
    RADIO_VOICE_LEVEL,
    RADIO_VOICE_LEVEL_MAX,
    RADIO_VOICE_LEVEL_MIN,
} from '../types/radioBrief';
import { clampRadioPrefetchCount } from '../services/radio/prefetchWindow';
import { DEFAULT_RADIO_BRIEF_SYSTEM_PROMPT, stripRadioBriefJsonContract } from '../services/radio/briefPrompt';
import { getStoredBoolean, getStoredString, setStoredBoolean, setStoredString } from './storagePrimitives';
import { setStatusMessage } from './useStatusMessageStore';
import i18n from '../i18n/config';

// src/stores/useRadioBriefSettingsStore.ts
// Functional radio-brief switches. Prefetch count is how many upcoming playQueue songs get
// lyrics+comments+web+TTS prepared ahead of the current track.

export const RADIO_BRIEF_ENABLED_KEY = 'folia_radio_brief_enabled';
export const RADIO_BRIEF_PREFETCH_ENABLED_KEY = 'folia_radio_brief_prefetch_enabled';
export const RADIO_BRIEF_PREFETCH_COUNT_KEY = 'folia_radio_brief_prefetch_count';
export const RADIO_BRIEF_DUCK_LEVEL_KEY = 'folia_radio_brief_duck_level';
export const RADIO_BRIEF_DUCK_RAMP_MS_KEY = 'folia_radio_brief_duck_ramp_ms';
export const RADIO_BRIEF_UNDUCK_RAMP_MS_KEY = 'folia_radio_brief_unduck_ramp_ms';
export const RADIO_BRIEF_VOICE_LEVEL_KEY = 'folia_radio_brief_voice_level';
export const RADIO_BRIEF_DEVELOPER_MODE_KEY = 'folia_radio_brief_developer_mode';
export const RADIO_BRIEF_SYSTEM_PROMPT_KEY = 'folia_radio_brief_system_prompt';

const clampDuckLevel = (value: number): number => (
    Math.min(RADIO_DUCK_LEVEL_MAX, Math.max(RADIO_DUCK_LEVEL_MIN, value))
);

const clampRampMs = (value: number): number => (
    Math.min(RADIO_DUCK_RAMP_MS_MAX, Math.max(RADIO_DUCK_RAMP_MS_MIN, Math.round(value)))
);

const clampVoiceLevel = (value: number): number => (
    Math.min(RADIO_VOICE_LEVEL_MAX, Math.max(RADIO_VOICE_LEVEL_MIN, value))
);

const readStoredNumber = (key: string, fallback: number, clamp: (value: number) => number): number => {
    if (typeof window === 'undefined') return fallback;
    const saved = localStorage.getItem(key);
    const parsed = saved === null ? NaN : Number(saved);
    return Number.isFinite(parsed) ? clamp(parsed) : fallback;
};

const readStoredPrefetchCount = (): number => {
    if (typeof window === 'undefined') return RADIO_DEFAULT_PREFETCH_COUNT;
    const saved = localStorage.getItem(RADIO_BRIEF_PREFETCH_COUNT_KEY);
    const parsed = saved === null ? NaN : Number(saved);
    return Number.isFinite(parsed) ? clampRadioPrefetchCount(parsed) : RADIO_DEFAULT_PREFETCH_COUNT;
};

type RadioBriefSettingsState = {
    enabled: boolean;
    prefetchEnabled: boolean;
    prefetchCount: number;
    duckLevel: number;
    duckRampMs: number;
    unduckRampMs: number;
    voiceLevel: number;
    developerMode: boolean;
    systemPrompt: string;
    setEnabled: (enabled: boolean) => void;
    setPrefetchEnabled: (enabled: boolean) => void;
    setPrefetchCount: (count: number) => void;
    setDuckLevel: (level: number) => void;
    setDuckRampMs: (ms: number) => void;
    setUnduckRampMs: (ms: number) => void;
    setVoiceLevel: (level: number) => void;
    setDeveloperMode: (enabled: boolean) => void;
    setSystemPrompt: (prompt: string) => void;
    resetSystemPrompt: () => void;
};

export const useRadioBriefSettingsStore = create<RadioBriefSettingsState>(set => ({
    enabled: getStoredBoolean(RADIO_BRIEF_ENABLED_KEY, false),
    prefetchEnabled: getStoredBoolean(RADIO_BRIEF_PREFETCH_ENABLED_KEY, false),
    prefetchCount: readStoredPrefetchCount(),
    duckLevel: readStoredNumber(RADIO_BRIEF_DUCK_LEVEL_KEY, RADIO_DUCK_LEVEL, clampDuckLevel),
    duckRampMs: readStoredNumber(RADIO_BRIEF_DUCK_RAMP_MS_KEY, RADIO_DUCK_RAMP_MS, clampRampMs),
    unduckRampMs: readStoredNumber(RADIO_BRIEF_UNDUCK_RAMP_MS_KEY, RADIO_UNDUCK_RAMP_MS, clampRampMs),
    voiceLevel: readStoredNumber(RADIO_BRIEF_VOICE_LEVEL_KEY, RADIO_VOICE_LEVEL, clampVoiceLevel),
    developerMode: getStoredBoolean(RADIO_BRIEF_DEVELOPER_MODE_KEY, false),
    systemPrompt: stripRadioBriefJsonContract(
        getStoredString(RADIO_BRIEF_SYSTEM_PROMPT_KEY, DEFAULT_RADIO_BRIEF_SYSTEM_PROMPT),
    ) || DEFAULT_RADIO_BRIEF_SYSTEM_PROMPT,
    setEnabled: enabled => {
        setStoredBoolean(RADIO_BRIEF_ENABLED_KEY, enabled);
        set({ enabled });
        setStatusMessage({
            type: 'info',
            text: i18n.t(enabled ? 'notifications.radioBriefOn' : 'notifications.radioBriefOff'),
        });
    },
    setPrefetchEnabled: prefetchEnabled => {
        setStoredBoolean(RADIO_BRIEF_PREFETCH_ENABLED_KEY, prefetchEnabled);
        set({ prefetchEnabled });
        setStatusMessage({
            type: 'info',
            text: i18n.t(prefetchEnabled ? 'notifications.radioBriefPrefetchOn' : 'notifications.radioBriefPrefetchOff'),
        });
    },
    setPrefetchCount: count => {
        const prefetchCount = clampRadioPrefetchCount(count);
        if (typeof window !== 'undefined') {
            localStorage.setItem(RADIO_BRIEF_PREFETCH_COUNT_KEY, String(prefetchCount));
        }
        set({ prefetchCount });
    },
    setDuckLevel: level => {
        const duckLevel = clampDuckLevel(level);
        if (typeof window !== 'undefined') localStorage.setItem(RADIO_BRIEF_DUCK_LEVEL_KEY, String(duckLevel));
        set({ duckLevel });
    },
    setDuckRampMs: ms => {
        const duckRampMs = clampRampMs(ms);
        if (typeof window !== 'undefined') localStorage.setItem(RADIO_BRIEF_DUCK_RAMP_MS_KEY, String(duckRampMs));
        set({ duckRampMs });
    },
    setUnduckRampMs: ms => {
        const unduckRampMs = clampRampMs(ms);
        if (typeof window !== 'undefined') localStorage.setItem(RADIO_BRIEF_UNDUCK_RAMP_MS_KEY, String(unduckRampMs));
        set({ unduckRampMs });
    },
    setVoiceLevel: level => {
        const voiceLevel = clampVoiceLevel(level);
        if (typeof window !== 'undefined') localStorage.setItem(RADIO_BRIEF_VOICE_LEVEL_KEY, String(voiceLevel));
        set({ voiceLevel });
    },
    setDeveloperMode: developerMode => {
        setStoredBoolean(RADIO_BRIEF_DEVELOPER_MODE_KEY, developerMode);
        set({ developerMode });
    },
    setSystemPrompt: prompt => {
        const systemPrompt = stripRadioBriefJsonContract(prompt);
        setStoredString(RADIO_BRIEF_SYSTEM_PROMPT_KEY, systemPrompt);
        set({ systemPrompt });
    },
    resetSystemPrompt: () => {
        setStoredString(RADIO_BRIEF_SYSTEM_PROMPT_KEY, DEFAULT_RADIO_BRIEF_SYSTEM_PROMPT);
        set({ systemPrompt: DEFAULT_RADIO_BRIEF_SYSTEM_PROMPT });
    },
}));
