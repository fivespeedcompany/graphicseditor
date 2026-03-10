'use client'

import { useRef, useCallback, useState } from 'react'
import { NodeData } from '@/lib/node-types'
import { useNodeStore } from '@/lib/node-store'
import { loadImage, loadNodeImage, openImageDialog } from '@/lib/tauri-bridge'
import { cn } from '@/lib/utils'
import { X, Image, Sun, Droplets, Palette, RotateCcw, Circle, Sparkles, Volume2, Target, Upload, BarChart2, TrendingUp, Paintbrush, Move, Layers, Crop, LayoutGrid, Hash, Zap, Wind } from 'lucide-react'

interface GlassNodeProps {
  node: NodeData
  isInChain: boolean
  zoom?: number
  thumbnailSrc?: string | null
  onStartConnection: (nodeId: string, portId: string, portType: 'input' | 'output', event: React.MouseEvent) => void
  onEndConnection: (nodeId: string, portId: string) => void
  onDragMove: (nodeId: string, x: number, y: number) => void
  onDragEnd: (nodeId: string) => void
}

const nodeIcons: Record<string, React.ReactNode> = {
  'image-input': <Image className="w-3.5 h-3.5" />,
  'image-node': <Image className="w-3.5 h-3.5" />,
  'brightness-contrast': <Sun className="w-3.5 h-3.5" />,
  'blur': <Circle className="w-3.5 h-3.5" />,
  'saturation': <Droplets className="w-3.5 h-3.5" />,
  'hue-shift': <Palette className="w-3.5 h-3.5" />,
  'invert': <RotateCcw className="w-3.5 h-3.5" />,
  'grayscale': <Circle className="w-3.5 h-3.5" />,
  'sharpen': <Sparkles className="w-3.5 h-3.5" />,
  'noise': <Volume2 className="w-3.5 h-3.5" />,
  'vignette': <Target className="w-3.5 h-3.5" />,
  'levels': <BarChart2 className="w-3.5 h-3.5" />,
  'curves': <TrendingUp className="w-3.5 h-3.5" />,
  'gradient-map': <Paintbrush className="w-3.5 h-3.5" />,
  'transform': <Move className="w-3.5 h-3.5" />,
  'mix-blend': <Layers className="w-3.5 h-3.5" />,
  'mask': <Crop className="w-3.5 h-3.5" />,
  'pixelate': <LayoutGrid className="w-3.5 h-3.5" />,
  'dither': <Hash className="w-3.5 h-3.5" />,
  'noise-texture': <Zap className="w-3.5 h-3.5" />,
  'displace': <Wind className="w-3.5 h-3.5" />,
  'output': <Image className="w-3.5 h-3.5" />,
}

const PARAM_RANGES: Record<string, [number, number]> = {
  brightness:   [-100, 100],
  contrast:     [-100, 100],
  degrees:      [-180, 180],
  radius:       [0, 20],
  shadows:      [-100, 100],
  midtones:     [-100, 100],
  highlights:   [-100, 100],
  input_black:  [0, 100],
  input_white:  [0, 100],
  gamma:        [1, 30],
  hue_a:        [0, 360],
  hue_b:        [0, 360],
  rotate:       [-180, 180],
  scale:        [10, 200],
  size:         [1, 50],
  levels:       [2, 16],
  freq:         [1, 100],
  octaves:      [1, 8],
  intensity:    [0, 100],
  mode:         [0, 4],
}

