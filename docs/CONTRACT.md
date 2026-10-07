# dsh-agent-preset-editor —— 内部契约（单一事实来源）

> 本文件是并行开发的**冻结接口**。任何人要改这里的内容，先告知 Lead。
> 版本：v1（2026-10-03）

---

## 0. 项目目标（一句话）

给 DSH Web GUI 加一个「Agent预设」入口：在右侧栏以一个 tab 类型承载**三种模式**（预设列表 / 参数配置 / 编辑），
让用户可视化地创建、配置、查看 Agent 预设，为预设定义**带默认值的参数**（低代码表单），
并为每个预设单独挂载 **MCP** 与 **Skills**。

---

## 1. 技术底座（已实测确认，勿再猜测）

### 1.1 插件包格式
```
dsh-agent-preset-editor/
  package.json          # dsh.bundle.patch + dsh.client(...) + exports
  cordis.patch.yml      # bundle patch：插入 host 行
  index.js              # host 半入口（ESM，可 import 同目录其它 .js）
  client.js             # client 半入口（构建产物，Lazy-CJS，勿手改）
  icon.svg
  locale/en.json locale/zh.json
  src/host/*.js         # host 源码（ESM 多文件）
  src/client/parts/*.js # client 源码片段（被脚本按序拼接成 client.js）
  scripts/build-client.mjs
```

`package.json` 关键字段（Lead 维护）：
```json
{
  "name": "dsh-agent-preset-editor",
  "type": "module",
  "exports": { ".": "./index.js", "./client": "./client.js", "./package.json": "./package.json" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true, "inject": ["@deepseek-ai/dsh-client-ui-sidebar-right"] }
  }
}
```

### 1.2 client 半 = Lazy-CJS，单文件
浏览器侧加载器是 `@deepseek-ai/dsh-client-modules`。它执行 `client.js` 后只登记一个 factory：

```js
window.__ModuleLoader__.load({
  id: 'dsh-agent-preset-editor',
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    const React = require('react');            // 基线模块表提供 React / react/jsx-runtime / cordis
    /* ... 全部代码 ... */
    return { inject: [...], apply(ctx) { ... } };
  },
});
```

**硬约束**
- 入口与 chunk 之间**不能同步 `require('./client.x.js')`**；分块只能 `require.async`。本项目**不使用分块**。
- 因此 client 半写成**单文件**：由 `src/client/parts/*.js` 按文件名升序拼接而成。
- `require()` 只能取基线模块：`react`、`react/jsx-runtime`（若有）。**不得** `require('@deepseek-ai/dsh-client-ui-primitives')` 或任何其它 DSH Client 包。
- 样式只能用主题 token（`--dsw-alias-*`、`--dsl-*`），字面颜色仅用于图标。样式用 `React.createElement('style', ...)` 注入或用内联 style。
- 不得替换 app root、不得 `document.body.appendChild`。

### 1.3 client part 拼接协议（重要）
`src/client/parts/` 下的文件**不是 ESM 模块**，是**裸语句片段**，按文件名升序拼接进 factory 函数体。
- 每个文件内**不要**写 `import` / `export`；直接写 `function foo(){}` / `const X = ...`。
- 后写的文件可以使用前面文件声明的绑定（同一函数作用域，`const`/`function` 提升按顺序）。
- 前导文件 `00-prelude.js` 已提供：`React`、`h`（`React.createElement` 别名）、`useState`/`useEffect`/`useMemo`/`useRef`/`useCallback`/`useSyncExternalStore`、`Fragment`。
- 结尾文件 `99-epilogue.js` 负责 `return { inject, apply }`。
- 拼接产物 `client.js` 由 `node scripts/build-client.mjs` 生成，**不要手改 client.js**。

### 1.4 右侧栏（"侧边栏"）扩展点
宿主服务 `ctx.sidebarRightTabs` 存在于 **client 半**。

