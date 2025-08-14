#!/usr/bin/env node

import { readFile, writeFile, access } from 'fs/promises'
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

function quote(s) {
  return '"' + String(s).replaceAll('"', '\\"') + '"'
}

function inferGroupFromProjectFolder(projectFolder) {
  const first = projectFolder.split(/[\\/]/)[0]
  return first || 'root'
}

async function readJson(filePath, { allowComments = false } = {}) {
  const raw = await readFile(filePath, 'utf-8')
  const text = allowComments ? stripJsonComments(raw) : raw
  return JSON.parse(text)
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  const repoRoot = process.cwd()
  const args = parseArgs(process.argv)
  const outPath = path.resolve(repoRoot, args.out || 'dep-graph.dot')
  const format = (args.format || 'dot').toLowerCase()

  const rushJsonPath = path.resolve(repoRoot, 'rush.json')
  const rush = await readJson(rushJsonPath, { allowComments: true })
  const projects = rush.projects || []

  const packageNameToFolder = new Map()
  const allInternalNames = new Set()
  const nameToGroup = new Map()

  for (const proj of projects) {
    const name = proj.packageName
    const folder = proj.projectFolder
    if (!name || !folder) continue
    packageNameToFolder.set(name, folder)
    allInternalNames.add(name)
    nameToGroup.set(name, inferGroupFromProjectFolder(folder))
  }

  const adjacency = new Map() // name -> Set<name>
  const allNodes = new Set(allInternalNames)
  const errors = []

  // Limit concurrency to avoid too many open files
  const projectEntries = [...packageNameToFolder.entries()]
  const concurrency = 20

  async function processSlice(slice) {
    await Promise.all(
      slice.map(async ([pkgName, folder]) => {
        try {
          const pkgJsonPath = path.resolve(repoRoot, folder, 'package.json')
          if (!(await fileExists(pkgJsonPath))) return
          const pkg = await readJson(pkgJsonPath)
          const depFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
          const deps = new Set()
          for (const field of depFields) {
            const section = pkg[field]
            if (section && typeof section === 'object') {
              for (const depName of Object.keys(section)) {
                if (allInternalNames.has(depName)) deps.add(depName)
              }
            }
          }
          adjacency.set(pkgName, deps)
        } catch (err) {
          errors.push({ package: pkgName, error: String(err) })
        }
      })
    )
  }

  for (let i = 0; i < projectEntries.length; i += concurrency) {
    const slice = projectEntries.slice(i, i + concurrency)
    // eslint-disable-next-line no-await-in-loop
    await processSlice(slice)
  }

  // Build edge list
  const edges = []
  const dependentsCount = new Map([...allInternalNames].map(n => [n, 0]))
  for (const [from, deps] of adjacency.entries()) {
    for (const to of deps) {
      edges.push([from, to])
      dependentsCount.set(to, (dependentsCount.get(to) || 0) + 1)
    }
  }

  if (format === 'json') {
    const jsonOut = {
      nodes: [...allNodes],
      edges: edges.map(([a, b]) => ({ from: a, to: b })),
      groups: Object.fromEntries([...nameToGroup.entries()])
    }
    await writeFile(outPath, JSON.stringify(jsonOut, null, 2))
  } else {
    // DOT output with clusters by top-level folder
    const groupToNodes = new Map()
    for (const name of allNodes) {
      const g = nameToGroup.get(name) || 'root'
      if (!groupToNodes.has(g)) groupToNodes.set(g, new Set())
      groupToNodes.get(g).add(name)
    }

    let dot = ''
    dot += 'digraph Monorepo {\n'
    dot += '  rankdir=LR;\n'
    dot += '  graph [fontname="Helvetica", fontsize=10];\n'
    dot += '  node [shape=box, fontname="Helvetica", fontsize=9];\n'
    dot += '  edge [fontname="Helvetica", fontsize=8];\n\n'

    // clusters
    for (const [group, nodes] of groupToNodes) {
      const clusterId = 'cluster_' + group.replace(/[^a-zA-Z0-9_]/g, '_')
      dot += `  subgraph ${clusterId} {\n`
      dot += `    label=${quote(group)};\n`
      dot += '    color="#cccccc";\n'
      for (const n of nodes) {
        dot += `    ${quote(n)};\n`
      }
      dot += '  }\n\n'
    }

    // edges
    const emitted = new Set()
    for (const [from, to] of edges) {
      const key = from + '->' + to
      if (emitted.has(key)) continue
      emitted.add(key)
      dot += `  ${quote(from)} -> ${quote(to)};\n`
    }

    dot += '}\n'
    await writeFile(outPath, dot)
  }

  // Print a concise summary
  const numNodes = allNodes.size
  const numEdges = edges.length
  const roots = [...allNodes].filter(n => (dependentsCount.get(n) || 0) === 0)
  const topInDegree = [...dependentsCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  console.log(`[dep-graph] nodes=${numNodes} edges=${numEdges} -> ${outPath}`)
  if (roots.length) {
    console.log(`[dep-graph] roots (${Math.min(10, roots.length)} shown): ${roots.slice(0, 10).join(', ')}`)
  }
  if (topInDegree.length) {
    console.log('[dep-graph] most depended-on (top 10):')
    for (const [name, count] of topInDegree) {
      console.log(`  ${name} <- ${count}`)
    }
  }
  if (errors.length) {
    console.warn(`[dep-graph] warnings while reading package.json (${errors.length}):`)
    for (const e of errors.slice(0, 5)) {
      console.warn(`  ${e.package}: ${e.error}`)
    }
    if (errors.length > 5) console.warn(`  ...and ${errors.length - 5} more`)
  }
}

main().catch(err => {
  console.error('[dep-graph] failed:', err)
  process.exit(1)
})