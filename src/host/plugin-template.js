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
    const rows = baseRows.filter((row) => disabled.has(row.id)).map(toPluginRow);

    const missing = [...disabled].filter((id) => !rows.some((row) => row.id === id));
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
