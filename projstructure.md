# Prism — Project Structure & File Map

Internal developer reference. Describes every file in the architecture, what it owns, and what to touch when changing specific behavior.

---

## Architecture Overview

Prism is a desktop image editor with a node-based graph UI. The stack is split into two halves that communicate over Tauri IPC:

- **Frontend** — Next.js 16 / React 19 / TypeScript. Owns the graph UI, node state, and parameter values. Never touches pixel data.
- **Rust backend** — Tauri 2. Owns all image data. Performs every pixel-level operation. Returns results as base64 JPEG for preview or writes PNG to disk for export.

The single architectural rule: **no pixel processing in JavaScript**. The frontend sends a serialized graph description to Rust; Rust executes it and sends back a base64 result.

---

## Top-Level Config Files

| File | Purpose |
|---|---|
| `next.config.mjs` | Next.js config. `output: 'export'` enables static export so Tauri can serve the built frontend from `../out`. |
| `package.json` | JS dependencies and scripts. Key scripts: `dev` (Next.js dev server), `build` (static export), `tauri` (delegates to `@tauri-apps/cli` — use as `npm run tauri dev` or `npm run tauri build`). |
| `tsconfig.json` | TypeScript config. Path alias `@/` maps to the project root. |
| `postcss.config.mjs` | PostCSS config for Tailwind v4. |
| `components.json` | shadcn/ui config — component style and path settings. |
| `.gitignore` | Standard Next.js / Rust ignores. |

---

## Frontend — `app/`

### `app/layout.tsx`
Root Next.js layout. Sets page `<title>`, favicon icons (light/dark/SVG/Apple), loads Geist fonts, and mounts Vercel Analytics. This is the only file that touches global HTML structure.

### `app/page.tsx`
The single page route. Renders `<NodeEditor />` and nothing else. All editor logic lives in components, not here.

### `app/globals.css`
Global CSS resets imported by the layout. Tailwind base directives live here.

---

## Frontend — `components/editor/`

These are the five components that build the editor UI. They form a strict parent → child tree: `NodeEditor → NodeCanvas → (GlassNode, ConnectionLines, AddNodePanel)`.

### `components/editor/node-editor.tsx`
**Top-level editor shell.** Mounts the toolbar and the canvas. Responsibilities:
- Initializes the default graph on first load (adds `image-input` and `output` nodes, connects them)
- Renders the top toolbar: app name, Export button, Undo/Redo stubs
- Handles Export: calls `saveImageDialog()` → `exportImage()` from the Tauri bridge
- Renders the bottom status bar (node count, connection count)

**Do not put** image upload logic here — it lives on the image-input node (`glass-node.tsx`).

### `components/editor/node-canvas.tsx`
**The interactive canvas.** Sits behind all nodes and handles:
- Rendering the processed preview image as the canvas background (uses `usePreview()` hook; falls back to the raw `backgroundImage` URL before first Rust result arrives)
- The dot-grid overlay
- Drag-to-connect port interactions: tracks `tempConnection` state, fires `addConnection` on drop
- Click-to-deselect (clicking empty canvas deselects all nodes)
- Renders all `<GlassNode />` instances and the `<ConnectionLines />` SVG overlay
- Opens/closes the `<AddNodePanel />`

**To change how the preview image is displayed** (fit mode, transitions, etc.), edit the background `<div>` inside this component.

### `components/editor/glass-node.tsx`
**Individual node card.** Renders a single node as a glass-morphism card. Responsibilities:
- Drag-to-move: full `mousedown/mousemove/mouseup` drag implementation
- Port rendering: output port in header (right), input port at bottom of body (left)
- Parameter sliders: one slider per entry in `node.params`, with label and live value display. Slider min/max are hardcoded per param key name.
- Delete button (shown on all nodes except `image-input` and `output`)
- **Image-input special UI**: a clickable upload button that calls `openImageDialog()` → `loadImage()` from the Tauri bridge, then stores the filename label and sets `imageLoaded = true` in the store
- Output-node special UI: "Final Output" placeholder label

