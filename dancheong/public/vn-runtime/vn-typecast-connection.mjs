// Listing voices verifies the key without synthesizing/charging for a take.
export async function fetchTypecastCatalog(key, fetchCatalog = fetch) {
  if (!key) throw new Error('Typecast API 키를 먼저 입력해 주세요.');
  if (!/^\S{1,512}$/u.test(key)) throw new Error('Typecast API 키의 공백과 길이를 확인해 주세요.');
  let response;
  try {
    response = await fetchCatalog('/api/vn/typecast/voices?model=ssfm-v30', {
      headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(35000),
    });
  } catch { throw new Error('Typecast 연결이 지연되거나 끊겼습니다. 잠시 후 연결 확인을 다시 눌러 주세요.'); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result?.voices)) {
    const message = typeof result?.error?.message === 'string' ? result.error.message.split(key).join('[보호됨]').slice(0, 240)
      : `Typecast 캐릭터 목록을 불러오지 못했습니다 (${response.status}).`;
    throw new Error(message);
  }
  const voices = result.voices.filter(row => typeof row?.id === 'string' && /^[a-z]{2,4}_[A-Za-z0-9]{6,64}$/u.test(row.id));
  if (!voices.length) throw new Error('연결됐지만 SSFM 3.0에서 사용할 캐릭터가 없습니다. Typecast API 대시보드를 확인해 주세요.');
  return voices;
}
