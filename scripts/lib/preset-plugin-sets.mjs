/**
 * 预设自带的 Cordis 插件行（agent 平面工具面）。
 *
 * 为什么所有「能干活的」预设都需要这一套：Web profile 的
 * `@deepseek-ai/dsh-web-app/cordis.patch.yml`（第 430-556 行）把整个 agent 平面在
 * **host 平面整体 disabled**，改由每个预设自己挂载。只渲染 persona 的预设，
 * 其 agent 一个工具都没有：读不了文件、跑不了命令、上不了网、加载不了 Skill。
 *
 * 数据来源：`preset-toolchain.json` —— 由 `scripts/refresh-toolchain-snapshot.mjs`
 * 从编辑器自己的 `GET /agent-preset-editor/api/plugin-template` 读出后落盘。那份模板
 * 又是 `src/host/plugin-template.js` 从 dsh 的 `dsh-base` / `dsh-web-app` bundle patch
 * **就地提取**的，所以这是官方清单，不是手抄。
 *
 * 为什么不要手抄：清单里 `plan-mode` 的 `config.section` 是 2.3 KB 的提示词，抄漏它
 * 会让整个预设**激活失败**——DSH 里看得到那个预设、却选不中，且不写 stderr。
 * 见 docs/CONTRACT.md §2.7 与 AI-USAGE.md「别手抄插件清单」。
 *
 * 两条硬性约定（快照里已经处理好，改动时务必保持）：
 *   - **不含 `persona`**：渲染器固定把它放在第一行
 *   - **不含 `skill-filesystem`**：由 `definition.skills[]` 自动合成唯一一行；
 *     重复写会撞 `filesystem` provider 名，让整棵预设子树起不来
 *   - 平台条件必须是 `{ __jsExpr }` 标记：写成普通字符串会被 Loader 的
 *     `Boolean('...')` 判成 true，该行在**所有平台**被静默停用
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SNAPSHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'preset-toolchain.json');
const DEFAULT_API = 'http://127.0.0.1:3080';

/** 读快照文件。 */
function fromSnapshot() {
  const doc = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  if (rows.length === 0) {
    throw new Error(`${SNAPSHOT} 里没有任何插件行；请重跑 scripts/refresh-toolchain-snapshot.mjs`);
  }
  return rows;
}

/**
 * 从编辑器自己的 `/plugin-template` 实时读取官方清单。
 *
 * 优先实时读的原因：那份模板由 `src/host/plugin-template.js` 从 dsh 的 bundle patch
 * 就地提取，永远与当前安装的 dsh 一致；快照只是它的一份离线副本（dsh 升级后会过期）。
 * 读不到（服务没跑 / 接口未加载）就返回 null，由调用方回退到快照。
 * @param {object} [options] - `{ url }` 覆盖服务地址。
 * @returns {Promise<Array|null>}
 */
async function fromLiveTemplate(options = {}) {
  const base = typeof options.url === 'string' && options.url !== '' ? options.url : DEFAULT_API;
  const endpoint = `${base.replace(/\/+$/, '')}/agent-preset-editor/api/plugin-template`;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || payload.ok !== true || !payload.data || payload.data.ok !== true) return null;
    const rows = Array.isArray(payload.data.rows) ? payload.data.rows : [];
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

/** 模板行 / 快照行的统一清洗：剔 skill-filesystem、字符串 disabled 升格、补两个 preset 专属行。 */
function cleanTemplateRows(rows) {
  return rows
    // skill-filesystem 由 definition.skills[] 合成唯一一行；放进来会撞 provider 名
    .filter((row) => row && row.name !== '@deepseek-ai/dsh-skill-filesystem')
    .map((row) => {
      const out = { id: row.id, name: row.name };
      if (row.config !== undefined && row.config !== null) out.config = row.config;
      if (row.disabled !== undefined && row.disabled !== null) {
        // 实时接口给的是普通字符串（解析器没注册 `!!js` tag）；必须升格成标记，
        // 否则 Loader 的 Boolean('...') 会把该行在所有平台静默停用
        out.disabled = typeof row.disabled === 'string' ? { __jsExpr: row.disabled } : row.disabled;
      }
      if (row.group !== undefined) out.group = row.group;
      if (row.isolate !== undefined) out.isolate = row.isolate;
      if (row.inject !== undefined) out.inject = row.inject;
      return out;
    })
    // 模板来自 dsh-base，不含 preset 独有的两个工具行（standard 预设里有），显式补回
    .concat([
      { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
      { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
    ]);
}

/**
 * 生成一整套工具行（深拷贝，调用方可安全地改）。
 *
 * 默认优先从**运行中的编辑器**实时读取官方清单，拿不到再回退到 `preset-toolchain.json`
 * 快照 —— 这样既不会因为 dsh 升级而过期，也不要求生成预设时服务一定在跑。
 * @param {object} [options] - `{ url }`、`{ offline: true }` 强制用快照。
 * @returns {Promise<Array<object>>} Cordis 行
 */
export async function standardToolchainPlugins(options = {}) {
  if (options.offline !== true) {
    const live = await fromLiveTemplate(options);
    if (live) return JSON.parse(JSON.stringify(cleanTemplateRows(live)));
  }
  return JSON.parse(JSON.stringify(cleanTemplateRows(fromSnapshot())));
}

/** 工具行来自哪里（供脚本打印 / 排查）。 */
export async function toolchainSource(options = {}) {
  if (options.offline !== true) {
    const live = await fromLiveTemplate(options);
    if (live) return { kind: 'live', endpoint: `${(options.url || DEFAULT_API).replace(/\/+$/, '')}/agent-preset-editor/api/plugin-template`, count: cleanTemplateRows(live).length };
  }
  const doc = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  return { kind: 'snapshot', file: SNAPSHOT, count: (doc.rows || []).length, source: doc.source || {} };
}
