# Plan: Live Node Pipeline — Real-Time Image Processing

## Current State Diagnosis

The Rust execution engine, IPC bridge, and preview hook are all wired up but the end-to-end pipeline has four specific gaps preventing it from working:

1. **`backgroundImage` is a raw Windows path** — `C:\Users\...\photo.jpg` gets used as a CSS `url()` value which browsers/Tauri WebView reject. Must be converted via `convertFileSrc()` from `@tauri-apps/api/core`.
2. **No auto-insert** — when you add a node from the panel it lands on canvas disconnected. You have to manually drag two wires to put it in the chain. The UX should auto-insert into the active chain.
3. **No connection deletion** — once connected there is no way to remove a wire without deleting the node.
4. **No visual feedback** during processing — the preview silently updates with no loading state and there is no indication of which nodes are active in the chain.

---

## Phase 1 — Fix the Preview Display Pipeline

These are bugs. Fix them before anything else.

### 1A. Convert file path to Tauri asset URL

**File:** `components/editor/glass-node.tsx`

After `loadImage(path)` succeeds, call `convertFileSrc(path)` and pass that to `setBackgroundImage` instead of the raw path:

```ts
import { convertFileSrc } from '@tauri-apps/api/core'

// inside handleImageUpload, after loadImage(path):
const assetUrl = convertFileSrc(path)
setBackgroundImage(assetUrl)
```

`convertFileSrc` turns a native path into `asset://localhost/C:/Users/.../photo.jpg` which the Tauri WebView can load as an `<img>` or CSS background.

### 1B. Expose `isProcessing` from `usePreview`

**File:** `hooks/use-preview.ts`

Change the return value from `string | null` to `{ preview: string | null, isProcessing: boolean }`:

```ts
const [isProcessing, setIsProcessing] = useState(false)

// before setTimeout fires:
setIsProcessing(true)

// inside the timeout, after result:
setPreview(result.image_b64)
setIsProcessing(false)

// on error:
setIsProcessing(false)

return { preview, isProcessing }
```

### 1C. Show processing state on the canvas

**File:** `components/editor/node-canvas.tsx`

Destructure `{ preview: previewImage, isProcessing }` from `usePreview()`. Add a small indicator in the bottom-right of the canvas that pulses during `isProcessing`:

```tsx
{isProcessing && (
  <div className="absolute bottom-16 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
    <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
    <span className="text-[10px] text-white/50 font-mono">processing</span>
  </div>
)}
```

### 1D. Trigger preview immediately on `imageLoaded`

**File:** `hooks/use-preview.ts`

The current effect fires when `[nodes, connections, imageLoaded]` changes. When `imageLoaded` first becomes `true` the nodes/connections have not changed, so the debounce fires correctly. **Verify this is working** — if not, add an explicit `if (imageLoaded)` immediate trigger with `delay: 0` on the first load.

---

## Phase 2 — Auto-Insert Node Into the Active Chain

### Goal

When the user picks a node from the Add Node panel, it should:
1. Appear positioned between the last processing node and the Output node
2. Be automatically wired into the chain so the image updates immediately
3. Require zero manual wire-dragging for the common single-chain case

### Algorithm: `insertNodeIntoChain`

Add this function to `node-store.ts`:

```ts
insertNodeIntoChain: (type: NodeType) => void
```

Logic inside `insertNodeIntoChain(type)`:

```
1. Find the Output node. If none, fall back to plain addNode().
2. Find the connection whose toNodeId === output.id (call this C: A → Output).
3. If C exists:
   a. Remove connection C.
   b. Compute new node position: midpoint between node A and Output, offset down by 40px if stacked.
   c. addNode(type, x, y) — get the new node id back.
   d. addConnection(A.id, 'out', newNode.id, 'in')
   e. addConnection(newNode.id, 'out', output.id, 'in')
4. If no connection into Output exists:
   a. Place node at (400, canvas_center_y).
   b. addNode normally.
```

