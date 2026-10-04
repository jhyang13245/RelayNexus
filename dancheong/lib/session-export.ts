import { buildDetailedStatusView } from "./status-presentation";
import { isSensitivePublicStatusText } from "./status-window";
import { readClaudeRuntime } from "./claude-runtime";
import type {
  LongTermMemoryRecord,
  PublicStatusSnapshot,
  ScenarioMediaAsset,
  ScenarioPack,
  TurnRecord,
} from "./scenario";

export type SessionTranscriptExportInput = {
  pack: ScenarioPack;
  sessionName: string;
  chapterTitle: string;
  exportedAt: string;
  currentScene: {
    day: number;
    date: string;
    weekday: string;
    time: string;
    weather: string;
    location: string;
    summary: string;
  };
  turns: TurnRecord[];
  longTermMemories: LongTermMemoryRecord[];
  mediaUrls: Record<string, string>;
  playerImageUrl?: string;
  generatedSceneImageLimit: number;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const safeImageUrl = (value: string | undefined): string =>
  value && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)
    ? value
    : "";

const imageMarkup = (
  imageUrl: string | undefined,
  caption: string,
  kind: "character" | "scene",
): string => {
  const safeUrl = safeImageUrl(imageUrl);
  if (!safeUrl) return "";
  return `<figure class="export-image export-image-${kind}">
    <img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(caption)}" />
    <figcaption>${kind === "character" ? "CHARACTER PROFILE" : "SCENE FRAME"}<strong>${escapeHtml(caption)}</strong></figcaption>
  </figure>`;
};

const displayNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number(value);

const statusMarkup = (
  snapshot: PublicStatusSnapshot,
  pack: ScenarioPack,
  open: boolean,
): string => {
  const status = buildDetailedStatusView(snapshot);
  const publicRole = !pack.player.role || isSensitivePublicStatusText(pack.player.role)
    ? "플레이어 캐릭터"
    : pack.player.role;
  const publicAffiliation = !pack.player.affiliation ||
      isSensitivePublicStatusText(pack.player.affiliation)
    ? "소속 미공개"
    : pack.player.affiliation;
  const funds = status.funds ? displayNumber(status.funds.value) : Number.NaN;
  const resources = status.resources.map((item) => `
    <div class="resource-cell">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.displayValue)}${item.unit ? `<small>${escapeHtml(item.unit)}</small>` : ""}</strong>
    </div>`).join("");
  const stats = status.stats.map((item) => {
    const current = displayNumber(item.value);
    const maximum = item.maximum && item.maximum > 0 ? item.maximum : 100;
    const percent = Number.isFinite(current)
      ? Math.max(0, Math.min(100, (current / maximum) * 100))
      : 0;
    return `<div class="stat-row">
      <span>${escapeHtml(item.label)}</span>
      <i><b style="width:${percent}%"></b></i>
      <strong>${item.grade ? `<em>${escapeHtml(item.grade)}</em>` : ""}${escapeHtml(item.displayValue)}${item.maximum ? ` / ${escapeHtml(item.maximum)}` : ""}</strong>
    </div>`;
  }).join("");
  const relations = snapshot.relations.length
    ? `<section class="public-record"><h4>공개된 인물 관계</h4>${snapshot.relations.map((relation) => `
        <p><strong>${escapeHtml(relation.name)}</strong><span>${escapeHtml(relation.reasonTitle || relation.relationType)} · 신뢰 ${escapeHtml(relation.trust)}</span></p>`).join("")}</section>`
    : "";
  const traces = snapshot.worldTraces.length
    ? `<section class="public-record"><h4>확인된 현장 기록</h4>${snapshot.worldTraces.map((trace) => `<p><strong>TURN ${escapeHtml(trace.turn)}</strong><span>${escapeHtml(trace.text)}</span></p>`).join("")}</section>`
    : "";

  return `<details class="status-hud"${open ? " open" : ""}>
    <summary>
      <span class="status-mark">상태</span>
      <span><strong>현재 상태</strong><small>D+${escapeHtml(snapshot.day)} · ${escapeHtml(snapshot.date)} · ${escapeHtml(snapshot.time)}</small></span>
      <em>${snapshot.changedCount ? `${escapeHtml(snapshot.changedCount)}개 변화` : "변화 없음"}</em>
    </summary>
    <div class="hud-body">
      <header><span><i></i> TURN STATUS · LIVE</span><em>TURN ${String(snapshot.turn).padStart(2, "0")}</em></header>
      <section class="hud-profile">
        <div class="player-photo">${escapeHtml(pack.player.name.slice(0, 1))}</div>
        <div><small>PLAYER STATUS</small><strong>${escapeHtml(pack.player.name)}</strong><p>${escapeHtml(publicRole)} · ${escapeHtml(publicAffiliation)}</p></div>
        <b>● ACTIVE</b>
      </section>
      <section class="hud-section"><h4>✦ ABILITY</h4><p>${escapeHtml(status.ability?.displayValue || "현재 공개된 특별 능력은 아직 없다.")}</p></section>
      <section class="hud-section"><h4>◔ CORE STATS</h4>${stats || '<p class="hud-empty">현재 공개된 코어 스탯이 없습니다.</p>'}</section>
      <section class="hud-section"><h4>RESOURCES</h4><div class="resource-grid">${resources || '<p class="hud-empty">현재 공개된 자원 정보가 없습니다.</p>'}</div></section>
      <section class="condition-row"><h4>CONDITION</h4><p>${escapeHtml(status.condition?.displayValue || "현재 확인된 부상이나 이상 상태는 없다.")}</p></section>
      <section class="funds-row"><h4>▣ ${escapeHtml(status.funds?.label || "자금")}</h4><strong>${Number.isFinite(funds) ? `${funds.toLocaleString("ko-KR")}${escapeHtml(status.funds?.unit || "원")}` : "기록 없음"}</strong><span>${escapeHtml(snapshot.location)} · ${escapeHtml(snapshot.weather)}</span></section>
      ${relations}${traces}
    </div>
  </details>`;
};

