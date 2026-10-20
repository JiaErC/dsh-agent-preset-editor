/**
 * 「预设该带的插件行」模板 —— 从 DSH 自带的 bundle patch 就地提取。
 *
 * 为什么必须有这个模块
 * --------------------
 * Web profile 把整个 agent 平面（tool-fs / tool-pwsh / tool-web / skill-filesystem /
 * plan-mode / compaction-* / agent-instructions …）在 host 平面整体 disabled，改由
 * **每个预设自己挂载**。于是每个新预设都得带一份完整插件清单 —— 而在此之前，这份
 * 清单只能靠人从别处**手抄**，抄漏一个必需字段（典型是 plan-mode 的 2.3 KB
 * `section`）就会让整棵预设子树激活失败：DSH 里看得到那个预设、却选不中，且 dsh
 * 不把失败写进 stderr。
 *
 * 这里把「该带哪些行、每行什么配置」变成一次可复现的读取，谁都不必再手抄。
 *
 * 挑选依据与内容来源是**两个不同的文件**，这点很关键：
 *  - `dsh-web-app/cordis.patch.yml` 决定**哪些行属于 agent 平面** —— 它把这份平面
 *    整体 `disabled: true`，那份停用名单就是权威的挑选依据；
 *  - `dsh-base/cordis.patch.yml` 提供**行本身的内容**（id / name / config）。
 * 刻意不继承 web-app 的 disabled：那些 `disabled: true` 是「web 平面不装它」的意思，
 * 而预设要的恰恰是**装上**；base 里自带的禁用（例如 tool-bash 在 Windows 上的
 * `!!js` 平台判断）才是该保留的。
 *
 * 两个文件都可能把行裹在 `insert:` 块或 `cordis:group` 的 config 里，所以要拍平。
 * base 与 web-app 的层级差异（base 扁平、dump-config 会显示组）不影响结果：
 * 组只是组织方式，扁平的行一样能用。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** 从 dsh 安装根到两个 bundle patch 的相对路径。 */
const BASE_PATCH = ['node_modules', '@deepseek-ai', 'dsh-base', 'cordis.patch.yml'];
const WEB_PATCH = ['node_modules', '@deepseek-ai', 'dsh-web-app', 'cordis.patch.yml'];

/**
 * 定位 dsh 的安装根。
 *
 * host 半跑在 dsh 进程里，所以 `process.argv[1]` 就是它自己的 `lib/bin.js` ——
 * 这条路不依赖包管理器布局，也不依赖本插件被 link 到哪里，对任何安装方式都成立。
 * @returns {string} 安装根绝对路径；推不出来时返回空串。
 */
function dshRoot() {
  const bin = process.argv[1];
  if (typeof bin !== 'string' || bin === '') return '';
  const libDir = path.dirname(path.resolve(bin));
  // bin.js 在 <root>/lib/ 下；
  if (path.basename(libDir) === 'lib') return path.dirname(libDir);
  return libDir;
}

/** 载入一个 YAML 解析器；用 dsh 自己的依赖，避免给本插件添运行时依赖。 */
function loadYaml() {
  const roots = [dshRoot(), path.dirname(fileURLToPath(import.meta.url))].filter(Boolean);
  for (const root of roots) {
    try {
      const req = createRequire(path.join(root, '__ape_probe__.js'));
      for (const name of ['yaml', 'js-yaml']) {
        try { return req(name); } catch { /* 换下一个解析器 */ }
      }
    } catch { /* 换下一个根 */ }
  }
  return null;
}

/**
 * 拍平出一份 patch 里所有真正的「行」。
 * `insert:` 是 patch 的插入语法，`cordis:group` 的 config 是嵌套条目 —— 两者都要下降。
 * @param {Array} nodes - 解析后的 patch 层。
 * @param {Array} out - 累积结果。
 * @returns {Array} 行数组。
 */