**To add a new node type with custom UI**, add a new conditional block in the body section (following the `image-input` / `output` pattern).

### `components/editor/connection-lines.tsx`
**SVG wire renderer.** A full-viewport SVG layer (`pointer-events: none`, `z-index: 5`) that draws:
- All committed connections as cubic Bézier curves with a gradient stroke
- The in-progress drag connection as a dashed animated path

Port positions are calculated from node layout constants at the top of the file (`NODE_WIDTH`, `HEADER_HEIGHT`, `PARAM_HEIGHT`, etc.). **If node card dimensions change** (e.g. taller header), update these constants here or connection lines will be misaligned.

### `components/editor/add-node-panel.tsx`
**Node picker panel.** A slide-in panel (bottom-left of canvas) that lists all addable node types grouped into three categories: Adjustments, Effects, Color. Clicking a node type calls `addNode()` and places the new node at a staggered position. Also exports `<AddNodeButton />` — the "+" button that toggles the panel.

`image-input` and `output` are intentionally excluded from this list (they are placed only once at init).

---

## Frontend — `lib/`

### `lib/node-types.ts`
**Shared type definitions and graph serialization.** The single source of truth for the TypeScript type system. Contains:
- `NodeType` — union of all 11 node type string literals
- `Port`, `NodeData`, `Connection` — core graph interfaces used throughout the UI
- `NODE_DEFINITIONS` — the static registry of every node type: its label, input/output ports, and default param values. **Adding a new node type starts here.**
- `Graph`, `GraphNode`, `GraphEdge` — the serialized payload shape that Rust expects
- `nodeDataToKind()` — converts a `NodeData` (flat params) into the tagged `kind` object matching the Rust `NodeKind` enum
- `buildGraphPayload()` — builds the full `Graph` payload from the current store state, called before every `execute_graph` IPC call

**When adding a new node type**, you must add an entry to `NODE_DEFINITIONS` and a `case` in `nodeDataToKind()` to map its params to the Rust enum variant.

### `lib/node-store.ts`
**Zustand global state store.** The single store for all runtime UI state. Contains:
- `nodes: NodeData[]` — all nodes currently on the canvas
- `connections: Connection[]` — all port connections
- `selectedNodeId` — which node is focused
- `backgroundImage` — display URL for the canvas background (raw file path or object URL; used as fallback before the first Rust preview arrives)
- `imageLoaded: boolean` — true once a source image has been loaded into Rust's `AppState`. The `usePreview` hook reads this to avoid firing execute calls before any image exists.

Actions: `addNode`, `removeNode`, `updateNodePosition`, `updateNodeParam`, `selectNode`, `addConnection`, `removeConnection`, `setBackgroundImage`, `setImageLoaded`.

Note: `getFilterString()` was removed. There is no CSS filter processing. All image effects are Rust-only.

### `lib/tauri-bridge.ts`
**Typed IPC wrappers.** The only file allowed to call `invoke()`. All Tauri communication flows through here. Exports:
- `loadImage(path)` → calls `load_image` Rust command; stores image in `AppState`
- `executeGraph(graph, preview)` → calls `execute_graph`; returns `ExecutionResult { image_b64, width, height }`
- `exportImage(graph, outputPath)` → calls `export_image`; writes PNG to disk; no return value
- `openImageDialog()` → opens native file picker via `tauri-plugin-dialog`; returns path string or null
- `saveImageDialog()` → opens native save dialog; returns path string or null
- `isTauri()` — internal guard; all functions no-op or throw when running outside Tauri (e.g. `next dev` in browser)

**Never call `invoke()` directly from components.** Always add a wrapper function here.

### `lib/utils.ts`
`cn()` utility — merges Tailwind class names using `clsx` + `tailwind-merge`. Used everywhere.

---