```js
// 1) 等注册表就绪（服务可能晚于 declaration 出现）
const seat = ctx.inject(['sidebarRightTabs'], (injected) => {
  const tabs = injected.get('sidebarRightTabs')
  if (!tabs) return
  // 2) 注册 tab 类型
  const disposeType = tabs.register({
    id: 'dsh-agent-preset-editor:presets',   // 实现 id，全局唯一
    kind: 'agent-preset-editor',             // tab kind
    multiple: true,                          // 每次打开独立实例（多预设并存必需）
    title: (address) => 'Agent预设',          // 打开时捕获为 chip 文字
    guide: [{                                // 右侧栏「新建」指南页入口 = 「侧边栏的新按钮」
      id: 'agent-preset-editor',
      order: 40,
      title: () => 'Agent预设',
      description: () => '配置与查看 Agent 预设、参数、MCP 与 Skills',
      icon: (props) => h(Icon, { size: props?.size ?? 16 }),
    }],
  })
  // 3) 注册 tab 正文
  const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: 'dsh-agent-preset-editor:presets',
    inject: (sessionId) => ({ ctx, sessionId }),
  }, EditorTabBody))
  return () => { disposeBody(); disposeType() }
})
```

**正文组件契约**（框架注入 props，见 `dsh-better-sidebar/src/client/native/tab-adapter.tsx`）：
```js
function EditorTabBody(props) {
  // props.sessionId  当前会话 id（来自 inject 工厂）
  // props.ctx        浏览器侧 cordis Context
  // props.useTabInfo 框架 hook → { tab: { id, kind, title, contentId, visible, navigation: { address, params, revision }, signal } }
  const info = props.useTabInfo()
  const params = info.tab.navigation.params || {}   // { presetId?, mode? }
}
```
- 打开一个新 tab：`ctx.sidebarRight.openTab('agent-preset-editor', { params: { presetId, mode } })`
- `navigation.params` 是 JSON 形状，运行时不校验；**我们的约定**见 §3.3。

**左侧栏按钮**（额外落点，字面满足"给侧边栏添加一个新的按钮"）：
```js
ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
  name: 'sidebar.footer.action', id: 'agent-preset-editor',
}, SidebarFooterButton))
// props: { wide: boolean }；点击 → ctx.sidebarRight.openTab('agent-preset-editor', {})
```

### 1.5 宿主 remote（无需自建 RPC 即可用的能力）
```
ctx.remote.agentPresets.list()               → { presets: [{ id, isDefault, name?, description?, broken? }] }
ctx.remote.agentPresets.read(id)             → { agentPreset, content, name?, description? }
ctx.remote.agentPresets.select(sessionId, id) → 提交会话预设；会话已开始则抛 code 'agent-preset/locked'
ctx.remote.settings.update(ns, { selectedDefault: id })
```
- 需要 `inject` 里带上 `'remote'`、`'remote.agentPresets'`、`'remote.settings'`。
- **"任务是否已开始"判定**：调用 `select` 若抛 `agent-preset/locked` 即为已锁定；UI 用 `dsh.sessionPresetLocked`（见 §3.2）做前置提示，`select` 的错误作最终裁决。
- 设置命名空间常量：`AGENT_PRESET_SETTINGS_NS = 'agent-preset-registry'`（Lead 在 shell 里导出，UI 直接用）。

### 1.6 host 半
`index.js` 是标准 ESM，`export const inject = ['webServer']`、`export function apply(ctx, config) {}`。
- 路由：`ctx.effect(() => ctx.webServer.register({ kind: 'exact'|'prefix', path, handler }), 'label')`；
  handler 签名 `async (req, res) => {}`，`req.url` 自带 query。
- 路由前缀统一：`/agent-preset-editor/api/…`
- 文件存储根：`path.join(process.env.DSH_HOME || <homedir>/.dsh, 'agent-preset-editor')`

---

## 2. 数据模型

所有 JSON 均 **UTF-8、2 空格缩进、末尾换行**。字段缺失即默认。

