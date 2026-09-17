// src/services/radio/radioErrors.ts
// Maps engine/IPC failures onto i18n keys the status toast already knows how to show.

export const radioBriefErrorKey = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/TAVILY_API_KEY/i.test(message)) return 'status.radioBriefMissingTavily';
    if (/MINIMAX_API_KEY/i.test(message)) return 'status.radioBriefMissingMinimax';
    if (/not configured in settings|GEMINI_API_KEY|OPENAI_API_KEY|api key/i.test(message)) {
        return 'status.missingApiKey';
    }
    if (/hot comments|cleaned hot comments/i.test(message)) return 'status.radioBriefNoComments';
    if (/lyrics empty/i.test(message)) return 'status.radioBriefNoLyrics';
    if (/web search/i.test(message)) return 'status.radioBriefNoWeb';
    if (/unsupported/i.test(message) && /hotComments/i.test(message)) return 'status.radioBriefNoCommentsCapability';
    if (/MiniMax/i.test(message)) return 'status.radioBriefTtsFailed';
    if (/Tavily/i.test(message)) return 'status.radioBriefWebFailed';
    if (/JSON/i.test(message) || /brief/i.test(message)) return 'status.radioBriefWriteFailed';
    return 'status.radioBriefFailed';
};
