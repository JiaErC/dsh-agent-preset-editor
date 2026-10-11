# AI-USAGE.md —— 给 dsh agent 的使用说明书

> **读者**：另一个运行在 DSH 上的 agent。当用户要你「建一个 Agent 预设」「改预设的提示词/参数」
> 「给某个预设挂 MCP / Skill」时，照本文执行即可，不需要读源码。
> **事实来源**：本仓库 `docs/CONTRACT.md`（冻结契约）+ DSH 自带的官方技能文档
> `editing-cordis-compositions`、`cordis-plugin-development/references/host-plugin.md`。
> **约定**：第 10 节是**真机实测**出来的行为（在独立 profile 上跑过完整流程），可以直接依赖；
> 其余小节凡是与实现冲突的，以实现为准。

---

## 0. 30 秒版

1. 确认插件在跑：`Invoke-Ape -Path '/state'` 能拿到 `presets/mcp/skills/values/paths`。
2. **写定义**用 `POST /preset/save`（+ `/mcp/save`、`/skill/save`）；
   **发布到 DSH** 用 `POST /preset/apply` —— 它把定义渲染成 `@deepseek-ai/dsh-agent-preset` 声明行（Loader 行 id `preset-<id>`）写进 profile。
3. **验证挂载**用 `plugin_manager` 的 `list_plugins`（找 `preset-<id>` 行的激活状态），不要只看 `/state`。
4. **切换当前会话用的预设**只能由浏览器侧完成（GUI 里的「启用」按钮）。会话已开始就切不了
   （`agent-preset/locked`）——让用户新建会话。
5. 任何带 `{{ $param }}` 的提示词模板：先用 `POST /prompt/preview` 看渲染结果，再 apply。

---

## 1. 这个插件装了之后，GUI 里多出什么

| 落点 | 说明 |
|---|---|
| 右侧栏 guide 入口 | 右侧栏「新建/添加」指南页里的一个入口胶囊（`order` 40），title「Agent预设」 |
| 左侧栏底部按钮 | `sidebar.footer.action` 席位，点击打开同一个 tab |
| 右侧栏 tab | kind `agent-preset-editor`，`multiple: true`（每次打开是独立实例，可多预设并存） |

tab 的导航参数（`navigation.params`，JSON 形状，运行时不校验；**你通过 HTTP 看不到它**，只是给人类用的）：

| 字段 | 取值 | 含义 |
|---|---|---|
| `presetId` | 预设 id | 打开哪个预设 |
| `mode` | `'list' \| 'params' \| 'edit'` | 初始模式；缺省 `'list'` |
| `tab` | `'presets' \| 'mcp' \| 'skills'` | 列表模式顶部三选一；缺省 `'presets'` |

三种模式对人类的分工：

| 模式 | 人类在这里做什么 | 对应你的写入口 |
|---|---|---|
| 预设列表 | 看有哪些预设、搜索、新建、删除、**启用**到当前会话；切到 MCP / Skills 目录 | 删除 → `/preset/delete`；启用 → 只能人工点 |
| 参数配置 | 按参数定义填值、保存为我的默认值、看提示词预览 | `/preset/values`、`/prompt/preview` |
| 编辑 | 改提示词、参数定义、低代码界面、勾选 MCP/Skills；「保存并发布到 DSH」 | `/preset/save`、`/preset/apply` |

---

## 2. 两条创建预设的路径（以及它们怎么共存）

### 2.1 路径 A：走本插件（人类用 GUI，agent 用 HTTP API）

产物是**本插件自己的数据**：`PresetDefinition` + 目录项 + 参数值。它**不会自动挂载**；
只有 `POST /preset/apply` 才把它渲染成 DSH 声明行写进 profile。好处是有参数表单、有界面、可反复改。

### 2.2 路径 B：走官方 bundle（纯 AI 路径，不依赖本插件）

官方机制：**预设就是一条由 bundle patch 承载的 `@deepseek-ai/dsh-agent-preset` 声明行**，
没有任何东西会「就地编辑」一个声明 —— 创建或修改预设 = 安装一个声明/覆盖它的 bundle。
写一个只有两个文件的目录，然后用 `plugin_manager` / `action: install_bundle` / `target` = 该目录的绝对路径安装。

`my-preset/package.json`：

```json
{
  "name": "@local/dsh-my-preset",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`my-preset/cordis.patch.yml`：

```yaml
- insert:
    - id: preset-my-preset          # Loader 行 id，约定 = preset-<id>
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: my-preset               # 必填：小写字母、数字、连字符
        name: 我的预设               # 可选：roster 里的显示名
        description: 一句话说明       # 可选
        order: 10                   # 可选：roster 排序
        plugins:                    # 必填：Cordis 入口列表
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: 你是一个……      # 提示词就写在这里
          - id: tool-pwsh
            name: '@deepseek-ai/dsh-tool-pwsh'
