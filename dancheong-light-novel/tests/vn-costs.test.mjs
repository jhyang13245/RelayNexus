import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateCost, sumCosts, usageReceipt } from '../public/vn-cost-core.mjs';
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
test('Luna의 캐시와 출력 토큰을 따로 계산하고 장문 요율을 반영한다', () => {
  approx(estimateCost({ model: 'gpt-5.6-luna', usage: { input_tokens: 10000, output_tokens: 1000, input_tokens_details: { cached_tokens: 4000 } } }).usd, .00248);
  approx(estimateCost({ model: 'gpt-5.6-luna', usage: { input_tokens: 300000, output_tokens: 1000 } }).usd, .1218);
});
test('실제 이미지 응답 모델을 기준으로 텍스트·이미지 입력과 출력을 계산한다', () => {
  const usage = { input_tokens: 1000, output_tokens: 500, input_tokens_details: { text_tokens: 200, image_tokens: 800 } };
  approx(estimateCost({ model: 'gpt-image-2.5-flare', usage }).usd, .0224);
  approx(estimateCost({ model: 'gpt-image-2', usage }).usd, .0112);
  assert.equal(estimateCost({ model: 'gpt-image-2.5-flare', usage: { ...usage, input_tokens_details: { ...usage.input_tokens_details, cached_tokens: 100 } } }).kind, 'upper-bound');
});
test('구독·사용량 누락·미지원 모델은 0달러 청구로 표시하지 않는다', () => {
  assert.deepEqual(estimateCost({ provider: 'go', model: 'gpt-5.6-luna' }), { usd: null, kind: 'subscription' });
  assert.deepEqual(estimateCost({ model: 'gpt-5.6-luna' }), { usd: null, kind: 'unknown' });
  assert.equal(estimateCost({ model: 'unknown', usage: { input_tokens: 1, output_tokens: 1 } }).usd, null);
  const total = sumCosts([{ cost: { usd: .5, kind: 'estimate' } }, { provider: 'go' }, {}]);
  assert.equal(total.usd, .5); assert.equal(total.unknown, 1); assert.equal(total.subscription, 1);
});
test('Responses 스트림 완료 이벤트와 이미지 JSON에서 사용량을 추출한다', () => {
  const response = { model: 'gpt-5.6-luna', usage: { input_tokens: 100, output_tokens: 20 } };
  assert.deepEqual(usageReceipt({ type: 'response.completed', response }), usageReceipt(response));
  assert.equal(usageReceipt({ type: 'response.output_text.delta', delta: '본문' }), null);
});
