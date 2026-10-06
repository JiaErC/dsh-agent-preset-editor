#!/usr/bin/env node
/**
 * Offline regression test for the plugin's browser half.
 *
 * Runs the SHIPPED `client.js` against a mock host — no browser, no DSH
 * process. It exists because two real defects reached a running Harness that
 * a plain syntax check could not see, and each one taught the mock something:
 *
 * 1. A Cordis `Context` is a Proxy. Reading a service the plugin did not
 *    declare in `inject` THROWS (`cannot get property "x" without inject`)
 *    rather than returning undefined — so the mock context throws too.
 * 2. `useEffect` bodies actually run here, so the async state loader is
 *    exercised instead of merely defined.
 * 3. `sessions` is a DECLARED dependency and therefore a plain property;
 *    `conversation` is an inject-free `ctx.get` probe. The mock models that
 *    split, because getting it backwards is exactly what broke
 *    「让 AI 帮我写」.
 *
 * The internal functions the second half needs are not part of the bundle's
 * public surface, so the source is patched in memory to publish them on
 * `globalThis` before the factory returns. Everything under test is still the
 * shipped code.
 *
 * Usage: node tests/verify-browser-half.mjs [path/to/client.js]
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = process.argv[2] || join(root, 'client.js')

const failures = []
const check = (label, condition, detail) => {
  if (condition) console.log(`  ok   ${label}`)
  else { failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`) }
}

/* ----------------------------- stubs ---------------------------------- */

const textareas = []
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  createElement() { return { setAttribute() {}, textContent: '', parentNode: null } },
  head: { appendChild() {}, removeChild() {} },
  querySelector(selector) {
    if (String(selector).includes('textarea')) return textareas[0] || null
    return null
  },
}

const hookStates = []
const setCalls = []
let hookCursor = 0
const pendingEffects = []

const mockReact = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  Fragment: Symbol('Fragment'),
  useState(initial) {
    const index = hookCursor++
    if (!(index in hookStates)) hookStates[index] = typeof initial === 'function' ? initial() : initial
    const setter = (next) => {
      const value = typeof next === 'function' ? next(hookStates[index]) : next
      hookStates[index] = value
      setCalls.push(value)
    }
    return [hookStates[index], setter]
  },
  useEffect(fn) { pendingEffects.push(fn); return () => {} },
  useMemo: (factory) => factory(),
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
  useSyncExternalStore: (subscribe, get) => get(),
  useLayoutEffect(fn) { pendingEffects.push(fn); return () => {} },
}

let captured = null
globalThis.window = { __ModuleLoader__: { load(definition) { captured = definition } } }

/* --------------------- load and patch the bundle ---------------------- */

const raw = readFileSync(CLIENT, 'utf8')
const ANCHOR = 'return {\n  name: PKG,'
if (!raw.includes(ANCHOR)) {
  console.error('FAIL: could not find the epilogue anchor; is client.js current?')
  process.exit(1)
}
const src = raw.replace(
  ANCHOR,
  'globalThis.__APE__ = { composeAskAi, composeRequestText, composeLanguage, composeInsert, composeSplice, LstAskAi, LstAddPresetModal, LstMcpEditModal, LstSkillEditModal, renderPrompt };\n  ' + ANCHOR,
)

console.log('# 0. the bundle materializes with only the platform table')
// eslint-disable-next-line no-new-func
new Function('window', 'document', src)(globalThis.window, globalThis.document)
check('factory captured', captured !== null)
check('factory id is the package name', captured && captured.id === 'dsh-agent-preset-editor', captured && captured.id)

const requested = []
const mockRequire = (name) => {
  requested.push(name)
  if (name === 'react') return mockReact
  throw new Error(`client bundle requested a module outside the platform table: ${name}`)
}
let mod
try {
  mod = captured.factory(mockRequire)
} catch (error) {
  console.error('  FAIL materializing factory:', error.stack || error.message)
  process.exit(1)
}
const APE = globalThis.__APE__
check('exports an inject list', Array.isArray(mod.inject), JSON.stringify(mod.inject))
check('exports apply()', typeof mod.apply === 'function')
check('only requires platform modules', requested.every((n) => n === 'react'), requested.join(', '))
check('sessions is a declared dependency', mod.inject.includes('sessions'), JSON.stringify(mod.inject))
check('conversation is NOT declared (it is a ctx.get probe)', !mod.inject.includes('conversation'))
check('internal functions exposed for the second half', APE !== undefined && typeof APE.composeAskAi === 'function')