export function flattenRows(nodes, out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node.insert)) { flattenRows(node.insert, out); continue; }
    if (Array.isArray(node.config)) { flattenRows(node.config, out); continue; }
    if (typeof node.id === 'string' && node.id !== '') out.push(node);
  }
  return out;
}

/** 只保留声明行认得的键（与 validate.js 的 PLUGIN_ROW_KEYS 一致）。 */
const KEPT_KEYS = ['id', 'name', 'config', 'disabled', 'inject', 'intercept', 'isolate', 'group'];

/** 复制一行，丢掉 patch 专属字段，并按固定键序输出。 */
function toPluginRow(node) {
  const row = {};
  for (const key of KEPT_KEYS) {
    if (node[key] !== undefined && node[key] !== null) row[key] = node[key];
  }
  return row;
}

/**
 * 「注册 service」的插件 → 它必须被包进哪个 isolate 组。
 *
 * 这是本模块最容易搞错、也唯一无法从 bundle patch 直接读到的一块。这些插件在 apply
 * 时各注册一个 Cordis service，而预设的 scope 里**外层已经有一份**同名注册，于是激活时报：
 *
 *   plan-mode (@deepseek-ai/dsh-plan-mode): service "planMode" has been registered at <PlanModeController>
 *   compaction-basic ...: service "compaction" has been registered ...
 *   workflow-ptc ...: service "workflowEngine" has been registered ...
 *   tool-result-pruner ...: service "toolResultPruner" has been registered ...
 *
 * 四条一起报，整棵预设子树起不来 —— 用户看到的就是「新建对话上方选不了这个预设」。
 * 解法是让它们在自己的 realm 里注册：`cordis:group` + `isolate`。组名与 isolate 键
 * 都照 `dsh web --dump-config` 的实际输出抄，没有自行发明。
 *
 * 为什么不能从 bundle patch 读：那两个 patch 里 `isolate` 一处都没有（组结构只出现在
 * **组合后**的配置里），读不到就只能照实测登记。DSH 若新增带 service 的插件，这张表要
 * 同步更新 —— 漏登记的症状就是上面那四条报错，很好认。
 */
const SERVICE_GROUPS = [
  {
    id: 'planning',
    isolate: { planMode: true },
    plugins: ['@deepseek-ai/dsh-plan-mode'],
  },
  {
    id: 'compaction',
    isolate: { compaction: true, toolResultPruner: true },
    plugins: [
      '@deepseek-ai/dsh-compaction-basic',
      '@deepseek-ai/dsh-command-compact',
      '@deepseek-ai/dsh-compaction-tool-result-pruner',
    ],
  },
  {
    id: 'delegation',
    isolate: { workflowEngine: true },
    plugins: [
      '@deepseek-ai/dsh-tool-subagent-control',
      '@deepseek-ai/dsh-tool-subagent-control/list-agents',
      '@deepseek-ai/dsh-tool-subagent',
      '@deepseek-ai/dsh-workflow-ptc',
      '@deepseek-ai/dsh-tool-workflow',
    ],
  },
];

/**
 * 把扁平的插件行整理成「该挂的形式」：注册 service 的插件收进各自的 isolate 组，
 * 其余保持原样、顺序不变。
 *
 * 为什么必须这么做：service 注册是**按 scope** 的，而预设的 scope 外层已经有一份，
 * 不隔离就撞名、整个预设激活失败。这一步是「能选中预设」的前提，不是可选修饰。
 * @param {Array} rows - 扁平的插件行。
 * @returns {Array} 可直接放进预设 plugins 的行（可能含 cordis:group 组行）。
 */
