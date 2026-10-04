#!/usr/bin/env node
/**
 * Syntax-check one part, or every part, without waiting for the others.
 *
 * A part is a bare statement fragment, so `node --check` cannot read it
 * directly (a top-level `return` is illegal in a module). Wrapping the text in
 * a function body restores the context the assembler gives it, which is what
 * makes this usable while teammates are still writing their own parts.
 *
 * Usage:
 *   node scripts/check-parts.mjs                 # every part
 *   node scripts/check-parts.mjs 60-edit.js      # one part
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const partsDir = join(root, 'src', 'client', 'parts')

const only = process.argv[2]
const all = (await readdir(partsDir)).filter((name) => name.endsWith('.js')).sort()
const targets = only === undefined ? all : all.filter((name) => name === only || name.includes(only))

if (targets.length === 0) {
  console.error(`[check-parts] no part matched ${JSON.stringify(only)}; available: ${all.join(', ')}`)
  process.exit(1)
}

let failed = 0
for (const name of targets) {
  const source = await readFile(join(partsDir, name), 'utf8')
  const problems = []

  // `return` only makes sense in the epilogue, which is the last part.
  const isEpilogue = name.startsWith('99-')
  const wrapped = isEpilogue ? source : `function __part(){\n${source}\n}`
  try {
    // eslint-disable-next-line no-new-func
    new Function('require', wrapped)
  } catch (error) {
    problems.push(`syntax: ${error instanceof Error ? error.message : String(error)}`)
  }

  // ESM syntax cannot survive concatenation into a CJS factory body.
  if (/^\s*(import|export)\s/m.test(source)) {
    problems.push('contains import/export — parts are concatenated, not loaded as modules')
  }
  // JSX needs no separate check: it is not valid JavaScript, so the
  // `new Function` parse above already rejects it. A text heuristic here used
  // to fire on placeholder text such as `<fill in the details here>` inside a
  // string literal — a false positive that cost more than it caught.
  // The browser half may only require platform-seeded modules.
  const requires = [...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])
  for (const request of requires) {
    if (request.startsWith('@deepseek-ai/') || request.startsWith('dsh-')) {
      problems.push(`requires "${request}" — client bundles may not import DSH Client packages`)
    }
  }

  if (problems.length === 0) {
    console.log(`ok    ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}`)
    for (const problem of problems) console.log(`        ${problem}`)
  }
}

console.log(`\n[check-parts] ${targets.length - failed}/${targets.length} passed`)
process.exit(failed === 0 ? 0 : 1)