/* ------------------------- apply() against a host --------------------- */

console.log('\n# 1. apply() registers against a mock host')
const tabs = []
const slotNames = []
const registrations = []
const effectLabels = []
const mockTabs = { register(definition) { tabs.push(definition); return () => {} } }
const slotsService = {
  inject(key, callback) { slotNames.push(key); const d = callback(); return typeof d === 'function' ? d : () => {} },
  register(options, component) { registrations.push({ options, component }); return () => {} },
}

const INJECTED = new Set(['slots', 'sessions', 'remote', 'remote.agentPresets', 'remote.settings'])
function makeCtx(services) {
  const target = {
    effect(fn, label) { effectLabels.push(label); const d = fn(); return typeof d === 'function' ? d : () => {} },
    inject(deps, callback) {
      const injected = { get: (name) => (name === 'sidebarRightTabs' ? mockTabs : undefined) }
      const d = callback(injected)
      return { dispose: typeof d === 'function' ? d : () => {} }
    },
    get(name) { serviceCalls.push(name); return services[name] },
    // `sessions` is declared → a plain property, exactly as Cordis exposes it.
    sessions: services.sessions,
    slots: slotsService,
    remote: {},
    logger: { error() {}, warn() {}, info() {} },
  }
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p]
      if (typeof p === 'symbol') return undefined
      if (INJECTED.has(p)) return undefined
      if (['then', 'toJSON', 'constructor', 'inspect', 'toString'].includes(p)) return undefined
      throw new Error(`cannot get property "${String(p)}" without inject`)
    },
    has(t, p) { return p in t || INJECTED.has(p) },
  })
}
const serviceCalls = []

const defaultSessions = {
  list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} },
  scope: () => undefined,
}
const ctx = makeCtx({ sessions: defaultSessions })
try {
  mod.apply(ctx)
} catch (error) {
  console.error('  FAIL apply() threw:', error.stack || error.message)
  process.exit(1)
}

check('installs its stylesheet via ctx.effect', effectLabels.length >= 1, effectLabels.join(' | '))
const tab = tabs[0] || {}
check('tab id is the implementation id', tab.id === 'dsh-agent-preset-editor:presets', tab.id)
check('tab kind is the contract kind', tab.kind === 'agent-preset-editor', tab.kind)
check('tab is multiple (one window per preset)', tab.multiple === true)
check('tab declares exactly one guide entry', Array.isArray(tab.guide) && tab.guide.length === 1)
const guide = (tab.guide || [])[0] || {}
check('guide entry id is present', typeof guide.id === 'string' && guide.id.length > 0, guide.id)
check('guide title renders', (() => { try { return typeof guide.title === 'function' && guide.title().length > 0 } catch { return false } })())
check('guide icon is renderable', typeof guide.icon === 'function')
check('registers the tab body slot', slotNames.includes('sidebar.right.pane.tab'), slotNames.join(', '))
check('registers the tab title slot', slotNames.includes('sidebar.right.pane.tab.title'), slotNames.join(', '))
check('registers the sidebar footer button', slotNames.includes('sidebar.footer.action'), slotNames.join(', '))

const body = registrations.find((r) => r.options.name === 'sidebar.right.pane.tab')
check('body keyed by the tab type id', body && body.options.key === 'dsh-agent-preset-editor:presets', body && body.options.key)
check('body inject hands over ctx + sessionId', (() => {
  if (!body || typeof body.options.inject !== 'function') return false
  const injected = body.options.inject('session-1')
  return injected && injected.sessionId === 'session-1' && injected.ctx === ctx
})())
check('body component is a function', body && typeof body.component === 'function')

/* ------------------- tab body renders without crashing ---------------- */

