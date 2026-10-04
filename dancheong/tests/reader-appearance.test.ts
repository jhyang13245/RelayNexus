import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const shellState = await readFile(
  new URL("../app/hooks/use-nexus-shell-state.ts", import.meta.url),
  "utf8",
);
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const cortexCss = await readFile(new URL("../public/cortex-nexus.css", import.meta.url), "utf8");
const cortexEngine = await readFile(new URL("../vendor/cortex/parts/08.part", import.meta.url), "utf8");
const version = await readFile(new URL("../lib/app-version.ts", import.meta.url), "utf8");

test("v1.10.3 locks the unzoomed session reader to vertical touch scrolling", () => {
  assert.match(
    css,
    /\.story-scroll\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-x:\s*clip;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior-x:\s*none;[\s\S]*?touch-action:\s*pan-y pinch-zoom/u,
  );
  assert.match(css, /\.app-shell \.story-content\s*\{[\s\S]*?overflow-wrap:\s*anywhere/u);
});

test("v1.10.3 offers persistent small medium and large prose scales", () => {
  assert.match(shellState, /type ReadingFontSize = "small" \| "medium" \| "large"/u);
  assert.match(shellState, /useState<ReadingFontSize>\("small"\)/u);
  assert.match(page, /\["small", "medium", "large"\]\.includes\(saved\.readingFontSize/u);
  assert.match(page, /JSON\.stringify\(\{ theme: themeMode, readingWidth, readingFontSize, typingSpeed \}\)/u);
  assert.match(page, /\["small", "소"\][\s\S]*?\["medium", "중"\][\s\S]*?\["large", "대"\]/u);
  assert.match(page, /font-\$\{readingFontSize\}/u);
  assert.match(css, /\.app-shell\.font-small\s*\{[\s\S]*?--reader-prose-size:\s*15\.5px/u);
  assert.match(css, /\.app-shell\.font-medium\s*\{[\s\S]*?--reader-prose-size:\s*17\.5px/u);
  assert.match(css, /\.app-shell\.font-large\s*\{[\s\S]*?--reader-prose-size:\s*19\.5px/u);
  assert.match(css, /\.app-shell \.narration\s*\{[^}]*font-size:\s*var\(--reader-prose-size\)/u);
  assert.match(css, /\.app-shell \.dialogue-copy p\s*\{[^}]*font-size:\s*var\(--reader-dialogue-size\)/u);
});

test("Cortex images use the mobile reading width without browser figure gutters", () => {
  assert.match(cortexCss, /\.turn-image-panel\{[^}]*width:100%;margin:24px 0 0/u);
  assert.match(cortexCss, /@media\(max-width:640px\)[\s\S]*?\.cortex-native \.turn-image-panel\{width:calc\(100% \+ 16px\);margin-left:-8px;margin-right:-8px\}/u);
});

test("Cortex paper ornaments use a transparent subtle quarter motif and scene changes use a dedicated knot", async () => {
  const view = await readFile(new URL("../public/cortex-nexus-view.js", import.meta.url), "utf8");
  assert.match(view, /paperOrnaments\.className='nexus-reading-ornaments'/u);
  assert.match(cortexCss, /\.nexus-reading-ornaments\{[^}]*calc\(var\(--reading-width\) \+ 56px\)/u);
  assert.match(cortexCss, /\.nexus-reading-ornaments::before,\.cortex-native \.nexus-reading-ornaments::after\{[^}]*dancheong-corner-quarter\.png[^}]*opacity:\.07/u);
  assert.doesNotMatch(cortexCss, /nexus-reading-ornaments[^}]*mix-blend-mode/u);
  assert.match(view, /knot\.src='\/dancheong-scene-knot\.png'/u);
  assert.match(cortexCss, /\.dancheong-scene-band\{[^}]*width:min\(84vw,376px\)/u);
});

test("reading width controls remain desktop-only", () => {
  assert.match(page, /generation-control-card reading-column-control[\s\S]{0,180}READING COLUMN/u);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.reading-column-control\s*\{\s*display:\s*none;/u);
});

test("the Cortex integration revision matches the published package version", async () => {
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.ok(version.includes(`APP_VERSION = "${pkg.version}"`));
});

test("Cortex engine notices use a Dancheong note card instead of unstyled prose", () => {
  assert.match(cortexEngine, /<aside class="engine-notice-stack" aria-label="엔진 특이사항">/u);
  assert.match(cortexCss, /\.cortex-native \.engine-notice-stack\{[^}]*display:grid[^}]*padding-top:20px/u);
  assert.match(cortexCss, /\.cortex-native \.engine-notice\{[^}]*border-top:3px solid var\(--engine-note-accent\)[^}]*background:/u);
  assert.match(cortexCss, /\.cortex-native \.engine-notice dl\{[^}]*grid-template-columns:44px minmax\(0,1fr\)/u);
});

test("the mobile continue action keeps its Korean label on one line", () => {
  assert.match(cortexCss, /\.cortex-native \.nexus-continue-button\{[^}]*white-space:nowrap[^}]*word-break:keep-all/u);
  assert.match(cortexCss, /\.cortex-native \.nexus-continue-button span\{white-space:nowrap\}/u);
  assert.match(cortexCss, /@media\(max-width:640px\)[^@]*\.cortex-native \.compose-actions>small\{flex:1 1 auto;margin-left:0\}/u);
});

test("iOS rotation cannot retain an autosized Cortex prose scale", () => {
  assert.match(css, /html,\s*body\s*\{[^}]*-webkit-text-size-adjust:\s*100%;[^}]*text-size-adjust:\s*100%;/u);
  assert.match(cortexCss, /html,body,\.cortex-native\{-webkit-text-size-adjust:100%;text-size-adjust:100%\}/u);
  assert.match(cortexCss, /\.cortex-native \.prose\{[^}]*font-size:var\(--prose-size\)/u);
});
