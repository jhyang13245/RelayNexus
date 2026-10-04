'use client';
import { useEffect, useState } from 'react';
import { deviceMuseReasoningEffort, deviceTextProvider, selectMuseReasoningEffort, selectTextProvider, TEXT_PROVIDERS, type MuseReasoningEffort, type TextProvider } from '../lib/text-provider';
export function TextProviderSelector({disabled=false}:{disabled?:boolean}) {
  const [provider,setProvider]=useState<TextProvider>('openai');
  const [museReasoning,setMuseReasoning]=useState<MuseReasoningEffort>('low');
  useEffect(()=>{setProvider(deviceTextProvider());setMuseReasoning(deviceMuseReasoningEffort())},[]);
  return <div className="text-provider-selector" data-provider={provider}>
    <div className="text-provider-options" role="radiogroup" aria-label="Cortex 집필 모델">
      {(['openai','opencode-go-luna','opencode-go'] as const).map(id=><button type="button" role="radio" aria-label={id==='openai'?'GPT 6 Luna · OpenAI':TEXT_PROVIDERS[id].label} aria-checked={provider===id} disabled={disabled} key={id} onClick={()=>{if(id!==provider){selectTextProvider(id);setProvider(id)}}}>
        <span><small>{id==='openai'?'OpenAI · 사용량 결제':'OpenCode Go · 구독'}</small><strong>{id==='opencode-go'?'Muse Spark 1.3': 'GPT 6 Luna'}</strong>{id==='opencode-go'&&<small>Contributor</small>}</span><b aria-hidden="true">{provider===id?'✓':'○'}</b>
      </button>)}
    </div>
    {provider==='opencode-go'&&<section className="muse-reasoning-selector" aria-labelledby="muse-reasoning-title">
      <div><strong id="muse-reasoning-title">추론 강도</strong><p>높을수록 첫 출력이 늦어질 수 있습니다.</p></div>
      <div role="radiogroup" aria-label="Muse 추론 강도">
        {([['low','낮음'],['medium','보통'],['high','높음']] as Array<[MuseReasoningEffort,string]>).map(([effort,label])=><button type="button" role="radio" aria-checked={museReasoning===effort} className={museReasoning===effort?'active':''} disabled={disabled} key={effort} onClick={()=>{selectMuseReasoningEffort(effort);setMuseReasoning(effort)}}><b>{label}</b><span>{effort==='low'?'속도 우선':effort==='medium'?'균형': '깊이 우선'}</span></button>)}
      </div>
    </section>}
    {provider!=='openai'&&<div className="opencode-go-guide">
      <div><strong>{provider==='opencode-go'?'Muse · Go 키로 연결':'Luna · Go 키로 연결'}</strong><p>{provider==='opencode-go'?'워크스페이스에서 Meta 데이터 전송·학습 사용 동의가 필요합니다.':'OpenAI 키가 아닌 OpenCode Go 키를 입력하세요.'}</p></div>
      <nav aria-label="OpenCode Go 설정">
        <a href="https://opencode.ai/go" target="_blank" rel="noreferrer">Go 소개 <em>↗</em></a>
        <a className="go-subscribe-button" href="https://opencode.ai/workspace/wrk_01M238PB85R2MWXNEH4SCK42E1/go" target="_blank" rel="noreferrer">내 Go 구독·결제 <em>↗</em></a>
      </nav>
      <details><summary>요금·데이터 안내</summary><p>Go에는 5시간·주간·월간 한도가 있으며 요금과 추가 과금 설정은 결제 화면을 확인하세요. {provider==='opencode-go'?'Contributor의 프롬프트와 출력은 Meta의 향후 모델 학습에 사용될 수 있습니다.':'Go 공식 안내상 Luna 데이터는 모델 학습에 사용되지 않으며 최대 30일 보관될 수 있습니다.'} 연결 확인은 소량의 사용량을 쓰며, 이미지·지음 등 OpenAI 전용 기능에는 별도의 OpenAI 키가 필요합니다.</p></details>
    </div>}
  </div>;
}
