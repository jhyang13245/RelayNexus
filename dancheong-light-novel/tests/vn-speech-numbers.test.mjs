import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { speakableKorean } from '../public/vn-speech-ko.mjs';

describe('speakableKorean counters', () => {
  it('reads multi-character native counters as native numbers', () => {
    assert.equal(speakableKorean('3마리'), '세 마리');
    assert.equal(speakableKorean('2가지'), '두 가지');
  });

  it('preserves existing single and multi-character counter readings', () => {
    assert.equal(speakableKorean('3개'), '세 개');
    assert.equal(speakableKorean('2명'), '두 명');
    assert.equal(speakableKorean('3시간'), '세 시간');
  });

  it('preserves unit and date readings', () => {
    assert.equal(speakableKorean('5km'), '오 킬로미터');
    assert.equal(speakableKorean('6월'), '유월');
    assert.equal(speakableKorean('10월'), '시월');
  });
});

