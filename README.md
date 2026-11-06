# dsh-agent-preset-editor

DSH（DeepSeek Harness）Web GUI 的侧边栏插件：可视化地创建、配置、查看 **Agent 预设**，
为预设定义**带默认值的参数**（低代码表单），并按预设挂载 **MCP 服务器**与 **Skills**。

- 预设本体就是 DSH 官方机制里的东西：一个 `@deepseek-ai/dsh-agent-preset` **声明行**，由 bundle patch 承载。
  本插件只是给「写这个声明行」配了个图形界面，并把提示词变成「模板 + 参数」。
- 面向另一个 dsh agent 的操作手册见 [AI-USAGE.md](AI-USAGE.md)；内部接口契约见 [docs/CONTRACT.md](docs/CONTRACT.md)。

## 界面落点

插件装好后，DSH Web GUI 里多出三处：

| 落点 | 位置 | 行为 |
|---|---|---|
| 右侧栏 guide 入口 | 右侧栏「新建」指南页里的一个入口胶囊 | 点开一个 `agent-preset-editor` 类型的 tab |
| 左侧栏底部按钮 | 左侧栏 footer | 同上，打开一个 tab |
| tab 正文 | 右侧栏面板 | 三种模式（下表）+ 顶部 `Agent预设 / MCP / Skills` 三选一 |

> 截图占位：`docs/images/01-guide-entry.png`（右侧栏指南页入口）、`docs/images/02-list-mode.png`（列表模式）、
> `docs/images/03-params-mode.png`（参数配置模式）、`docs/images/04-edit-mode.png`（编辑模式）。
> 图片未随本仓库提供。

## 三种模式

| 模式 | 做什么 |
|---|---|
| **预设列表** | 列出本插件创建的预设与 DSH roster 里的预设（区分内置 / 用户 / 覆盖内置），搜索、新建、删除、一键「启用」到当前会话；顶部可切到 **MCP** / **Skills** 目录管理 |
| **参数配置** | 面向使用者的低代码表单：按该预设的参数定义渲染界面，改值、保存为我的默认值、实时预览渲染后的提示词；这里不做结构改动 |
| **编辑** | 面向作者的完整编辑器：基础信息、提示词模板（带 `{{ $name }}` 占位扫描）、参数定义表、用低代码表单设计参数界面、勾选挂载的 MCP 与 Skills，保存 / 保存并发布到 DSH / 删除 |

`MCP` 与 `Skills` 目录是**全局共享、只被引用才生效**的：往目录里加一项不会影响任何预设，
只有某个预设的 `mcp` / `skills` 里引用了它，才会在该预设的声明行里挂载。
MCP 是一个引用一行；**Skill 无论引用几个都只合成一行**（一个 provider 扫多个目录）——
这是宿主侧 provider 按名唯一的硬约束，违反会让整个预设激活失败，
详见 [AI-USAGE.md](AI-USAGE.md) 的「Skill 行为什么只能有一行」。

**预设的工具来自它自己挂载的插件行。** Web profile 把所有 agent 工具行（读写文件、跑 shell、
联网搜索、加载 Skill、待办、交付物卡片、子代理……）在 host 平面整体关掉了，改由**每个预设
自己挂载**。所以「编辑模式 → 挂载插件（原始 Cordis 行）」这一节不是高级选项，而是决定这个预设
有没有工具的地方：不挂 `tool-fs` 就读不了文件，不挂 `tool-web` 就上不了网，只挂
`skill-filesystem` 而没有 `tool-skill`，Skills 就是「注册了但模型用不到」。
这一节的完整规则（行形态、`cordis:group`、`!!js` 表达式、为什么不能重复写 persona /
skill-filesystem）见 [docs/CONTRACT.md](docs/CONTRACT.md) §2.7。

### 「让 AI 帮我写」

**三个**添加弹窗（Agent 预设 / MCP / Skills）的**顶部右侧**各有一个「让 AI 帮我写」按钮。
它把一句填好格式的请求（跟随界面语言在中英文之间切换）写进**当前会话的输入框**，关掉弹窗并把
焦点交给输入框。你补完信息后发送，会话里的 AI 就会通过插件的 HTTP API 把它落库。

三条请求分别是：

```
给「Agent 预设编辑器」新增一个 Agent 预设：
<说明它的用途：面向什么任务、AI 该扮演什么角色、需要哪些参数 / MCP / Skills>
```
```
给 Agent 预设插件添加以下 MCP：
<在这里补充它的信息：项目位置 / 启动命令与参数 / 传输方式（stdio、http 或 sse）/ 用途>
```
```
给 Agent 预设插件添加以下 Skill：
<在这里补充它的信息：名称 / 用途 / SKILL.md 正文或所在目录>
```

