import { spawnSync } from "node:child_process"
import { rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const npmExecPath = process.env.npm_execpath
const invocation = npmExecPath
  ? { command: process.execPath, prefix: [npmExecPath] }
  : { command: process.platform === "win32" ? "npm.cmd" : "npm", prefix: [] }
const scripts = ["lint:ci", "test:coverage", "smoke:package", "fallow"]

try {
  for (const script of scripts) {
    const result = spawnSync(invocation.command, [...invocation.prefix, "run", script], {
      cwd: root,
      stdio: "inherit",
    })
    if (result.error) throw result.error
    if (result.signal) throw new Error(`${script} was terminated by ${result.signal}`)
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      break
    }
  }
} finally {
  rmSync(resolve(root, ".tmp-coverage"), { recursive: true, force: true })
}
