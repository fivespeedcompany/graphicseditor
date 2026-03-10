import { useEffect, useRef, useState } from 'react'
import { useNodeStore, getActiveNodeIds } from '@/lib/node-store'
import { executeGraph } from '@/lib/tauri-bridge'
import { buildGraphPayload, Graph } from '@/lib/node-types'

export function usePreview() {
  const nodes = useNodeStore(s => s.nodes)
  const connections = useNodeStore(s => s.connections)
  const imageLoaded = useNodeStore(s => s.imageLoaded)
  const [preview, setPreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlight = useRef(false)
  const pending = useRef<Graph | null>(null)

  // Runs a graph through Rust. If a request is already in-flight, saves the
  // latest graph and re-runs immediately when the current one finishes,
  // so rapid slider changes always reflect the most recent state without
  // flooding Rust with simultaneous requests.
  const runRef = useRef<((graph: Graph) => Promise<void>) | undefined>(undefined)
  runRef.current = async (graph: Graph) => {
    if (inFlight.current) {
      pending.current = graph
      return
    }
    inFlight.current = true
    setIsProcessing(true)
    try {
      const result = await executeGraph(graph, true)
      setPreview(result.image_b64)
    } catch (e) {
      console.error('Preview failed:', e)
    } finally {
      inFlight.current = false
      const next = pending.current
      pending.current = null
      if (next) {
        runRef.current!(next)
      } else {
        setIsProcessing(false)
      }
    }
  }

  useEffect(() => {
    if (!imageLoaded) return

    clearTimeout(timer.current)

    timer.current = setTimeout(() => {
      const activeIds = getActiveNodeIds(nodes, connections)
      const activeNodes = nodes.filter(n => activeIds.has(n.id))
      const activeConnections = connections.filter(
        c => activeIds.has(c.fromNodeId) && activeIds.has(c.toNodeId)
      )
      const graph = buildGraphPayload(activeNodes, activeConnections)
      runRef.current!(graph)
    }, 50)

    return () => clearTimeout(timer.current)
  }, [nodes, connections, imageLoaded])

  return { preview, isProcessing }
}
