# GPT 6 Luna writer migration — 1.23.1

OpenAI and OpenCode Go gameplay writing now default to `gpt-6-luna`. Cortex sends its existing explicit `low` reasoning effort and applies the same natural text-display cadence as 5.6 Luna. The published prose, scenario instructions, output budgets, saves and package contracts are unchanged.

## Scope and compatibility

- Update the text-provider catalog, hosted/standalone Cortex defaults, legacy gameplay defaults, connection checks and visible model labels.
- Keep Cortex publication review, continuity, event verdict, branch recovery and memory requests pinned to `gpt-5.6-luna`; keep Jieum draft generation unchanged.
- The Go transport preserves each Luna request's model instead of replacing every request with the writer model. It still uses the Go key and fixed Go endpoint for both Luna generations. The authenticated proxy accepts `gpt-6-luna` and `gpt-5.6-luna` so older open clients continue to work. Muse routing and key separation are unchanged.
- Recognize the new model in reader/server token costs and multiplayer billing; preserve historical 5.6 pricing. Cache reads/writes and the >272,000 input-token surcharge are included. Rates per million tokens: input $0.10, cached input $0.01, cache write $0.125, output $0.50.
- The existing provider preference and encrypted key identifiers do not change. Existing hosted sessions get the current writer on their next settings handshake; no story/package reinstallation or data migration is required. Explicit custom model settings in legacy saves remain explicit.

## Official availability checked 2026-09-24

- [OpenAI GPT 6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): Responses, streaming, structured output, explicit low effort and pricing.
- [OpenAI migration guidance](https://developers.openai.com/api/docs/guides/latest-model): preserve effective reasoning and existing request contracts.
- [OpenCode Go](https://opencode.ai/docs/go/): lists GPT 6 Luna as `gpt-6-luna` at `https://opencode.ai/zen/go/v1/responses`, including short/long-context rates. The older `/docs/en/go/` address and cached search snippets did not provide the current catalog; the current canonical page does.

## Validation boundary

Regression checks cover new and legacy Go allowlisting, unchanged Muse requests, low writer effort, preserved 5.6 adjudication, key separation, successful mocked Canon turns through both providers, new/legacy cache and long-context prices, and mixed-model multiplayer attribution. Existing suites and the production build are run for this release.

No paid live model calls or Korean-fiction A/B benchmark were run. Public Go availability does not verify access for each individual subscription; the app's connection check validates the selected model with the user's own key.