To get the new node's id back, `addNode` currently mutates state and doesn't return the id. Change `addNode` to return the new `NodeId`, or generate the id before calling `set()` so it can be used in steps d and e.

**File changes:**
- `lib/node-store.ts` — add `insertNodeIntoChain`, change `addNode` to return `string` (the new node id)
- `components/editor/add-node-panel.tsx` — call `insertNodeIntoChain(type)` instead of `addNode(type, x, y)`

### Position Calculation for the New Node

```ts
function findInsertPosition(nodeA: NodeData, nodeOutput: NodeData): { x: number, y: number } {
  return {
    x: Math.round((nodeA.x + nodeOutput.x) / 2),
    y: Math.round((nodeA.y + nodeOutput.y) / 2),
  }
}
```

If multiple nodes are already stacked at similar x positions, nudge by `existingMiddleNodes.length * 30` in both x and y to avoid overlap.

---

## Phase 3 — Drag-onto-Connection Insert (Advanced Auto-Insert)

This is the "drop a node between two wires" interaction.

### Approach: Drop Zone Proximity Detection

During node drag (`handleMouseMove` in `glass-node.tsx`), check if the node's center is within 30px of any connection wire's midpoint. If yes:
- Highlight that connection in the SVG (change stroke color/width)
- On mouse-up, call `insertNodeBetween(connection, droppedNodeId)` in the store

### Data Flow for Proximity Check

`glass-node.tsx` does not have access to connections directly. Two options:

**Option A (simpler):** Pass an `onDragPosition` callback from `node-canvas.tsx` down to each `GlassNode`. The canvas has all the data it needs (nodes + connections) to do the proximity check and can set `hoveredConnectionId` state. `ConnectionLines` receives `hoveredConnectionId` as a prop and highlights that wire.

**Option B (cleaner):** Move the proximity logic entirely into `node-canvas.tsx` by listening to a global `mousemove` event while any node is being dragged (track via a new `isDragging: string | null` store field).

**Recommended: Option A.**

### New prop chain:

```
NodeCanvas
  hoveredConnectionId: string | null   (local state)
  draggingNodeId: string | null        (local state)

  onNodeDragPosition(nodeId, x, y) ──► check all connection midpoints
                                       if dist < 30px → setHoveredConnectionId(conn.id)
                                       else → setHoveredConnectionId(null)

  ConnectionLines
    hoveredConnectionId ──► renders that path with highlight color

  GlassNode
    onDragPosition(nodeId, x, y)  (fires on every mousemove during drag)
```

### `insertNodeBetween` store action

```ts
insertNodeBetween: (connectionId: string, nodeId: string) => void
```

```
1. Find connection C by id.
2. Remove C.
3. addConnection(C.fromNodeId, C.fromPortId, nodeId, 'in')
4. addConnection(nodeId, 'out', C.toNodeId, C.toPortId)
```

Call this from `node-canvas.tsx` inside the `onMouseUp` handler when `hoveredConnectionId` is set and `draggingNodeId` matches the dropped node.

---

## Phase 4 — Connection Deletion

### Click-to-select a connection

The connection SVG currently has `pointer-events: none`. To make wires selectable:

1. Remove `pointer-events: none` from the SVG element.
2. Add a wider invisible hit area path behind each visible path:
   ```svg
   <path
     d={createPath(...)}
     fill="none"
     stroke="transparent"
     strokeWidth="12"   // fat invisible hit area
     style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
     onClick={() => setSelectedConnectionId(conn.id)}
   />
   ```
3. Track `selectedConnectionId: string | null` in local state in `ConnectionLines`.
4. Render selected connection with a highlighted style (e.g. white stroke, slightly thicker).
5. Listen for `Delete` / `Backspace` key in a `useEffect` inside `ConnectionLines`. On keydown, call `removeConnection(selectedConnectionId)` from the store.

**File changes:**
- `components/editor/connection-lines.tsx` — add hit-area paths, selection state, keydown handler
- No store changes needed (`removeConnection` already exists)