console.log('\n# 2. tab body renders without tripping the injection guard')
globalThis.fetch = async (url, init) => {
  fetchCalls.push({ url: String(url), method: (init && init.method) || 'GET' })
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        data: {
          presets: [{ id: 'demo', name: '演示预设', description: 'x', order: 1, prompt: 'hi {{ $a }}', params: [{ name: 'a', label: 'A', type: 'text', default: 'v' }], form: { rule: [] }, mcp: [], skills: [] }],
          mcp: [], skills: [], values: {}, warnings: [],
          dsh: { roster: [], defaultId: null, sessionPreset: null, sessionPresetLocked: false },
          paths: { root: 'x', declarations: 'y' },
        },
      }
    },
  }
}
const fetchCalls = []
const info = {
  tab: {
    id: 't1', kind: 'agent-preset-editor', title: 'Agent预设', contentId: 'c1', visible: true,
    navigation: { address: 'a', params: {}, revision: 0 },
    signal: new AbortController().signal,
  },
}
try {
  const element = body.component({ ctx, sessionId: 'session-1', useTabInfo: () => info })
  check('component returned an element', element !== null && typeof element === 'object')
  for (const effect of pendingEffects.splice(0)) {
    try { effect() } catch (error) { failures.push('effect threw'); console.error('  FAIL effect threw:', error.message) }
  }
  await new Promise((resolve) => setTimeout(resolve, 80))
} catch (error) {
  console.error('  FAIL rendering tab body:', error.stack || error.message)
  failures.push('tab body render')
}
const errorSet = setCalls.find((v) => v instanceof Error || (typeof v === 'string' && /without inject/.test(v)))
check('loader did not report an injection error', errorSet === undefined, errorSet && String(errorSet))
check('loader reached the host API', fetchCalls.some((c) => c.url.includes('/agent-preset-editor/api/state')), JSON.stringify(fetchCalls))

/* ---------------------- prompt rendering (contract) ------------------- */

console.log('\n# 3. prompt placeholder rendering')
check('values win over defaults', APE.renderPrompt('你是 {{ $r }}。', { r: '分析师' }, [{ name: 'r', default: '架构师' }]) === '你是 分析师。')
check('missing value falls back to the default', APE.renderPrompt('你是 {{ $r }}。', {}, [{ name: 'r', default: '架构师' }]) === '你是 架构师。')
check('empty string falls back to the default', APE.renderPrompt('你是 {{ $r }}。', { r: '' }, [{ name: 'r', default: '架构师' }]) === '你是 架构师。')
check('an undefined placeholder becomes empty', APE.renderPrompt('x{{ $nope }}y', {}, []) === 'xy')
check('whitespace inside the braces is tolerated', APE.renderPrompt('{{$a}}|{{  $a  }}', { a: 'v' }, []) === 'v|v')
check('arrays join with 、', APE.renderPrompt('{{ $a }}', { a: ['x', 'y'] }, []) === 'x、y')
check('booleans read as 是/否', APE.renderPrompt('{{ $a }}', { a: false }, []) === '否')

/* ---------------------- language and request wording ------------------ */

console.log('\n# 4. language follows the interface')
document.documentElement.lang = 'zh-CN'
check('zh-CN -> zh', APE.composeLanguage() === 'zh', APE.composeLanguage())
document.documentElement.lang = 'en-US'
check('en-US -> en', APE.composeLanguage() === 'en', APE.composeLanguage())
document.documentElement.lang = 'ja'
check('a non-Chinese tag -> en', APE.composeLanguage() === 'en', APE.composeLanguage())
document.documentElement.lang = ''
check('no tag at all -> zh', APE.composeLanguage() === 'zh', APE.composeLanguage())

