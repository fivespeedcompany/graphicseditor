'use client'

import { NodeType, NODE_DEFINITIONS } from '@/lib/node-types'
import { useNodeStore } from '@/lib/node-store'
import { cn } from '@/lib/utils'
import { Plus, Sun, Circle, Droplets, Palette, RotateCcw, Sparkles, Volume2, Target, X } from 'lucide-react'
import { useState } from 'react'

const nodeCategories = [
  {
    name: 'Adjustments',
    nodes: [
      { type: 'brightness-contrast' as NodeType, icon: Sun, label: 'Brightness / Contrast' },
      { type: 'saturation' as NodeType, icon: Droplets, label: 'Saturation' },
      { type: 'hue-shift' as NodeType, icon: Palette, label: 'Hue Shift' },
    ]
  },
  {
    name: 'Effects',
    nodes: [
      { type: 'blur' as NodeType, icon: Circle, label: 'Blur' },
      { type: 'sharpen' as NodeType, icon: Sparkles, label: 'Sharpen' },
      { type: 'noise' as NodeType, icon: Volume2, label: 'Noise' },
      { type: 'vignette' as NodeType, icon: Target, label: 'Vignette' },
    ]
  },
  {
    name: 'Color',
    nodes: [
      { type: 'grayscale' as NodeType, icon: Circle, label: 'Grayscale' },
      { type: 'invert' as NodeType, icon: RotateCcw, label: 'Invert' },
    ]
  }
]

interface AddNodePanelProps {
  isOpen: boolean
  onClose: () => void
}

export function AddNodePanel({ isOpen, onClose }: AddNodePanelProps) {
  const { addNode, nodes } = useNodeStore()

  const handleAddNode = (type: NodeType) => {
    // Count existing filter nodes to stagger placement so they don't stack
    const filterCount = nodes.filter(n => n.type !== 'image-input' && n.type !== 'output').length
    const offset = filterCount * 20
    addNode(type, 380 + offset, 180 + offset)
    onClose()
  }
  
  return (
    <div
      className={cn(
        "absolute left-4 top-1/2 -translate-y-1/2 w-52 rounded-xl overflow-hidden transition-all duration-300 z-[200]",
        "bg-[rgba(12,12,12,0.9)] backdrop-blur-2xl",
        "border border-[rgba(255,255,255,0.05)]",
        "shadow-[0_24px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.02)]",
        isOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 pointer-events-none"
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
        <span className="text-xs font-medium text-white/90 tracking-wide">Add Node</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      
      <div className="p-2 max-h-[400px] overflow-y-auto">
        {nodeCategories.map((category) => (
          <div key={category.name} className="mb-3">
            <div className="px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                {category.name}
              </span>
            </div>
            <div className="space-y-0.5">
              {category.nodes.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => handleAddNode(type)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg",
                    "text-white/70 hover:text-white/95",
                    "hover:bg-white/5 active:bg-white/10",
                    "transition-all duration-150"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 text-white/50" />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AddNodeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute left-4 bottom-4 z-[200] flex items-center gap-2.5 px-4 py-2.5 rounded-lg",
        "bg-[rgba(12,12,12,0.85)] backdrop-blur-2xl",
        "border border-[rgba(255,255,255,0.06)]",
        "text-white/70 hover:text-white/95",
        "shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.03)]",
        "transition-all duration-200 hover:border-white/12 active:scale-[0.98]"
      )}
    >
      <Plus className="w-4 h-4" />
      <span className="text-[11px] font-medium tracking-wide">Add Node</span>
    </button>
  )
}
