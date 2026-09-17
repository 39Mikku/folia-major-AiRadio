import type { LyricData } from '../../types';

// src/services/radio/lyricText.ts
// Copied from cyberradio/mcp-server/tools/ncm.js vocalLines / META_PAT.
// The brief prompt needs sung lines, not credit blocks.

const META_PAT = /^(作词|作曲|编曲|制作|出品|监制|混音|母带|演唱|歌手|主唱|和声|配唱|录音|吉他|贝斯|鼓|弦乐|键盘|钢琴|Producer|Composer|Lyricist|Arranger|Mixed|Mastered|Vocal|Recorded|Performed|by[:：]?\s|作詞|作曲家|編曲|歌詞|演奏)/i;

export const lyricTextForBrief = (lyrics: LyricData | null | undefined): string => {
    const lines = lyrics?.lines ?? [];
    const sung = lines
        .map(line => line.fullText.trim())
        .filter(text => {
            if (!text) return false;
            if (META_PAT.test(text)) return false;
            if (/^[A-Za-z\u4e00-\u9fa5]{1,8}\s*[:：]/.test(text)) return false;
            return true;
        });
    return sung.join('\n');
};