```

声明行的 `config` 字段（官方权威）：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 小写字母、数字、连字符 |
| `plugins` | 是 | Cordis 入口列表（`id` / `name` / `config` / `disabled`；`!!js` 只允许出现在插件配置或 `disabled` 里） |
| `name` | 否 | roster 显示名 |
| `description` | 否 | 说明 |
| `order` | 否 | roster 位置 |

### 2.3 两条路径的交界：insert 还是 override

| 场景 | 做法 |
|---|---|
| 新建一个**新 id** 的预设 | `insert` 一行 `id: preset-<新id>`。本插件的 `/preset/apply` 走的是这条路 |
| 改一个**已存在**的预设（内置或别人装的） | **按 Loader 行 id 覆盖**：写 `- id: preset-<id>` + 完整 `config`。**override 会整体替换 `config`**，所以必须把 `id`、`plugins` 和其余字段**全部重写一遍**，不能只写改动的部分 |
| 想改内置预设（`standard` / `ptc` / `minimal` / `cordis`） | 同上，用 override；直接用同 id `insert` 会撞名、声明加载失败 |

共存关系：本插件只读写**自己的数据目录**与**自己的受管区块**（`# >>> dsh-agent-preset-editor BEGIN` …
`# <<< dsh-agent-preset-editor END`），不会碰别人的 bundle。
所以「路径 A 建的预设」和「路径 B 装的 bundle 预设」在 roster 里是并列的两行；
本插件的列表模式会把两者都列出来并标出来源（内置 / 用户 / 覆盖内置）。
唯一要避免的冲突：**同一个预设 id 不要既让本插件 apply、又用一个手工 bundle 去 insert** ——
两处都在抢 `preset-<id>` 这个行 id。

### 2.4 旧的目录式预设已经废弃

`$DSH_HOME/.agent-presets/<id>/`（`preset.yml` + `agent.cordis.yml`）**已经没有任何东西在读它**，
本插件也不读写。看到那里的残留，只能迁移：`id` 取目录名、`name`/`description`/`order` 取自 `preset.yml`、
`plugins` 逐字取自 `agent.cordis.yml`，做成 2.2 的 bundle 装进去，验证行存在后再删旧目录。
**迁移前逐条核对插件包名**：预设写完之后改过名的包会在激活时失败。

### 2.5 用户从 GUI 点「让 AI 帮我写」之后，你会收到什么

**三个**添加弹窗的顶部右侧各有一个「让 AI 帮我写」按钮：**Agent 预设列表**的「添加」、
**MCP** 的「添加」、**Skills** 的「添加」。点它会把下面这句话插入**当前会话的输入框**
（跟随界面语言：中文界面给中文，其余给英文），然后关掉弹窗、把焦点交给输入框。

预设列表的「添加」：

```
给「Agent 预设编辑器」新增一个 Agent 预设：
<说明它的用途：面向什么任务、AI 该扮演什么角色、需要哪些参数 / MCP / Skills>
```

MCP 的「添加」：

```
给 Agent 预设插件添加以下 MCP：
<在这里补充它的信息：项目位置 / 启动命令与参数 / 传输方式（stdio、http 或 sse）/ 用途>
```

Skills 的「添加」：

```
给 Agent 预设插件添加以下 Skill：
<在这里补充它的信息：名称 / 用途 / SKILL.md 正文或所在目录>
```

用户会先把尖括号里的内容补完再发送。**收到这类请求时你要做的**：

1. 从用户补充的文字里提取字段；**缺什么就问他，不要编造**路径、命令、`SKILL.md` 正文，
   也不要替他决定一个预设该做什么。
2. `GET /agent-preset-editor/api/state` 看这个 id 是否已存在（同 id 是**覆盖**，不是冲突）。
3. 按请求类型落库：
   - **新增预设** → `POST /preset/save`，请求体见 §3.2。参数一定要给**默认值**
     （§5.2 的语义：默认值 = 该预设的最优值），`form.rule` 可用 `ruleFromParams` 的等价结构。
     落库后告诉用户「已创建，可在参数配置模式里按任务微调」。
   - **MCP** → `POST /mcp/save`（§3.3）。
   - **Skill** → `POST /skill/save`（§3.4）。
4. 登记 MCP / Skill 时额外说明：「已加进目录；但要在某个预设里勾选它才会生效」——除非用户
   同时点名了预设，那就再 `POST /preset/save`，把那个 id 追加进该预设的 `mcp` / `skills` 数组。
5. 需要真正挂载时再 `POST /preset/apply`，并把返回的 `restartRequired` / `note` **原样**转告。

> 这些按钮**不预设任何字段**，它们只做一件事：把「谁来填表」交接给会话里的你。请求里没有
> 结构化数据，全部信息来自用户的补充。同一条请求里可能同时出现多个对象，逐个处理。
>
> 预设那条请求刻意把插件名叫全（`「Agent 预设编辑器」`）：句子里「Agent 预设插件」和
> 「Agent 预设」挨在一起，不点名就容易被读成同一件事。

---

## 3. 存储与数据模型

### 3.1 位置