## Frontend — `hooks/`

### `hooks/use-preview.ts`
**Debounced live preview hook.** Used by `node-canvas.tsx`. Watches `nodes`, `connections`, and `imageLoaded` from the store. When any of these change and `imageLoaded` is true, it debounces 200ms then:
1. Calls `buildGraphPayload()` to serialize the current graph
2. Calls `executeGraph(graph, preview: true)` via the Tauri bridge
3. Updates `preview` state with the returned `image_b64` data URL

Returns: `string | null` — the base64 JPEG data URL, or null if no result yet.

**Preview images are always downscaled to ≤ 800px on the longest side** (handled in Rust, not here). The 200ms debounce prevents firing on every slider tick.

---

## Rust Backend — `src-tauri/`

### `src-tauri/Cargo.toml`
Rust dependencies. Key crates:
- `tauri = "2"` — desktop shell and IPC
- `tauri-plugin-dialog = "2"` — native file open/save dialogs
- `image = "0.25"` — image loading, format encoding/decoding, resize
- `imageproc = "0.25"` — Gaussian blur, convolution filters
- `fast_image_resize = "4"` — high-performance downscaling (available for future use)
- `base64 = "0.22"` — encodes preview JPEG bytes to base64 string for IPC
- `time = "=0.3.36"` — pinned to this version because 0.3.47+ requires rustc 1.88.0 (current toolchain is 1.86.0)

### `src-tauri/build.rs`
One line: calls `tauri_build::build()`. Processes `tauri.conf.json` and the `capabilities/` folder at compile time to generate permission bindings and Windows resource files (icon embedding, version info).

### `src-tauri/tauri.conf.json`
Tauri application configuration:
- `beforeDevCommand: "npm run dev"` — starts the Next.js dev server when running `npm run tauri dev`
- `beforeBuildCommand: "npm run build"` — runs the Next.js static export before bundling
- `devUrl: "http://localhost:3000"` — Tauri loads this URL in dev mode
- `frontendDist: "../out"` — Tauri loads the static export from here in production
- Window: label `"main"`, 1280×800, resizable
- Bundle: icon paths point to `src-tauri/icons/` (generate with `npm run tauri icon public/icon.svg`)

### `src-tauri/capabilities/default.json`
Tauri v2 permission declaration. Grants the `main` window these permissions:
- `core:default` — standard window, event, and app APIs
- `dialog:default` / `dialog:allow-open` / `dialog:allow-save` — native file dialogs

**Any new Tauri plugin** must have its permissions added here or its commands will be blocked at runtime.

---

## Rust Backend — `src-tauri/src/`

### `src-tauri/src/main.rs`
Binary entry point. Builds the Tauri app:
- Registers `tauri_plugin_dialog`
- Calls `.manage(AppState::new())` to inject shared state
- Registers the three IPC commands: `load_image`, `execute_graph`, `export_image`
- `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` suppresses the Windows console window in release builds

### `src-tauri/src/state.rs`
**Shared application state.** `AppState` holds:
- `source_image: Mutex<Option<CachedImage>>` — the currently loaded source image, wrapped in a Mutex for safe concurrent access across async commands

The `Mutex` is intentional: async Tauri commands can run concurrently, so state access must be synchronized. **Never hold the lock across an `await` point** — lock, clone the `Arc<DynamicImage>`, unlock, then do async work with the clone.

### `src-tauri/src/commands.rs`
**IPC command implementations.** Three `#[tauri::command]` functions:

- `load_image(path, state)` — opens the image file from disk using the `image` crate, wraps it in `Arc`, stores it in `AppState`. Called once when the user picks a file.
- `execute_graph(payload, state)` — clones the source image Arc from state, runs `executor::execute()`, encodes the result as JPEG, base64-encodes it, and returns `ExecutionResult { image_b64, width, height }`.
- `export_image(payload, output_path, state)` — same as execute but with `preview: false` (full resolution) and saves directly to disk as PNG via `result.save()`. No base64 round-trip.

