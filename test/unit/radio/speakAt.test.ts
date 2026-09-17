import { describe, expect, it } from 'vitest';
import { radioSpeakAtSec } from '@/services/radio/speakAt';
import type { TrackProfile } from '@/services/automix/trackProfile';

// test/unit/radio/speakAt.test.ts

const profile = (partial: Partial<TrackProfile>): TrackProfile => partial as TrackProfile;

describe('radioSpeakAtSec', () => {
    it('uses sectionStart when the profile measured a structural boundary', () => {
        expect(radioSpeakAtSec(profile({ sectionStart: 12.5, leadIn: 0.4 }))).toBe(12.5);
    });

    it('uses leadIn when sectionStart is null', () => {
        expect(radioSpeakAtSec(profile({ sectionStart: null, leadIn: 1.2 }))).toBe(1.2);
    });
});
