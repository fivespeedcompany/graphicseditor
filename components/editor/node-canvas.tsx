'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useNodeStore, getActiveNodeIds } from '@/lib/node-store'
import { usePreview } from '@/hooks/use-preview'
import { NodeData, Connection } from '@/lib/node-types'
import { GlassNode } from './glass-node'
import { ConnectionLines } from './connection-lines'
import { AddNodePanel, AddNodeButton } from './add-node-panel'

interface TempConnection {
  fromNodeId: string
  fromPortId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
}

interface Transform {
  zoom: number
  panX: number
  panY: number
}

// Mirror of the constants in connection-lines.tsx — keep in sync if node layout changes.
const NODE_WIDTH = 224
const HEADER_HEIGHT = 40
const PARAM_HEIGHT = 50
const PORT_INSET = 18
const BODY_PADDING = 12
const SPECIAL_CONTENT_HEIGHT = 64

function getConnectionMidpoints(
  nodes: NodeData[],
  connections: Connection[]
): Array<{ id: string; x: number; y: number }> {
  return connections
    .map(conn => {
      const fromNode = nodes.find(n => n.id === conn.fromNodeId)
      const toNode = nodes.find(n => n.id === conn.toNodeId)
      if (!fromNode || !toNode) return null

      const fromX = fromNode.x + NODE_WIDTH - 28
      const fromY = fromNode.y + HEADER_HEIGHT / 2
      const paramCount = Object.keys(toNode.params).length
      const hasSpecialContent = toNode.type === 'output' || toNode.type === 'image-input'
      const bodyHeight =
        paramCount * PARAM_HEIGHT +
        (hasSpecialContent ? SPECIAL_CONTENT_HEIGHT : 0) +
        BODY_PADDING * 2
      const toX = toNode.x + PORT_INSET
      const toY = toNode.y + HEADER_HEIGHT + bodyHeight - 20

      return { id: conn.id, x: (fromX + toX) / 2, y: (fromY + toY) / 2 }
    })
    .filter((m): m is { id: string; x: number; y: number } => m !== null)
}

