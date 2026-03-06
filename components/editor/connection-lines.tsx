'use client'

import { useNodeStore } from '@/lib/node-store'
import { useMemo, useState, useEffect, useLayoutEffect } from 'react'

interface ConnectionLinesProps {
  tempConnection: {
    fromX: number
    fromY: number
    toX: number
    toY: number
  } | null
  hoveredConnectionId: string | null
  containerRef: React.RefObject<HTMLDivElement>
}

type PortPos = { x: number; y: number }
type PortPositions = Record<string, { input?: PortPos; output?: PortPos }>

export function ConnectionLines({ tempConnection, hoveredConnectionId, containerRef }: ConnectionLinesProps) {
  const { nodes, connections, removeConnection } = useNodeStore()
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [portPositions, setPortPositions] = useState<PortPositions>({})

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

  // Re-read port positions from the DOM whenever nodes or connections change.
  // Scoped deps prevent running on every render, eliminating the re-render loop
  // and the expensive JSON.stringify comparison.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const next: PortPositions = {}

    container.querySelectorAll<HTMLElement>('[data-port-node]').forEach(el => {
      const nodeId = el.dataset.portNode!
      const portType = el.dataset.portType as 'input' | 'output'
      const r = el.getBoundingClientRect()
      if (!next[nodeId]) next[nodeId] = {}
      next[nodeId][portType] = {
        x: r.left + r.width / 2 - containerRect.left,
        y: r.top + r.height / 2 - containerRect.top,
      }
    })

    setPortPositions(next)
  }, [nodes, connections])

  const connectionPaths = useMemo(() => {
    return connections.map(conn => {
      const fromPos = portPositions[conn.fromNodeId]?.output
      const toPos = portPositions[conn.toNodeId]?.input
      if (!fromPos || !toPos) return null
      return { id: conn.id, fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y }
    }).filter(Boolean)
  }, [connections, portPositions])

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
