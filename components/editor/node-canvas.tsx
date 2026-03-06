'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
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

  const activeNodeIds = useMemo(
    () => getActiveNodeIds(nodes, connections),
    [nodes, connections]
  )

  const handleStartConnection = useCallback(
    (nodeId: string, portId: string, portType: 'input' | 'output', event: React.MouseEvent) => {
      if (portType !== 'output') return

      const canvasRect = canvasRef.current?.getBoundingClientRect()
      if (!canvasRect) return

      // Use the actual port circle center from the DOM
      const portEl = canvasRef.current?.querySelector<HTMLElement>(
        `[data-port-node="${nodeId}"][data-port-type="output"]`
      )
      const portRect = portEl?.getBoundingClientRect()
      const fromX = portRect
        ? portRect.left + portRect.width / 2 - canvasRect.left
        : (nodes.find(n => n.id === nodeId)?.x ?? 0) + NODE_WIDTH - 28
      const fromY = portRect
        ? portRect.top + portRect.height / 2 - canvasRect.top
        : (nodes.find(n => n.id === nodeId)?.y ?? 0) + HEADER_HEIGHT / 2

      setTempConnection({
        fromNodeId: nodeId,
        fromPortId: portId,
        fromX,
        fromY,
        toX: event.clientX - canvasRect.left,
        toY: event.clientY - canvasRect.top,
      })

      const handleMouseMove = (e: MouseEvent) => {
        setTempConnection(prev =>
          prev ? { ...prev, toX: e.clientX - rect.left, toY: e.clientY - rect.top } : null
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

  // Called every frame while a node is being dragged.
  // Only considers unconnected nodes as candidates for auto-insert.
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

  // Called once when a node drag ends. If hovering a connection, splice in.
  // Reads from ref (not state) to avoid stale closure — hoveredConnectionId
  // changes during the drag but the mouseup listener captured onDragEnd once at mousedown.
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

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      selectNode(null)
    }
  }

  const displayImage = previewImage ?? backgroundImage

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-screen overflow-hidden bg-background"
      onClick={handleCanvasClick}
    >
      {/* Background: Rust-processed preview, raw fallback, or empty state */}
      {displayImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-300"
          style={{ backgroundImage: `url(${displayImage})` }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] text-white/15 tracking-widest uppercase select-none">
            Upload an image to begin
          </span>
        </div>
      )}

      {/* Dot grid overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

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
        containerRef={canvasRef}
      />

      {/* Nodes */}
      {nodes.map(node => (
        <GlassNode
          key={node.id}
          node={node}
          isInChain={activeNodeIds.has(node.id)}
          onStartConnection={handleStartConnection}
          onEndConnection={handleEndConnection}
          onDragMove={handleNodeDragMove}
          onDragEnd={handleNodeDragEnd}
        />
      ))}

      {/* Add Node panel */}
      <AddNodePanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
      {!isPanelOpen && <AddNodeButton onClick={() => setIsPanelOpen(true)} />}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="absolute bottom-16 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
          <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
          <span className="text-[10px] text-white/50 font-mono tracking-wider">processing</span>
        </div>
      )}
    </div>
  )
}
