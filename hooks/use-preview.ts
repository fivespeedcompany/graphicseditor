import { useEffect, useRef, useState } from 'react'
import { useNodeStore, getActiveNodeIds } from '@/lib/node-store'
import { executeGraph } from '@/lib/tauri-bridge'
import { buildGraphPayload } from '@/lib/node-types'

export function usePreview() {
  const nodes = useNodeStore(s => s.nodes)
  const connections = useNodeStore(s => s.connections)
  const imageLoaded = useNodeStore(s => s.imageLoaded)
  const [preview, setPreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!imageLoaded) return

    clearTimeout(timer.current)
    setIsProcessing(true)

    timer.current = setTimeout(async () => {
      const activeIds = getActiveNodeIds(nodes, connections)
      const activeNodes = nodes.filter(n => activeIds.has(n.id))
      const activeConnections = connections.filter(
        c => activeIds.has(c.fromNodeId) && activeIds.has(c.toNodeId)
      )
      const graph = buildGraphPayload(activeNodes, activeConnections)
      try {
        const result = await executeGraph(graph, true)
        setPreview(result.image_b64)
      } catch (e) {
        console.error('Preview failed:', e)
      } finally {
        setIsProcessing(false)
      }
    }, 200)

    return () => clearTimeout(timer.current)
  }, [nodes, connections, imageLoaded])

  return { preview, isProcessing }
}
