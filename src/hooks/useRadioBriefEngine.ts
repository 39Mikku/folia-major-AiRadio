import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayerState } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { runRadioBriefTurn, stopLiveRadioBrief } from '../services/radio/radioBriefConductor';
import { loadPersistedRadioBrief } from '../services/radio/radioBriefPersist';
import { unduckMusicAfterBrief, type RadioVoiceNodes } from '../services/radio/voiceBus';
import { isRadioBriefHostAvailable } from '../services/radio/radioIpc';
import { radioBriefErrorKey } from '../services/radio/radioErrors';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useRadioBriefSettingsStore } from '../stores/useRadioBriefSettingsStore';
import { useRadioBriefRuntimeStore, type RadioBriefPhase } from '../stores/useRadioBriefRuntimeStore';
import { setStatusMessage } from '../stores/useStatusMessageStore';

// src/hooks/useRadioBriefEngine.ts
// Starts one conductor turn per song. Prefetch and automix `armed` cannot retrigger generation.

const PHASE_STATUS: Partial<Record<RadioBriefPhase, string>> = {
    lyrics: 'status.radioBriefLyrics',
    comments: 'status.radioBriefComments',
    web: 'status.radioBriefWeb',
    writing: 'status.radioBriefWriting',
    tts: 'status.radioBriefTts',
    waiting: 'status.radioBriefWaitingMix',
    speaking: 'status.radioBriefSpeaking',
};

type UseRadioBriefEngineParams = {
    audioContextRef: MutableRefObject<AudioContext | null>;
    getDisplayElement: () => HTMLAudioElement | null;
    isBlendFading: () => boolean;
    getVoiceNodes: () => RadioVoiceNodes | null;
};