存储根 = `path.join(process.env.DSH_HOME || <homedir>/.dsh, 'agent-preset-editor')`。
本机 `DSH_HOME=D:\.dsh`，即 `D:\.dsh\agent-preset-editor\`。
**不要手写这些文件**：那里是 host 半的内部布局（契约只固定了根目录），读写一律走 HTTP API。

### 3.2 PresetDefinition

所有 JSON 都是 UTF-8、2 空格缩进、末尾换行；**字段缺失即取默认**。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | `^[a-z0-9][a-z0-9-]*$`；同时就是 DSH preset id（`config.id`） |
| `name` | string | 否 | 展示名 |
| `description` | string | 否 | 一句话 |
| `order` | number | 否 | 列表 / roster 排序 |
| `prompt` | string | 否 | 提示词模板，占位语法见第 5 节 |
| `params` | ParamSpec[] | 否 | 参数定义，见 3.4 |
| `form` | `{ rule: Rule[] }` | 否 | 参数配置模式的低代码界面，见 3.6 |
| `mcp` | string[] | 否 | 引用 MCP 目录项 id；不影响其它预设 |
| `skills` | string[] | 否 | 引用 Skill 目录项 id |
| `dsh` | object | 否 | host 派生回填的渲染结果（保存时可忽略） |
| `createdAt` / `updatedAt` | ISO string | 否 | 时间戳 |

### 3.3 McpEntry（目录项，只被引用才影响预设）

| 字段 | 说明 |
|---|---|
| `id` | 目录项 id，被 `PresetDefinition.mcp[]` 引用 |
| `name` / `description` | 展示用 |
| `enabled` | 是否可选/启用 |
| `server` | **直接映射** `@deepseek-ai/dsh-mcp-client` 的 config：`serverName`、`transport`(`'stdio'\|'http'\|'sse'`)、`command`、`args[]`、`cwd`、`env{}`、`url`（非 stdio 用）、`toolCallTimeoutMs` |

### 3.4 SkillEntry（目录项）

| 字段 | 说明 |
|---|---|
| `id` / `name` / `description` / `enabled` | 同上 |
| `source` | `'inline'`（正文内联在 `content`）或 `'path'`（指向磁盘上的 SKILL.md 目录） |
| `content` | `source==='inline'` 时的 SKILL.md 全文 |
| `path` | `source==='path'` 时的**绝对目录** |

### 3.5 ParamSpec 与 ParamValues

| ParamSpec 字段 | 说明 |
|---|---|
| `name` | 必填，`^[A-Za-z_][A-Za-z0-9_]*$`；提示词里用 `{{ $name }}` 引用 |
| `label` | 表单标签 |
| `type` | `'text'\|'textarea'\|'number'\|'select'\|'radio'\|'checkbox'\|'switch'\|'slider'` |
| `default` | **必填**：该预设应设置的最优值（见第 5 节） |
| `options` | `[{ label, value }]`，`select`/`radio`/`checkbox` 用 |
| `min` / `max` / `step` | `number`/`slider` 用 |
| `description` | 补充说明 |
| `required` | 是否必填 |

ParamValues（每个预设一份，可针对任务微调）：

```json
{ "presetId": "spec-writer", "values": { "taskType": "design-doc" }, "updatedAt": "2026-10-03T00:00:00.000Z" }
```

### 3.6 低代码 rule（form-create 风格，最小子集）

```jsonc
{
  "type": "select",            // 见下表
  "field": "taskType",         // 绑定键；divider/title/prompt-preview 无 field
  "title": "任务类型",
  "value": "design-doc",       // 默认值
  "info": "补充说明",           // 帮助文本
  "props": { "placeholder": "请选择", "disabled": false, "rows": 3,
             "options": [{ "label": "…", "value": "…" }],
             "min": 0, "max": 100, "step": 1, "multiple": false },
  "validate": [ { "required": true, "message": "必填" } ],
  "col": { "span": 12 }        // 24 栅格；缺省 24
}
```

| `type` | 控件 | 备注 |
|---|---|---|
| `input` / `textarea` / `number` | 文本 / 多行 / 数字 | `props.rows`、`props.min/max/step` |
| `select` / `radio` / `checkbox` | 下拉 / 单选组 / 多选组 | `props.options`；`checkbox` 的值是数组 |
| `switch` / `slider` | 开关 / 滑块 | 布尔 / 数字 |
| `divider` / `title` | 分隔线 / 小标题 | 无 field |
| `prompt-preview` | **只读提示词预览**（本插件扩展） | `props.prompt` 或读当前预设 prompt，随值实时渲染 |

未知 `type` 会渲染成一条提示条（不崩）。
`form.rule` 为空时，界面会用 `ruleFromParams(params)` 由参数定义兜底 —— 所以**只写 `params` 是合法的**。

---

## 4. HTTP API 速查

统一前缀 **`/agent-preset-editor/api`**，与 GUI 同源（跑在同一个 dsh web 进程里）。
响应统一包裹：

```jsonc
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "bad-request", "message": "…" } }
```

`code` ∈ `bad-request` `not-found` `conflict` `io-error` `internal`；HTTP 状态码 200 / 400 / 404 / 409 / 500。

| 方法 | 路径 | 请求体 | 响应 `data` |
|---|---|---|---|
| GET | `/state` | — | `EditorState`（见下） |
| POST | `/preset/save` | `PresetDefinition` | `{ "id": "…" }` |
| POST | `/preset/delete` | `{ "id": "…" }` | `{ "id": "…" }` |
| POST | `/preset/values` | `{ "id": "…", "values": {…} }` | `{ "id": "…" }` |
| POST | `/preset/apply` | `{ "id": "…" }` | `{ "id": "…", "applied": true, "mode": "loader"\|"patch", "restartRequired": bool, "note": "…" }` |
| POST | `/mcp/save` | `McpEntry` | `{ "id": "…" }` |
| POST | `/mcp/delete` | `{ "id": "…" }` | `{ "id": "…" }` |
| POST | `/skill/save` | `SkillEntry` | `{ "id": "…" }` |
| POST | `/skill/delete` | `{ "id": "…" }` | `{ "id": "…" }` |
| POST | `/prompt/preview` | `{ "id": "…", "values": {…} }` | `{ "prompt": "渲染后的提示词" }` |

`EditorState`（GET `/state` 的 `data`）：

```jsonc
{
  "presets": [ /* PresetDefinition… */ ],
  "mcp":     [ /* McpEntry… */ ],
  "skills":  [ /* SkillEntry… */ ],
  "values":  { "<presetId>": { /* values */ } },
  "dsh": {
    "roster":   [ { "id": "…", "isDefault": true, "name": "…", "description": "…", "broken": null } ],
    "defaultId": "standard",
    "sessionPreset": "standard",
    "sessionPresetLocked": false
  },
  "paths": { "root": "…", "declarations": "…" }
}
```

> ⚠️ **`dsh` 段是浏览器侧补全的**。host 返回的是占位
> `{ "roster": [], "defaultId": null, "sessionPreset": null, "sessionPresetLocked": false }`。
> 你从 shell 调 `/state` 拿到的 `dsh` 段**永远是占位**，不要用它判断 roster / 会话状态。

### 4.1 PowerShell 调用器（贴一次，后续都用它）

```powershell
# 与 GUI 同源：端口 = 用户浏览器里 dsh web 的端口（本机实测 127.0.0.1:3080）
$Base = 'http://127.0.0.1:3080/agent-preset-editor/api'