console.log('\n# 5. request wording')
document.documentElement.lang = 'zh-CN'
const zhMcp = APE.composeRequestText('mcp')
const zhSkill = APE.composeRequestText('skill')
const zhPreset = APE.composeRequestText('preset')
check('zh MCP request names the plugin and the catalogue', zhMcp.includes('Agent 预设插件') && zhMcp.includes('MCP'), zhMcp.slice(0, 40))
check('zh MCP request tells the user what to fill in', /项目位置/.test(zhMcp) && /命令/.test(zhMcp))
check('zh Skill request tells the user what to fill in', /SKILL\.md/.test(zhSkill))
check('zh preset request asks for a new Agent preset', /新增一个 Agent 预设/.test(zhPreset), zhPreset.slice(0, 40))
check('zh preset request names the plugin so the two "预设" cannot blur', /「Agent 预设编辑器」/.test(zhPreset), zhPreset.slice(0, 40))
check('zh preset request tells the user what to describe', /用途/.test(zhPreset) && /角色/.test(zhPreset))
document.documentElement.lang = 'en-US'
const enMcp = APE.composeRequestText('mcp')
const enSkill = APE.composeRequestText('skill')
const enPreset = APE.composeRequestText('preset')
check('en MCP request is English', /Add the following MCP to the Agent preset plugin/.test(enMcp), enMcp.slice(0, 60))
check('en MCP request lists the same fields', /start command/.test(enMcp) && /transport/.test(enMcp))
check('en Skill request is English', /Add the following Skill to the Agent preset plugin/.test(enSkill), enSkill.slice(0, 60))
check('en preset request is English', /Add a new Agent preset to the Agent Preset Editor/.test(enPreset), enPreset.slice(0, 60))
check('all three requests differ', new Set([zhMcp, zhSkill, zhPreset, enMcp, enSkill, enPreset]).size === 6)
check('unknown kind falls back to MCP', APE.composeRequestText('nope').includes('MCP'))

/* ------------------------------- splice ------------------------------- */

console.log('\n# 6. splice behaviour (pure)')
const s1 = APE.composeSplice('', 'hello', null)
check('empty draft takes the text verbatim', s1.draft === 'hello' && s1.caretAfter === 5, JSON.stringify(s1))
check('append path separates with one space', APE.composeSplice('existing', 'hello', null).draft === 'existing hello')
check('caret insert joins with single spaces', APE.composeSplice('aB', 'X', { start: 1, end: 1 }).draft === 'a X B')
check('a live selection is replaced', APE.composeSplice('abcdef', 'X', { start: 2, end: 5 }).draft === 'ab X f')
check('whitespace-only draft is treated as empty', APE.composeSplice('  ', 'hi', null).draft === 'hi')

/* ------------------------ writing into the composer ------------------- */

console.log('\n# 7. writing into the current session composer')
const draftState = { draft: '' }
const input = {
  state: { getSnapshot: () => ({ draft: draftState.draft }) },
  setDraft(next) { draftState.draft = next },
}
let lastScope = null
const conversationService = { input: { for: (scope) => { lastScope = scope; return input } } }
const sessionsService = { scope: (id) => (id === 'session-1' ? { id } : undefined) }
const ctx2 = makeCtx({ conversation: conversationService, sessions: sessionsService })

document.documentElement.lang = 'zh-CN'
draftState.draft = ''
const result = APE.composeAskAi(ctx2, 'session-1', 'mcp')
check('reports success', result.ok === true, JSON.stringify(result).slice(0, 100))
check('the draft holds the request', draftState.draft.includes('给 Agent 预设插件添加以下 MCP'), draftState.draft.slice(0, 40))
check('it reached the right session scope', lastScope && lastScope.id === 'session-1', JSON.stringify(lastScope))
check('conversation was read through ctx.get', serviceCalls.includes('conversation'))

draftState.draft = '先前的草稿'
const second = APE.composeAskAi(ctx2, 'session-1', 'skill')
check('a second request appends instead of replacing', second.ok && draftState.draft.startsWith('先前的草稿 '), draftState.draft.slice(0, 40))
check('the appended text is the Skill wording', draftState.draft.includes('添加以下 Skill'))

/* --------------------------- degradation ------------------------------ */

console.log('\n# 8. degradation names its cause (never a bare failure)')
const noConv = makeCtx({ sessions: sessionsService })
check('missing conversation -> reason no-conversation', APE.composeAskAi(noConv, 'session-1', 'mcp').reason === 'no-conversation')
const noSessions = makeCtx({ conversation: conversationService })
check('missing sessions -> reason no-sessions-service', APE.composeAskAi(noSessions, 'session-1', 'mcp').reason === 'no-sessions-service')
check('no session id -> reason no-session', APE.composeAskAi(ctx2, '', 'mcp').reason === 'no-session')
check('unknown session -> reason no-scope', APE.composeAskAi(ctx2, 'gone', 'mcp').reason === 'no-scope')
check('no ctx -> reason no-ctx', APE.composeAskAi(null, 'session-1', 'mcp').reason === 'no-ctx')
const named = APE.composeAskAi(noConv, 'session-1', 'mcp')
check('the reason carries a human sentence', typeof named.message === 'string' && named.message.length > 0, named.message)
check('different causes give different sentences',
  APE.composeAskAi(noConv, 'session-1', 'mcp').message !== APE.composeAskAi(noSessions, 'session-1', 'mcp').message)

