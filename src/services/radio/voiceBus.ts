import { rampGain } from '../automix/crossfadeGraph';
import { RADIO_DUCK_LEVEL, RADIO_DUCK_RAMP_MS, RADIO_UNDUCK_RAMP_MS, RADIO_VOICE_LEVEL } from '../../types/radioBrief';

// src/services/radio/voiceBus.ts
// Duck lives on the dedicated musicDuck node in playbackGraph. Voice joins at the volume fader.
// Mix numbers come from cyberradio/user-data/config.json and the radio-brief settings store.

export type RadioVoiceNodes = {
    musicDuck: GainNode;
    voiceGain: GainNode;
};

export type RadioMixSettings = {
    duckLevel: number;
    duckRampMs: number;
    unduckRampMs: number;
    voiceLevel: number;
};

const toSec = (ms: number) => Math.max(0.05, ms / 1000);

export const duckMusicForBrief = (
    context: AudioContext,
    nodes: RadioVoiceNodes,
    mix: RadioMixSettings = {
        duckLevel: RADIO_DUCK_LEVEL,
        duckRampMs: RADIO_DUCK_RAMP_MS,
        unduckRampMs: RADIO_UNDUCK_RAMP_MS,
        voiceLevel: RADIO_VOICE_LEVEL,
    },
): void => {
    rampGain(context, nodes.musicDuck, mix.duckLevel, toSec(mix.duckRampMs));
};

export const unduckMusicAfterBrief = (
    context: AudioContext,
    nodes: RadioVoiceNodes,
    mix: RadioMixSettings = {
        duckLevel: RADIO_DUCK_LEVEL,
        duckRampMs: RADIO_DUCK_RAMP_MS,
        unduckRampMs: RADIO_UNDUCK_RAMP_MS,
        voiceLevel: RADIO_VOICE_LEVEL,
    },
): void => {
    rampGain(context, nodes.musicDuck, 1, toSec(mix.unduckRampMs));
};

export const playBriefBuffer = (
    context: AudioContext,
    nodes: RadioVoiceNodes,
    buffer: AudioBuffer,
    onEnded: () => void,
    mix?: RadioMixSettings,
): AudioBufferSourceNode => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(nodes.voiceGain);
    const voiceLevel = mix?.voiceLevel ?? RADIO_VOICE_LEVEL;
    nodes.voiceGain.gain.setValueAtTime(voiceLevel, context.currentTime);
    source.onended = onEnded;
    duckMusicForBrief(context, nodes, mix);
    source.start();
    return source;
};
