import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const npmCommand = process.env.npm_command ?? ""
const packaging = npmCommand === "pack" || npmCommand === "publish"
const huskyPath = resolve(root, "node_modules/husky/bin.js")

try {
  if (!packaging && existsSync(huskyPath) && existsSync(resolve(root, ".git")) && process.env.HUSKY !== "0") {
    const result = spawnSync(process.execPath, [huskyPath], { cwd: root, stdio: "inherit" })
    if (result.error) throw result.error
    if (result.signal) throw new Error(`husky was terminated by ${result.signal}`)
    if (result.status !== 0) throw new Error(`husky exited with status ${result.status}`)
  }
} catch (error) {
  console.error(`pi-git-tui prepare failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