export function GlassNode({
  node,
  isInChain,
  zoom = 1,
  thumbnailSrc,
  onStartConnection,
  onEndConnection,
  onDragMove,
  onDragEnd,
}: GlassNodeProps) {
  const {
    updateNodePosition,
    updateNodeParam,
    removeNode,
    selectNode,
    selectedNodeId,
    setImageLoaded,
    setBackgroundImage,
    nodeImages,
    setNodeImage,
  } = useNodeStore()
  const nodeRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0, zoom: 1 })

  const isSelected = selectedNodeId === node.id

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.closest('.port') ||
      target.closest('input') ||
      target.closest('button')
    ) {
      return
    }

    e.preventDefault()
    setIsDragging(true)
    selectNode(node.id)

    // Disable CSS transition immediately so position tracks the cursor with zero delay
    if (nodeRef.current) nodeRef.current.style.transition = 'none'

    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
      zoom,
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Screen-space delta ÷ zoom = world-space delta
      const dx = (e.clientX - dragStart.current.x) / dragStart.current.zoom
      const dy = (e.clientY - dragStart.current.y) / dragStart.current.zoom
      const newX = dragStart.current.nodeX + dx
      const newY = dragStart.current.nodeY + dy
      // Update DOM directly — no React render cycle, position is instant
      if (nodeRef.current) {
        nodeRef.current.style.left = `${newX}px`
        nodeRef.current.style.top = `${newY}px`
      }
      updateNodePosition(node.id, newX, newY)
      onDragMove(node.id, newX, newY)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // Restore transition after drag ends
      if (nodeRef.current) nodeRef.current.style.transition = ''
      onDragEnd(node.id)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [node.id, node.x, node.y, updateNodePosition, selectNode, onDragMove, onDragEnd])

  const handleParamChange = (param: string, value: number) => {
    updateNodeParam(node.id, param, value)
  }

  const handleImageUpload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    const path = await openImageDialog()
    if (!path) return
    try {
      await loadImage(path)
      setImageLoaded(true)
      const { convertFileSrc } = await import('@tauri-apps/api/core')
      setBackgroundImage(convertFileSrc(path))
    } catch (err) {
      console.error('Failed to load image:', err)
    }
  }, [setImageLoaded, setBackgroundImage])

  const handleNodeImageUpload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    const path = await openImageDialog()
    if (!path) return
    try {
      const result = await loadNodeImage(node.id, path)
      setNodeImage(node.id, result.thumbnail_b64)
    } catch (err) {
      console.error('Failed to load node image:', err)
    }
  }, [node.id, setNodeImage])

  return (
    <div
      data-node
      ref={nodeRef}
      className={cn(
        'absolute w-56 rounded-xl overflow-hidden transition-all duration-150 select-none',
        'bg-[rgba(15,15,15,0.8)] backdrop-blur-2xl',
        'border border-[rgba(255,255,255,0.06)]',
        'shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.03)]',
        isDragging && 'cursor-grabbing scale-[1.02] shadow-[0_16px_48px_rgba(0,0,0,0.6)]',
        isSelected && 'border-[rgba(255,255,255,0.15)] ring-1 ring-white/10'
      )}
      style={{
        left: node.x,
        top: node.y,
        zIndex: isSelected ? 100 : 10,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2">
          <div className="text-white/60">{nodeIcons[node.type]}</div>
          <span className="text-xs font-medium text-white/90 tracking-wide">
            {node.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {node.outputs.length > 0 && (
            <div
              data-port-node={node.id}
              data-port-type="output"
              className="port w-3.5 h-3.5 rounded-full border-[1.5px] border-white/50 bg-white/5 hover:border-white hover:bg-white/30 hover:scale-125 cursor-crosshair transition-all duration-200"
              onMouseDown={(e) => {
                e.stopPropagation()
                onStartConnection(node.id, node.outputs[0].id, 'output', e)
              }}
            />
          )}
          {node.type !== 'image-input' && node.type !== 'output' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeNode(node.id)
              }}
              className="ml-1 p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {/* Parameters */}
        {Object.entries(node.params).map(([key, value]) => {
          // Blend mode: dropdown instead of slider
          if (key === 'mode' && node.type === 'mix-blend') {
            const BLEND_MODES = [
              { value: 0, label: 'Normal' },
              { value: 1, label: 'Multiply' },
              { value: 2, label: 'Screen' },
              { value: 3, label: 'Overlay' },
              { value: 4, label: 'Difference' },
            ]
            return (
              <div key={key} className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-white/40">
                  Mode
                </label>
                <div className="relative">
                  <select
                    value={value}
                    onChange={(e) => handleParamChange(key, parseInt(e.target.value))}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/75 px-2.5 py-1.5 pr-7 cursor-pointer focus:outline-none focus:border-white/25 transition-colors"
                    style={{ colorScheme: 'dark' }}
                  >
                    {BLEND_MODES.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            )
          }

          // Default: slider
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-white/40">
                  {key.replace(/_/g, ' ')}
                </label>
                <span className="text-[10px] font-mono text-white/60">
                  {typeof value === 'number' ? value.toFixed(0) : value}
                </span>
              </div>
              <div className="relative h-5 flex items-center group">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full h-[3px] rounded-full bg-white/[0.07]" />
                </div>
                <input
                  type="range"
                  min={PARAM_RANGES[key]?.[0] ?? 0}
                  max={PARAM_RANGES[key]?.[1] ?? 100}
                  value={value}
                  onChange={(e) => handleParamChange(key, parseFloat(e.target.value))}
                  className="relative w-full h-[3px] appearance-none bg-transparent rounded-full cursor-pointer z-10
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-2.5
                    [&::-webkit-slider-thumb]:h-2.5
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-white
                    [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,255,255,0.3)]
                    [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:transition-all
                    [&::-webkit-slider-thumb]:duration-150
                    [&::-webkit-slider-thumb]:hover:scale-150
                    [&::-webkit-slider-thumb]:hover:shadow-[0_0_12px_rgba(255,255,255,0.5)]
                    [&::-moz-range-thumb]:w-2.5
                    [&::-moz-range-thumb]:h-2.5
                    [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-white
                    [&::-moz-range-thumb]:shadow-[0_0_8px_rgba(255,255,255,0.3)]
                    [&::-moz-range-thumb]:border-0
                    [&::-moz-range-thumb]:cursor-pointer
                    [&::-moz-range-track]:bg-transparent"
                />
              </div>
            </div>
          )
        })}

        {/* Input ports at bottom — one row per port (supports dual-input nodes) */}
        {node.inputs.map((port) => (
          <div key={port.id} className="flex items-center gap-2.5 pt-2 border-t border-white/5 mt-1">
            <div
              data-port-node={node.id}
              data-port-id={port.id}
              data-port-type="input"
              className="port w-3.5 h-3.5 rounded-full border-[1.5px] border-white/50 bg-white/5 hover:border-white hover:bg-white/30 hover:scale-125 cursor-crosshair transition-all duration-200"
              onMouseDown={(e) => {
                e.stopPropagation()
                onStartConnection(node.id, port.id, 'input', e)
              }}
              onMouseUp={() => onEndConnection(node.id, port.id)}
            />
            <span className="text-[10px] text-white/40 uppercase tracking-wider">
              {port.label}
            </span>
          </div>
        ))}

        {/* Image Node special content */}
        {node.type === 'image-node' && (
          <button
            onClick={handleNodeImageUpload}
            className="w-full overflow-hidden rounded-lg border border-dashed border-white/10 hover:border-white/25 transition-all duration-150 cursor-pointer group"
          >
            {nodeImages[node.id] ? (
              <div className="relative h-20">
                <img
                  src={nodeImages[node.id]}
                  alt="Node image"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-150 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 h-14 bg-white/5 hover:bg-white/10 transition-all duration-150">
                <Upload className="w-3.5 h-3.5 text-white/40" />
                <span className="text-[10px] text-white/40">Upload Image</span>
              </div>
            )}
          </button>
        )}

        {/* Image Input special content */}
        {node.type === 'image-input' && (
          <button
            onClick={handleImageUpload}
            className="w-full overflow-hidden rounded-lg border border-dashed border-white/10 hover:border-white/25 transition-all duration-150 cursor-pointer group"
          >
            {thumbnailSrc ? (
              <div className="relative h-20">
                <img
                  src={thumbnailSrc}
                  alt="Input image"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-150 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 h-14 bg-white/5 hover:bg-white/10 transition-all duration-150">
                <Upload className="w-3.5 h-3.5 text-white/40" />
                <span className="text-[10px] text-white/40">Upload Image</span>
              </div>
            )}
          </button>
        )}

        {/* Output special content */}
        {node.type === 'output' && (
          <div className="flex items-center justify-center h-12 rounded-lg bg-white/5 border border-dashed border-white/10">
            <span className="text-[10px] text-white/40">Final Output</span>
          </div>
        )}
      </div>
    </div>
  )
}
