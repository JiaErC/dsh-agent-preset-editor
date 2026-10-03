#!/usr/bin/env node
/**
 * Assemble `client.js` from `src/client/parts/*.js`.
 *
 * The browser module system is Lazy-CJS: `client.js` runs once and registers
 * a factory; anything the factory `require`s must come from the platform
 * module table (React and friends). Cross-part imports therefore cannot use
 * ESM syntax, and a bundle-local chunk cannot be required synchronously. The
 * parts are plain statement fragments concatenated in filename order into one
 * factory body — one file, no build toolchain, no dependency.
 *
 * Usage: node scripts/build-client.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const partsDir = join(root, 'src', 'client', 'parts')
const outFile = join(root, 'client.js')

const BANNER = `/**
 * dsh-agent-preset-editor — browser half.
 *
 * GENERATED FILE. Do not edit by hand: edit src/client/parts/*.js and run
 * \`node scripts/build-client.mjs\`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-agent-preset-editor',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
`

const FOOTER = `  },
});
`

const files = (await readdir(partsDir)).filter((name) => name.endsWith('.js')).sort()
if (files.length === 0) {
  console.error(`[build-client] no parts found in ${partsDir}`)
  process.exit(1)
}

const chunks = []
for (const name of files) {
  const body = await readFile(join(partsDir, name), 'utf8')
  chunks.push(`/* ============================ ${name} ============================ */\n${body.replace(/\s*$/, '')}\n`)
}

const output = BANNER + chunks.join('\n') + FOOTER

// Syntax gate: parse the factory body without executing it (no `window`, no
// `require` at parse time). Anything that fails here never reaches the page.
const bodyStart = BANNER.length
const bodyEnd = output.length - FOOTER.length
const factoryBody = output.slice(bodyStart, bodyEnd)
try {
  // eslint-disable-next-line no-new-func
  new Function('require', factoryBody)
} catch (error) {
  console.error('[build-client] syntax error in assembled factory body:')
  console.error(error instanceof Error ? error.message : String(error))
  const lines = factoryBody.split('\n')
  const stack = error instanceof Error ? error.stack ?? '' : ''
  const match = /<anonymous>:(\d+)/.exec(stack)
  if (match) {
    const line = Number(match[1])
    for (let i = Math.max(0, line - 6); i < Math.min(lines.length, line + 4); i += 1) {
      console.error(`${String(i + 1).padStart(5)} | ${lines[i]}`)
    }
  }
  process.exit(1)
}

await writeFile(outFile, output, 'utf8')
console.log(`[build-client] wrote ${outFile}`)
console.log(`[build-client] parts: ${files.join(', ')}`)