### `src-tauri/src/graph/mod.rs`
Declares the three graph submodules: `types`, `executor`, `cache`.

### `src-tauri/src/graph/types.rs`
**Shared Rust type definitions.** The Rust mirror of the TypeScript types in `node-types.ts`. Contains:
- `NodeKind` — tagged enum with `#[serde(tag = "type", rename_all = "kebab-case")]` so it deserializes from the frontend JSON payload (e.g. `{ "type": "blur", "radius": 5.0 }`)
- `GraphNode`, `Graph`, `Edge` — the deserialized graph structure
- `ExecuteGraphPayload` — the full IPC request payload (graph + `preview` flag)
- `ExecutionResult` — the IPC response (base64 string + dimensions)

**When adding a new node type**, add a variant to `NodeKind` here with the correct field names and types. The `rename_all = "kebab-case"` attribute controls how the `type` discriminant is matched from JSON.

### `src-tauri/src/graph/executor.rs`
**Graph execution engine.** Two public functions:
- `topo_sort(graph)` — Kahn's algorithm; returns nodes in topological order; returns `Err` if the graph has a cycle
- `execute(graph, source_image, preview)` — walks the sorted order, routes each node to its executor via `make_executor()`, stores intermediate results in a `HashMap<NodeId, Arc<DynamicImage>>`, returns the output node's image

`make_executor()` is a private factory that maps each `NodeKind` variant to its concrete `NodeExecutor` implementation.

**When adding a new node type**, add a `match` arm in `make_executor()` here.

### `src-tauri/src/graph/cache.rs`
`CachedImage` struct — wraps `Arc<DynamicImage>`. Currently only holds the image Arc. Exists as a named type on `AppState` so future fields (dimensions, format metadata, hash keys for node-level caching) can be added without touching `state.rs` or `commands.rs`.

---

## Rust Backend — `src-tauri/src/nodes/`

### `src-tauri/src/nodes/mod.rs`
Declares the `NodeExecutor` trait and the four node submodules:
```rust
pub trait NodeExecutor: Send + Sync {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String>;
}
```
All node implementations implement this trait. The `Send + Sync` bounds are required because nodes are constructed inside async commands.

### `src-tauri/src/nodes/color.rs`
**Per-pixel color adjustment nodes.** All operate on `RGBA8` pixel buffers in a single pass.

| Struct | Params | Algorithm |
|---|---|---|
| `BrightnessContrastNode` | `brightness: f32`, `contrast: f32` | Normalizes to [0,1], applies additive brightness then multiplicative contrast around 0.5 |
| `GrayscaleNode` | `amount: f32` | Blends `image.grayscale()` with original by amount percentage |
| `SaturationNode` | `amount: f32` | Luma-preserving saturation via `luma + factor * (channel - luma)` |
| `HueShiftNode` | `degrees: f32` | Converts each pixel RGB → HSV, rotates H by `degrees/360`, converts back |
| `InvertNode` | `amount: f32` | Blends `255 - channel` with original by amount percentage |

Also contains private `rgb_to_hsv` / `hsv_to_rgb` helpers used by `HueShiftNode`.

Has unit tests (`#[cfg(test)]`) for `GrayscaleNode` and `InvertNode`.

### `src-tauri/src/nodes/filter.rs`
**Spatial filter nodes.** These operate on neighborhoods of pixels, not single pixels.

| Struct | Params | Algorithm |
|---|---|---|
| `BlurNode` | `radius: f32` | `imageproc::filter::gaussian_blur_f32` — standard Gaussian blur |
| `SharpenNode` | `amount: f32` | Unsharp mask: `original + strength * (original - gaussian_blur(1.0, original))` |
| `NoiseNode` | `amount: f32` | Additive noise via a deterministic per-pixel hash (`pseudo_noise`); no `rand` crate dependency |

