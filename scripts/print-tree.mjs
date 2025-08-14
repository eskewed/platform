#!/usr/bin/env node

import { readdir, stat, writeFile } from 'fs/promises'
import path from 'path'
import process from 'process'

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const part = argv[i]
    if (part.startsWith('--')) {
      const [key, val] = part.split('=')
      args[key.slice(2)] = val === undefined ? true : val
    }
  }
  return args
}

const DEFAULT_EXCLUDES = new Set([
  'node_modules',
  '.git',
  'pnpm-store',
  'dist',
  'build',
  '__pycache__',
  '.venv',
  // rush cache dir
  'temp',
])

async function listDir(root, opts, depth = 0, lines = []) {
  const entries = await readdir(root, { withFileTypes: true })
  const dirs = []
  const files = []
  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (opts.exclude.has(entry.name)) continue
      dirs.push(entry.name)
    } else if (entry.isFile()) {
      if (depth === 0) files.push(entry.name)
    }
  }
  dirs.sort((a, b) => a.localeCompare(b))
  files.sort((a, b) => a.localeCompare(b))

  const rel = path.relative(opts.base, root)
  const label = rel === '' ? '/' : rel + '/'
  const indent = '  '.repeat(depth)
  if (depth === 0) lines.push(label)

  for (const dir of dirs) {
    lines.push(indent + dir + '/')
    if (depth + 1 < opts.maxDepth) {
      await listDir(path.join(root, dir), opts, depth + 1, lines)
    }
  }

  if (depth === 0 && files.length > 0) {
    lines.push('')
    lines.push('Files at root:')
    for (const f of files) lines.push('  ' + f)
  }

  return lines
}

async function main() {
  const args = parseArgs(process.argv)
  const root = path.resolve(args.root || process.cwd())
  const maxDepth = Math.max(1, parseInt(args.maxDepth || '3', 10))
  const exclude = new Set((args.exclude || '').split(',').filter(Boolean))
  for (const e of DEFAULT_EXCLUDES) exclude.add(e)

  const opts = { base: root, maxDepth, exclude }
  const lines = await listDir(root, opts)
  const text = lines.join('\n') + '\n'

  if (args.out) {
    await writeFile(path.resolve(args.out), text)
  }
  process.stdout.write(text)
}

main().catch(err => {
  console.error('print-tree failed:', err)
  process.exit(1)
})