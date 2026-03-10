export type NodeType =
  | 'image-input'
  | 'image-node'
  | 'brightness-contrast'
  | 'blur'
  | 'saturation'
  | 'hue-shift'
  | 'invert'
  | 'grayscale'
  | 'sharpen'
  | 'noise'
  | 'vignette'
  | 'levels'
  | 'curves'
  | 'gradient-map'
  | 'transform'
  | 'mix-blend'
  | 'mask'
  | 'pixelate'
  | 'dither'
  | 'noise-texture'
  | 'displace'
  | 'output'

export interface Port {
  id: string
  type: 'input' | 'output'
  label: string
  dataType: 'image' | 'number'
}

export interface NodeData {
  id: string
  type: NodeType
  label: string
  x: number
  y: number
  inputs: Port[]
  outputs: Port[]
  params: Record<string, number>
}

export interface Connection {
  id: string
  fromNodeId: string
  fromPortId: string
  toNodeId: string
  toPortId: string
}

// --- Graph serialization types (mirrors Rust graph/types.rs) ---

export interface GraphEdge {
  from_node: string
  from_port: string
  to_node: string
  to_port: string
}

export interface GraphNode {
  id: string
  kind: object
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function nodeDataToKind(n: NodeData): object {
  switch (n.type) {
    case 'brightness-contrast':
      return { type: 'brightness-contrast', brightness: n.params.brightness, contrast: n.params.contrast }
    case 'blur':
      return { type: 'blur', radius: n.params.radius }
    case 'saturation':
      return { type: 'saturation', amount: n.params.amount }
    case 'hue-shift':
      return { type: 'hue-shift', degrees: n.params.degrees }
    case 'invert':
      return { type: 'invert', amount: n.params.amount }
    case 'grayscale':
      return { type: 'grayscale', amount: n.params.amount }
    case 'sharpen':
      return { type: 'sharpen', amount: n.params.amount }
    case 'noise':
      return { type: 'noise', amount: n.params.amount }
    case 'vignette':
      return { type: 'vignette', amount: n.params.amount, softness: n.params.softness }
    case 'levels':
      return { type: 'levels', input_black: n.params.input_black, input_white: n.params.input_white, gamma: n.params.gamma }
    case 'curves':
      return { type: 'curves', shadows: n.params.shadows, midtones: n.params.midtones, highlights: n.params.highlights }
    case 'gradient-map':
      return { type: 'gradient-map', hue_a: n.params.hue_a, hue_b: n.params.hue_b, saturation: n.params.saturation }
    case 'transform':
      return { type: 'transform', rotate: n.params.rotate, scale: n.params.scale }
    case 'mix-blend':
      return { type: 'mix-blend', opacity: n.params.opacity, mode: n.params.mode }
    case 'mask':
      return { type: 'mask', invert: n.params.invert }
    case 'pixelate':
      return { type: 'pixelate', size: n.params.size }
    case 'dither':
      return { type: 'dither', levels: n.params.levels, strength: n.params.strength }
    case 'noise-texture':
      return { type: 'noise-texture', freq: n.params.freq, octaves: n.params.octaves, intensity: n.params.intensity }
    case 'displace':
      return { type: 'displace', amount: n.params.amount, freq: n.params.freq }
    case 'image-input':
      return { type: 'image-input' }
    case 'image-node':
      return { type: 'image-node' }
    case 'output':
      return { type: 'output' }
  }
}

export function buildGraphPayload(nodes: NodeData[], connections: Connection[]): Graph {
  return {
    nodes: nodes.map(n => ({ id: n.id, kind: nodeDataToKind(n) })),
    edges: connections.map(c => ({
      from_node: c.fromNodeId,
      from_port: c.fromPortId,
      to_node: c.toNodeId,
      to_port: c.toPortId,
    })),
  }
}

const IMG_IN: Port = { id: 'in', type: 'input', label: 'Image', dataType: 'image' }
const IMG_OUT: Port = { id: 'out', type: 'output', label: 'Image', dataType: 'image' }

export const NODE_DEFINITIONS: Record<NodeType, Omit<NodeData, 'id' | 'x' | 'y'>> = {
  'image-input': {
    type: 'image-input',
    label: 'Image Input',
    inputs: [],
    outputs: [IMG_OUT],
    params: {}
  },
  'image-node': {
    type: 'image-node',
    label: 'Image',
    inputs: [],
    outputs: [IMG_OUT],
    params: {}
  },
  'brightness-contrast': {
    type: 'brightness-contrast',
    label: 'Brightness / Contrast',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { brightness: 0, contrast: 0 }
  },
  'blur': {
    type: 'blur',
    label: 'Blur',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { radius: 0 }
  },
  'saturation': {
    type: 'saturation',
    label: 'Saturation',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { amount: 100 }
  },
  'hue-shift': {
    type: 'hue-shift',
    label: 'Hue Shift',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { degrees: 0 }
  },
  'invert': {
    type: 'invert',
    label: 'Invert',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { amount: 100 }
  },
  'grayscale': {
    type: 'grayscale',
    label: 'Grayscale',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { amount: 100 }
  },
  'sharpen': {
    type: 'sharpen',
    label: 'Sharpen',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { amount: 0 }
  },
  'noise': {
    type: 'noise',
    label: 'Noise',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { amount: 0 }
  },
  'vignette': {
    type: 'vignette',
    label: 'Vignette',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { amount: 0, softness: 50 }
  },
  'levels': {
    type: 'levels',
    label: 'Levels',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { input_black: 0, input_white: 100, gamma: 10 }
  },
  'curves': {
    type: 'curves',
    label: 'Curves',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { shadows: 0, midtones: 0, highlights: 0 }
  },
  'gradient-map': {
    type: 'gradient-map',
    label: 'Gradient Map',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { hue_a: 240, hue_b: 30, saturation: 80 }
  },
  'transform': {
    type: 'transform',
    label: 'Transform',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { rotate: 0, scale: 100 }
  },
  'mix-blend': {
    type: 'mix-blend',
    label: 'Mix / Blend',
    inputs: [
      { id: 'in-a', type: 'input', label: 'Layer A', dataType: 'image' },
      { id: 'in-b', type: 'input', label: 'Layer B', dataType: 'image' },
    ],
    outputs: [IMG_OUT],
    params: { opacity: 50, mode: 0 }
  },
  'mask': {
    type: 'mask',
    label: 'Mask',
    inputs: [
      { id: 'image', type: 'input', label: 'Image', dataType: 'image' },
      { id: 'mask', type: 'input', label: 'Mask', dataType: 'image' },
    ],
    outputs: [IMG_OUT],
    params: { invert: 0 }
  },
  'pixelate': {
    type: 'pixelate',
    label: 'Pixelate',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { size: 8 }
  },
  'dither': {
    type: 'dither',
    label: 'Dither',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { levels: 4, strength: 100 }
  },
  'noise-texture': {
    type: 'noise-texture',
    label: 'Noise Texture',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { freq: 20, octaves: 4, intensity: 50 }
  },
  'displace': {
    type: 'displace',
    label: 'Displace',
    inputs: [IMG_IN],
    outputs: [IMG_OUT],
    params: { amount: 10, freq: 20 }
  },
  'output': {
    type: 'output',
    label: 'Output',
    inputs: [IMG_IN],
    outputs: [],
    params: {}
  }
}