function Invoke-Ape {
  param(
    [Parameter(Mandatory)][string]$Path,
    [ValidateSet('GET','POST')][string]$Method = 'GET',
    [string]$Json        # POST 的 JSON 文本；务必用单引号 here-string 传（见坑 #7）
  )
  $p = @{ Uri = "$Base$Path"; Method = $Method; ContentType = 'application/json; charset=utf-8' }
  if ($Json) { $p.Body = [System.Text.Encoding]::UTF8.GetBytes($Json) }
  try   { $r = Invoke-RestMethod @p }
  catch { throw "HTTP 失败：$($_.Exception.Message)`n$($_.ErrorDetails.Message)" }
  if (-not $r.ok) { throw "API 错误 $($r.error.code)：$($r.error.message)" }
  $r.data
}

# 探活（换端口时挨个试）
Invoke-Ape -Path '/state' | Select-Object -ExpandProperty paths
```

只读体检：

```powershell
$s = Invoke-Ape -Path '/state'
$s.presets | Select-Object id, name, order, @{n='mcp';e={$_.mcp -join ','}}, @{n='skills';e={$_.skills -join ','}}
$s.mcp.name; $s.skills.name; $s.values.Keys
```

---

## 5. 参数占位语法与默认值语义

### 5.1 语法

- 占位写作 `{{ $name }}`，允许内部空格：`{{$name}}`、`{{  $name  }}`。
- 渲染 = 把值替换成字符串：

| 值的情况 | 渲染结果 |
|---|---|
| 数组（`checkbox`） | 用 `、` 连接，例如 `正确性、安全` |
| 布尔 | `是` / `否` |
| 缺失或空 | 先用该参数的 `default`；连 `default` 也没有 → 替换为空串 |

- 渲染函数 `renderPrompt(prompt, values, params)` 由 client 半提供，host 半有一份**行为一致**的实现（`/prompt/preview`）。
- `{{ $name }}` 里的 `name` 必须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`，否则它不会被识别成占位。

### 5.2 默认值语义（写给生成预设的你）

`ParamSpec.default` 不是「占位符」，而是**这个预设代表的最优配置**：

- `default` = 你（AI）认为该预设在这个用途下最好的取值。用户不改任何东西直接用，就应该得到正确的行为。
- 参数**不是越多越好**。每个参数都要能回答：「换成别的值会实际改变 agent 的行为吗？」答不上就别建。
- 用户的典型用法是：选中预设 → 在参数配置模式里按本次任务微调 1~2 个值 → 开工。
  所以 `default` 要覆盖最常见的场景，`options` 要覆盖真实会用的分支。
- 提示词里每个 `{{ $x }}` 都要有对应 ParamSpec；每个 ParamSpec 也尽量在提示词里被用到。
- 写完先 `POST /prompt/preview` 看渲染结果，再 apply。

---

## 6. 完整工作流：改一个已有预设

```powershell
# 1) 读现状
$s = Invoke-Ape -Path '/state'
$p = $s.presets | Where-Object id -eq 'spec-writer'
if (-not $p) { throw '本插件里没有这个预设；它可能是内置/别人装的 bundle 预设（本插件不能就地改，见坑 #1）' }

# 2) 改（本地对象即可，字段缺失即默认）
$p.description = '把需求转成可评审的设计文档（v2）'
$p.params | Where-Object name -eq 'maxWords' | ForEach-Object { $_.default = 1500 }

# 3) 写回定义
Invoke-Ape -Path '/preset/save' -Method POST -Json ($p | ConvertTo-Json -Depth 12) | Out-Null

# 4) 想改「这次任务」的值，单独走 values
Invoke-Ape -Path '/preset/values' -Method POST `
  -Json '{"id":"spec-writer","values":{"maxWords":800}}' | Out-Null

# 5) 看渲染结果（提示词最终长什么样）
(Invoke-Ape -Path '/prompt/preview' -Method POST -Json '{"id":"spec-writer","values":{"maxWords":800}}').prompt

# 6) 发布到 DSH：渲染成 preset-spec-writer 声明行写进 profile
$a = Invoke-Ape -Path '/preset/apply' -Method POST -Json '{"id":"spec-writer"}'
$a   # 看 mode / restartRequired / note —— 原样转告用户，别自己下结论

