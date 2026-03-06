# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (Next.js only, no Tauri)
pnpm dev

# Full desktop app (Tauri + Next.js)
pnpm tauri dev
# or equivalently:
pnpm run tauri dev

# Production build
pnpm build          # Next.js static export → out/
pnpm tauri build    # Bundles Tauri installer

# Lint
pnpm lint

# Rust only (from src-tauri/)
cargo build
cargo check
cargo test
```

> **Note:** `pnpm install` must be run before first use if `node_modules` is missing. Icons must be generated before bundling: `cargo tauri icon public/icon.svg` (run from `src-tauri/`).

## Architecture

Prism is a **node-based image editor** built as a Tauri 2 desktop app. There is a strict separation of concerns:

- **Rust owns all pixel data** — the frontend never touches raw pixels.
- **Frontend owns UI/graph state** — the node graph, connections, and parameters live in a Zustand store.
- **IPC boundary** — frontend sends a serialized graph to Rust; Rust returns a base64 JPEG for preview or writes a file for export.

### Frontend (`app/`, `components/`, `lib/`, `hooks/`)

Built with Next.js 16 (static export mode) + React 19 + Tailwind v4 + shadcn/ui.

| Path | Role |
|------|------|
| `app/page.tsx` | Root — renders `<NodeEditor>` |
| `components/editor/node-editor.tsx` | Top-level editor shell (toolbar, export, initializes default graph) |
| `components/editor/node-canvas.tsx` | Pan/zoom canvas, handles drag interactions |
| `components/editor/glass-node.tsx` | Individual node card UI with port connectors and param sliders |
| `components/editor/connection-lines.tsx` | SVG overlay for drawing connection wires |
| `components/editor/add-node-panel.tsx` | Floating panel to add new nodes |
| `lib/node-types.ts` | TypeScript types + `NODE_DEFINITIONS` catalog + `buildGraphPayload()` serializer |
| `lib/node-store.ts` | Zustand store — all graph mutation logic (`addNode`, `insertNodeIntoChain`, etc.) |
| `lib/tauri-bridge.ts` | Thin wrappers over `invoke()` — `loadImage`, `executeGraph`, `exportImage`, `openImageDialog`, `saveImageDialog` |
| `hooks/use-preview.ts` | Debounced (200 ms) preview: watches store state, calls `executeGraph` with `preview: true` |

**Adding a new node type** requires changes in both the frontend and Rust:
1. Add the variant to `NodeType` union in `lib/node-types.ts`
2. Add its `NODE_DEFINITIONS` entry (ports + default params)
3. Add its `nodeDataToKind` case in `buildGraphPayload`
4. Add the corresponding Rust `NodeKind` variant in `src-tauri/src/graph/types.rs` (tagged serde with `kebab-case`)
5. Implement `NodeExecutor` in the appropriate module under `src-tauri/src/nodes/`
6. Wire it in `executor::make_executor` in `src-tauri/src/graph/executor.rs`

### Rust backend (`src-tauri/src/`)

| Path | Role |
|------|------|
| `main.rs` | Tauri builder — registers plugin + commands |
| `state.rs` | `AppState { source_image: Mutex<Option<CachedImage>> }` |
| `commands.rs` | Three Tauri commands: `load_image`, `execute_graph`, `export_image` |
| `graph/types.rs` | Serde types mirroring the TS types (`Graph`, `NodeKind` enum, `ExecuteGraphPayload`, `ExecutionResult`) |
| `graph/executor.rs` | Kahn's topological sort + graph execution loop; preview mode downscales to 800px max |
| `graph/cache.rs` | `CachedImage` wrapper (`Arc<DynamicImage>`) |
| `nodes/color.rs` | Brightness/contrast, grayscale, saturation, hue-shift, invert |
| `nodes/filter.rs` | Blur, sharpen, noise |
| `nodes/effect.rs` | Vignette |

**Critical Rust rule:** Never hold the `AppState` mutex lock across an `await` point. Always clone the `Arc<DynamicImage>` out of the lock before doing async work (see `commands.rs` pattern).

### IPC Protocol

- `load_image(path)` → stores image in `AppState`
- `execute_graph({ graph, preview })` → returns `{ image_b64, width, height }` (base64 JPEG)
- `export_image({ graph, preview: false }, output_path)` → writes file, returns nothing

The `NodeKind` enum uses `#[serde(tag = "type", rename_all = "kebab-case")]` — the `type` field in the JSON must match exactly (e.g., `"brightness-contrast"`, `"hue-shift"`).

### Tauri Config
- `src-tauri/tauri.conf.json` — `devUrl: localhost:3000`, `frontendDist: ../out`
- `src-tauri/capabilities/default.json` — grants `dialog:allow-open`, `dialog:allow-save`
- Next.js is configured for **static export** (`output: 'export'`) — no SSR, no API routes.
