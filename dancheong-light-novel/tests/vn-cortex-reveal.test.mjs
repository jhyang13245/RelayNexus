import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('VN pacing adapter releases published chunks while retaining Cortex media/publication gates', () => {
  const html = readFileSync(new URL('../public/cortex.html', import.meta.url), 'utf8');
  const start = html.indexOf('function createTypewriterV180(');
  const end = html.indexOf('/* v1.19.0', start);
  assert.ok(start > 0 && end > start);
  const tasks = new Map(); let sequence = 0, allowed = 0;
  const context = {
    NexusVNHandlesTextReveal: true,
    settings: { typingSpeed: 'natural', model: 'gpt-5.6-luna' },
    asText: value => String(value ?? ''), performance: { now: () => 1000 },
    setTimeout: callback => { tasks.set(++sequence, callback); return sequence; },
    requestAnimationFrame: callback => callback(), renderTurns: () => {},
    window: { NexusCortexSpeakerMedia: { gate: (_turn, _text, _shown, proposed) => Math.min(allowed, proposed) } },
  };
  const create = runInNewContext(`(${html.slice(start, end).trim()})`, context);
  const turn = { text: '미공개 내부 초안', metrics: {} };
  const writer = create(turn);
  const tick = () => { const [id, callback] = tasks.entries().next().value; tasks.delete(id); callback(); };
  writer.push('공개된 첫 문단'); tick();
  assert.equal(turn.displayText, '', 'blocked media prefix must stay blocked');
  allowed = 4; tick();
  assert.equal(turn.displayText, '공개된 ', 'only the allowed prefix is published');
  allowed = Infinity; tick();
  assert.equal(turn.displayText, '공개된 첫 문단', 'chunk is available to the VN clock without upstream character pacing');
  assert.equal(context.settings.typingSpeed, 'natural', 'user preference is preserved');
  assert.ok(!turn.displayText.includes('미공개'), 'unpublished draft is never fed to the reader');
});
