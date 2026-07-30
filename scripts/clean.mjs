import { rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const directories = new Map([
  ["--coverage", ".tmp-coverage"],
  ["--tests", ".tmp-tests"],
  ["--typecheck", ".tmp-typecheck"],
])

try {
  const requestedTargets = process.argv.length > 2 ? process.argv.slice(2) : [...directories.keys()]
  const targets = new Set(
    requestedTargets.map((target) => {
      const directory = directories.get(target)
      if (!directory) throw new Error(`unknown target ${target}`)
      return directory
    }),
  )
  for (const target of targets) rmSync(resolve(root, target), { recursive: true, force: true })
} catch (error) {
  console.error(`pi-git-tui clean failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
