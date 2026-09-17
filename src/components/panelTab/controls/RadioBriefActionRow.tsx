import React from 'react';
import { Loader2, Mic, MicOff, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRadioBriefSettingsStore } from '../../../stores/useRadioBriefSettingsStore';
import { useRadioBriefRuntimeStore } from '../../../stores/useRadioBriefRuntimeStore';
import { isRadioBriefHostAvailable } from '../../../services/radio/radioIpc';

// src/components/panelTab/controls/RadioBriefActionRow.tsx
// Explicit radio-brief switch on the player controls tab, same row language as AI theme.

type RadioBriefActionRowProps = {
    isDaylight: boolean;
};

const BUSY = new Set(['lyrics', 'comments', 'web', 'writing', 'tts', 'waiting', 'speaking', 'probing']);

const RadioBriefActionRow: React.FC<RadioBriefActionRowProps> = ({ isDaylight }) => {
    const { t } = useTranslation();
    const enabled = useRadioBriefSettingsStore(state => state.enabled);
    const setEnabled = useRadioBriefSettingsStore(state => state.setEnabled);
    const phase = useRadioBriefRuntimeStore(state => state.phase);
    const detail = useRadioBriefRuntimeStore(state => state.detail);
    const requestSpeakNow = useRadioBriefRuntimeStore(state => state.requestSpeakNow);
    const currentHasBrief = useRadioBriefRuntimeStore(state => state.currentHasBrief);
    const busy = BUSY.has(phase);
    const hostReady = isRadioBriefHostAvailable();
    const buttonBg = isDaylight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10';

    const toggle = () => {
        const next = !enabled;
        setEnabled(next);
        if (next) requestSpeakNow();
    };

    const generateNow = () => {
        if (!enabled) setEnabled(true);
        requestSpeakNow();
    };

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={toggle}
                    disabled={!hostReady}
                    title={t('player.radioBriefToggle')}
                    className={`h-12 rounded-xl flex items-center justify-center gap-2 transition-colors ${
                        enabled ? 'bg-blue-500/20 text-blue-300' : buttonBg
                    } ${!hostReady ? 'opacity-35 cursor-not-allowed' : ''}`}
                >
                    {enabled ? <Mic size={18} /> : <MicOff size={18} />}
                    <span className="text-xs font-medium">{t('player.radioBriefToggle')}</span>
                </button>
                <button
                    type="button"
                    onClick={generateNow}
                    disabled={!hostReady || busy}
                    title={currentHasBrief ? t('player.radioBriefRegenerate') : t('player.radioBriefGenerate')}
                    className={`h-12 rounded-xl flex items-center justify-center gap-2 transition-colors ${
                        busy ? 'bg-blue-500/20 text-blue-300' : buttonBg
                    } ${!hostReady ? 'opacity-35 cursor-not-allowed' : ''}`}
                >
                    {busy ? (
                        <Loader2 size={18} className="animate-spin" />
                    ) : currentHasBrief ? (
                        <Sparkles size={18} />
                    ) : (
                        <Mic size={18} />
                    )}
                    <span className="text-xs font-medium">
                        {busy
                            ? (detail || t('player.radioBriefGenerate'))
                            : currentHasBrief
                                ? t('player.radioBriefRegenerate')
                                : t('player.radioBriefGenerate')}
                    </span>
                </button>
            </div>
        </div>
    );
};

export default RadioBriefActionRow;