---

## Phase 5 — Chain Visibility: Active vs Disconnected Nodes

Nodes not connected to the chain should be visually dimmed to make the active pipeline obvious.

### Compute active node set

Add `getActiveNodeIds(): Set<string>` to the store (or compute it as a selector):

```ts
function getActiveNodeIds(nodes: NodeData[], connections: Connection[]): Set<string> {
  const outputNode = nodes.find(n => n.type === 'output')
  if (!outputNode) return new Set()

  const active = new Set<string>()
  const queue = [outputNode.id]

  while (queue.length) {
    const id = queue.pop()!
    if (active.has(id)) continue
    active.add(id)
    connections
      .filter(c => c.toNodeId === id)
      .forEach(c => queue.push(c.fromNodeId))
  }
  return active
}
```

### Apply to GlassNode

Pass `isInChain: boolean` prop to `GlassNode`. When false, apply `opacity-40` to the node card.

**File changes:**
- `lib/node-store.ts` — export `getActiveNodeIds` as a plain function (not a store action)
- `components/editor/node-canvas.tsx` — compute active set, pass `isInChain` to each `GlassNode`
- `components/editor/glass-node.tsx` — accept and apply `isInChain` prop

---

## Phase 6 — Polish

### Preview transition

The background `<div>` in `node-canvas.tsx` already has `transition-all duration-300`. This is fine. No change needed.

### "No image" empty state

When `!backgroundImage && !previewImage`, show a centered prompt on the canvas:

```tsx
{!displayImage && (
  <div className="absolute inset-0 flex items-center justify-center">
    <span className="text-[11px] text-white/20 tracking-widest uppercase">
      Upload an image to begin
    </span>
  </div>
)}
```

### Node processing order badge

Inside each `GlassNode` header, show a small monospace number indicating the node's position in the topological sort order. This helps developers and power users understand execution order.

Compute order in `node-canvas.tsx` using the same Kahn's algorithm as Rust (a lightweight TS version), then pass `orderIndex: number | null` to each `GlassNode`.

---

## Implementation Order

| Step | File(s) | What it fixes |
|---|---|---|
| 1 | `glass-node.tsx` | `convertFileSrc` — makes background image visible |
| 2 | `hooks/use-preview.ts`, `node-canvas.tsx` | `isProcessing` indicator |
| 3 | `lib/node-store.ts`, `add-node-panel.tsx` | Auto-insert from panel (zero-wire UX) |
| 4 | `components/editor/connection-lines.tsx` | Connection deletion via click + Delete key |
| 5 | `node-canvas.tsx`, `glass-node.tsx` | Active chain dimming |
| 6 | `node-canvas.tsx`, `glass-node.tsx` | Drag-onto-connection proximity insert |
| 7 | `node-canvas.tsx` | Empty state, order badges |

Steps 1–4 are required for the core pipeline to feel functional. Steps 5–7 are UX polish that can follow.

---

## Files Changed in This Plan

| File | Change |
|---|---|
| `components/editor/glass-node.tsx` | `convertFileSrc` on upload; accept `isInChain` + `orderIndex` props; fire `onDragPosition` during drag |
| `components/editor/node-canvas.tsx` | Destructure `isProcessing` from hook; processing indicator; active node set; drag proximity detection; pass new props to GlassNode |
| `components/editor/connection-lines.tsx` | Hit-area paths; `selectedConnectionId` state; Delete key handler; `hoveredConnectionId` highlight |
| `components/editor/add-node-panel.tsx` | Call `insertNodeIntoChain` instead of `addNode` |
| `lib/node-store.ts` | `addNode` returns `string`; add `insertNodeIntoChain`; add `insertNodeBetween`; export `getActiveNodeIds` |
| `hooks/use-preview.ts` | Return `{ preview, isProcessing }` instead of bare string |

No Rust changes needed. The execution engine already handles any valid graph correctly.