# 7) 验证挂载（官方路径，不是看 /state）
#    用 plugin_manager：list_plugins 找 preset-spec-writer 行的激活状态；
#    list_bundles 看 bundle；failed / overridden / restart-required 要分别解释。
```

`/preset/apply` 的渲染约定（host 半实现规格，**具体产出以实际写入的 patch 为准**）：

| 定义里的东西 | 渲染成 |
|---|---|
| `prompt` + 当前 values | 一行 `@deepseek-ai/dsh-persona`，`config.prefix` = 渲染后的提示词 |
| `mcp[]` 里每个被引用且 `enabled` 的目录项 | 一行 `@deepseek-ai/dsh-mcp-client`，`config` 直接取该 `McpEntry.server` |
| `skills[]` 里 `source==='inline'` 的 | 正文写盘成 `<root>/skills/<id>/SKILL.md`，再声明一行指向它的 skill 目录 |
| `skills[]` 里 `source==='path'` 的 | 直接声明该 `path` |
| 整体 | 一个 `insert: [{ id: preset-<id>, name: '@deepseek-ai/dsh-agent-preset', config: { id, name, description, order, plugins } }]` |

**切换当前会话使用的预设不在 HTTP API 里**：那是浏览器侧的 remote 调用（`agentPresets.select`）。
所以「让这个会话现在就用新预设」这一步**只能请用户点 GUI 的「启用」**；
会话已开始就会被拒（`agent-preset/locked`）。

---

## 7. 默认值策略：常见预设类型的推荐起点

这些是**建议起点，不是契约要求**。照抄后按用户场景微调；参数名任意，但保持 `snake/camel` 与语义清晰。

| 预设类型 | 推荐参数（name: type / 默认值） | 为什么这么设 |
|---|---|---|
| **编码**（写功能、修 bug） | `language: select`（默认项目主语言）、`testPolicy: radio`（`test-first` 先写测试 / `after` 后补 / `none`）、`maxChangeLines: number`（默认 400）、`commitStyle: select`（`conventional` / `plain`） | 语言决定工具链与惯用法；先写测试是最安全默认；改动规模上限能防止一次性大改难评审；commit 风格影响交付物 |
| **代码评审** | `rigor: slider` 1–5（默认 4）、`focus: checkbox`（`correctness`,`security`,`performance`,`naming`,`tests`；默认前两个）、`commentLanguage: radio`（`中文` / `English`） | 评审的默认姿态应是「严格但聚焦正确性与安全」，而不是列一堆风格问题；focus 决定评审清单 |
| **文档写作** | `role: text`（默认「资深技术文档工程师」）、`taskType: select`（`design-doc`,`api-spec`,`readme`,`review-notes`）、`audience: select`（`developer`,`operator`,`end-user`）、`maxWords: number`（默认 1200）、`includeMermaid: switch`（默认 `true`） | 文档类预设最大的变量是读者与篇幅；默认给「开发者向 + 1200 字 + 带图」 |
| **出题 / 教学** | `subject: text`、`difficulty: radio`（`easy`,`medium`,`hard`；默认 `medium`）、`count: number`（默认 10）、`style: select`（`mcq`,`blank`,`short-answer`）、`withAnswers: switch`（默认 `true`） | 题型与难度是硬变量；默认带答案解析，便于自测 |
| **求职 / 简历** | `targetRole: text`、`seniority: select`（`intern`,`junior`,`mid`,`senior`；默认 `mid`）、`city: text`、`tone: radio`（`concise`,`warm`；默认 `concise`） | 岗位与资历决定用词与取舍；中文简历默认简洁直白 |

配套的 MCP / Skills 引用建议：

| 预设类型 | 值得引用的 MCP | 值得引用的 Skill |
|---|---|---|
| 文档写作 / 出题 | Word（`docx`）、Excel（`excel`）等文件类 MCP | 该团队自己的写作规范 SKILL.md |
| 编码 / 评审 | 通常不需要额外 MCP（用宿主自带的文件与 shell 工具） | 语言/框架的代码风格、评审清单 |
| 求职 | 若需产出 .docx 简历则引 Word MCP | 简历写作规范 |

**只引用真的会被用到的项** —— 每多挂一个 MCP，都会给该预设的每个会话增加工具与启动成本。

---

## 8. 常见坑（都是会真的踩到的）

| # | 症状 | 原因 | 怎么做 |
|---|---|---|---|
| 1 | 声明行加载失败 / 行标红 | 同一个 `preset-<id>` 被 `insert` 两次；或想改内置预设却用了 insert | 改已存在的预设一律**按 Loader 行 id override**，而且 override 会**整体替换** `config` —— 把 `id`、`plugins` 等所有字段完整重写 |
| 2 | 「启用」报错 / 按钮不可用 | 会话已开始，预设被锁定（`agent-preset/locked`） | 让用户**新建会话**再选；无窗口 ID 可用时不要重试 |
| 3 | 在 `$DSH_HOME/.agent-presets/<id>/` 里改了东西，毫无反应 | 旧目录式预设**已不再被任何代码读取** | 迁移成 2.2 的 bundle 声明；本插件不读写该目录 |
| 4 | 预设行留在 roster 上但激活失败、带着诊断 | 引用的插件包名写错 / 已改名 / 未安装 | 逐条核对包名（`plugins[].name`）是否已装；修好 bundle 后**重新安装** |
| 5 | 改了预设，当前会话行为没变 | 已存在的会话与它的子会话保持**启动时**的插件修订 | 在**新会话**里验证 |
| 6 | 从 shell 读 `/state`，`dsh.roster` 空、`defaultId` 为 null | `dsh` 段由**浏览器侧**补全，HTTP 拿到的是占位 | 验证挂载用 `plugin_manager` 的 `list_plugins`（`preset-<id>` 行）/ `cordis_inspect_query`，不要用 `/state` |
| 7 | 请求体里的 `{{ $role }}` 变成了空或报错 | PowerShell 双引号会展开 `$role` | JSON 一律用**单引号** here-string：`@' … '@` |
| 8 | 中文提示词存进去变成乱码 | 请求未按 UTF-8 编码 | `ContentType = 'application/json; charset=utf-8'` + `Body = [Text.Encoding]::UTF8.GetBytes($json)`（第 4.1 节的调用器已处理） |
| 9 | 直接改存储目录里的 JSON，GUI 看不到变化 | 那是 host 半内部布局，契约只固定了根目录 | 一律走 HTTP API |
| 10 | 往 MCP/Skills 目录加了项，但预设行为没变 | 目录项**只有被某个预设引用**才生效 | 把 id 加进该预设的 `mcp` / `skills` 数组，再 `/preset/apply` |
| 11 | 预览里某处是空的 | 占位名不在 `params` 里、或名字不合法、或值为空且无 `default` | 先 `/prompt/preview`，对着输出逐个核对占位 |
| 12 | `apply` 返回 `restartRequired: true`，但用户以为已经生效 | 声明的落点是 profile 的 patch 文件，`patch` 模式需要重启/HMR | 把返回的 `mode` / `restartRequired` / `note` **原样**转告用户；不要承诺「已经生效」 |
| 13 | 装了包但 GUI 里没有新落点 | 浏览器侧 `client.js` 未重新加载 | 刷新页面；换了包内容则重启 profile（替换已安装包的 JS 需要重启才能加载新模块） |
| 14 | 换了个 id 重新发布，旧的那行还在 | apply 只写自己那个 id 的声明行，**不会**清理别的 id | 要下线一个已发布预设，调 `POST /preset/delete`（它会摘掉 `applied.json` 里的记录并重写受管区块），再重启/HMR |

---

## 9. 完整可复制示例：3 个参数 + 1 个 MCP + 1 个 Skill

目标预设 `spec-writer`：角色/任务类型/篇幅上限三个参数，引用 `docx` 这个 MCP 与 `design-doc-authoring` 这个 Skill。

```powershell
$Base = 'http://127.0.0.1:3080/agent-preset-editor/api'

