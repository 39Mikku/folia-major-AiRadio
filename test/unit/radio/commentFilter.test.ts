import { describe, expect, it } from 'vitest';
import { isStoryComment, pickCleanHotComments } from '@/services/radio/commentFilter';

// test/unit/radio/commentFilter.test.ts

describe('commentFilter', () => {
    it('keeps a story-shaped comment', () => {
        expect(isStoryComment('那年夏天我在地铁里第一次听到这首歌，窗外的雨一直在下个不停，我想起宿舍')).toBe(true);
    });

    it('drops links and short noise', () => {
        expect(isStoryComment('好听 https://example.com')).toBe(false);
        expect(isStoryComment('好听！')).toBe(false);
    });

    it('stops at the requested count', () => {
        const picked = pickCleanHotComments([
            { content: '那年夏天我在地铁里第一次听到这首歌，窗外的雨一直在下个不停，我想起宿舍', likedCount: 10 },
            { content: '打卡', likedCount: 99 },
            { content: '大学毕业那天晚上我把整张专辑循环到天亮，满脑子都是宿舍那盏灯', likedCount: 4 },
            { content: '下班路上听到这首就哭了，出租车窗外全是雨和路灯，我想起那年', likedCount: 2 },
        ], 2);
        expect(picked).toHaveLength(2);
        expect(picked[0].content).toContain('地铁');
    });

    it('uses raw hot comments when none pass the story filter', () => {
        const picked = pickCleanHotComments([
            { content: '这首编曲真的很好听啊', likedCount: 8 },
            { content: '整张专辑循环了三天', likedCount: 3 },
        ], 2);
        expect(picked).toHaveLength(2);
    });
});
