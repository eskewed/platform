#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import process from 'process'

function stripJsonComments(jsonWithComments) {
  let isInString = false
  let isInSingleLineComment = false
  let isInMultiLineComment = false
  let prevChar = ''
  let result = ''

  for (let i = 0; i < jsonWithComments.length; i++) {
    const currentChar = jsonWithComments[i]
    const nextChar = jsonWithComments[i + 1]

    if (!isInSingleLineComment && !isInMultiLineComment) {
      if (currentChar === '"' && prevChar !== '\\') {
        isInString = !isInString
      }
    }

    if (isInString) {
      result += currentChar
      prevChar = currentChar
      continue
    }

    if (isInSingleLineComment) {
      if (currentChar === '\n') {
        isInSingleLineComment = false
        result += currentChar
      }
      prevChar = currentChar
      continue
    }

    if (isInMultiLineComment) {
      if (currentChar === '*' && nextChar === '/') {
        isInMultiLineComment = false
        i++
      }
      prevChar = currentChar
      continue
    }

    if (currentChar === '/' && nextChar === '/') {
      isInSingleLineComment = true
      i++
      prevChar = currentChar
      continue
    }

    if (currentChar === '/' && nextChar === '*') {
      isInMultiLineComment = true
      i++
      prevChar = currentChar
      continue
    }

    result += currentChar
    prevChar = currentChar
  }

  return result
}

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

function inferGroup(projectFolder) {
  const first = projectFolder.split(/[\\/]/)[0]
  return first || 'root'
}

async function main() {
  const args = parseArgs(process.argv)
  const repoRoot = process.cwd()
  const rushPath = path.resolve(repoRoot, 'rush.json')
  const raw = await readFile(rushPath, 'utf-8')
  const rush = JSON.parse(stripJsonComments(raw))
  const projects = rush.projects || []

  const lines = []
  const counts = new Map()
  for (const p of projects) {
    const group = inferGroup(p.projectFolder)
    counts.set(group, (counts.get(group) || 0) + 1)
    lines.push(`${p.packageName}\t${p.projectFolder}\t${group}`)
  }

  const header = `Total projects: ${projects.length}`
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g, c]) => `${g}=${c}`).join(', ')
  const summary = `${header} | By group: ${groups}`

  const out = (args.out && path.resolve(args.out)) || path.resolve(repoRoot, 'rush-projects.txt')
  await writeFile(out, lines.join('\n') + '\n')

  console.log(summary)
  console.log(`List written to ${out}`)
}

main().catch(err => {
  console.error('list-rush-projects failed:', err)
  process.exit(1)
})