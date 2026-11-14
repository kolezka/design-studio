import { createPlugin, rootFrom } from 'claude-plugin-dsh'
import { serveCanvas } from './canvas.js'

const root = rootFrom(import.meta.url)
const plugin = createPlugin({ root })

export const name = plugin.name

export function apply(ctx, config) {
  serveCanvas(ctx, root)
  return plugin.apply(ctx, config)
}

export default { name, apply }
