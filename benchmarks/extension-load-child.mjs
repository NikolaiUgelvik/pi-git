import { performance } from "node:perf_hooks"
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent"

const [entryPath, cwd, agentDirectory] = process.argv.slice(2)
if (!entryPath || !cwd || !agentDirectory) {
  throw new Error("usage: extension-load-child.mjs <entry> <cwd> <agent-directory>")
}

const startedAt = performance.now()
const loaded = await discoverAndLoadExtensions([entryPath], cwd, agentDirectory)
const loadMs = performance.now() - startedAt
if (loaded.errors.length > 0) throw new Error(JSON.stringify(loaded.errors))
if (loaded.extensions.length !== 1) throw new Error(`expected one extension, loaded ${loaded.extensions.length}`)

const extension = loaded.extensions[0]
if (!extension?.commands.has("diff") || extension.shortcuts.size !== 0) {
  throw new Error("extension did not register only /diff")
}

process.stdout.write(`${JSON.stringify({ loadMs })}\n`)