export function useRadioBriefEngine({
    audioContextRef,
    getDisplayElement,
    isBlendFading,
    getVoiceNodes,
}: UseRadioBriefEngineParams) {
    const { t } = useTranslation();
    const enabled = useRadioBriefSettingsStore(state => state.enabled);
    const prefetchEnabled = useRadioBriefSettingsStore(state => state.prefetchEnabled);
    const prefetchCount = useRadioBriefSettingsStore(state => state.prefetchCount);
    const speakRequest = useRadioBriefRuntimeStore(state => state.speakRequest);
    const currentSong = usePlaybackStore(state => state.currentSong);
    const playQueue = usePlaybackStore(state => state.playQueue);
    const playerState = usePlaybackStore(state => state.playerState);
    const lastBriefRef = useRef<string | null>(null);
    const spokenKeyRef = useRef<string | null>(null);
    const lastSpeakRequestRef = useRef(0);
    const runIdRef = useRef(0);
    const gettersRef = useRef({
        getDisplayElement,
        isBlendFading,
        getVoiceNodes,
        t,
        playQueue,
        prefetchEnabled,
        prefetchCount,
    });
    gettersRef.current = {
        getDisplayElement,
        isBlendFading,
        getVoiceNodes,
        t,
        playQueue,
        prefetchEnabled,
        prefetchCount,
    };
    const songKey = currentSong ? getPlaybackSongKey(currentSong) : null;

    useEffect(() => {
        if (!songKey) {
            useRadioBriefRuntimeStore.getState().setCurrentHasBrief(false);
            return;
        }
        void loadPersistedRadioBrief(songKey).then(entry => {
            useRadioBriefRuntimeStore.getState().setCurrentHasBrief(Boolean(entry?.brief));
        });
    }, [songKey]);

    useEffect(() => {
        if (!enabled) {
            const runtime = useRadioBriefRuntimeStore.getState();
            if (runtime.phase !== 'idle' || runtime.detail) runtime.setPhase('idle');
            return undefined;
        }
        const translate = gettersRef.current.t;
        if (!isRadioBriefHostAvailable()) {
            const text = translate('status.radioBriefDesktopOnly');
            useRadioBriefRuntimeStore.getState().setPhase('error', text);
            setStatusMessage({ type: 'error', text });
            return undefined;
        }
        const song = usePlaybackStore.getState().currentSong;
        if (!song || playerState !== PlayerState.PLAYING) {
            const runtime = useRadioBriefRuntimeStore.getState();
            if (runtime.phase !== 'idle') runtime.setPhase('idle');
            return undefined;
        }

        const currentKey = getPlaybackSongKey(song);
        const manual = speakRequest !== lastSpeakRequestRef.current;
        lastSpeakRequestRef.current = speakRequest;
        if (!manual && spokenKeyRef.current === currentKey) return undefined;

        const runId = runIdRef.current + 1;
        runIdRef.current = runId;
        const abort = new AbortController();

        const report = (phase: RadioBriefPhase) => {
            if (runIdRef.current !== runId) return;
            const key = PHASE_STATUS[phase];
            const text = key ? gettersRef.current.t(key) : '';
            const runtime = useRadioBriefRuntimeStore.getState();
            if (runtime.phase === phase && runtime.detail === text) return;
            runtime.setPhase(phase, text);
            if (text) setStatusMessage({ type: 'info', text, nonce: Date.now(), durationMs: 4000 });
        };

        void (async () => {
            try {
                const { result, entry } = await runRadioBriefTurn({
                    song,
                    force: true,
                    prefetchEnabled: gettersRef.current.prefetchEnabled,
                    prefetchCount: gettersRef.current.prefetchCount,
                    previousBrief: lastBriefRef.current,
                    signal: abort.signal,
                    host: {
                        getAudioContext: () => audioContextRef.current,
                        getDisplayElement: () => gettersRef.current.getDisplayElement(),
                        isBlendFading: () => gettersRef.current.isBlendFading(),
                        getVoiceNodes: () => gettersRef.current.getVoiceNodes(),
                        getMix: () => {
                            const mix = useRadioBriefSettingsStore.getState();
                            return {
                                duckLevel: mix.duckLevel,
                                duckRampMs: mix.duckRampMs,
                                unduckRampMs: mix.unduckRampMs,
                                voiceLevel: mix.voiceLevel,
                            };
                        },
                        getQueue: () => gettersRef.current.playQueue,
                    },
                    onStep: report,
                });
                if (runIdRef.current !== runId || abort.signal.aborted) return;
                if (result === 'spoke' && entry) {
                    lastBriefRef.current = entry.brief;
                    spokenKeyRef.current = currentKey;
                    useRadioBriefRuntimeStore.getState().setCurrentHasBrief(true);
                    useRadioBriefRuntimeStore.getState().setPhase('idle');
                    setStatusMessage({
                        type: 'success',
                        text: gettersRef.current.t('status.radioBriefDone'),
                        nonce: Date.now(),
                    });
                } else if (result === 'error') {
                    const text = gettersRef.current.t('status.radioBriefNoAudioGraph');
                    useRadioBriefRuntimeStore.getState().setPhase('error', text);
                    setStatusMessage({ type: 'error', text });
                }
            } catch (error) {
                if (runIdRef.current !== runId || abort.signal.aborted) return;
                const text = gettersRef.current.t(radioBriefErrorKey(error));
                useRadioBriefRuntimeStore.getState().setPhase('error', text);
                setStatusMessage({ type: 'error', text });
            }
        })();

        return () => {
            abort.abort();
            stopLiveRadioBrief();
            const context = audioContextRef.current;
            const nodes = gettersRef.current.getVoiceNodes();
            if (context && nodes) {
                unduckMusicAfterBrief(context, nodes, {
                    duckLevel: useRadioBriefSettingsStore.getState().duckLevel,
                    duckRampMs: useRadioBriefSettingsStore.getState().duckRampMs,
                    unduckRampMs: useRadioBriefSettingsStore.getState().unduckRampMs,
                    voiceLevel: useRadioBriefSettingsStore.getState().voiceLevel,
                });
            }
        };
    }, [audioContextRef, enabled, playerState, songKey, speakRequest]);
}
