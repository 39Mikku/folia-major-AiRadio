'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// electron/radioBriefIpc.cjs
// Web search (Tavily), brief JSON (existing AI client), MiniMax TTS. Keys from electron-store.

const RADIO_BRIEF_SCHEMA_NAME = 'radio_brief';
const RADIO_BRIEF_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['brief'],
    properties: { brief: { type: 'string' } },
};

const TAVILY_URL = 'https://api.tavily.com/search';
const MINIMAX_URL = 'https://api.minimaxi.com/v1/t2a_v2';
const DEFAULT_VOICE = 'Chinese (Mandarin)_Warm_Girl';
const DEFAULT_MODEL = 'speech-2.8-hd';

const registerRadioBriefIpc = ({
    ipcMain,
    store,
    app,
    isTrustedMainWindowContents,
    fetchWithOptionalSystemProxy,
    runAiJsonCompletion,
}) => {
    const ttsDir = () => path.join(app.getPath('userData'), 'radio-tts');

    const ensureTtsDir = () => {
        fs.mkdirSync(ttsDir(), { recursive: true });
    };

    ipcMain.handle('radio-web-search', async (event, query) => {
        if (!isTrustedMainWindowContents(event.sender)) {
            throw new Error('Untrusted renderer attempted radio-web-search.');
        }
        const q = typeof query === 'string' ? query.trim() : '';
        if (!q) throw new Error('radio-web-search requires a query');
        const apiKey = store.get('TAVILY_API_KEY');
        if (!apiKey) throw new Error('TAVILY_API_KEY is not configured in settings');
        const useSystemProxy = store.get('USE_SYSTEM_PROXY_FOR_AI') || false;
        const response = await fetchWithOptionalSystemProxy(TAVILY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                query: q,
                max_results: 3,
                search_depth: 'basic',
                include_answer: 'advanced',
            }),
        }, useSystemProxy);
        if (!response.ok) {
            throw new Error(`Tavily search failed: ${response.status}`);
        }
        const data = await response.json();
        const results = (data?.results || []).slice(0, 3).map((item) => ({
            title: String(item.title || ''),
            content: String(item.content || ''),
        }));
        return {
            answer: String(data?.answer || '').trim(),
            results,
        };
    });

    ipcMain.handle('radio-write-brief', async (event, systemPrompt, sourcePrompt) => {
        if (!isTrustedMainWindowContents(event.sender)) {
            throw new Error('Untrusted renderer attempted radio-write-brief.');
        }
        const useSystemProxy = store.get('USE_SYSTEM_PROXY_FOR_AI') || false;
        const customFetch = (url, options) => fetchWithOptionalSystemProxy(url, options, useSystemProxy);
        const jsonText = await runAiJsonCompletion({
            store,
            systemPrompt: String(systemPrompt || ''),
            sourcePrompt: String(sourcePrompt || ''),
            schema: RADIO_BRIEF_JSON_SCHEMA,
            schemaName: RADIO_BRIEF_SCHEMA_NAME,
            customFetch,
        });
        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch {
            throw new Error('radio-write-brief model output was not JSON');
        }
        const brief = typeof parsed?.brief === 'string' ? parsed.brief.trim() : '';
        if (!brief) throw new Error('radio-write-brief JSON missing brief');
        return { brief };
    });

    ipcMain.handle('radio-synthesize-speech', async (event, text) => {
        if (!isTrustedMainWindowContents(event.sender)) {
            throw new Error('Untrusted renderer attempted radio-synthesize-speech.');
        }
        const spoken = typeof text === 'string' ? text.trim() : '';
        if (!spoken) throw new Error('radio-synthesize-speech requires text');
        const apiKey = store.get('MINIMAX_API_KEY');
        if (!apiKey) throw new Error('MINIMAX_API_KEY is not configured in settings');
        const voiceId = store.get('MINIMAX_VOICE_ID') || DEFAULT_VOICE;
        const model = store.get('MINIMAX_MODEL') || DEFAULT_MODEL;
        const useSystemProxy = store.get('USE_SYSTEM_PROXY_FOR_AI') || false;
        const response = await fetchWithOptionalSystemProxy(MINIMAX_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                text: spoken,
                stream: false,
                voice_setting: { voice_id: voiceId, speed: 1, vol: 1.0, pitch: 0 },
                audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
            }),
        }, useSystemProxy);
        if (!response.ok) {
            throw new Error(`MiniMax TTS failed: ${response.status}`);
        }
        const payload = await response.json();
        const data = payload?.data;
        if (!data) throw new Error('MiniMax returned no data');
        let buf;
        if (data.audio) {
            buf = Buffer.from(data.audio, 'hex');
        } else if (data.audio_url) {
            const audioRes = await fetchWithOptionalSystemProxy(data.audio_url, {}, useSystemProxy);
            buf = Buffer.from(await audioRes.arrayBuffer());
        } else {
            throw new Error('MiniMax returned no audio');
        }
        ensureTtsDir();
        const hash = crypto.createHash('sha1').update(spoken).digest('hex').slice(0, 12);
        fs.writeFileSync(path.join(ttsDir(), `${hash}.mp3`), buf);
        return { audio: buf };
    });

    const probeItem = async (run) => {
        try {
            return await run();
        } catch (error) {
            return { ok: false, detail: error instanceof Error ? error.message : String(error) };
        }
    };

    ipcMain.handle('radio-brief-probe', async (event) => {
        if (!isTrustedMainWindowContents(event.sender)) {
            throw new Error('Untrusted renderer attempted radio-brief-probe.');
        }
        const tavily = await probeItem(async () => {
            const apiKey = store.get('TAVILY_API_KEY');
            if (!apiKey) return { ok: false, detail: 'TAVILY_API_KEY is not configured in settings' };
            const useSystemProxy = store.get('USE_SYSTEM_PROXY_FOR_AI') || false;
            const response = await fetchWithOptionalSystemProxy(TAVILY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    query: 'Folia music player',
                    max_results: 1,
                    search_depth: 'basic',
                }),
            }, useSystemProxy);
            if (!response.ok) return { ok: false, detail: `Tavily HTTP ${response.status}` };
            const data = await response.json();
            const count = Array.isArray(data?.results) ? data.results.length : 0;
            return { ok: count > 0, detail: count > 0 ? `Tavily ${count}` : 'Tavily returned no results' };
        });
        const minimax = await probeItem(async () => {
            const apiKey = store.get('MINIMAX_API_KEY');
            if (!apiKey) return { ok: false, detail: 'MINIMAX_API_KEY is not configured in settings' };
            const voiceId = store.get('MINIMAX_VOICE_ID') || DEFAULT_VOICE;
            const model = store.get('MINIMAX_MODEL') || DEFAULT_MODEL;
            const useSystemProxy = store.get('USE_SYSTEM_PROXY_FOR_AI') || false;
            const response = await fetchWithOptionalSystemProxy(MINIMAX_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    text: '测',
                    stream: false,
                    voice_setting: { voice_id: voiceId, speed: 1, vol: 1.0, pitch: 0 },
                    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
                }),
            }, useSystemProxy);
            if (!response.ok) return { ok: false, detail: `MiniMax HTTP ${response.status}` };
            const payload = await response.json();
            const data = payload?.data;
            const hasAudio = Boolean(data?.audio || data?.audio_url);
            return { ok: hasAudio, detail: hasAudio ? 'MiniMax TTS ok' : 'MiniMax returned no audio' };
        });
        const ai = await probeItem(async () => {
            const useSystemProxy = store.get('USE_SYSTEM_PROXY_FOR_AI') || false;
            const customFetch = (url, options) => fetchWithOptionalSystemProxy(url, options, useSystemProxy);
            const jsonText = await runAiJsonCompletion({
                store,
                systemPrompt: '只输出 JSON：{"brief":"..."}。brief 两个字。',
                sourcePrompt: '写 brief 为「连通」。',
                schema: RADIO_BRIEF_JSON_SCHEMA,
                schemaName: RADIO_BRIEF_SCHEMA_NAME,
                customFetch,
            });
            const parsed = JSON.parse(jsonText);
            const brief = typeof parsed?.brief === 'string' ? parsed.brief.trim() : '';
            return { ok: Boolean(brief), detail: brief ? 'AI brief ok' : 'AI returned empty brief' };
        });
        return { tavily, minimax, ai };
    });

    ipcMain.handle('radio-brief-write-debug', async (event, runId, fileName, content) => {
        if (!isTrustedMainWindowContents(event.sender)) {
            throw new Error('Untrusted renderer attempted radio-brief-write-debug.');
        }
        const safeRun = String(runId || '').replace(/[^\w.-]+/g, '_').slice(0, 160);
        const safeFile = String(fileName || '').replace(/[^\w.-]+/g, '_').slice(0, 80);
        if (!safeRun || !safeFile) throw new Error('radio-brief-write-debug requires runId and fileName');
        const dir = path.join(app.getPath('userData'), 'radio-brief-debug', safeRun);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, safeFile), String(content ?? ''), 'utf8');
        return { ok: true, dir };
    });
};

module.exports = { registerRadioBriefIpc };
