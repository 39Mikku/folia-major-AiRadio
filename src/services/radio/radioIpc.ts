import type { RadioWebHit } from '../../types/radioBrief';
import type { RadioBriefProbe } from '../../stores/useRadioBriefRuntimeStore';

// src/services/radio/radioIpc.ts
// Renderer access to the Electron radio-brief handlers (web search, brief JSON, MiniMax TTS).

type ElectronRadioBridge = {
    radioWebSearch?: (query: string) => Promise<{ answer?: string; results: RadioWebHit[] }>;
    radioWriteBrief?: (systemPrompt: string, sourcePrompt: string) => Promise<{ brief: string }>;
    radioSynthesizeSpeech?: (text: string) => Promise<{ audio: ArrayBuffer }>;
    radioBriefProbe?: () => Promise<RadioBriefProbe>;
};

const bridge = (): ElectronRadioBridge | null => {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { electron?: ElectronRadioBridge }).electron ?? null;
};

export const isRadioBriefHostAvailable = (): boolean => {
    const api = bridge();
    return Boolean(api?.radioWebSearch && api?.radioWriteBrief && api?.radioSynthesizeSpeech);
};

export const radioBriefProbe = async (): Promise<RadioBriefProbe> => {
    const api = bridge();
    if (!api?.radioBriefProbe) {
        throw new Error('radio-brief-probe is Electron-only');
    }
    return api.radioBriefProbe();
};

export const radioWebSearch = async (query: string): Promise<{ answer: string; results: RadioWebHit[] }> => {
    const api = bridge();
    if (!api?.radioWebSearch) {
        throw new Error('radio-web-search is Electron-only');
    }
    const payload = await api.radioWebSearch(query);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    return {
        answer: typeof payload?.answer === 'string' ? payload.answer.trim() : '',
        results: results.map((item) => ({
            title: String(item.title || ''),
            content: String(item.content || ''),
        })),
    };
};

export const radioWriteBrief = async (systemPrompt: string, sourcePrompt: string): Promise<string> => {
    const api = bridge();
    if (!api?.radioWriteBrief) {
        throw new Error('radio-write-brief is Electron-only');
    }
    const payload = await api.radioWriteBrief(systemPrompt, sourcePrompt);
    const brief = typeof payload?.brief === 'string' ? payload.brief.trim() : '';
    if (!brief) {
        throw new Error('radio-write-brief returned an empty brief');
    }
    return brief;
};

export const radioSynthesizeSpeech = async (text: string): Promise<ArrayBuffer> => {
    const api = bridge();
    if (!api?.radioSynthesizeSpeech) {
        throw new Error('radio-synthesize-speech is Electron-only');
    }
    const payload = await api.radioSynthesizeSpeech(text);
    const audio = payload?.audio as ArrayBuffer | Uint8Array | undefined;
    if (!audio) {
        throw new Error('radio-synthesize-speech returned no audio');
    }
    if (audio instanceof ArrayBuffer) return audio;
    const bytes = new Uint8Array(audio.byteLength);
    bytes.set(audio);
    return bytes.buffer;
};