### 2.1 PresetDefinition（插件自有的预设定义）
```jsonc
{
  "id": "design-doc-writer",          // 必填；^[a-z0-9][a-z0-9-]*$；= DSH preset id
  "name": "设计文档 Agent",            // 展示名
  "description": "把需求转化为设计文档",  // 一句话
  "order": 10,                        // 列表排序
  "prompt": "你是 {{ $role }}。\n任务类型：{{ $taskType }}\n",  // 提示词模板，参数占位见 §2.5
  "params": [ /* ParamSpec[]，见 §2.4 */ ],
  "form": { "rule": [ /* 低代码 rule，见 §4 */ ] },  // 参数配置模式的 GUI
  "mcp": ["docx", "excel"],           // 引用 MCP 目录项 id（不影响其它预设）
  "skills": ["design-doc-authoring"], // 引用 Skill 目录项 id
  "dsh": {                            // 由 host 派生回填（可选，保存时可忽略）
    "declaredPlugins": [ /* 渲染出的 Cordis 子插件行 */ ]
  },
  "createdAt": "2026-10-03T00:00:00.000Z",
  "updatedAt": "2026-10-03T00:00:00.000Z"
}
```

### 2.2 McpEntry（MCP 目录项，全局共享、只被引用才影响预设）
```jsonc
{
  "id": "docx",
  "name": "Word 文档处理",
  "description": "42 个 Word 工具：创建、结构提取、表格填充",
  "enabled": true,
  "server": {                       // 直接映射到 @deepseek-ai/dsh-mcp-client 的 config
    "serverName": "docx",
    "transport": "stdio",           // 'stdio' | 'http' | 'sse'
    "command": "D:/python/envs/mcp/python.exe",
    "args": ["E:/AI_mcp_projects/Docx_MCP_cj/final_complete_server.py"],
    "cwd": "E:/AI_mcp_projects/Docx_MCP_cj",
    "env": {},
    "url": "",                      // transport != stdio 时用
    "toolCallTimeoutMs": 120000
  },
  "createdAt": "...", "updatedAt": "..."
}
```

### 2.3 SkillEntry（Skills 目录项）
```jsonc
{
  "id": "design-doc-authoring",
  "name": "设计文档写作",
  "description": "把模糊需求转成可执行的设计文档",
  "enabled": true,
  "source": "inline",        // 'inline'（正文内联）| 'path'（指向磁盘 SKILL.md 目录）
  "content": "# 设计文档写作\n…SKILL.md 全文…",   // source==='inline'
  "path": "",                                      // source==='path' 时的绝对目录
  "createdAt": "...", "updatedAt": "..."
}
```

**不变式（发布渲染，务必遵守）**：同一个预设引用 N 个 Skill 时，声明行里
`@deepseek-ai/dsh-skill-filesystem` **最多只出现一行**，`config.customSkillDirs`
按 `definition.skills[]` 的引用顺序装 N 个目录（去重 —— 比较前先做词法归一：统一分隔符方向、
去掉结尾分隔符，因为 inline 源走 `path.join` 得到反斜杠、path 源多为正斜杠，同一物理目录会有
两种写法；跳过空目录；一个有效目录都没有就不生成该行）。

原因是硬约束而非风格：该插件的 `providerName` 默认就是 `"filesystem"`，而
`@deepseek-ai/dsh-skill` 的 provider 表**按名唯一** —— 逐 Skill 一行会让第二个 provider
撞名并抛 `a skill provider named "filesystem" is already registered in this scope`，
且抛在**激活**阶段：整棵预设子树起不来、`preset-<id>` 变成坏行。一个 provider 能扫多个根，
合并成一行即可覆盖全部 Skill。该失败**不写 stderr**，只能从 roster 的 `broken` 字段读到。

