export type NodeType = 
  | 'image-input'
  | 'brightness-contrast'
  | 'blur'
  | 'saturation'
  | 'hue-shift'
  | 'invert'
  | 'grayscale'
  | 'sharpen'
  | 'noise'
  | 'vignette'
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
    case 'image-input':
      return { type: 'image-input' }
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

export const NODE_DEFINITIONS: Record<NodeType, Omit<NodeData, 'id' | 'x' | 'y'>> = {
  'image-input': {
    type: 'image-input',
    label: 'Image Input',
    inputs: [],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: {}
  },
  'brightness-contrast': {
    type: 'brightness-contrast',
    label: 'Brightness / Contrast',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: { brightness: 0, contrast: 0 }
  },
  'blur': {
    type: 'blur',
    label: 'Blur',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: { radius: 0 }
  },
  'saturation': {
    type: 'saturation',
    label: 'Saturation',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: { amount: 100 }
  },
  'hue-shift': {
    type: 'hue-shift',
    label: 'Hue Shift',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: { degrees: 0 }
  },
  'invert': {
    type: 'invert',
    label: 'Invert',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: { amount: 100 }
  },
  'grayscale': {
    type: 'grayscale',
    label: 'Grayscale',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: { amount: 100 }
  },
  'sharpen': {
    type: 'sharpen',
    label: 'Sharpen',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: { amount: 0 }
  },
  'noise': {
    type: 'noise',
    label: 'Noise',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: { amount: 0 }
  },
  'vignette': {
    type: 'vignette',
    label: 'Vignette',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'out', type: 'output', label: 'Image', dataType: 'image' }],
    params: { amount: 0, softness: 50 }
  },
  'output': {
    type: 'output',
    label: 'Output',
    inputs: [{ id: 'in', type: 'input', label: 'Image', dataType: 'image' }],
    outputs: [],
    params: {}
  }
}