/* ------------------------------ buttons ------------------------------- */

console.log('\n# 9. the buttons exist and are wired')
const button = APE.LstAskAi({ ctx: ctx2, sessionId: 'session-1', kind: 'mcp', toast: { show() {} }, onClose() {} })
check('LstAskAi renders an element', button !== null && typeof button === 'object')
check('the label is 「让 AI 帮我写」', JSON.stringify(button.children).includes('让 AI 帮我写'), JSON.stringify(button.children))
check('it carries a click handler', typeof button.props.onClick === 'function')
const skillButton = APE.LstAskAi({ ctx: ctx2, sessionId: 'session-1', kind: 'skill', toast: { show() {} }, onClose() {} })
check('the skill button is a separate instance', skillButton !== button)
check('the skill button title mentions Skill', String(skillButton.props.title).includes('Skill'))

/* ------------------- dialog → button props plumbing ------------------- */

console.log('\n# 10. the「让 AI 帮我写」button reaches the dialogs')
// A props-plumbing bug shipped once: the list rendered its dialogs WITHOUT
// ctx/sessionId, so the button inside reported「页面上下文缺失」. The mock React
// does not re-render, so the branch that mounts a dialog while `editing` is set
// cannot be reached from McpListMode here. The two halves are therefore checked
// separately: this section drives each dialog directly and walks its element
// tree; section 11 reads the call sites as text.
function walk(node, visit) {
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return }
  if (node === null || typeof node !== 'object') return
  // Only element-shaped nodes are descended into. A Cordis context is a Proxy
  // that THROWS on an unknown property, so touching `.type` on one would abort
  // the whole traversal — and `ctx` sits in props on every level here.
  let isElement = false
  try { isElement = node.type !== undefined && node.props !== undefined } catch (error) { return }
  if (!isElement) return
  visit(node)
  try {
    for (const key of Object.keys(node.props)) walk(node.props[key], visit)
  } catch (error) { /* props 不可枚举：跳过 */ }
  if (Array.isArray(node.children)) for (const child of node.children) walk(child, visit)
}

function askAiButtonsIn(element) {
  const found = []
  walk(element, (node) => { if (node.type === APE.LstAskAi) found.push(node) })
  return found
}

const dialogProps = {
  state: { presets: [] },
  entry: null,
  isNew: true,
  existingIds: [],
  ctx: ctx2,
  sessionId: 'session-1',
  toast: { show() {} },
  reload: async () => {},
  onClose() {},
}

for (const [label, component, kind] of [
  ['预设', APE.LstAddPresetModal, 'preset'],
  ['MCP', APE.LstMcpEditModal, 'mcp'],
  ['Skill', APE.LstSkillEditModal, 'skill'],
]) {
  if (typeof component !== 'function') { check(`${label} dialog is exported`, false); continue }
  let element
  try {
    hookCursor = 0
    element = component(dialogProps)
  } catch (error) {
    failures.push(`${label} dialog render`)
    console.error(`  FAIL ${label} dialog threw:`, error.stack || error.message)
    continue
  }
  check(`${label} dialog renders`, element !== null && typeof element === 'object')
  const buttons = askAiButtonsIn(element)
  check(`${label} dialog carries exactly one「让 AI 帮我写」button`, buttons.length === 1, `found ${buttons.length}`)
  const buttonElement = buttons[0]
  if (buttonElement) {
    check(`${label} button received ctx`, buttonElement.props.ctx === ctx2, String(buttonElement.props.ctx))
    check(`${label} button received sessionId`, buttonElement.props.sessionId === 'session-1', String(buttonElement.props.sessionId))
    check(`${label} button is wired to the right catalogue`, buttonElement.props.kind === kind, String(buttonElement.props.kind))
  }
}