export function groupServicePlugins(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const owner = new Map();
  for (const group of SERVICE_GROUPS) {
    for (const name of group.plugins) owner.set(name, group.id);
  }

  const out = [];
  const grouped = new Map(SERVICE_GROUPS.map((g) => [g.id, []]));

  for (const row of rows) {
    const groupId = owner.get(row && row.name);
    if (groupId === undefined) out.push(row);
    else grouped.get(groupId).push(row);
  }

  // 组追加在末尾：它们只注册 service、不提供工具，放最后不影响工具面，
  // 也不会把 persona 与工具行挤开。
  for (const group of SERVICE_GROUPS) {
    const members = grouped.get(group.id);
    if (!members || members.length === 0) continue;
    // 与调用方已有的同名行撞 id 时不覆盖：留给用户自己的结构。
    if (out.some((row) => row && row.id === group.id)) continue;
    out.push({
      id: group.id,
      name: 'cordis:group',
      group: true,
      isolate: { ...group.isolate },
      config: members,
    });
  }

  return out;
}

/** 缓存：同一进程里模板不会变，重复请求不必反复读盘。 */
let cache = null;

/**
 * 读出「预设该带的插件行」。
 *
 * @param {object} [options] - `{ refresh: true }` 跳过缓存。
 * @returns {{ok: boolean, rows: Array, source: object, reason: string}}
 *   `ok` 为假时 `reason` 是给用户看的一句话，`rows` 为空。
 */
export function readPluginTemplate(options = {}) {
  if (cache && options.refresh !== true) return cache;

  const build = () => {
    const root = dshRoot();
    if (root === '') {
      return { ok: false, rows: [], source: {}, reason: '定位不到 dsh 安装目录（process.argv[1] 不可用）' };
    }
    const basePath = path.join(root, ...BASE_PATCH);
    const webPath = path.join(root, ...WEB_PATCH);
    if (!fs.existsSync(basePath) || !fs.existsSync(webPath)) {
      return {
        ok: false, rows: [], source: { root, basePath, webPath },
        reason: '找不到 dsh 自带的 bundle patch（' + path.basename(basePath) + '）；'
          + '如果你的 dsh 不是 npm 全局安装，请手动填写插件清单',
      };
    }
    const YAML = loadYaml();
    if (!YAML) {
      return { ok: false, rows: [], source: { root }, reason: '没有可用的 YAML 解析器，无法读取 bundle patch' };
    }

    let webDoc;
    let baseDoc;
    try {
      webDoc = YAML.parse(fs.readFileSync(webPath, 'utf8'));
      baseDoc = YAML.parse(fs.readFileSync(basePath, 'utf8'));
    } catch (error) {
      return {
        ok: false, rows: [], source: { root },
        reason: '解析 bundle patch 失败：' + (error && error.message ? error.message : String(error)),
      };
    }

    // 1) 挑选依据：web 平面整体停用了哪些行
    const webRows = flattenRows(Array.isArray(webDoc) ? webDoc : [webDoc]);
    const disabled = new Set(webRows.filter((row) => row.disabled === true).map((row) => row.id));
    if (disabled.size === 0) {
      return {
        ok: false, rows: [], source: { root },
        reason: 'web bundle patch 里没有找到被停用的行，无法判断 agent 平面包含什么',
      };
    }

    // 2) 内容来源：base 里这些行的定义（保留 base 自己带的 disabled，例如平台判断）
    const baseRows = flattenRows(Array.isArray(baseDoc) ? baseDoc : [baseDoc]);
    const flat = baseRows.filter((row) => disabled.has(row.id)).map(toPluginRow);
    // 3) 把注册 service 的插件收进 isolate 组 —— 不做这一步，预设会在激活时报
    //    「service ... has been registered」，然后整个预设选不中。
    const rows = groupServicePlugins(flat);

    const missing = [...disabled].filter((id) => !flat.some((row) => row.id === id));
    return {
      ok: rows.length > 0,
      rows,
      source: { root, basePath, webPath, expected: disabled.size, missing },
      reason: rows.length > 0
        ? ''
        : 'bundle patch 里没有提取到任何 agent 平面插件行',
    };
  };

  const result = build();
  // 只缓存成功结果：失败往往是环境问题，不该被钉死到进程结束。
  if (result.ok) cache = result;
  return result;
}

/** 清掉缓存（测试与「重新读取」用）。 */
export function clearPluginTemplateCache() {
  cache = null;
}