function Invoke-Ape {
  param(
    [Parameter(Mandatory)][string]$Path,
    [ValidateSet('GET','POST')][string]$Method = 'GET',
    [string]$Json
  )
  $p = @{ Uri = "$Base$Path"; Method = $Method; ContentType = 'application/json; charset=utf-8' }
  if ($Json) { $p.Body = [System.Text.Encoding]::UTF8.GetBytes($Json) }
  try   { $r = Invoke-RestMethod @p }
  catch { throw "HTTP 失败：$($_.Exception.Message)`n$($_.ErrorDetails.Message)" }
  if (-not $r.ok) { throw "API 错误 $($r.error.code)：$($r.error.message)" }
  $r.data
}

# ── ① MCP 目录项（已存在同 id 就跳过）──────────────────────────────────
$mcpJson = @'
{
  "id": "docx",
  "name": "Word 文档处理",
  "description": "42 个 Word 工具：创建、结构提取、表格填充",
  "enabled": true,
  "server": {
    "serverName": "docx",
    "transport": "stdio",
    "command": "D:/python/envs/mcp/python.exe",
    "args": ["E:/AI_mcp_projects/Docx_MCP_cj/final_complete_server.py"],
    "cwd": "E:/AI_mcp_projects/Docx_MCP_cj",
    "env": {},
    "url": "",
    "toolCallTimeoutMs": 120000
  }
}
'@
Invoke-Ape -Path '/mcp/save' -Method POST -Json $mcpJson | Out-Null

# ── ② Skill 目录项（inline：正文直接内联 SKILL.md）────────────────────
$skillJson = @'
{
  "id": "design-doc-authoring",
  "name": "设计文档写作",
  "description": "把模糊需求转成可执行的设计文档",
  "enabled": true,
  "source": "inline",
  "content": "# 设计文档写作\n\n1. 先写一句话目标与不做的事。\n2. 再写接口/数据/失败路径。\n3. 最后写验收标准与未决问题。\n",
  "path": ""
}
'@
Invoke-Ape -Path '/skill/save' -Method POST -Json $skillJson | Out-Null

# ── ③ 预设定义（参数 + 低代码界面 + 引用）────────────────────────────
$presetJson = @'
{
  "id": "spec-writer",
  "name": "设计文档 Agent",
  "description": "把需求转成可评审的设计文档",
  "order": 20,
  "prompt": "你是 {{ $role }}。\n本次任务类型：{{ $taskType }}\n篇幅上限：{{ $maxWords }} 字。\n输出前先自检：目标、接口、失败路径、验收标准是否齐全。\n",
  "params": [
    { "name": "role", "label": "角色", "type": "text",
      "default": "资深系统设计工程师", "description": "决定提示词的语气与深度", "required": true },
    { "name": "taskType", "label": "任务类型", "type": "select", "default": "design-doc",
      "options": [
        { "label": "设计文档", "value": "design-doc" },
        { "label": "接口草案", "value": "api-spec" },
        { "label": "评审意见", "value": "review-notes" }
      ], "required": true },
    { "name": "maxWords", "label": "篇幅上限（字）", "type": "number",
      "default": 1200, "min": 200, "max": 8000, "step": 100 }
  ],
  "form": { "rule": [
    { "type": "input", "field": "role", "title": "角色", "value": "资深系统设计工程师",
      "info": "决定提示词的语气与深度", "col": { "span": 12 },
      "validate": [ { "required": true, "message": "必填" } ] },
    { "type": "select", "field": "taskType", "title": "任务类型", "value": "design-doc",
      "col": { "span": 12 },
      "props": { "options": [
        { "label": "设计文档", "value": "design-doc" },
        { "label": "接口草案", "value": "api-spec" },
        { "label": "评审意见", "value": "review-notes" } ] } },
    { "type": "number", "field": "maxWords", "title": "篇幅上限（字）", "value": 1200,
      "props": { "min": 200, "max": 8000, "step": 100 } },
    { "type": "divider" },
    { "type": "prompt-preview", "title": "渲染预览" }
  ] },
  "mcp": ["docx"],
  "skills": ["design-doc-authoring"]
}
'@
Invoke-Ape -Path '/preset/save' -Method POST -Json $presetJson | Out-Null