/* ------------------ list → dialog call sites (static) ----------------- */

console.log('\n# 11. every dialog call site forwards ctx + sessionId')
// See section 10 for why this one is textual: the mount branch needs a state
// change the mock cannot produce. This is the exact guard for the regression
// class — a missed prop on an `h(Dialog, {…})` literal.
{
  const list = readFileSync(join(root, 'src/client/parts/40-list.js'), 'utf8')
  for (const dialog of ['LstAddPresetModal', 'LstMcpEditModal', 'LstSkillEditModal']) {
    const calls = [...list.matchAll(new RegExp(`h\\(${dialog},\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\)`, 'g'))].map((m) => m[1])
    check(`${dialog} is rendered somewhere`, calls.length >= 1, `found ${calls.length}`)
    check(`every ${dialog} call site passes ctx`, calls.every((block) => /\bctx:/.test(block)))
    check(`every ${dialog} call site passes sessionId`, calls.every((block) => /\bsessionId:/.test(block)))
  }
}

/* ------------------ list row layout (overlap regression) -------------- */

console.log('\n# 12. list-row layout cannot overlap')
// The reported MCP-list bug: the switch beside a multi-line description was a
// flex-shrink candidate (flex:0 1 auto + min-width:0), so a long description
// squeezed its box to 0 width while the 36px control inside could not shrink —
// the control spilled out and painted over the text. Layout facts are asserted
// here because a mock renderer has no geometry to measure.
{
  const css = (selector) => {
    const found = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`).exec(raw)
    return found ? found[1] : undefined
  }

  const switchField = css('.ape-switch-field')
  check('.ape-switch-field exists in the stylesheet', typeof switchField === 'string')
  check('the switch field is not a flex-shrink candidate', /flex:0 0 auto/.test(switchField || ''), switchField)
  check('the switch control itself is fixed size', /flex:0 0 auto/.test(css('.ape-switch') || ''))

  const rowMain = css('.ape-listrow-main')
  check('.ape-listrow-main exists', typeof rowMain === 'string')
  check('the text column can shrink below its content', /min-width:0/.test(rowMain || ''), rowMain)
  check('the text column wraps long words', /word-break:break-word/.test(rowMain || '') && /overflow-wrap:anywhere/.test(rowMain || ''), rowMain)

  const rowRight = css('.ape-listrow-right')
  check('the control column never shrinks', /flex:0 0 auto/.test(rowRight || ''), rowRight)
  check('the control column does not wrap', /flex-wrap:nowrap/.test(rowRight || ''), rowRight)

  const row = css('.ape-listrow')
  check('the row has breathing room', /padding:10px 12px/.test(row || ''), row)
  check('the row has no fixed height', !/(^|;)height:/.test(row || ''), row)

  // The switch wrapper in McpListMode / SkillListMode must be pinned too: it is
  // a flex item inside `actions` and would otherwise be the next shrink target.
  const list = readFileSync(join(root, 'src/client/parts/40-list.js'), 'utf8')
  const pinned = [...list.matchAll(/h\('div', \{ style: \{ flex: 'none'[^}]*\}, onClick: LstStop\(\) \}, h\(UiSwitch/g)]
  check('both list modes pin the switch wrapper', pinned.length === 2, `found ${pinned.length}`)

  // And the edit-mode picker: prose wraps, identifiers break mid-token.
  const edit = readFileSync(join(root, 'src/client/parts/60-edit.js'), 'utf8')
  check('edit-mode rows wrap prose', /wordBreak: 'break-word'[\s\S]{0,40}overflowWrap: 'anywhere'/.test(edit))
  check('edit-mode code identifiers break mid-token', /wordBreak: 'break-all'/.test(edit))
  check('edit-mode rows carry padding', /padding: '10px 8px'/.test(edit))
  check('edit-mode rows shrink-safe', /padding: '10px 8px',\n\s*minWidth: 0,/.test(edit))
  check('edit-mode rows have no fixed height', !/ED_ROW_STYLE[\s\S]{0,200}?height:/.test(edit))
}

console.log('')
if (failures.length === 0) console.log('ALL CHECKS PASSED')
else { console.log(`${failures.length} CHECK(S) FAILED: ${failures.join(', ')}`); process.exit(1) }