### 2.4 ParamSpec（参数定义）
```jsonc
{
  "name": "taskType",     // 必填；^[A-Za-z_][A-Za-z0-9_]*$；提示词用 {{ $taskType }} 引用
  "label": "任务类型",     // 表单标签
  "type": "select",       // 'text'|'textarea'|'number'|'select'|'radio'|'checkbox'|'switch'|'slider'
  "default": "design-doc",// 必填（默认为插件内置的最优值）
  "options": [ { "label": "设计文档", "value": "design-doc" } ],  // select/radio/checkbox 用
  "min": 0, "max": 100, "step": 1,   // number/slider 用
  "description": "补充说明",
  "required": false
}
```

### 2.5 参数占位语法
- 占位：`{{ $name }}`，允许内部空格：`{{$name}}`、`{{  $name  }}`。
- 渲染：把值替换为字符串。数组（checkbox）用 `、` 连接；布尔→ `是`/`否`；缺失或空→ 用 `default`，再无则替换为空串。
- 渲染函数 `renderPrompt(prompt, values, params)` 由 **Lead 在 shell 中提供**（`src/client/parts/70-shell.js`），UI 直接调用，勿自行实现。

### 2.6 ParamValues（每个预设一份，可针对任务微调）
```jsonc
{ "presetId": "design-doc-writer", "values": { "taskType": "design-doc" }, "updatedAt": "..." }
```

---

## 3. HTTP API（host 半提供，client 半消费）

统一前缀 `/agent-preset-editor/api`。JSON 请求体，响应统一：
```jsonc
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "bad-request", "message": "…" } }
```
- `code` 取值：`bad-request` `not-found` `conflict` `io-error` `internal`。
- HTTP 状态码：200 / 400 / 404 / 409 / 500。

### 3.1 端点清单
| 方法 | 路径 | 请求体 | 响应 data |
|---|---|---|---|
| GET | `/state` | — | `EditorState`（§3.2） |
| POST | `/preset/save` | `PresetDefinition` | `{ "id": "…" }` |
| POST | `/preset/delete` | `{ "id": "…" }` | `{ "id": "…" }` |
| POST | `/preset/values` | `{ "id": "…", "values": {…} }` | `{ "id": "…" }` |
| POST | `/preset/apply` | `{ "id": "…" }` | `{ "id": "…", "applied": true, "mode": "loader"\|"patch", "restartRequired": bool, "note": "…" }` |
| POST | `/mcp/save` | `McpEntry` | `{ "id": "…" }` |
| POST | `/mcp/delete` | `{ "id": "…" }` | `{ "id": "…" }` |
| POST | `/skill/save` | `SkillEntry` | `{ "id": "…" }` |
| POST | `/skill/delete` | `{ "id": "…" }` | `{ "id": "…" }` |
| POST | `/prompt/preview` | `{ "id": "…", "values": {…} }` | `{ "prompt": "渲染后的提示词" }` |

### 3.2 EditorState
```jsonc
{
  "presets": [ PresetDefinition… ],
  "mcp": [ McpEntry… ],
  "skills": [ SkillEntry… ],
  "values": { "<presetId>": { …values… } },
  "dsh": {
    "roster":   [ { id, isDefault, name?, description?, broken? } ],  // agentPresets.list()
    "defaultId": "standard",
    "sessionPreset": "standard",   // 当前会话所用预设（可 null）
    "sessionPresetLocked": false   // true = 会话已开始，不能切换
  },
  "paths": { "root": "…", "declarations": "…" }
}
```
> `dsh` 段由 **client 半**在拿到 `/state` 后自行补全（client 才能调 `ctx.remote`）；
> host 返回的 `dsh` 为 `{ "roster": [], "defaultId": null, "sessionPreset": null, "sessionPresetLocked": false }` 占位。

### 3.3 tab navigation.params 约定
```ts
{ presetId?: string,   // 打开哪个预设
  mode?: 'list' | 'params' | 'edit',  // 初始模式；缺省 'list'
  tab?: 'presets' | 'mcp' | 'skills'  // list 模式的顶部切换；缺省 'presets'
}
```

---

## 4. 低代码表单（form-create 风格）

参考 `E:\AI_mcp_projects\form-create`，但我们做**最小可用子集**，纯 React 实现，不引入任何依赖。

