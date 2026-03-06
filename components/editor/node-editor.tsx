'use client'

import { useEffect, useRef } from 'react'
import { useNodeStore } from '@/lib/node-store'
import { buildGraphPayload } from '@/lib/node-types'
import { exportImage, saveImageDialog } from '@/lib/tauri-bridge'
import { NodeCanvas } from './node-canvas'
import { Download, Undo2, Redo2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function NodeEditor() {
  const { addNode, nodes, connections, addConnection } = useNodeStore()
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current && nodes.length === 0) {
      initialized.current = true
      addNode('image-input', 80, 200)
      addNode('output', 700, 200)

      setTimeout(() => {
        const store = useNodeStore.getState()
        const imageInput = store.nodes.find(n => n.type === 'image-input')
        const output = store.nodes.find(n => n.type === 'output')
        if (imageInput && output) {
          store.addConnection(imageInput.id, 'out', output.id, 'in')
        }
      }, 100)
    }
  }, [addNode, nodes.length, addConnection])

  const handleExport = async () => {
    const outputPath = await saveImageDialog()
    if (!outputPath) return
    const store = useNodeStore.getState()
    const graph = buildGraphPayload(store.nodes, store.connections)
    try {
      await exportImage(graph, outputPath)
    } catch (e) {
      console.error('Export failed:', e)
    }
  }

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/40 to-transparent">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold tracking-[0.2em] text-white/85 uppercase">Prism</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.07] text-white/40 font-mono tracking-wider">beta</span>
        </div>

        <div className="flex items-center gap-1.5">
          <ToolbarButton onClick={handleExport} tooltip="Export">
            <Download className="w-3.5 h-3.5" />
          </ToolbarButton>
          <div className="w-px h-3 bg-white/[0.08] mx-2" />
          <ToolbarButton disabled tooltip="Undo">
            <Undo2 className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton disabled tooltip="Redo">
            <Redo2 className="w-3.5 h-3.5" />
          </ToolbarButton>
        </div>
      </div>

      {/* Main Canvas */}
      <NodeCanvas />

      {/* Bottom Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-gradient-to-t from-black/30 to-transparent">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span className="text-[10px] text-white/25 font-mono tracking-wider">
              {nodes.length} nodes
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span className="text-[10px] text-white/25 font-mono tracking-wider">
              {connections.length} links
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/20 tracking-wide">
            Drag to move • Connect ports to link
          </span>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({ 
  children, 
  onClick, 
  disabled,
  tooltip
}: { 
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  tooltip?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={cn(
        "p-2 rounded-md transition-all duration-150",
        "bg-white/[0.04] backdrop-blur-xl",
        "border border-white/[0.04]",
        "text-white/50 hover:text-white/90 hover:bg-white/[0.08]",
        disabled && "opacity-30 cursor-not-allowed hover:bg-white/[0.04] hover:text-white/50"
      )}
    >
      {children}
    </button>
  )
}