为什么要有这条路径：登记一个 MCP 要填 `serverName` / `transport` / `command` / `args`，
登记一个 Skill 要写 `SKILL.md` 正文或给出目录，设计一个预设要想清角色、参数与挂载 ——
用户手上通常没有这些字段，但能用一句话描述想要什么。于是让用户描述、让 AI 填表。

预设那条刻意把插件名写全：句子里「Agent 预设插件」与「Agent 预设」挨在一起，
不点名容易被读成同一件事。

## 安装

```powershell
# profile 名 = $DSH_HOME/profiles 下的目录名（例如 web）
dsh plugin --profile web add D:\path\to\dsh-agent-preset-editor
```

`dsh plugin --profile <name> <pnpm 参数...>` 就是官方入口：它在该 profile 目录里执行 pnpm，
并把 `dsh.profile.bundles` 与已安装包对齐；本包的 `cordis.patch.yml` 会插入一行 host 插件
（Loader 行 id `agent-preset-editor`，name `dsh-agent-preset-editor`），profile 启动时合并生效。

- 图形化等价路径：让会话里的 agent 调 `plugin_manager` / `install_bundle`，`target` 传本包的**绝对目录**。
- 安装会**在 Host 进程里执行插件代码**，因此需要 Full access 或用户审批。
- 安装（含替换）后通常需要**重启 profile** 才会加载新的 JavaScript 模块；新增 bundle 有机会经 HMR 直接激活。
  浏览器侧同理：刷新页面后 client 半才重新加载。
- 装完启动：`dsh web`（= `dsh --profile web`），或 `dsh --profile <你的 profile 名>`。

## 数据存放位置

```
$DSH_HOME/agent-preset-editor/          # 本机：D:\.dsh\agent-preset-editor\
```

`$DSH_HOME` 未设置时回退到 `%USERPROFILE%\.dsh`（见 CONTRACT §1.6）。
目录内容预期为：预设定义、MCP 目录、Skills 目录、每个预设一份参数值，以及发布时渲染出的 patch 文件。
**这些文件是 host 半的内部实现，不要用手工编辑它们代替 API**；读写走 HTTP API（见 AI-USAGE.md），
GUI 与 agent 的写入都经过同一套校验。

## 生效边界：什么立刻生效，什么要重启

| 你改了什么 | 写到哪 | 什么时候生效 |
|---|---|---|
| 预设定义（提示词模板、参数定义、低代码 rule、MCP/Skills 引用） | 插件存储根 | 只是一条本插件的数据；**不会**自动挂载到 DSH |
| 参数值（参数配置模式 / `/preset/values`） | 插件存储根 | 立即影响渲染结果与 `/prompt/preview`；对**已挂载**的预设，需要重新「发布到 DSH」才会把新渲染结果写进 persona |
| 「保存并发布到 DSH」（`/preset/apply`） | profile 的 `cordis.patch.yml` 受管区块（`# >>> dsh-agent-preset-editor BEGIN` … `# <<< dsh-agent-preset-editor END`） | 渲染/更新 `preset-<id>` 声明行。以接口返回的 `mode`（`loader` / `patch`）与 `restartRequired` / `note` 为准：`patch` 模式下需要重启 profile 或等待 HMR；**已开始的会话保持它启动时的插件版本**，改动请在新会话里验证 |
| 切换当前会话使用的预设（列表 / 参数配置模式的「启用」） | 会话预设（`agentPresets.select`） | 立即生效；**会话已开始则被拒绝**（`agent-preset/locked`），只能新建会话后再选 |

## 卸载与回滚

1. （可选）在 GUI 里删掉自己创建的预设 —— 只清数据，不影响 DSH。
2. 移除包：`dsh plugin --profile web remove dsh-agent-preset-editor`，或让 agent 调
   `plugin_manager` / `remove_bundle`。
3. 回滚发布的声明：打开该 profile 的 `cordis.patch.yml`，删掉
   `# >>> dsh-agent-preset-editor BEGIN` … `# <<< dsh-agent-preset-editor END` 之间的受管区块；
   或用 host 半写入前的备份 `cordis.patch.yml.bak-agent-preset-editor` 还原（备份命名以实际实现为准，
   同目录下通常还能看到其它插件的 `.bak-*` 备份）。
4. 重启 profile。插件数据目录不会自动清理，需要时手动删除 `$DSH_HOME/agent-preset-editor/`。

## 开发

