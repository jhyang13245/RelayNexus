"use client";
import { lazy, Suspense } from 'react';
const Editor=lazy(()=>import('../../features/jieum/jieum-editor'));
export default function JieumClient(){return <Suspense fallback={<main className="jieum-loading"><h1>단청 지음</h1><p>저작 공간을 준비하고 있습니다.</p></main>}><Editor/></Suspense>}
