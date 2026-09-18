import React from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_RADIO_BRIEF_SYSTEM_PROMPT } from '../../../services/radio/briefPrompt';
import { useRadioBriefSettingsStore } from '../../../stores/useRadioBriefSettingsStore';

// src/components/modal/settings/RadioBriefPromptEditor.tsx
// Editable system prompt; empty or reset falls back to the SKILL.md default.

const RadioBriefPromptEditor: React.FC = () => {
    const { t } = useTranslation();
    const systemPrompt = useRadioBriefSettingsStore(state => state.systemPrompt);
    const setSystemPrompt = useRadioBriefSettingsStore(state => state.setSystemPrompt);
    const resetSystemPrompt = useRadioBriefSettingsStore(state => state.resetSystemPrompt);
    const isDefault = systemPrompt.trim() === DEFAULT_RADIO_BRIEF_SYSTEM_PROMPT;

    return (
        <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t('options.radioBriefSystemPrompt')}
                </div>
                <button
                    type="button"
                    onClick={() => resetSystemPrompt()}
                    disabled={isDefault}
                    className="px-2 py-1 rounded-lg text-[11px] border border-white/10 hover:bg-white/5 disabled:opacity-40"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {t('options.radioBriefSystemPromptReset')}
                </button>
            </div>
            <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                {t('options.radioBriefSystemPromptDesc')}
            </div>
            <textarea
                value={systemPrompt}
                onChange={event => setSystemPrompt(event.target.value)}
                rows={12}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm leading-6 focus:outline-none focus:border-white/30 transition-colors resize-y min-h-[12rem]"
                style={{ color: 'var(--text-primary)' }}
                spellCheck={false}
            />
        </div>
    );
};

export default RadioBriefPromptEditor;