### 4.1 rule（控件规则）
```jsonc
{
  "type": "input",            // 见 §4.2
  "field": "taskType",        // 绑定键
  "title": "任务类型",         // 标签
  "value": "design-doc",      // 默认值
  "info": "补充说明",          // 帮助文本
  "props": {                  // 透传给控件
    "placeholder": "请选择", "disabled": false, "rows": 3,
    "options": [ { "label": "…", "value": "…" } ],   // select/radio/checkbox
    "min": 0, "max": 100, "step": 1,
    "multiple": false
  },
  "validate": [ { "required": true, "message": "必填" } ],
  "col": { "span": 12 }       // 栅格宽度（24 栅格制）；缺省 24
}
```

### 4.2 控件类型（`type` → 渲染器）
| type | 控件 | 说明 |
|---|---|---|
| `input` | 单行文本 | |
| `textarea` | 多行文本 | `props.rows` |
| `number` | 数字输入 | `props.min/max/step` |
| `select` | 下拉选择 | `props.options`、`props.multiple` |
| `radio` | 单选组 | `props.options` |
| `checkbox` | 多选组 | `props.options`，值为数组 |
| `switch` | 开关 | 布尔 |
| `slider` | 滑块 | `props.min/max/step` |
| `divider` | 分隔线 | 无 field |
| `title` | 小标题 | 无 field，用 `title` 文本 |
| `prompt-preview` | **只读提示词预览**（本插件扩展） | `props.prompt` 或读当前预设 prompt；随值实时渲染 |

未知 type → 渲染为提示条（不崩）。

### 4.3 表单引擎 API（`src/client/parts/30-form.js` 必须导出这些函数）
```js
// 渲染一个表单
// props: { rule: Rule[], value: object, onChange(nextValue, field, val), ctx, mode: 'edit'|'fill' }
function LcForm(props) { … }

// 由 ParamSpec[] 生成默认 rule（编辑器与用户都用它兜底）
function ruleFromParams(params) { … }   // → Rule[]

// 由 rule 反推 ParamSpec[]（保存预设时同步 params 字段）
function paramsFromRule(rule) { … }     // → ParamSpec[]

// 取值/设值工具
function valuesFromRule(rule) { … }     // → { field: value }
function validateRule(rule, value) { … } // → { ok: boolean, errors: { field: msg } }
```

---

## 5. UI 原语（`src/client/parts/10-ui.js` 必须导出）

只允许主题 token 上色（`--dsw-alias-*`）。所有组件签名固定，其它 part 依赖它们。

```js
function Icon(props)          // { name: 'preset'|'mcp'|'skill'|'plus'|'search'|'play'|'edit'|'sliders'|'trash'|'save'|'back'|'refresh'|'check'|'close', size?: number }
function UiButton(props)      // { children, onClick, variant?: 'primary'|'ghost'|'danger', size?: 'sm'|'md', disabled?, title?, icon? }
function UiInput(props)       // { value, onChange(string), placeholder?, disabled?, type?, onKeyDown?, autoFocus? }
function UiTextarea(props)    // { value, onChange(string), rows?, placeholder?, disabled? }
function UiSelect(props)      // { value, onChange(string), options: {label,value}[], disabled?, multiple? }
function UiSwitch(props)      // { checked, onChange(bool), disabled?, label? }
function UiSlider(props)      // { value, onChange(number), min, max, step, disabled? }
function UiCheckGroup(props)  // { value: any[], onChange(arr), options }
function UiRadioGroup(props)  // { value, onChange, options }
function UiSearch(props)      // { value, onChange(string), placeholder? }
function UiBadge(props)       // { children, tone?: 'default'|'ok'|'warn'|'err' }
function UiEmpty(props)       // { title, hint? }
function UiSpinner(props)     // { }
function UiModal(props)       // { open, title, onClose, children, footer? }
function UiField(props)       // { label, info?, error?, children, required? }
function UiSection(props)     // { title, actions?, children }
function UiRow(props)         // { children, onClick?, active?, right? }  列表行
function useToast()           // → { show(msg, tone?: 'ok'|'err'|'info'), node }  node 需渲染到页面
function Toolbar(props)       // { children }  顶部工具条容器
function Segmented(props)     // { value, onChange, options: {label,value,icon?}[] }  顶部三选一切换
```

