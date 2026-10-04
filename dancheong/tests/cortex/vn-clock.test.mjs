import test from 'node:test';
import assert from 'node:assert/strict';
import {storyClockLabel} from '../../public/cortex-vn-clock.mjs';

test('story clock uses the selected saved beat, not held lighting or a later calendar day',()=>{
  const scenario={world:{day:4,time:'21:10:00'}};
  const turns=[{status:'COMMITTED',vnScene:{world:{time:'08:35:00'}}},{status:'COMMITTED',vnScene:{world:{day:4,time:'21:10:00'}}}];
  assert.equal(storyClockLabel({page:{turnIndex:0},turns,scenario}),'08:35:00');
  assert.equal(storyClockLabel({page:{turnIndex:1},turns,scenario}),'D+4 · 21:10:00');
  assert.equal(storyClockLabel({page:{turnIndex:-1},turns,scenario}),'시간 미정');
  assert.equal(storyClockLabel({page:{turnIndex:-1},turns:[],scenario:{world:{day:0,time:'08:00:00'}}}),'D+0 · 08:00:00');
  turns[1].status='ADJUDICATION_PENDING';
  assert.equal(storyClockLabel({page:{turnIndex:1},turns,scenario}),'마지막 확인 · D+4 · 21:10:00');
});