export function NodeCanvas() {
  const { nodes, connections, addConnection, insertNodeBetween, backgroundImage, selectNode } =
    useNodeStore()
  const { preview: previewImage, isProcessing } = usePreview()
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [tempConnection, setTempConnection] = useState<TempConnection | null>(null)
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null)
  const hoveredConnectionIdRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Transform state — zoom and pan in screen space.
  // transformRef always holds the current value so event handlers never go stale.
  const transformRef = useRef<Transform>({ zoom: 1, panX: 0, panY: 0 })
  const [transform, setTransform] = useState<Transform>({ zoom: 1, panX: 0, panY: 0 })

  const updateTransform = useCallback((updater: (prev: Transform) => Transform) => {
    const next = updater(transformRef.current)
    transformRef.current = next
    setTransform(next)
  }, [])

  const activeNodeIds = useMemo(
    () => getActiveNodeIds(nodes, connections),
    [nodes, connections]
  )

  // ── Zoom toward cursor on scroll wheel ────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui]')) return
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top

    updateTransform(prev => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newZoom = Math.max(0.12, Math.min(5, prev.zoom * factor))
      // Keep the world point under the cursor fixed
      const worldX = (cursorX - prev.panX) / prev.zoom
      const worldY = (cursorY - prev.panY) / prev.zoom
      return {
        zoom: newZoom,
        panX: cursorX - worldX * newZoom,
        panY: cursorY - worldY * newZoom,
      }
    })
  }, [updateTransform])

  // Must attach with { passive: false } so preventDefault works
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Middle-mouse-button pan ───────────────────────────────────────────────
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startPanX = transformRef.current.panX
    const startPanY = transformRef.current.panY

    const handleMove = (e: MouseEvent) => {
      updateTransform(prev => ({
        ...prev,
        panX: startPanX + (e.clientX - startX),
        panY: startPanY + (e.clientY - startY),
      }))
    }
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [updateTransform])

  // ── Ctrl+0 resets zoom and pan ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault()
        updateTransform(() => ({ zoom: 1, panX: 0, panY: 0 }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [updateTransform])

  // ── Connection drag ───────────────────────────────────────────────────────
  const handleStartConnection = useCallback(
    (nodeId: string, portId: string, portType: 'input' | 'output', event: React.MouseEvent) => {
      if (portType !== 'output') return

      const canvasRect = canvasRef.current?.getBoundingClientRect()
      if (!canvasRect) return

      const { zoom, panX, panY } = transformRef.current

      // Measure port position from DOM (screen space) → convert to world space
      const portEl = canvasRef.current?.querySelector<HTMLElement>(
        `[data-port-node="${nodeId}"][data-port-type="output"]`
      )
      const portRect = portEl?.getBoundingClientRect()
      const fromX = portRect
        ? (portRect.left + portRect.width / 2 - canvasRect.left - panX) / zoom
        : (nodes.find(n => n.id === nodeId)?.x ?? 0) + NODE_WIDTH - 28
      const fromY = portRect
        ? (portRect.top + portRect.height / 2 - canvasRect.top - panY) / zoom
        : (nodes.find(n => n.id === nodeId)?.y ?? 0) + HEADER_HEIGHT / 2

      setTempConnection({
        fromNodeId: nodeId,
        fromPortId: portId,
        fromX,
        fromY,
        toX: (event.clientX - canvasRect.left - panX) / zoom,
        toY: (event.clientY - canvasRect.top - panY) / zoom,
      })

      const handleMouseMove = (e: MouseEvent) => {
        // Read from ref so this never goes stale during a long drag
        const { zoom: z, panX: px, panY: py } = transformRef.current
        setTempConnection(prev =>
          prev
            ? {
                ...prev,
                toX: (e.clientX - canvasRect.left - px) / z,
                toY: (e.clientY - canvasRect.top - py) / z,
              }
            : null
        )
      }
      const handleMouseUp = () => {
        setTempConnection(null)
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [nodes]
  )

  const handleEndConnection = useCallback(
    (nodeId: string, portId: string) => {
      if (tempConnection && tempConnection.fromNodeId !== nodeId) {
        addConnection(tempConnection.fromNodeId, tempConnection.fromPortId, nodeId, portId)
      }
      setTempConnection(null)
    },
    [tempConnection, addConnection]
  )

  // ── Node drag / auto-insert ───────────────────────────────────────────────
  const handleNodeDragMove = useCallback(
    (nodeId: string, x: number, y: number) => {
      const isConnected = connections.some(
        c => c.fromNodeId === nodeId || c.toNodeId === nodeId
      )
      if (isConnected) {
        setHoveredConnectionId(null)
        return
      }

      const nodeCx = x + NODE_WIDTH / 2
      const nodeCy = y + HEADER_HEIGHT / 2
      const midpoints = getConnectionMidpoints(nodes, connections)

      let closest: string | null = null
      let closestDist = 60

      for (const { id, x: mx, y: my } of midpoints) {
        const dist = Math.sqrt((nodeCx - mx) ** 2 + (nodeCy - my) ** 2)
        if (dist < closestDist) {
          closestDist = dist
          closest = id
        }
      }
      hoveredConnectionIdRef.current = closest
      setHoveredConnectionId(closest)
    },
    [connections, nodes]
  )

  const handleNodeDragEnd = useCallback(
    (nodeId: string) => {
      if (hoveredConnectionIdRef.current) {
        insertNodeBetween(hoveredConnectionIdRef.current, nodeId)
      }
      hoveredConnectionIdRef.current = null
      setHoveredConnectionId(null)
    },
    [insertNodeBetween]
  )

  const displayImage = previewImage ?? backgroundImage
  const zoomPct = Math.round(transform.zoom * 100)

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-screen overflow-hidden bg-background"
      onMouseDown={handleCanvasMouseDown}
      onClick={(e) => {
        // Deselect when clicking empty canvas (not on a node or UI panel)
        const target = e.target as HTMLElement
        if (!target.closest('[data-node]') && !target.closest('[data-ui]')) {
          selectNode(null)
        }
      }}
    >
      {/* Background preview — always full-viewport, never scaled */}
      {displayImage && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-300"
          style={{ backgroundImage: `url(${displayImage})` }}
        />
      )}

      {/* Dot grid — fixed, decorative, not scaled */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* ── World: only nodes + wires scale/pan ──────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.zoom})`,
          transformOrigin: '0 0',
        }}
      >

        {/* Connection wires */}
        <ConnectionLines
          tempConnection={
            tempConnection
              ? {
                  fromX: tempConnection.fromX,
                  fromY: tempConnection.fromY,
                  toX: tempConnection.toX,
                  toY: tempConnection.toY,
                }
              : null
          }
          hoveredConnectionId={hoveredConnectionId}
        />

        {/* Nodes */}
        {nodes.map(node => (
          <GlassNode
            key={node.id}
            node={node}
            zoom={transform.zoom}
            isInChain={activeNodeIds.has(node.id)}
            thumbnailSrc={node.type === 'image-input' ? previewImage : null}
            onStartConnection={handleStartConnection}
            onEndConnection={handleEndConnection}
            onDragMove={handleNodeDragMove}
            onDragEnd={handleNodeDragEnd}
          />
        ))}
      </div>

      {/* ── Fixed UI — not affected by zoom/pan ──────────────────────────── */}

      {/* Empty state */}
      {!displayImage && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] text-white/15 tracking-widest uppercase select-none">
            Upload an image to begin
          </span>
        </div>
      )}

      {/* Add Node panel */}
      <div data-ui>
        <AddNodePanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
        {!isPanelOpen && <AddNodeButton onClick={() => setIsPanelOpen(true)} />}
      </div>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="absolute bottom-12 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
          <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
          <span className="text-[10px] text-white/50 font-mono tracking-wider">processing</span>
        </div>
      )}

      {/* Zoom indicator + reset */}
      <div data-ui className="absolute bottom-4 right-4 z-50">
        <button
          onClick={() => updateTransform(() => ({ zoom: 1, panX: 0, panY: 0 }))}
          className="px-2 py-1 rounded text-[10px] font-mono text-white/25 hover:text-white/55 hover:bg-white/5 transition-colors"
          title="Reset zoom · Ctrl+0"
        >
          {zoomPct}%
        </button>
      </div>
    </div>
  )
}