`pseudo_noise(x, y)` is a private integer hash function that returns values in [-1, 1]. Noise is deterministic (same input = same output) — this is intentional for reproducibility.

### `src-tauri/src/nodes/effect.rs`
**Composited effect nodes.**

| Struct | Params | Algorithm |
|---|---|---|
| `VignetteNode` | `amount: f32`, `softness: f32` | Computes radial distance from image center for each pixel, multiplies RGB channels by a falloff factor controlled by `amount` and `softness` |

### `src-tauri/src/nodes/input.rs`
Placeholder file. `ImageInput` is handled directly in `executor.rs` (it simply returns the source image Arc) so no struct is needed here. Reserved for future input node types (e.g. solid color generator, gradient, second image input).

---

## Data Flow Summary

```
User drags slider
  → updateNodeParam() in node-store.ts
    → usePreview() fires after 200ms debounce
      → buildGraphPayload() serializes nodes + connections to Graph JSON
        → executeGraph() calls invoke('execute_graph', { payload })
          → Rust: executor::execute() runs topo-sort → node pipeline
            → result encoded as base64 JPEG
          → Frontend receives { image_b64, width, height }
        → usePreview() returns image_b64
      → node-canvas.tsx sets background to data URL

User clicks Upload on image-input node
  → openImageDialog() opens native file picker
    → path returned
      → loadImage(path) calls invoke('load_image', { path })
        → Rust: image::open(path) → stored in AppState.source_image
      → setImageLoaded(true) in store
        → usePreview() begins firing on next graph change

User clicks Export
  → saveImageDialog() opens native save dialog
    → outputPath returned
      → exportImage(graph, outputPath) calls invoke('export_image', ...)
        → Rust: executor::execute() at full resolution
          → result.save(outputPath) writes PNG to disk
```

---

## Adding a New Node Type — Checklist

1. **`lib/node-types.ts`** — add to `NodeType` union, add entry in `NODE_DEFINITIONS`, add `case` in `nodeDataToKind()`
2. **`src-tauri/src/graph/types.rs`** — add variant to `NodeKind` enum with correct field names
3. **`src-tauri/src/nodes/`** — implement `NodeExecutor` in the appropriate file (`color.rs`, `filter.rs`, `effect.rs`) or create a new file + declare it in `mod.rs`
4. **`src-tauri/src/graph/executor.rs`** — add `match` arm in `make_executor()`
5. **`components/editor/add-node-panel.tsx`** — add to the appropriate category so it appears in the picker
6. *(Optional)* **`components/editor/connection-lines.tsx`** — if the node has a non-standard height, update the layout constants so connection lines render correctly

---

## What Lives Where — Quick Lookup

| I want to change… | Edit this file |
|---|---|
| How a node processes pixels | `src-tauri/src/nodes/color.rs`, `filter.rs`, or `effect.rs` |
| Graph execution order / cycle detection | `src-tauri/src/graph/executor.rs` |
| IPC commands exposed to the frontend | `src-tauri/src/commands.rs` + `src-tauri/src/main.rs` |
| Tauri permissions | `src-tauri/capabilities/default.json` |
| App window size / title / dev server URL | `src-tauri/tauri.conf.json` |
| Node card appearance / slider UI | `components/editor/glass-node.tsx` |
| Connection wire drawing / port positions | `components/editor/connection-lines.tsx` |
| Node picker categories | `components/editor/add-node-panel.tsx` |
| Preview debounce timing | `hooks/use-preview.ts` |
| Tauri IPC wrappers / dialog calls | `lib/tauri-bridge.ts` |
| Node default params / port definitions | `lib/node-types.ts` → `NODE_DEFINITIONS` |
| Global app state | `lib/node-store.ts` |
| Toolbar buttons (Export, Undo) | `components/editor/node-editor.tsx` |
| Canvas background / preview display | `components/editor/node-canvas.tsx` |
| Page title / fonts / analytics | `app/layout.tsx` |
