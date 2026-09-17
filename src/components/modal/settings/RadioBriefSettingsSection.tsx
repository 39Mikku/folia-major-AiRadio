import React, { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { Theme } from '../../../types';
import {
    RADIO_DUCK_LEVEL_MAX,
    RADIO_DUCK_LEVEL_MIN,
    RADIO_DUCK_RAMP_MS_MAX,
    RADIO_DUCK_RAMP_MS_MIN,
    RADIO_PREFETCH_COUNT_MAX,
    RADIO_PREFETCH_COUNT_MIN,
    RADIO_VOICE_LEVEL_MAX,
    RADIO_VOICE_LEVEL_MIN,
} from '../../../types/radioBrief';
import { isRadioBriefHostAvailable, radioBriefProbe } from '../../../services/radio/radioIpc';
import { useRadioBriefSettingsStore } from '../../../stores/useRadioBriefSettingsStore';
import { useRadioBriefRuntimeStore } from '../../../stores/useRadioBriefRuntimeStore';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';

// src/components/modal/settings/RadioBriefSettingsSection.tsx
// Playback-page controls for radio briefs: master switch, prefetch window, MiniMax/Tavily keys.

type RadioBriefSettingsSectionProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: Theme;
};

const inputClass = 'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-white/30 transition-colors';

