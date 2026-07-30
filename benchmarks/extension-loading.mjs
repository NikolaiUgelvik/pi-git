import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const childPath = resolve(root, "benchmarks/extension-load-child.mjs")
const entryPath = resolve(root, "extensions/diff.ts")
const temporaryRoot = mkdtempSync(join(tmpdir(), "pi-git-tui-extension-load-"))
const agentDirectory = join(temporaryRoot, "agent")
mkdirSync(agentDirectory)

function parseIterations() {
  const index = process.argv.indexOf("--iterations")
  const rawValue = index >= 0 ? process.argv[index + 1] : undefined
  const iterations = rawValue === undefined ? 10 : Number.parseInt(rawValue, 10)
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error("--iterations must be a positive integer")
  return iterations
}

function successfulOutput(result, label) {
  if (result.error) throw result.error
  if (!result.signal && result.status === 0) return result.stdout
  const details = [`${label} failed (${result.signal ?? result.status})`, result.stdout.trim(), result.stderr.trim()]
  throw new Error(details.filter(Boolean).join("\n"))
}

function sampleLoader() {
  const startedAt = performance.now()
  const result = spawnSync(process.execPath, [childPath, entryPath, root, agentDirectory], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })
  const wallMs = performance.now() - startedAt
  const payload = JSON.parse(successfulOutput(result, "extension discovery").trim())
  if (typeof payload.loadMs !== "number") throw new Error("load child returned an invalid measurement")
  return { loadMs: payload.loadMs, wallMs }
}

function samplePiReadiness() {
  const cliPath = resolve(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js")
  const startedAt = performance.now()
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "--mode",
      "rpc",
      "--no-session",
      "--offline",
      "--no-extensions",
      "--no-context-files",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-tools",
      "--extension",
      entryPath,
    ],
    {
      cwd: root,
      encoding: "utf8",
      input: '{"id":"ready","type":"get_commands"}\n',
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDirectory, PI_OFFLINE: "1" },
      maxBuffer: 10 * 1024 * 1024,
    },
  )
  const wallMs = performance.now() - startedAt
  const response = successfulOutput(result, "Pi readiness")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((event) => event.id === "ready")
  const commands = response?.success ? response.data?.commands : undefined
  if (!Array.isArray(commands) || !commands.some((command) => command.name === "diff")) {
    throw new Error("Pi became ready without /diff")
  }
  return wallMs
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function summarize(values) {
  return {
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

function format(summary) {
  return `median ${summary.median.toFixed(1)} ms, p95 ${summary.p95.toFixed(1)} ms, range ${summary.min.toFixed(1)}-${summary.max.toFixed(1)} ms`
}

try {
  const iterations = parseIterations()
  sampleLoader()
  samplePiReadiness()

  const loaderSamples = []
  const wallSamples = []
  const readinessSamples = []
  for (let index = 0; index < iterations; index++) {
    const loader = sampleLoader()
    loaderSamples.push(loader.loadMs)
    wallSamples.push(loader.wallMs)
    readinessSamples.push(samplePiReadiness())
  }

  console.log(`Fresh-process TypeScript extension loading (${iterations} measured samples; one warm-up discarded)`)
  console.log("Every sample starts a new Node process. Filesystem page caches remain warm.")
  console.log(`jiti loader segment: ${format(summarize(loaderSamples))}`)
  console.log(`extension discovery wall: ${format(summarize(wallSamples))}`)
  console.log(`Pi RPC command readiness: ${format(summarize(readinessSamples))}`)
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