# ── ④ 验证渲染 ────────────────────────────────────────────────────────
(Invoke-Ape -Path '/prompt/preview' -Method POST `
  -Json '{"id":"spec-writer","values":{"taskType":"api-spec","maxWords":600}}').prompt

# ── ⑤ 发布到 DSH（渲染成 preset-spec-writer 声明行）──────────────────
Invoke-Ape -Path '/preset/apply' -Method POST -Json '{"id":"spec-writer"}'

# ── ⑥ 验证挂载 ────────────────────────────────────────────────────────
# 用 plugin_manager：list_plugins → 找预设行 preset-spec-writer 的激活状态；
# list_bundles → 确认 bundle。failed / overridden / restart-required 分别转告用户。

# ── ⑦ 让用户用上它 ────────────────────────────────────────────────────
# HTTP API 不能切换当前会话的预设：请用户在 GUI 的「Agent预设」列表里点「启用」，
# 或新建会话时选择 spec-writer（会话已开始则必须先新建会话）。
```

回滚这个示例：

```powershell
Invoke-Ape -Path '/preset/delete' -Method POST -Json '{"id":"spec-writer"}' | Out-Null
# 若要连声明一起撤：让用户在 Plugin Manager 里处理 preset-spec-writer 行，
# 或按 README「卸载与回滚」删掉 profile 的受管区块。
```

---

## 10. 已实测确认（真机跑过，不是推断）

下表原是一份「待验证清单」，现已在**与用户会话隔离的独立 profile** 上实测出答案。
测法：`dsh ape-verify --port 3099 --no-open` 起一个独立 profile，再用 HTTP API 走完
「建 MCP 目录项 → 建 Skill 目录项 → 建预设 → 存参数值 → 预览提示词 → 发布」全流程。

| # | 项目 | 实测结果 |
|---|---|---|
| 1 | dsh web 的监听端口 | 本机 web profile 是 `127.0.0.1:3080`；首页 URL 带 `?token=<43 字符>`，**不带 token 拿不到 200**。换机器请以用户浏览器地址为准 |
| 2 | `/preset/apply` 的 `mode` | 固定 `"patch"`、`restartRequired: true`。响应另有 `rowIds` / `declarations` / `profilePatch` / `profileBackup` / `profileChanged` 五个字段 |
| 3 | 发布渲染出的 `plugins[]` | 见下方实测样例：persona 行 `id: persona`、`config.prefix` 是块标量 `\|-`；MCP 行 `id: mcp-<目录项 id>`、一个 MCP 一行；**Skill 行一个预设最多一条**、`id` 固定为 `skill-filesystem`，被引用到的目录全部合并进 `config.customSkillDirs` 数组（原因见下方「Skill 行为什么只能有一行」） |
| 4 | 存储根布局 | `applied.json`、`mcp.json`、`skills.json`、`presets.patch.yml`、`presets/<id>.json`、`values/<id>.json`、`skills/<id>/SKILL.md`（inline 来源的 Skill 会落盘到这里）。**写代码请走 HTTP API，别依赖这个布局** |
| 5 | 同 id 二次 `/preset/save` | **覆盖，不报 conflict**（返回 `{"ok":true,"data":{"id":"…"}}`）。id 是主键，改名 = 新建新 id + 删除旧 id |
| 6 | 发布备份文件名 | `cordis.patch.yml.bak-agent-preset-editor`（与 profile patch 同目录） |
| 7 | inline Skill 落盘 | `<root>/skills/<id>/SKILL.md`；声明行用 `@deepseek-ai/dsh-skill-filesystem` 的 `customSkillDirs: [ '<root>/skills/<id>' ]` 指过去。引用多个 Skill 时是这个数组的**多个元素**，不是多行 —— 见下方「Skill 行为什么只能有一行」 |
| 8 | `sessionPresetLocked=true` 时 GUI「启用」按钮 | **不禁用**。该字段只是 `turnCount > 0` 的启发式提示；权威裁决是 `select` 抛的 `agent-preset/locked`。按钮始终可点，失败时提示「任务已开始，无法切换预设；请新建会话后再选「X」」 |
| 9 | 换 id 后旧 `preset-<旧id>` 行 | **不会自动清理**。受管区块只渲染 `applied.json` 里记录的 id；要下线一个已发布预设，调 `/preset/delete` |

### 实测出的 `plugins[]` 样例（可直接对照）

```yaml
- insert:
    - id: preset-ape-smoke
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: ape-smoke
        name: 冒烟测试预设
        description: 验证用预设
        order: 99
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: |-
                你是 数据分析师。
                任务类型：impl
                严谨：否
          - id: mcp-docx
            name: '@deepseek-ai/dsh-mcp-client'
            config:
              serverName: docx
              transport: stdio
              command: 'D:/python/envs/mcp/python.exe'
              args:
                - srv.py
              cwd: 'E:/x'
              env: {}
              url: ''
              toolCallTimeoutMs: 120000
          - id: skill-filesystem
            name: '@deepseek-ai/dsh-skill-filesystem'
            config:
              customSkillDirs:
                - 'D:\.dsh\agent-preset-editor\skills\ape-skill'
                - 'D:/All_mcp_skills_tools/anthropics-skills/docx'
                - 'D:/All_mcp_skills_tools/PPT-Design-Skill/skill'
```

### Skill 行为什么只能有一行（血泪教训）

**不变式：同一个预设里，`@deepseek-ai/dsh-skill-filesystem` 最多一行；引用 N 个 Skill 就往
`customSkillDirs` 里放 N 个目录**（按 `skills[]` 的引用顺序；同一目录只留一份 —— 去重前先做
词法归一，统一分隔符方向与结尾分隔符，因为 inline 源拼出的目录是反斜杠、path 源常是正斜杠，
同一物理目录会因此有两种写法；空目录跳过；一个有效目录都没有就不生成该行）。

早期版本给每个 Skill 各推一行，结果是：**任何引用 ≥2 个 Skill 的预设都激活不了**，而且症状
极具误导性 —— 没有报错、没有日志，只是那个 `preset-<id>` 变成 roster 里的坏行、选不了也用不了。

失败链条：

1. `@deepseek-ai/dsh-skill-filesystem` 的 `providerName` 默认就是 `"filesystem"`（它的
   config schema 里 `default("filesystem")`，构造时 `this.name = config.providerName ?? "filesystem"`）。
2. `@deepseek-ai/dsh-skill` 的 provider 表**按名唯一**，第二个同名 provider 直接抛
   `a skill provider named "filesystem" is already registered in this scope`。
3. 抛错发生在**激活**阶段，于是整棵预设子树起不来。

一个 provider 本身就能扫多个根，所以正确做法是合并成一行。注意它**只在进程内可见**：
dsh 不会把这个失败写进 stderr，只能从 roster 的 `broken` 字段读到 —— 排查这类问题时别只看日志。

### 两条容易误解的语义（都是实测出来的）

1. **`persona.prefix` 在 apply 那一刻就固化了**：发布用的是**当时**的 `ParamValues`。
   之后在参数配置模式里调值，只影响本插件的预览和 `/prompt/preview`，**不会**自动改动已发布的声明。
   GUI 的「保存为我的默认值」现在会**顺带把新取值写回声明**（`/preset/values` 成功后自动跟一次
   `/preset/apply`，仅限该预设已发布时），但**仍要重启 profile 才被 agent 读到** ——
   声明是静态 YAML，取值必须在发布时烘进 `persona.prefix`。
   你作为 agent 若要改某个预设的取值：`POST /preset/values` 之后**必须**再 `POST /preset/apply`，
   两者缺一，用户看到的就是「参数改了没反应」。
2. **未定义的占位渲染成空串**：`{{ $nope }}` 在 `params` 里没有定义、`values` 里也没有 →
   替换为空串，不报错、也不保留原文。所以发布前请用「正文中未定义参数」警告把占位补全。

### 新建预设时最容易踩的坑：插件清单缺必需字段

**症状**：预设能在 DSH 的列表里看到，**却选不中**（点「启用」没反应）；`dsh` 的 stderr
**完全干净**，只有 roster 的 `broken` 字段里写着原因。

**成因**：Web profile 把整个 agent 平面（`tool-*` / `skill-filesystem` / `plan-mode` /
`compaction-*` / `agent-instructions` …）整体 disabled，改由**每个预设自己挂载**。
所以每个预设的 `plugins` 都必须手写一份完整清单 —— 而这份清单是从
`<dsh>/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml` 里那些行抄出来的，
**抄漏一个必需 config 就会让整棵预设子树激活失败**。

**实测案例（plan-mode）**：
```
plan-mode (@deepseek-ai/dsh-plan-mode): PlanModeConfig needs a non-empty `section`
```
`section` 是 2.3 KB 的英文提示词，而且 `plan-mode` 藏在 `planning` 这个
`cordis:group` 的 `config` **数组内部** —— 只扫顶层根本看不见它。

**现在有两道闸**（都会给出同一句话，直接告诉你缺什么）：

1. **编辑模式**：插件行 JSON 一改就校验（`EdPluginRowIssues` → `EdRequiredConfigIssues`）；
2. **保存/发布**：host 半 `normalizePlugins` 会拒绝（`validate.js` 的 `REQUIRED_PLUGIN_CONFIG`），
   防住绕过 UI 直接写 `<root>/presets/<id>.json` 的路径。

**排查这类问题的正确姿势**：不要只看日志（什么都不写）。要么重启后看 DSH 里那个预设
能不能选中，要么从进程内读 `agentPresets.list()` 的 `broken` 字段。

> 注意校验表目前**只覆盖 `plan-mode`** —— 只登记实测确认过必需的字段，加多了会变成误拦。
> 所以「清单里别的行有问题」仍可能悄悄失败；新建预设时**最稳的做法是从一个已经能用的
> 预设整份复制 `plugins`**，而不是凭记忆重写。

> 这一条是用户报「参数修改之后不能保存」的真正来源：`/preset/values` 一直是正常的
> （写 `<root>/values/<id>.json`，重启后仍在），但**它单独存在时对 agent 没有任何影响** ——
> AI 读的是发布那一刻烘死的文本。所以判定「参数保存有没有生效」时，看的是
> **受管区块里那个预设的 `prefix` 是否已经换成新值**，而不是 values 文件在不在。