const assetCaption = (
  asset: ScenarioMediaAsset | undefined,
  fallback: string,
): string => asset?.characterName || asset?.caption || asset?.label || fallback;

const recordedAtLabel = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

const turnMarkup = (
  turn: TurnRecord,
  index: number,
  input: SessionTranscriptExportInput,
  assets: Map<string, ScenarioMediaAsset>,
): string => {
  const usedTurnEndAssets = new Map<string, { caption: string; kind: "character" | "scene" }>();
  const blocks = turn.blocks.map((block, blockIndex) => {
    const cue = (turn.characterVisuals ?? []).find((item) => item.blockIndex === blockIndex);
    const assetId = block.mediaAssetId || cue?.canonicalAssetId || "";
    const asset = assets.get(assetId);
    const imageUrl = input.mediaUrls[assetId] ||
      (cue ? input.mediaUrls[cue.canonicalAssetId] : "");
    const placement = asset?.placement ?? (cue && imageUrl ? "after_block" : undefined);
    const caption = cue?.characterName || assetCaption(asset, "등장인물");
    const kind = cue || asset?.kind === "character" ? "character" as const : "scene" as const;
    if (placement === "turn_end" && imageUrl) {
      usedTurnEndAssets.set(assetId, { caption, kind });
    }
    const media = placement === "after_block"
      ? imageMarkup(
          imageUrl,
          caption,
          kind,
        )
      : "";
    if (block.type === "dialogue") {
      return `<div class="dialogue"><div class="dialogue-avatar">${escapeHtml((block.speakerName || "?").slice(0, 1))}</div><div><header><strong>${escapeHtml(block.speakerName || "이름 없는 인물")}</strong>${block.emotion ? `<span>${escapeHtml(block.emotion)}</span>` : ""}</header><p>“${escapeHtml(block.text.replace(/^[“\"]|[”\"]$/g, ""))}”</p></div></div>${media}`;
    }
    if (block.type === "system") {
      return `<p class="system-block">${escapeHtml(block.text)}</p>${media}`;
    }
    return `<p class="narration">${escapeHtml(block.text)}</p>${media}`;
  }).join("");
  const turnEndMedia = [...usedTurnEndAssets].map(([assetId, presentation]) => {
    return imageMarkup(
      input.mediaUrls[assetId],
      presentation.caption,
      presentation.kind,
    );
  }).join("");
  const sceneImage = turn.imageUrl
    ? imageMarkup(turn.imageUrl, `TURN ${turn.turn} 장면`, "scene")
    : turn.imagePrompt
      ? `<div class="missing-image"><strong>장면 이미지 기록 없음</strong><p>최근 ${input.generatedSceneImageLimit}개 보관 정책 이전의 이미지이거나 생성에 실패한 장면입니다.</p></div>`
      : "";
  const userMarker = turn.userText
    ? `<div class="user-input"><span>나의 입력</span><p>${escapeHtml(turn.userText)}</p></div>`
    : turn.advanceMode === "canonical"
      ? '<div class="canonical-input">▷ 이어서 진행 <small>패키지 정석 전개</small></div>'
      : "";
  const status = turn.statusSnapshot
    ? statusMarkup(turn.statusSnapshot, input.pack, index === input.turns.length - 1)
    : "";
  const recommendations = turn.recommendations.length
    ? `<section class="recommendations"><h4>당시 추천 행동</h4><ol>${turn.recommendations.map((item) => `<li><span>${escapeHtml(item.risk)}</span>${escapeHtml(item.label)}</li>`).join("")}</ol></section>`
    : "";

  return `<section class="turn" id="turn-${escapeHtml(turn.turn)}">
    <header class="turn-meta"><strong>TURN ${String(turn.turn).padStart(2, "0")}</strong><span>생성 기록 · ${escapeHtml(recordedAtLabel(turn.createdAt))}</span></header>
    ${userMarker}${blocks}${turnEndMedia}${sceneImage}${status}${recommendations}
  </section>`;
};

