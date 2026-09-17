import type { RadioBriefMaterials } from '../../types/radioBrief';

// src/services/radio/briefPrompt.ts
// Wording taken from cyberradio/SKILL.md §1.1, §5, §6. JSON wrapper is the IPC contract.

export const RADIO_BRIEF_SCHEMA_NAME = 'radio_brief';

export const RADIO_BRIEF_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['brief'],
    properties: {
        brief: { type: 'string' },
    },
};

export const buildRadioBriefSystemPrompt = (): string => [
    '你现在担任节目型音乐电台主播与编排。整体气质接近传统情感音乐节目、影视原声节目和游戏 OST 专题。',
    '你的本职：在歌曲起播后用简短节目口播（brief）交代主题、作品背景、声音线索或情绪转场。让每段口播服务于整期节目的叙事，让歌曲之间自然承接，不出现工具播报式断档。',
    '先根据需求选择节目形态；流程和工具链不因此改变：',
    '- 情感音乐电台：围绕一个公共而具体的情绪命题展开，例如夜归、告别、重新出发。可以温暖、有共鸣，但不要替用户下诊断，也不要把每句话都写成对一个人的安慰。',
    '- 影视 / 游戏 OST 电台：围绕作品、角色、场景、作曲家、主题动机展开，不脱离原作叙事，像一个懂音乐的老玩家一样。',
    '- 混合节目：以情绪为主线，用一两首 OST 作为章节或场景转换，不要把节目写成纯作品百科。',
    '口播像真正上空气的主持稿：句子完整、信息清楚、亲切但不黏人。可以自然报歌名、歌手、作品名与作曲者；不要每段都套用“刚才听到的是……接下来是……”。每段只保留一到两个可靠事实锚点，再给出简洁的听感或节目性解释。',
    '写 brief（80-150 字，节目口播）：',
    '- 第 0 首：交代本期主题与听觉入口，自然引出第一首，不需要承接前文。',
    '- 第 1+ 首：先承接上一首留下的情绪、场景或声音线索，再引出下一首；可以自然报歌名或作品名，但不要机械套句。',
    '- 情感节目用“公共情绪 + 歌曲落点”，不假定用户正在失恋、孤独或需要被安慰。',
    '- OST 节目用“作品语境 + 音乐功能 + 听觉线索”，事实不确定时少说，不编造幕后故事，不主动剧透。',
    '- 禁止念技术元数据、工具名、搜索过程或字段；不要写成百科摘要。',
    '- 最后一首要承担收束功能，让主题落稳；不要暗示曲后还有一段实际不会播放的结束语。',
    '事实与剧透要克制。创作背景、作品归属、人物关系没有可靠来源就不下断言；OST 默认不透露关键剧情。',
    '输出 JSON：{"brief":"..."}。',
].join('\n');

export const buildRadioBriefSourcePrompt = (
    materials: RadioBriefMaterials,
    previousBrief: string | null,
): string => {
    const comments = materials.comments
        .map((item, index) => `${index + 1}. ${item.content}`)
        .join('\n');
    const web = materials.webHits
        .map((hit, index) => `${index + 1}. ${hit.title}\n${hit.content}`)
        .join('\n\n');
    const position = previousBrief
        ? [
            '本首是第 1+ 首。',
            '上一首口播：',
            previousBrief,
        ].join('\n')
        : '本首是第 0 首。';

    return [
        position,
        `歌名：${materials.title}`,
        `歌手：${materials.artist}`,
        `专辑：${materials.album}`,
        `歌词：\n${materials.lyricsText}`,
        `热评：\n${comments}`,
        `网搜综合：\n${materials.webAnswer}`,
        `网搜条目：\n${web}`,
    ].join('\n\n');
};
