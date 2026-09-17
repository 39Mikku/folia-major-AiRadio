import type { RadioHotComment } from '../../types/radioBrief';

// src/services/radio/commentFilter.ts
// Copied from cyberradio/mcp-server/tools/ncm.js makeCleaner + STORY_HINTS.
// Drops check-ins, links, and short noise; keeps story-shaped hot comments for the brief.

const STORY_HINTS = /(我|那年|那天|当时|那时|大学|高三|高中|初中|她|他|奶奶|爷爷|爸爸|妈妈|哥哥|姐姐|失去|哭了|想起|怀念|喜欢|分手|毕业|宿舍|凌晨|地铁|出租车|窗外|雨|雪|下班)/;

export const isStoryComment = (content: string, minLength = 30, maxLength = 250): boolean => {
    if (!content) return false;
    const len = [...content].length;
    if (len < minLength || len > maxLength) return false;
    if (/https?:\/\//.test(content)) return false;
    if (/@[\u4e00-\u9fa5\w]+/.test(content)) return false;
    if ((content.match(/[!！]{2,}/g) || []).length > 0) return false;
    return STORY_HINTS.test(content);
};

const toComment = (item: { content?: string; likedCount?: number; likes?: number }): RadioHotComment | null => {
    const content = typeof item.content === 'string' ? item.content.trim() : '';
    if (!content) return null;
    return { content, likes: Number(item.likedCount ?? item.likes ?? 0) };
};

export const pickCleanHotComments = (
    raw: Array<{ content?: string; likedCount?: number; likes?: number }>,
    limit: number,
): RadioHotComment[] => {
    const stories: RadioHotComment[] = [];
    for (const item of raw) {
        const comment = toComment(item);
        if (!comment || !isStoryComment(comment.content)) continue;
        stories.push(comment);
        if (stories.length >= limit) return stories;
    }
    if (stories.length > 0) return stories;

    const usable: RadioHotComment[] = [];
    for (const item of raw) {
        const comment = toComment(item);
        if (!comment || comment.content.length < 8) continue;
        usable.push(comment);
        if (usable.length >= limit) break;
    }
    return usable;
};
