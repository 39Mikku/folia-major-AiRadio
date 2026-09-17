import type { TrackProfile } from '../automix/trackProfile';

// src/services/radio/speakAt.ts
// Incoming-track intro in Folia is `sectionStart` (src/services/automix/transitionPlanner.ts).
// `leadIn` is the always-written first-sound field on the same TrackProfile.

export const radioSpeakAtSec = (profile: TrackProfile): number => (
    profile.sectionStart ?? profile.leadIn
);
