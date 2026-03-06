import { create } from 'zustand'
import { NodeData, Connection, NodeType, NODE_DEFINITIONS } from './node-types'

interface NodeStore {
  nodes: NodeData[]
  connections: Connection[]
  selectedNodeId: string | null
  backgroundImage: string | null
  imageLoaded: boolean

  addNode: (type: NodeType, x: number, y: number) => string
  removeNode: (id: string) => void
  updateNodePosition: (id: string, x: number, y: number) => void
  updateNodeParam: (id: string, param: string, value: number) => void
  selectNode: (id: string | null) => void

  addConnection: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => void
  removeConnection: (id: string) => void
  insertNodeIntoChain: (type: NodeType) => void
  insertNodeBetween: (connectionId: string, nodeId: string) => void

  setBackgroundImage: (url: string | null) => void
  setImageLoaded: (loaded: boolean) => void
}

let nodeIdCounter = 0

// Walks backwards from Output to find every node reachable via connections.
export function getActiveNodeIds(nodes: NodeData[], connections: Connection[]): Set<string> {
  const outputNode = nodes.find(n => n.type === 'output')
  if (!outputNode) return new Set()

  const active = new Set<string>()
  const queue = [outputNode.id]

  while (queue.length) {
    const id = queue.pop()!
    if (active.has(id)) continue
    active.add(id)
    connections
      .filter(c => c.toNodeId === id)
      .forEach(c => queue.push(c.fromNodeId))
  }
  return active
}

export const useNodeStore = create<NodeStore>((set, get) => ({
  nodes: [],
  connections: [],
  selectedNodeId: null,
  backgroundImage: null,
  imageLoaded: false,

  addNode: (type, x, y) => {
    const definition = NODE_DEFINITIONS[type]
    const id = `node-${++nodeIdCounter}`
    const newNode: NodeData = {
      ...definition,
      id,
      x,
      y,
      params: { ...definition.params },
    }
    set(state => ({ nodes: [...state.nodes, newNode] }))
    return id
  },

  removeNode: (id) => {
    const { connections } = get()
    const incoming = connections.filter(c => c.toNodeId === id)
    const outgoing = connections.filter(c => c.fromNodeId === id)

    // Heal the chain: reconnect each upstream source directly to each downstream target
    const bridgeConnections: Connection[] = []
    for (const inc of incoming) {
      for (const out of outgoing) {
        bridgeConnections.push({
          id: `conn-${Date.now()}-${bridgeConnections.length}`,
          fromNodeId: inc.fromNodeId,
          fromPortId: inc.fromPortId,
          toNodeId: out.toNodeId,
          toPortId: out.toPortId,
        })
      }
    }

    set(state => ({
      nodes: state.nodes.filter(n => n.id !== id),
      connections: [
        ...state.connections.filter(c => c.fromNodeId !== id && c.toNodeId !== id),
        ...bridgeConnections,
      ],
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }))
  },

  updateNodePosition: (id, x, y) => {
    set(state => ({
      nodes: state.nodes.map(n => (n.id === id ? { ...n, x, y } : n)),
    }))
  },

  updateNodeParam: (id, param, value) => {
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === id ? { ...n, params: { ...n.params, [param]: value } } : n
      ),
    }))
  },

  selectNode: (id) => {
    set({ selectedNodeId: id })
  },

  addConnection: (fromNodeId, fromPortId, toNodeId, toPortId) => {
    const existingConnection = get().connections.find(
      c => c.toNodeId === toNodeId && c.toPortId === toPortId
    )
    if (existingConnection) {
      set(state => ({
        connections: state.connections.filter(c => c.id !== existingConnection.id),
      }))
    }
    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromNodeId,
      fromPortId,
      toNodeId,
      toPortId,
    }
    set(state => ({ connections: [...state.connections, newConnection] }))
  },

  removeConnection: (id) => {
    set(state => ({
      connections: state.connections.filter(c => c.id !== id),
    }))
  },

  // Adds a new node and splices it in before the Output node.
  // If image-input → output is the current chain, result becomes:
  //   image-input → new-node → output
  insertNodeIntoChain: (type) => {
    const { nodes, connections } = get()
    const definition = NODE_DEFINITIONS[type]
    const newId = `node-${++nodeIdCounter}`

    const outputNode = nodes.find(n => n.type === 'output')
    const connectionIntoOutput = outputNode
      ? connections.find(c => c.toNodeId === outputNode.id)
      : null
    const fromNode = connectionIntoOutput
      ? nodes.find(n => n.id === connectionIntoOutput.fromNodeId)
      : null

    // Position: midpoint between the last node and Output, nudged by stack depth
    let x = 400
    let y = 200
    if (fromNode && outputNode) {
      const stackCount = nodes.filter(
        n => n.type !== 'image-input' && n.type !== 'output'
      ).length
      x = Math.round((fromNode.x + outputNode.x) / 2) + stackCount * 10
      y = Math.round((fromNode.y + outputNode.y) / 2) + stackCount * 10
    }

    const newNode: NodeData = {
      ...definition,
      id: newId,
      x,
      y,
      params: { ...definition.params },
    }

    if (connectionIntoOutput && outputNode && fromNode) {
      const newConn1: Connection = {
        id: `conn-${Date.now()}`,
        fromNodeId: fromNode.id,
        fromPortId: connectionIntoOutput.fromPortId,
        toNodeId: newId,
        toPortId: 'in',
      }
      const newConn2: Connection = {
        id: `conn-${Date.now() + 1}`,
        fromNodeId: newId,
        fromPortId: 'out',
        toNodeId: outputNode.id,
        toPortId: connectionIntoOutput.toPortId,
      }
      set(state => ({
        nodes: [...state.nodes, newNode],
        connections: [
          ...state.connections.filter(c => c.id !== connectionIntoOutput.id),
          newConn1,
          newConn2,
        ],
      }))
    } else {
      set(state => ({ nodes: [...state.nodes, newNode] }))
    }
  },

  // Rewires an existing connection to pass through an already-placed node.
  // A → B becomes A → nodeId → B.
  insertNodeBetween: (connectionId, nodeId) => {
    const conn = get().connections.find(c => c.id === connectionId)
    if (!conn) return

    const newConn1: Connection = {
      id: `conn-${Date.now()}`,
      fromNodeId: conn.fromNodeId,
      fromPortId: conn.fromPortId,
      toNodeId: nodeId,
      toPortId: 'in',
    }
    const newConn2: Connection = {
      id: `conn-${Date.now() + 1}`,
      fromNodeId: nodeId,
      fromPortId: 'out',
      toNodeId: conn.toNodeId,
      toPortId: conn.toPortId,
    }
    set(state => ({
      connections: [
        ...state.connections.filter(c => c.id !== connectionId),
        newConn1,
        newConn2,
      ],
    }))
  },

  setBackgroundImage: (url) => {
    set({ backgroundImage: url })
  },

  setImageLoaded: (loaded) => {
    set({ imageLoaded: loaded })
  },
}))