export function buildSessionTranscriptHtml(
  input: SessionTranscriptExportInput,
): string {
  const assets = new Map(
    (input.pack.mediaAssets ?? []).map((asset) => [asset.id, asset] as const),
  );
  const safePlayerImage = safeImageUrl(input.playerImageUrl);
  const memoryMarkup = input.longTermMemories.length
    ? `<ol class="memory-list">${input.longTermMemories.map((memory) => `<li><div><span>D+${escapeHtml(memory.day)} · TURN ${String(memory.turn).padStart(2, "0")}</span><strong>${escapeHtml([memory.date, memory.weekday, memory.time].filter(Boolean).join(" · "))}</strong></div><article><h3>${escapeHtml(memory.title)}</h3>${memory.location ? `<small>${escapeHtml(memory.location)}</small>` : ""}<p>${escapeHtml(memory.summary)}</p></article></li>`).join("")}</ol>`
    : '<p class="empty-memory">아직 장기기억으로 전환된 사건이 없습니다.</p>';
  const lastRuntimeSnapshot = [...input.turns]
    .reverse()
    .find((turn) => turn.runtimeSnapshot)?.runtimeSnapshot;
  const eventLedger = lastRuntimeSnapshot
    ? readClaudeRuntime(input.pack, lastRuntimeSnapshot)
    : undefined;
  const carryoverEntries = (eventLedger?.sealed ?? []).filter((event) =>
    (event.carryoverItems?.length ?? 0) > 0 || event.carryoverResolution
  );
  const carryoverMarkup = carryoverEntries.length
    ? `<ol class="carryover-ledger">${carryoverEntries.map((event) => {
        const sourceEvent = input.pack.events.find((candidate) => candidate.id === event.id);
        const items = (event.carryoverItems ?? []).map((item) => `<li>
          <span class="carryover-state carryover-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
          <div><strong>${escapeHtml(item.requirement)}</strong>${item.resolutionSummary ? `<p>${escapeHtml(item.resolutionSummary)}</p>` : ""}${item.resolvedTurn ? `<small>→ TURN ${String(item.resolvedTurn).padStart(2, "0")}에서 처리</small>` : ""}</div>
        </li>`).join("");
        return `<li class="carryover-event"><header><span>봉인 사건</span><strong>${escapeHtml(sourceEvent?.name || event.id)}</strong></header><ul>${items}</ul>${event.carryoverResolution ? `<p class="carryover-resolution">${escapeHtml(event.carryoverResolution)}</p>` : ""}</li>`;
      }).join("")}</ol>`
    : '<p class="empty-memory">다음 사건으로 이월된 미완료 조건이 없습니다.</p>';
  const turns = input.turns.map((turn, index) =>
    turnMarkup(turn, index, input, assets)
  ).join("");
  const imageCount = (turns.match(/<img\b/gu) ?? []).length +
    (safePlayerImage ? 1 : 0);

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(input.pack.title)} · ${escapeHtml(input.sessionName)} 전문</title>
<style>
:root{--ink:#17202a;--muted:#737b86;--line:#e7e5df;--paper:#fffefb;--warm:#f6f2eb;--accent:#ef642f;--navy:#172531;${safePlayerImage ? `--player-image:url("${safePlayerImage}");` : ""}}
*{box-sizing:border-box}body{margin:0;background:var(--warm);color:var(--ink);font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo",sans-serif;line-height:1.7}main{width:min(980px,100%);margin:auto;padding:48px 22px 100px}.cover{padding:38px;border:1px solid #e8e2d9;border-radius:26px;background:var(--paper);box-shadow:0 20px 60px rgba(35,38,42,.08)}.cover small,.eyebrow{color:var(--accent);font-size:11px;font-weight:900;letter-spacing:.16em}.cover h1{margin:9px 0 4px;font-family:Georgia,"Noto Serif KR",serif;font-size:34px;line-height:1.2}.cover h2{margin:0;color:#6d737b;font-size:17px}.cover-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:28px}.cover-grid div{padding:14px;border-radius:14px;background:#f8f5ef}.cover-grid span,.cover-grid strong{display:block}.cover-grid span{color:#9a948a;font-size:10px}.cover-grid strong{margin-top:3px;font-size:13px}.current-scene{margin-top:18px;padding:18px;border-left:4px solid var(--accent);background:#fff7f2}.current-scene strong{display:block}.current-scene p{margin:4px 0 0;color:#606873}.section-heading{margin:48px 0 18px}.section-heading span{color:var(--accent);font-size:10px;font-weight:900;letter-spacing:.15em}.section-heading h2{margin:3px 0 0;font-family:Georgia,"Noto Serif KR",serif}.memory-list{margin:0;padding:0;list-style:none}.memory-list li{display:grid;grid-template-columns:190px 1fr;gap:18px;padding:18px 0;border-top:1px solid var(--line)}.memory-list li>div span,.memory-list li>div strong{display:block}.memory-list li>div span{color:var(--accent);font-size:10px;font-weight:800}.memory-list li>div strong{font-size:11px}.memory-list article h3{margin:0;font-size:15px}.memory-list article small{color:var(--muted)}.memory-list article p{margin:6px 0}.empty-memory{padding:20px;border:1px dashed #d8d2c8;border-radius:14px;color:var(--muted);text-align:center}.turn{margin-top:34px;padding:30px;border:1px solid var(--line);border-radius:24px;background:var(--paper);box-shadow:0 12px 40px rgba(38,39,42,.05)}.turn-meta{display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid var(--line);color:#96918a;font-size:10px}.turn-meta strong{color:var(--accent);letter-spacing:.13em}.user-input,.canonical-input{margin-bottom:25px;padding:15px 18px;border-radius:15px;background:#fff2eb}.user-input span{color:#b9512c;font-size:10px;font-weight:900}.user-input p{margin:4px 0 0;font-weight:650}.canonical-input{font-weight:800}.canonical-input small{margin-left:6px;color:#aa8e80}.narration{margin:0 0 18px;white-space:pre-wrap;font-family:Georgia,"Noto Serif KR",serif;font-size:16px}.system-block{padding:13px 15px;border-radius:10px;background:#f3f0ea;color:#716b64;font-size:13px}.dialogue{display:grid;grid-template-columns:42px 1fr;gap:12px;margin:24px 0}.dialogue-avatar{display:grid;width:42px;height:42px;place-items:center;border-radius:50%;background:#78658a;color:#fff;font-weight:800}.dialogue header strong{font-size:14px}.dialogue header span{margin-left:8px;padding:3px 7px;border-radius:99px;background:#f1eee9;color:#8b857d;font-size:9px}.dialogue p{margin:5px 0 0;font-size:17px;font-weight:650}.export-image{margin:26px 0;overflow:hidden;border:1px solid #ddd8cf;border-radius:20px;background:#f0ece6}.export-image img{display:block;width:100%;height:auto;max-height:760px;object-fit:contain;background:#171b20}.export-image-scene img{aspect-ratio:16/9;object-fit:cover}.export-image figcaption{display:flex;gap:12px;align-items:center;padding:13px 16px;background:var(--paper);color:#a06950;font-size:9px;font-weight:900;letter-spacing:.13em}.export-image figcaption strong{color:var(--ink);font-size:14px;letter-spacing:0}.missing-image{margin:22px 0;padding:16px;border:1px dashed #d9d2c8;border-radius:13px;color:#817a72}.missing-image p{margin:3px 0 0;font-size:12px}.status-hud{margin:30px 0;border-radius:20px;background:#1a2630;color:#dce5e9;overflow:hidden}.status-hud summary{display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center;padding:17px 20px;cursor:pointer}.status-mark{display:grid;width:42px;height:42px;place-items:center;border:1px solid #355266;border-radius:12px;color:#78a9c7;font-style:italic}.status-hud summary strong,.status-hud summary small{display:block}.status-hud summary small{color:#82929b;font-size:10px}.status-hud summary em{color:#82b8d8;font-size:10px}.hud-body{padding:22px;border-top:1px solid rgba(255,255,255,.09);background:linear-gradient(135deg,#0d2028,#122d36)}.hud-body>header{display:flex;justify-content:space-between;padding-bottom:17px;border-bottom:1px solid rgba(255,255,255,.1);font-size:10px;font-weight:900;letter-spacing:.13em}.hud-body>header i{display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;background:#69deb1}.hud-profile{display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center;padding:21px 0;border-bottom:1px solid rgba(255,255,255,.1)}.player-photo{display:grid;width:58px;height:72px;place-items:center;border-radius:15px;background-color:#253a47;background-image:var(--player-image);background-position:center;background-size:cover;font-size:22px}.hud-profile small,.hud-profile strong,.hud-profile p{display:block;margin:0}.hud-profile small{color:#e69a72;font-size:9px;letter-spacing:.14em}.hud-profile strong{font-size:21px}.hud-profile p{color:#93a5ae;font-size:11px}.hud-profile>b{color:#72deb0;font-size:9px}.hud-section{padding:18px 0;border-bottom:1px solid rgba(255,255,255,.1)}.hud-section h4,.condition-row h4,.funds-row h4{margin:0 0 8px;color:#7ca4b8;font-size:10px;letter-spacing:.14em}.hud-section p{margin:0;font-size:12px}.stat-row{display:grid;grid-template-columns:80px 1fr 120px;gap:10px;align-items:center;margin:10px 0;font-size:11px}.stat-row>i{height:5px;border-radius:99px;background:#31444d;overflow:hidden}.stat-row>i>b{display:block;height:100%;background:#73d8b2}.stat-row>strong{text-align:right}.stat-row em{margin-right:5px;color:#7ed8b5}.resource-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.resource-cell{padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:13px;text-align:center}.resource-cell span,.resource-cell strong{display:block}.resource-cell span{color:#9cb0ba;font-size:9px}.resource-cell strong{margin-top:4px;font-size:18px}.resource-cell small{margin-left:3px;font-size:9px}.condition-row,.funds-row{display:grid;grid-template-columns:110px 1fr auto;gap:12px;align-items:center;padding:15px 0;border-bottom:1px solid rgba(255,255,255,.1)}.condition-row p{margin:0;font-size:11px}.funds-row strong{font-size:18px}.funds-row span{color:#879ba5;font-size:9px}.public-record{margin-top:17px;padding-top:15px;border-top:1px solid rgba(255,255,255,.1)}.public-record h4{margin:0 0 8px;color:#d59a79;font-size:10px}.public-record p{display:flex;justify-content:space-between;margin:6px 0;font-size:10px}.public-record p span{color:#9dafb8}.hud-empty{color:#8fa1aa!important}.recommendations{margin-top:24px;padding-top:16px;border-top:1px solid var(--line)}.recommendations h4{margin:0;font-size:11px}.recommendations ol{margin:8px 0 0;padding-left:22px}.recommendations li{margin:6px 0}.recommendations li span{margin-right:8px;padding:2px 6px;border-radius:99px;background:#f5e9e1;color:#a65030;font-size:9px}.export-foot{margin-top:50px;padding:20px;border-top:1px solid var(--line);color:#8a857e;font-size:11px;text-align:center}
.carryover-ledger,.carryover-ledger ul{margin:0;padding:0;list-style:none}.carryover-event{margin:12px 0;padding:20px;border:1px solid #dfd8cb;border-left:4px solid #8a6c55;border-radius:14px;background:#f5f1e9}.carryover-event>header span,.carryover-event>header strong{display:block}.carryover-event>header span{color:#9b765d;font-size:9px;font-weight:900;letter-spacing:.13em}.carryover-event>header strong{font-size:16px}.carryover-event ul>li{display:grid;grid-template-columns:auto 1fr;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #ddd4c7}.carryover-event li p{margin:3px 0;color:#625f59;font-size:12px}.carryover-event li small{color:#92725d}.carryover-state{align-self:start;padding:3px 7px;border-radius:99px;background:#ddd3c6;color:#594c42;font-size:9px;font-weight:900}.carryover-resolved{background:#d8eee4;color:#28744f}.carryover-substituted{background:#f0dfc2;color:#895f1a}.carryover-resolution{margin:14px 0 0;padding:12px;border-radius:10px;background:#fffaf2;color:#5f574e;font-size:12px}
@media(max-width:640px){main{padding:18px 10px 70px}.cover,.turn{padding:20px;border-radius:18px}.cover h1{font-size:25px}.cover-grid{grid-template-columns:1fr}.memory-list li{grid-template-columns:1fr;gap:6px}.narration{font-size:15px}.dialogue p{font-size:15px}.status-hud summary{padding:13px}.hud-body{padding:15px}.hud-profile{grid-template-columns:52px 1fr}.hud-profile>b{display:none}.player-photo{width:48px;height:60px}.stat-row{grid-template-columns:60px 1fr 85px}.resource-grid{grid-template-columns:1fr 1fr}.condition-row,.funds-row{grid-template-columns:1fr}.condition-row h4,.funds-row h4{margin:0}.public-record p{display:block}.public-record p span{display:block}}
@media print{body{background:#fff}main{width:100%;padding:0}.cover,.turn{box-shadow:none;break-inside:avoid}.status-hud{break-inside:avoid}.export-image{break-inside:avoid}}
</style>
</head>
<body>
<main>
  <header class="cover">
    <small>RELAY NOVEL · COMPLETE TRANSCRIPT</small>
    <h1>${escapeHtml(input.pack.title)}</h1>
    <h2>${escapeHtml(input.sessionName)} · ${escapeHtml(input.chapterTitle)}</h2>
    <div class="cover-grid">
      <div><span>플레이어</span><strong>${escapeHtml(input.pack.player.name)}</strong></div>
      <div><span>기록 범위</span><strong>${input.turns.length}개 턴 · 장기기억 ${input.longTermMemories.length}건</strong></div>
      <div><span>포함된 이미지</span><strong>${imageCount}개</strong></div>
    </div>
    <div class="current-scene"><strong>D+${escapeHtml(input.currentScene.day)} · ${escapeHtml(input.currentScene.date)} ${escapeHtml(input.currentScene.weekday)} · ${escapeHtml(input.currentScene.time)}</strong><span>${escapeHtml(input.currentScene.weather)} · ${escapeHtml(input.currentScene.location)}</span><p>${escapeHtml(input.currentScene.summary)}</p></div>
  </header>
  <section><div class="section-heading"><span>CHRONOLOGICAL MEMORY</span><h2>장기기억</h2></div>${memoryMarkup}</section>
  <section><div class="section-heading"><span>SEALED EVENT CROSS-REFERENCE</span><h2>이월 조건 처리 기록</h2></div>${carryoverMarkup}</section>
  <section><div class="section-heading"><span>FULL CONVERSATION</span><h2>대화 및 스토리 전문</h2></div>${turns}</section>
  <footer class="export-foot">${escapeHtml(input.exportedAt)}에 내보냄 · 공개된 플레이 기록만 포함 · 생성 이미지는 세션 보관 정책상 최근 ${input.generatedSceneImageLimit}개까지 포함됩니다.</footer>
</main>
</body>
</html>`;
}

export const sessionTranscriptFileName = (
  title: string,
  sessionName: string,
  exportedAt: Date,
): string => {
  const safe = (value: string) => value
    .normalize("NFKC")
    .replace(/[^0-9A-Za-z가-힣_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70) || "릴레이소설";
  const stamp = [
    exportedAt.getFullYear(),
    String(exportedAt.getMonth() + 1).padStart(2, "0"),
    String(exportedAt.getDate()).padStart(2, "0"),
    "_",
    String(exportedAt.getHours()).padStart(2, "0"),
    String(exportedAt.getMinutes()).padStart(2, "0"),
  ].join("");
  return `${safe(title)}_${safe(sessionName)}_전문_${stamp}.html`;
};