```powershell
npm run build   # node scripts/build-client.mjs  —— 把 src/client/parts/*.js 拼成 client.js
npm run check   # node scripts/check-parts.mjs   —— part 片段语法自查
npm test        # node tests/verify-browser-half.mjs —— 在 mock 宿主上跑真实 client.js
node tests/preset-plugins.test.mjs                 # 插件行渲染 / !!js 表达式标记的回归测试
```

发布预设前建议再跑一遍离线硬校验（不写盘、不联网，直接调用 host 半的真实模块）：

```powershell
node scripts/validate-preset-draft.mjs <预设定义.json>
```

它检查：归一化是否会被 400 拒绝、提示词占位与参数是否双向闭合、`form.rule` 是否与参数一一对应、
生成的行 id 是否重复、必备能力（文件 / shell / 联网 / Skill / 待办 / 交付物）是否挂齐、
`!!js` 表达式是否真的发射成 `!!js` 标量，以及 `skills[]` 是否只合成一行 `skill-filesystem`。

如果**正在运行的 dsh 进程早于**这些源码改动，那么它的 `/preset/apply` 仍会用旧模块渲染，
`presets.patch.yml` 会缺行。这时先用本仓的渲染器离线重放受管区块，再重启：

```powershell
node scripts/republish-managed-block.mjs --dry-run   # 先看每个预设会渲染出几行
node scripts/republish-managed-block.mjs             # 写回 presets.patch.yml + profile 受管区块
```

隔离/多 profile 场景**显式指定目标**（别让它猜）：`--patch <profile 目录或 cordis.patch.yml>`。
运行中的 dsh 进程永远用 `profileContext.patchPath` 精确解析目标 profile，不会猜。

`npm test` 用的是**构建产物本身**，不是复刻实现：它把 client.js 加载进一个 mock 宿主，
让 `apply()` 真跑一遍注册，再驱动标签页正文与「让 AI 帮我写」的写入路径。

两个 mock 细节是拿真机缺陷换来的，改测试时别简化掉：

- **Cordis 的 `Context` 是 Proxy**：读一个没写进 `inject` 的服务会**抛错**而不是返回
  `undefined`，所以 mock 也必须抛。用普通对象当 mock，这类错误在本地完全不可见。
- **`useEffect` 要真的执行**：否则异步 loader 与 composer 写入路径根本没被跑到。

```
package.json          dsh.bundle.patch + dsh.client(...) + exports/meta/icon
cordis.patch.yml      bundle patch：插入 host 行
index.js              host 半入口（ESM）
client.js             client 半入口（由 parts 拼接生成，勿手改）
src/host/*.js         host 源码：存储、路由、声明渲染
src/client/parts/*.js client 源码片段（按文件名升序拼接，无 import/export、无 JSX）
scripts/build-client.mjs           把 parts 拼成 client.js
scripts/validate-preset-draft.mjs  候选预设的离线硬校验（形状 / 占位 / 能力覆盖 / `!!js`）
scripts/gen-resume-helper.mjs      「简历助手」预设定义的生成脚本（提示词以模板字符串维护）
scripts/republish-managed-block.mjs 用本仓渲染器重放受管区块（运行中的进程早于改动时用）
tests/verify-browser-half.mjs      在 mock 宿主上跑真实 client.js
tests/preset-plugins.test.mjs      插件行渲染与 `!!js` 表达式标记的回归测试
locale/{en,zh}.json   Plugin Manager 显示文案
```

硬约束（改代码前务必读 CONTRACT §1.2 / §1.3）：client 半是**单文件 Lazy-CJS**，
只能 `require('react')` / `require('react/jsx-runtime')`，不得引用任何其它 DSH Client 包；
part 片段之间不写 `import` / `export`；样式只用主题 token，不替换 app root。

服务读取另有一条硬规矩：**能用 `inject` 声明的就声明**（`ctx.sessions`、`ctx.slots`、`ctx.remote`），
只有**晚出现**的服务（`sidebarRightTabs`）或**文档明确要求 `ctx.get` 探测**的服务
（`conversation`）才走 `safeGet` / `ctx.inject`。曾经的教训：`sessions` 偷懒用 `ctx.get`，
在真机上返回空，整个「让 AI 帮我写」静默失败。

## 相关文档

- [AI-USAGE.md](AI-USAGE.md) —— 给 dsh agent 的使用说明书（HTTP API、存储格式、参数语法、默认值策略、坑）
- [docs/CONTRACT.md](docs/CONTRACT.md) —— 内部冻结契约（数据模型 / HTTP API / 三模式 / 占位语法）
