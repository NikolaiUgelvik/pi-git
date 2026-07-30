import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const temporaryRoot = mkdtempSync(join(tmpdir(), "pi-git-tui-package-smoke-"))

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.signal || result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed (${result.signal ?? result.status})`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    )
  }
  return result.stdout
}

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath) return { command: process.execPath, args: [npmExecPath, ...args] }
  return { command: process.platform === "win32" ? "npm.cmd" : "npm", args }
}

function runNpm(args, cwd = root) {
  const invocation = npmInvocation(args)
  return run(invocation.command, invocation.args, { cwd })
}

function collectRelativeFiles(directory, prefix = "") {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...collectRelativeFiles(join(directory, entry.name), relativePath))
    else if (entry.isFile()) files.push(relativePath)
  }
  return files.sort()
}

function assertPackageMetadata(packageJson) {
  assert.deepEqual(packageJson.files, ["extensions", "src", "assets", "README.md", "LICENSE"])
  assert.deepEqual(packageJson.pi.extensions, ["./extensions/diff.ts"])
  assert.equal(packageJson.main, undefined)
  assert.equal(packageJson.types, undefined)
  assert.equal(packageJson.exports, undefined)
  assert.equal(
    packageJson.pi.image,
    "https://raw.githubusercontent.com/NikolaiUgelvik/pi-git-tui/main/assets/banner.png",
  )
  assert.equal(packageJson.license, "Apache-2.0")
  assert.equal(packageJson.engines.node, ">=22.19.0")
  assert.equal(packageJson.repository.url, "git+https://github.com/NikolaiUgelvik/pi-git-tui.git")
}

function assertInstalledContents(packageRoot) {
  const files = collectRelativeFiles(packageRoot)
  for (const required of [
    "package.json",
    "README.md",
    "LICENSE",
    "assets/banner.png",
    "extensions/diff.ts",
    "src/extension.ts",
  ]) {
    assert(files.includes(required), `installed package is missing ${required}`)
  }
  assert(!files.some((file) => file.startsWith("dist/")), "installed package contains compiled output")
  assert(!files.some((file) => file.startsWith("scripts/")), "installed package contains development scripts")

  for (const file of files) {
    const publishedSource = file.startsWith("extensions/") || file.startsWith("src/")
    const rootFile = ["package.json", "README.md", "LICENSE"].includes(file)
    assert(rootFile || file.startsWith("assets/") || publishedSource, `unexpected installed file: ${file}`)
    if (publishedSource) assert(file.endsWith(".ts"), `published source is not TypeScript: ${file}`)
  }
}

function linkHostPeers(consumerDirectory) {
  const peerScope = join(consumerDirectory, "node_modules/@earendil-works")
  mkdirSync(peerScope, { recursive: true })
  for (const packageName of ["pi-coding-agent", "pi-tui"]) {
    const source = join(root, "node_modules/@earendil-works", packageName)
    const target = join(peerScope, packageName)
    assert(existsSync(source), `missing host peer ${packageName}`)
    symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir")
  }
}

async function assertPackageLoads(packageRoot) {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
  assertPackageMetadata(packageJson)

  const entryPath = join(packageRoot, packageJson.pi.extensions[0])
  const agentDirectory = join(
    temporaryRoot,
    `loader-agent-${relative(temporaryRoot, packageRoot).replaceAll("/", "-")}`,
  )
  mkdirSync(agentDirectory, { recursive: true })
  const loaded = await discoverAndLoadExtensions([entryPath], temporaryRoot, agentDirectory)
  assert.deepEqual(loaded.errors, [])
  assert.equal(loaded.extensions.length, 1)

  const extension = loaded.extensions[0]
  const command = extension?.commands.get("diff")
  assert(command, "TypeScript extension did not register /diff")
  assert.equal(extension.shortcuts.size, 0, "extension registered an unexpected global shortcut")

  const notifications = []
  await command.handler("", {
    hasUI: false,
    ui: {
      notify(message, level) {
        notifications.push({ message, level })
      },
    },
  })
  assert.deepEqual(notifications, [{ message: "/diff requires interactive mode", level: "error" }])
}

function assertActualPiLoad(packageRoot, name) {
  const project = join(temporaryRoot, `${name}-project`)
  const agentDirectory = join(temporaryRoot, `${name}-agent`)
  mkdirSync(project)
  const piCommand = join(root, "node_modules", ".bin", process.platform === "win32" ? "pi.cmd" : "pi")
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDirectory, PI_OFFLINE: "1" }
  run(piCommand, ["install", packageRoot], { cwd: project, env })
  const output = run(piCommand, ["--offline", "--help"], { cwd: project, env })
  assert.doesNotMatch(output, /Warning:|Failed to load extension/u)
}

function copyGitCheckout() {
  const checkout = join(temporaryRoot, "git-checkout")
  mkdirSync(checkout)
  for (const directory of ["assets", "extensions", "scripts", "src"]) {
    cpSync(join(root, directory), join(checkout, directory), { recursive: true })
  }
  for (const file of ["LICENSE", "README.md", "package-lock.json", "package.json"]) {
    cpSync(join(root, file), join(checkout, file))
  }
  return checkout
}

try {
  const gitCheckout = copyGitCheckout()
  runNpm(["install", "--omit=dev", "--no-audit", "--no-fund"], gitCheckout)
  assert(!existsSync(join(gitCheckout, "node_modules/typescript")), "production Git install included TypeScript")
  assert(!existsSync(join(gitCheckout, "dist")), "production Git install created compiled output")
  await assertPackageLoads(gitCheckout)
  assertActualPiLoad(gitCheckout, "git")

  const packDirectory = join(temporaryRoot, "pack")
  mkdirSync(packDirectory)
  runNpm(["pack", "--ignore-scripts", "--silent", "--pack-destination", packDirectory])
  const tarballs = readdirSync(packDirectory).filter((name) => name.endsWith(".tgz"))
  assert.equal(tarballs.length, 1, "npm pack did not produce exactly one tarball")

  const consumerDirectory = join(temporaryRoot, "consumer")
  mkdirSync(consumerDirectory)
  writeFileSync(join(consumerDirectory, "package.json"), '{"name":"pi-git-tui-smoke","private":true,"type":"module"}\n')
  runNpm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--legacy-peer-deps",
      join(packDirectory, tarballs[0]),
    ],
    consumerDirectory,
  )
  linkHostPeers(consumerDirectory)

  const packageRoot = join(consumerDirectory, "node_modules/pi-git-tui")
  assertInstalledContents(packageRoot)
  await assertPackageLoads(packageRoot)
  assertActualPiLoad(packageRoot, "npm")
  console.log("Packed TypeScript source loaded through Pi and registered /diff successfully.")
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
