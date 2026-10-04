'use client';
export function OpenAIApiGuide({onGuide,openaiOnly=false}:{onGuide:()=>void;openaiOnly?:boolean}) {
  return <div className={`api-setup-guide${openaiOnly?' openai-only-guide':''}`}>
    <div className="api-setup-guide-head"><div><strong>처음 연결하시나요?</strong><small>OpenAI 공식 화면에서 결제와 키 발급을 완료한 뒤 이곳에 한 번만 입력하세요.</small></div><button type="button" onClick={onGuide}>4단계 설정 가이드</button></div>
    <nav aria-label="OpenAI API 시작 설정">
      <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer"><b>1</b><span>결제 설정 열기</span><em>↗</em></a>
      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"><b>2</b><span>API 키 발급하기</span><em>↗</em></a>
    </nav>
  </div>;
}