const RadioBriefSettingsSection: React.FC<RadioBriefSettingsSectionProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
}) => {
    const { t } = useTranslation();
    const {
        enabled,
        prefetchEnabled,
        prefetchCount,
        duckLevel,
        duckRampMs,
        unduckRampMs,
        voiceLevel,
        developerMode,
        setEnabled,
        setPrefetchEnabled,
        setPrefetchCount,
        setDuckLevel,
        setDuckRampMs,
        setUnduckRampMs,
        setVoiceLevel,
        setDeveloperMode,
    } = useRadioBriefSettingsStore(useShallow(state => ({
        enabled: state.enabled,
        prefetchEnabled: state.prefetchEnabled,
        prefetchCount: state.prefetchCount,
        duckLevel: state.duckLevel,
        duckRampMs: state.duckRampMs,
        unduckRampMs: state.unduckRampMs,
        voiceLevel: state.voiceLevel,
        developerMode: state.developerMode,
        setEnabled: state.setEnabled,
        setPrefetchEnabled: state.setPrefetchEnabled,
        setPrefetchCount: state.setPrefetchCount,
        setDuckLevel: state.setDuckLevel,
        setDuckRampMs: state.setDuckRampMs,
        setUnduckRampMs: state.setUnduckRampMs,
        setVoiceLevel: state.setVoiceLevel,
        setDeveloperMode: state.setDeveloperMode,
    })));
    const hostReady = isRadioBriefHostAvailable();
    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-300/90' : 'bg-white/10';
    const [tavilyKey, setTavilyKey] = useState('');
    const [minimaxKey, setMinimaxKey] = useState('');
    const [voiceId, setVoiceId] = useState('');
    const [savingKeys, setSavingKeys] = useState(false);
    const probing = useRadioBriefRuntimeStore(state => state.probing);
    const probe = useRadioBriefRuntimeStore(state => state.probe);
    const requestSpeakNow = useRadioBriefRuntimeStore(state => state.requestSpeakNow);

    useEffect(() => {
        if (!window.electron?.getSettings) return;
        void window.electron.getSettings().then((settings: Record<string, unknown>) => {
            setTavilyKey(String(settings.TAVILY_API_KEY ?? ''));
            setMinimaxKey(String(settings.MINIMAX_API_KEY ?? ''));
            setVoiceId(String(settings.MINIMAX_VOICE_ID ?? ''));
        });
    }, []);

    const renderToggle = (checked: boolean, onChange: () => void, disabled?: boolean) => (
        <button
            type="button"
            onClick={onChange}
            disabled={disabled}
            className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-40 ${checked ? '' : toggleOffBackgroundClass}`}
            style={{ backgroundColor: checked ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
            aria-pressed={checked}
        >
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
    );

    const saveKeys = async () => {
        if (!window.electron?.saveSettings) return;
        setSavingKeys(true);
        try {
            await window.electron.saveSettings('TAVILY_API_KEY', tavilyKey.trim());
            await window.electron.saveSettings('MINIMAX_API_KEY', minimaxKey.trim());
            await window.electron.saveSettings('MINIMAX_VOICE_ID', voiceId.trim());
            setStatusMessage({ type: 'success', text: t('notifications.radioBriefKeysSaved') });
        } catch (error) {
            console.error('[RadioBrief] failed to save keys', error);
            setStatusMessage({ type: 'error', text: t('notifications.radioBriefKeysSaveFailed') });
        } finally {
            setSavingKeys(false);
        }
    };

    return (
        <SettingsAnchor anchorId="radioBrief" label={t('options.radioBriefSettings')}>
            <SettingsSectionHeading icon={Mic} label={t('options.radioBriefSettings')} />
            <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {t('options.radioBriefEnable')}
                        </div>
                        <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('options.radioBriefEnableDesc')}
                        </div>
                    </div>
                    {renderToggle(enabled, () => {
                        const next = !enabled;
                        setEnabled(next);
                        if (next) requestSpeakNow();
                    })}
                </div>

                {!hostReady && (
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('options.radioBriefDesktopOnly')}
                    </div>
                )}

                <div className={`space-y-4 ${enabled ? '' : 'opacity-45 pointer-events-none'}`}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                {t('options.radioBriefPrefetch')}
                            </div>
                            <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }}>
                                {t('options.radioBriefPrefetchDesc')}
                            </div>
                        </div>
                        {renderToggle(prefetchEnabled, () => setPrefetchEnabled(!prefetchEnabled))}
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                {t('options.radioBriefPrefetchCount')}
                            </div>
                            <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                {prefetchCount}
                            </div>
                        </div>
                        <input
                            type="range"
                            min={RADIO_PREFETCH_COUNT_MIN}
                            max={RADIO_PREFETCH_COUNT_MAX}
                            step={1}
                            value={prefetchCount}
                            onChange={event => setPrefetchCount(Number(event.target.value))}
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-3 pt-2 border-t border-white/10">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {t('options.radioBriefMix')}
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.radioBriefVoiceLevel')}
                                </div>
                                <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                    {Math.round(voiceLevel * 100)}%
                                </div>
                            </div>
                            <input
                                type="range"
                                min={RADIO_VOICE_LEVEL_MIN}
                                max={RADIO_VOICE_LEVEL_MAX}
                                step={0.05}
                                value={voiceLevel}
                                onChange={event => setVoiceLevel(Number(event.target.value))}
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.radioBriefDuckLevel')}
                                </div>
                                <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                    {Math.round(duckLevel * 100)}%
                                </div>
                            </div>
                            <input
                                type="range"
                                min={RADIO_DUCK_LEVEL_MIN}
                                max={RADIO_DUCK_LEVEL_MAX}
                                step={0.01}
                                value={duckLevel}
                                onChange={event => setDuckLevel(Number(event.target.value))}
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.radioBriefDuckRamp')}
                                </div>
                                <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                    {duckRampMs}ms
                                </div>
                            </div>
                            <input
                                type="range"
                                min={RADIO_DUCK_RAMP_MS_MIN}
                                max={RADIO_DUCK_RAMP_MS_MAX}
                                step={50}
                                value={duckRampMs}
                                onChange={event => setDuckRampMs(Number(event.target.value))}
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.radioBriefUnduckRamp')}
                                </div>
                                <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                    {unduckRampMs}ms
                                </div>
                            </div>
                            <input
                                type="range"
                                min={RADIO_DUCK_RAMP_MS_MIN}
                                max={RADIO_DUCK_RAMP_MS_MAX}
                                step={50}
                                value={unduckRampMs}
                                onChange={event => setUnduckRampMs(Number(event.target.value))}
                                className="w-full"
                            />
                        </div>
                    </div>

                    {hostReady && (
                        <div className="space-y-3 pt-2 border-t border-white/10">
                            <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-[0.16em] opacity-40" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.radioBriefTavilyKey')}
                                </div>
                                <input
                                    type="password"
                                    autoComplete="off"
                                    value={tavilyKey}
                                    onChange={event => setTavilyKey(event.target.value)}
                                    className={inputClass}
                                    style={{ color: 'var(--text-primary)' }}
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-[0.16em] opacity-40" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.radioBriefMinimaxKey')}
                                </div>
                                <input
                                    type="password"
                                    autoComplete="off"
                                    value={minimaxKey}
                                    onChange={event => setMinimaxKey(event.target.value)}
                                    className={inputClass}
                                    style={{ color: 'var(--text-primary)' }}
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-[0.16em] opacity-40" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.radioBriefMinimaxVoice')}
                                </div>
                                <input
                                    type="text"
                                    value={voiceId}
                                    onChange={event => setVoiceId(event.target.value)}
                                    placeholder="Chinese (Mandarin)_Warm_Girl"
                                    className={inputClass}
                                    style={{ color: 'var(--text-primary)' }}
                                />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => { void saveKeys(); }}
                                    disabled={savingKeys}
                                    className="px-3 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/5 disabled:opacity-40"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {t('options.radioBriefSaveKeys')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void (async () => {
                                            useRadioBriefRuntimeStore.getState().setProbing(true);
                                            try {
                                                const result = await radioBriefProbe();
                                                useRadioBriefRuntimeStore.getState().setProbe(result);
                                                const ok = result.tavily.ok && result.minimax.ok && result.ai.ok;
                                                setStatusMessage({
                                                    type: ok ? 'success' : 'error',
                                                    text: t(ok ? 'status.radioBriefProbeOk' : 'status.radioBriefProbeFailed'),
                                                });
                                            } catch (error) {
                                                console.error('[RadioBrief] probe failed', error);
                                                setStatusMessage({ type: 'error', text: t('status.radioBriefProbeFailed') });
                                            } finally {
                                                useRadioBriefRuntimeStore.getState().setProbing(false);
                                            }
                                        })();
                                    }}
                                    disabled={probing}
                                    className="px-3 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/5 disabled:opacity-40"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {t('options.radioBriefProbe')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!enabled) setEnabled(true);
                                        requestSpeakNow();
                                    }}
                                    className="px-3 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/5"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {t('player.radioBriefGenerate')}
                                </button>
                            </div>
                            {probe && (
                                <div className="text-[11px] space-y-1" style={{ color: 'var(--text-secondary)' }}>
                                    <div>{t('options.radioBriefProbeTavily')}: {probe.tavily.ok ? 'OK' : probe.tavily.detail}</div>
                                    <div>{t('options.radioBriefProbeMinimax')}: {probe.minimax.ok ? 'OK' : probe.minimax.detail}</div>
                                    <div>{t('options.radioBriefProbeAi')}: {probe.ai.ok ? 'OK' : probe.ai.detail}</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-start justify-between gap-3 pt-2 border-t border-white/10">
                    <div className="space-y-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {t('options.radioBriefDeveloper')}
                        </div>
                        <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('options.radioBriefDeveloperDesc')}
                        </div>
                    </div>
                    {renderToggle(developerMode, () => setDeveloperMode(!developerMode))}
                </div>
            </div>
        </SettingsAnchor>
    );
};

export default RadioBriefSettingsSection;
