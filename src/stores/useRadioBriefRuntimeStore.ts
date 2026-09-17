import { create } from 'zustand';

// src/stores/useRadioBriefRuntimeStore.ts
// Live radio-brief phase, probe results, and a generation token the engine watches.

export type RadioBriefPhase =
    | 'idle'
    | 'probing'
    | 'lyrics'
    | 'comments'
    | 'web'
    | 'writing'
    | 'tts'
    | 'waiting'
    | 'speaking'
    | 'error';

export type RadioBriefProbeItem = {
    ok: boolean;
    detail: string;
};

export type RadioBriefProbe = {
    tavily: RadioBriefProbeItem;
    minimax: RadioBriefProbeItem;
    ai: RadioBriefProbeItem;
};

type RadioBriefRuntimeState = {
    phase: RadioBriefPhase;
    detail: string;
    speakRequest: number;
    currentHasBrief: boolean;
    probe: RadioBriefProbe | null;
    probing: boolean;
    setPhase: (phase: RadioBriefPhase, detail?: string) => void;
    requestSpeakNow: () => void;
    setCurrentHasBrief: (hasBrief: boolean) => void;
    setProbe: (probe: RadioBriefProbe | null) => void;
    setProbing: (probing: boolean) => void;
};

export const useRadioBriefRuntimeStore = create<RadioBriefRuntimeState>(set => ({
    phase: 'idle',
    detail: '',
    speakRequest: 0,
    currentHasBrief: false,
    probe: null,
    probing: false,
    setPhase: (phase, detail = '') => set({ phase, detail }),
    requestSpeakNow: () => set(state => ({ speakRequest: state.speakRequest + 1 })),
    setCurrentHasBrief: currentHasBrief => set({ currentHasBrief }),
    setProbe: probe => set({ probe }),
    setProbing: probing => set({ probing }),
}));
