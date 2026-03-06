import type { Graph } from './node-types'

export interface ExecutionResult {
  image_b64: string
  width: number
  height: number
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function loadImage(path: string): Promise<void> {
  if (!isTauri()) throw new Error('Not running in Tauri')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('load_image', { path })
}

export async function executeGraph(
  graph: Graph,
  preview = true
): Promise<ExecutionResult> {
  if (!isTauri()) throw new Error('Not running in Tauri')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('execute_graph', { payload: { graph, preview } })
}

export async function exportImage(
  graph: Graph,
  outputPath: string
): Promise<void> {
  if (!isTauri()) throw new Error('Not running in Tauri')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('export_image', { payload: { graph, preview: false }, outputPath })
}

export async function openImageDialog(): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const result = await open({
    filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })
  return typeof result === 'string' ? result : null
}

export async function saveImageDialog(): Promise<string | null> {
  if (!isTauri()) return null
  const { save } = await import('@tauri-apps/plugin-dialog')
  const result = await save({
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  return typeof result === 'string' ? result : null
}