`useToast()` 返回的 `node` 必须由调用方渲染（通常是 shell）。

---

## 6. 各 part 文件职责与导出

| 文件 | 负责人 | 必须提供 |
|---|---|---|
| `00-prelude.js` | Lead | React 绑定、常量、`cx()` 等工具 |
| `10-ui.js` | ui-kit | §5 全部原语 |
| `20-api.js` | Lead | `Api` 对象（§6.1） |
| `30-form.js` | ui-kit | §4.3 全部函数 + `LcForm` |
| `40-list.js` | ui-list | `PresetListMode(props)`、`McpListMode(props)`、`SkillListMode(props)` |
| `50-params.js` | ui-list | `ParamsMode(props)` |
| `60-edit.js` | ui-edit | `EditMode(props)` |
| `70-shell.js` | Lead | `EditorTabBody`、`SidebarFooterButton`、`renderPrompt`、`useEditorState`、`openEditorTab` |
| `90-register.js` | Lead | tab 类型 / slot 注册 |
| `99-epilogue.js` | Lead | `return { inject, apply }` |

### 6.1 `Api`（20-api.js，Lead 提供）
```js
const Api = {
  base: '/agent-preset-editor/api',
  async state(),                       // → EditorState（已补全 dsh 段）
  async savePreset(def),               // → { id }
  async deletePreset(id),
  async saveValues(id, values),
  async applyPreset(id),               // → { applied, mode, restartRequired, note }
  async saveMcp(entry), async deleteMcp(id),
  async saveSkill(entry), async deleteSkill(id),
  async previewPrompt(id, values),     // → { prompt }
}
// 所有方法失败时 throw Error(message)，调用方用 toast 显示。
```

### 6.2 视图组件统一 props
```js
{
  ctx,            // 浏览器 cordis Context
  sessionId,      // 当前会话
  state,          // EditorState（含 dsh 段）
  reload,         // async () => void  重新拉取 /state 并触发重渲染
  setMode,        // (mode, params?) => void  切换模式 / 打开某个预设
  presetId,       // ParamsMode/EditMode 专用：当前预设 id
  tab,            // ListMode 专用：'presets'|'mcp'|'skills'
  setTab,         // (tab) => void
  toast,          // { show(msg, tone) }
}
```
> 视图组件**只读 props**，不得自行 fetch；需要写操作时调 `Api.*` 然后 `await reload()`。

---

## 7. 命名与风格
- 缩进 2 空格，**不使用 TypeScript**，`const`/`let`，箭头函数优先。
- 所有面向用户的文案用中文（`locale/zh.json` 与 `locale/en.json` 同步维护；本期先中文硬编码 + locale 文件占位）。
- React 用 `h(...)`（`React.createElement` 别名），**不用 JSX**（client.js 无编译步骤）。
- 组件名首字母大写；part 内部函数加前缀避免与其它 part 撞名：ui-kit 用 `ui`/`Lc`，list 用 `Lst`，params 用 `Par`，edit 用 `Ed`。
- 不写 `console.log` 噪音；错误用 `console.error('[agent-preset-editor] …', err)`。

---

## 8. 验证要求（每个负责人自查）
1. `node --check <文件>` 通过（对 part 片段用 Lead 的 `scripts/check-parts.mjs`）。
2. `node scripts/build-client.mjs` 成功，产物 `client.js` 能被 `node --check client.js` 解析。
3. 不出现 `require('@deepseek-ai/...')`（client 半）。
4. 不出现 JSX 语法。
5. 视图组件对 `state` 为 `null`/字段缺失时**不崩**（空态渲染 UiEmpty）。
