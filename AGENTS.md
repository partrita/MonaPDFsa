# Project Instructions (for AI Agents)

## Language Rule — Always Use ASD-STE100
- Always write all agent-facing text in ASD-STE100 Simplified Technical English.
- Use short sentences. Use approved words. Avoid ambiguity.
- Do not use idioms. Do not use long nouns. Do not use passive voice unless needed.
- Apply this rule to: comments, commit messages, pull request descriptions, documentation, and chat replies.

## Project overview

Open Redact PDF is a browser-first PDF redaction engine implemented in Rust and exposed through WebAssembly.

Core product rules:

- Redaction must operate on PDF structure, not canvas overlays.
- Unredacted text should remain searchable and selectable whenever the supported subset allows it.
- Unsupported features must fail explicitly rather than silently degrade or corrupt output.
- Page-space geometry is the canonical redaction input model. UI tools are adapters, not the engine.

## Working rules

- If you change Rust code that affects browser behavior, rebuild the wasm bundle with `pnpm wasm:build`.
- If you change public Rust or TS APIs, update both the code-level docs and the publishable docs in `docs/`.
- Keep the fixture corpus and integration tests aligned with supported behavior. Do not widen support without tests.
- Preserve the current MVP philosophy: smaller correct support is better than broad fragile support.
- Do not claim support for PDF features unless the parser, extraction path, apply path, and save path all agree.

## Testing instructions

- For engine changes, run `cargo test --workspace` and `cargo clippy --workspace --all-targets -- -D warnings`.
- For TS SDK or demo changes, run `pnpm --filter @fabifont/open-redact-pdf build`, `pnpm --filter open-redact-pdf-demo-web build`, and `pnpm --filter open-redact-pdf-demo-web test`.
- When redaction behavior changes, prefer adding or updating integration coverage in `tests/integration/end_to_end.rs`.
- Fixture PDFs are generated from `tests/fixtures/generate-fixtures.mjs`; regenerate them when the fixture corpus changes.

## Documentation instructions

- The human-facing docs site lives in `docs/`.
- The root landing page is `docs/index.md`.
- Stable API references live under `docs/reference/`.
- Workflow and integration guides live under `docs/guides/`.
- `docs/publishing.md` describes the GitHub Pages setup and the documentation layout intended for later Context7 ingestion.
- Deep implementation internals live under `docs/internals/`. Start with `docs/internals/00-reading-order.md` for the recommended reading order.

## Security considerations

- A visible black rectangle is not a redaction result unless the underlying targeted content is removed or neutralized.
- Never introduce a fallback that rasterizes full pages without documenting it as a deliberate, constrained behavior.
- When partial support is not safe, return an explicit `Unsupported` or `UnsupportedOption` error.

## Commit guidance

- Use short imperative commit messages.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) so the changelog generator can pick the right section: `feat`, `fix`, `perf`, `refactor`, `build`, `ops`, `chore`, `docs`, `style`, `test`, `revert`. The first three plus `revert` make it into `CHANGELOG.md`; `docs`, `style`, `test`, and `chore` are skipped.
- Keep refactors, behavior fixes, and fixture updates together only when they are directly coupled.
- After public API changes, update `README.md`, `AGENTS.md`, and the relevant docs pages in the same change.

## Changelog

- `CHANGELOG.md` is generated from the conventional-commit history by [git-cliff](https://git-cliff.org/) using `cliff.toml`.
- Regenerate the full file before tagging a release:
  ```
  git-cliff -o CHANGELOG.md
  ```
  Or stage just the unreleased range when bumping to a new tag:
  ```
  git-cliff --unreleased --tag v<NEW> --prepend CHANGELOG.md
  ```
- Commit the regenerated `CHANGELOG.md` alongside the version bump.
