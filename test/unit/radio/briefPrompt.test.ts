import { describe, expect, it } from 'vitest';
import { buildRadioBriefSourcePrompt, buildRadioBriefSystemPrompt } from '@/services/radio/briefPrompt';
import type { RadioBriefMaterials } from '@/types/radioBrief';

// test/unit/radio/briefPrompt.test.ts

const materials: RadioBriefMaterials = {
    song: {} as RadioBriefMaterials['song'],
    title: '夜曲',
    artist: '周杰伦',
    album: '十一月的萧邦',
    lyricsText: '一群嗜血的蚂蚁被腐肉所吸引',
    comments: [{ content: '那年夏天我在地铁里第一次听到这首歌，窗外的雨一直在下个不停，我想起宿舍', likes: 10 }],
    webAnswer: '周杰伦为电影《头文字D》创作了夜曲。',
    webHits: [{ title: '创作背景', content: '为电影《头文字D》创作。' }],
};

describe('radio brief prompt', () => {
    it('uses SKILL.md host copy, including the original metadata rule', () => {
        const system = buildRadioBriefSystemPrompt();
        expect(system).toContain('可以自然报歌名、歌手、作品名与作曲者');
        expect(system).toContain('不要每段都套用“刚才听到的是……接下来是……”');
        expect(system).toContain('禁止念技术元数据、工具名、搜索过程或字段');
        expect(system).toContain('80-150 字');
        expect(system).not.toContain('禁止每段都报歌名');
        expect(system).not.toContain('不合格');
    });

    it('passes tool results as labeled fields', () => {
        const source = buildRadioBriefSourcePrompt(materials, null);
        expect(source).toContain('本首是第 0 首。');
        expect(source).toContain('歌名：夜曲');
        expect(source).toContain('专辑：十一月的萧邦');
        expect(source).toContain('为电影《头文字D》创作。');
        expect(source).toContain('网搜综合：');
        expect(source).not.toContain('https://example.com');
        expect(source).not.toContain('禁止照念');
        expect(source).not.toContain('报幕腔');
    });
});
