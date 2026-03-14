import { spawn } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const nextDir = path.join(root, '.next')

if (existsSync(nextDir)) {
  const backup = path.join(root, `.next_corrupt_${Date.now()}`)
  renameSync(nextDir, backup)
  console.log(`Rotated stale cache: ${path.basename(backup)}`)
}

const nextBin = path.join(root, 'node_modules', '.bin', 'next')
const child = spawn(nextBin, ['dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('exit', code => {
  process.exit(code ?? 0)
})
