import { execSync, spawn } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const nextDir = path.join(root, '.next')
const portsToReclaim = [3000, 3001]

function reclaimPort(port) {
  try {
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim()

    if (!output) return

    const pids = output.split('\n').map(v => v.trim()).filter(Boolean)
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM')
        console.log(`Stopped process ${pid} on port ${port}`)
      } catch {}
    }
  } catch {
    // No listener on this port.
  }
}

for (const port of portsToReclaim) {
  reclaimPort(port)
}

if (existsSync(nextDir)) {
  const backup = path.join(root, `.next_corrupt_${Date.now()}`)
  renameSync(nextDir, backup)
  console.log(`Rotated stale cache: ${path.basename(backup)}`)
}

const nextBin = path.join(root, 'node_modules', '.bin', 'next')
const child = spawn(nextBin, ['dev', '-p', '3000'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('exit', code => {
  process.exit(code ?? 0)
})
