'use client'

import { useNodeStore } from '@/lib/node-store'
import { useMemo, useState, useEffect } from 'react'
import { NodeData } from '@/lib/node-types'

// Node layout constants — keep in sync with glass-node.tsx dimensions.
const NODE_WIDTH = 224
const HEADER_HEIGHT = 40
const PARAM_HEIGHT = 50
const PORT_INSET = 18
const BODY_PADDING = 12
const SPECIAL_CONTENT_HEIGHT = 64

interface ConnectionLinesProps {
  tempConnection: {
    fromX: number
    fromY: number
    toX: number
    toY: number
  } | null
  hoveredConnectionId: string | null
}

function getOutputPort(node: NodeData) {
  return {
    x: node.x + NODE_WIDTH - 28,
    y: node.y + HEADER_HEIGHT / 2,
  }
}

function getInputPort(node: NodeData) {
  const paramCount = Object.keys(node.params).length
  const hasSpecialContent = node.type === 'output' || node.type === 'image-input'
  const bodyHeight =
    paramCount * PARAM_HEIGHT +
    (hasSpecialContent ? SPECIAL_CONTENT_HEIGHT : 0) +
    BODY_PADDING * 2
  return {
    x: node.x + PORT_INSET,
    y: node.y + HEADER_HEIGHT + bodyHeight - 20,
  }
}

export function ConnectionLines({ tempConnection, hoveredConnectionId }: ConnectionLinesProps) {
  const { nodes, connections, removeConnection } = useNodeStore()
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)

  // Delete / Backspace removes the selected connection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnectionId) {
        if ((e.target as HTMLElement).tagName === 'INPUT') return
        removeConnection(selectedConnectionId)
        setSelectedConnectionId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedConnectionId, removeConnection])

  const connectionPaths = useMemo(() => {
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    return connections.map(conn => {
      const fromNode = nodeMap.get(conn.fromNodeId)
      const toNode = nodeMap.get(conn.toNodeId)
      if (!fromNode || !toNode) return null
      const fromPos = getOutputPort(fromNode)
      const toPos = getInputPort(toNode)
      return { id: conn.id, fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y }
    }).filter(Boolean)
  }, [connections, nodes])

  const createPath = (fromX: number, fromY: number, toX: number, toY: number) => {
    const dx = Math.abs(toX - fromX)
    const controlOffset = Math.min(dx * 0.5, 100)
    return `M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`
  }

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 5, pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id="connGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.2)" />
        </linearGradient>
      </defs>

      {connectionPaths.map(conn => {
        if (!conn) return null
        const isSelected = conn.id === selectedConnectionId
        const isHovered = conn.id === hoveredConnectionId
        const isActive = isSelected || isHovered
        const d = createPath(conn.fromX, conn.fromY, conn.toX, conn.toY)

        return (
          <g key={conn.id}>
            {/* Glow track */}
            <path
              d={d}
              fill="none"
              stroke={isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}
              strokeWidth={isActive ? 6 : 3}
            />
            {/* Visible line */}
            <path
              d={d}
              fill="none"
              stroke={
                isSelected
                  ? 'rgba(255,255,255,0.95)'
                  : isHovered
                  ? 'rgba(255,255,255,0.65)'
                  : 'url(#connGrad)'
              }
              strokeWidth={isActive ? 2 : 1.5}
            />
            {/* Wide invisible hit area — pointer-events only on stroke */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth="16"
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                setSelectedConnectionId(prev => (prev === conn.id ? null : conn.id))
              }}
            />
          </g>
        )
      })}

      {/* In-progress drag wire */}
      {tempConnection && (
        <g>
          <path
            d={createPath(
              tempConnection.fromX,
              tempConnection.fromY,
              tempConnection.toX,
              tempConnection.toY
            )}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="3"
          />
          <path
            d={createPath(
              tempConnection.fromX,
              tempConnection.fromY,
              tempConnection.toX,
              tempConnection.toY
            )}
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="animate-pulse"
          />
        </g>
      )}
    </svg>
  )
}
