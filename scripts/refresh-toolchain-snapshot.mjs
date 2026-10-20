#!/usr/bin/env node
/**
 * 刷新 `scripts/lib/preset-toolchain.json` —— 预设自带的 agent 平面工具行快照。
 *
 * 数据来自编辑器自己的 `GET /agent-preset-editor/api/plugin-template`（要有一个在跑的
 * dsh web + 已加载本插件的 host 半）。那份模板由 `src/host/plugin-template.js` 从 dsh 的
 * `dsh-base` / `dsh-web-app` bundle patch 就地提取，所以拿到的是官方清单，不是手抄；
 * bundle patch 随 dsh 升级变化时重跑本脚本即可。
 *
 * 用法：
 *   node scripts/refresh-toolchain-snapshot.mjs [--url http://127.0.0.1:3080]
 *
 * 两个后处理是硬约定，别去掉：
 *   - 剔除 `skill-filesystem`：它由 definition.skills[] 合成唯一一行，重复写会撞
 *     `filesystem` provider 名，让整棵预设子树激活失败。
 *   - 字符串形态的 `disabled` 一律转成 `{ __jsExpr }` 标记：普通字符串会被 Loader 的
 *     `Boolean('...')` 判成 true，该行在所有平台被静默停用。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'lib', 'preset-toolchain.json');

const argUrl = (() => {
  const at = process.argv.indexOf('--url');
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : 'http://127.0.0.1:3080';
})();

/** 字符串形态的 disabled → `{ __jsExpr }` 标记。 */
const toMarker = (value) => (typeof value === 'string' ? { __jsExpr: value } : value);

const endpoint = `${argUrl.replace(/\/+$/, '')}/agent-preset-editor/api/plugin-template`;

let template;
try {
  const response = await fetch(endpoint);
  template = await response.json();
} catch (error) {
  console.error(`读取 ${endpoint} 失败：${error && error.message ? error.message : String(error)}`);
  console.error('请确认 dsh web 正在运行，且它启动时已加载 dsh-agent-preset-editor 的 host 半。');
  process.exit(1);
}

if (!template || !template.ok || !template.data || template.data.ok !== true) {
  console.error(`模板接口没有给出可用清单：${JSON.stringify(template && (template.error || template.data))}`);
  process.exit(1);
}

const rows = template.data.rows
  .filter((row) => row.name !== '@deepseek-ai/dsh-skill-filesystem')
  .map((row) => {
    const out = { id: row.id, name: row.name };
    if (row.config !== undefined && row.config !== null) out.config = row.config;
    if (row.disabled !== undefined && row.disabled !== null) out.disabled = toMarker(row.disabled);
    if (row.group !== undefined) out.group = row.group;
    if (row.isolate !== undefined) out.isolate = row.isolate;
    if (row.inject !== undefined) out.inject = row.inject;
    return out;
  });

// 注意：**不要**在这里补 tool-ask-user / present。
// 快照必须与 /plugin-template 的原始行一一对应，preset 专属的两行由
// scripts/lib/preset-plugin-sets.mjs 的 cleanTemplateRows() 统一追加 ——
// 两条路径（实时 / 离线）都过同一个函数，才不会重复。这里补一次、
// 那里再补一次，离线路径就会得到重复行 id，加载器会撞名。

const doc = {
  $comment: [
    '预设自带的 agent 平面工具行快照。由 scripts/refresh-toolchain-snapshot.mjs 从编辑器自己的',
    'GET /agent-preset-editor/api/plugin-template 读出后写入；那份模板又是 src/host/plugin-template.js',
    '从 dsh 的 dsh-base / dsh-web-app bundle patch 就地提取的，所以这里是官方清单，不是手抄。',
    'bundle patch 随 dsh 升级变化时，重跑该脚本刷新。',
    '约定：不含 persona（渲染器固定第一行），不含 skill-filesystem（由 definition.skills[] 合成唯一一行）。',
  ],
  source: template.data.source,
  rows,
};

await fs.writeFile(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`已写入 ${rows.length} 行 → ${OUT}`);
console.log('  ' + rows.map((row) => row.id).join(' / '));
