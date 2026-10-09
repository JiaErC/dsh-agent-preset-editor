#!/usr/bin/env node
/**
 * 用**本仓已修好的渲染器**重放受管区块：把 applied.json 里的每个预设重新渲染成
 * 声明 YAML，写回 <root>/presets.patch.yml，再注入 profile 的受管标记区块。
 *
 * 为什么需要它：正在运行的 dsh web 进程是**改动之前**启动的，它加载的是旧模块，
 * 于是 /preset/apply 只渲染出 persona + mcp-* + skill-filesystem 三行、把预设自带的
 * 工具行丢掉了。重启能解决，但不能靠「重启之后才正确」——先把磁盘上的事实修对，
 * 重启只是让它生效。
 *
 * 幂等：同一份存储内容永远产出同样的文件；块外内容一个字节都不动（复用
 * declarations.js 里与 /preset/apply 完全相同的 injectManagedBlock）。
 *
 * 用法：node scripts/republish-managed-block.mjs [--dry-run]
 */

import fs from 'node:fs';

import { injectManagedBlock, renderPatchDocument, buildPresetRow, hasDeclarationRow } from '../src/host/declarations.js';
import { backupFile, createStore, resolveDshHome, resolveStoreRoot, writeFileAtomic } from '../src/host/store.js';
import { resolveProfilePatchFile } from '../src/host/declarations.js';

const dryRun = process.argv.includes('--dry-run');

const store = createStore(resolveStoreRoot({}));
const appliedIds = store.readApplied();
const catalogs = {
  mcp: store.listMcp().entries,
  skills: store.listSkills().entries,
};
const skillById = new Map(catalogs.skills.map((entry) => [entry.id, entry]));

// hasDeclarationRow 需要一个 ctx.loader 才能探测「内置预设 → 用覆盖而不是插入」。
// 离线重放没有 loader，所以退回与它相同的兜底规则：id 属于随包发布的四个预设才覆盖。
const SHIPPED = new Set(['standard', 'ptc', 'minimal', 'cordis']);
const ctx = {};

const rows = [];
for (const id of appliedIds) {
  const definition = store.readPreset(id);
  if (!definition) {
    console.log(`  ! ${id}：没有本地定义，跳过（下次 sync 会把它从 applied 里摘掉）`);
    continue;
  }
  const values = store.readValues(id) || {};
  const resolvedSkills = [];
  for (const ref of definition.skills || []) {
    const entry = skillById.get(ref);
    if (!entry || entry.enabled === false) continue;
    resolvedSkills.push(entry);
  }
  const row = buildPresetRow(definition, values, { mcp: catalogs.mcp, skills: resolvedSkills }, {
    override: hasDeclarationRow(ctx, id) || SHIPPED.has(id),
    store,
  });
  rows.push({ ...row, order: definition.order, presetId: id });
}

rows.sort((a, b) => (a.order === b.order ? a.presetId.localeCompare(b.presetId) : a.order - b.order));

const yamlSource = renderPatchDocument(rows);
const profilePatch = resolveProfilePatchFile({});

console.log('=== 重放受管区块 ===');
console.log(`  DSH_HOME=${resolveDshHome()}`);
console.log(`  存储根=${store.paths.root}`);
console.log(`  applied=${JSON.stringify(appliedIds)}`);
for (const row of rows) {
  const ids = row.config.plugins.map((item) => item.id);
  console.log(`  ${row.rowId}：${ids.length} 行 → ${ids.join(' / ')}`);
}
console.log(`  profile patch=${profilePatch}`);

const existingPatch = store.readPatchFile();
const existingProfile = (() => {
  try { return fs.readFileSync(profilePatch, 'utf8'); } catch { return ''; }
})();
const nextProfile = injectManagedBlock(existingProfile, yamlSource);
const profileChanged = nextProfile !== existingProfile;

console.log(`  presets.patch.yml 变化=${existingPatch !== yamlSource}`);
console.log(`  profile 受管区块变化=${profileChanged}`);

if (dryRun) {
  console.log('\n--dry-run：没有写盘。');
  process.exit(0);
}

store.writePatchFile(yamlSource);
if (profileChanged) {
  const backup = existingProfile === '' ? null : backupFile(profilePatch);
  writeFileAtomic(profilePatch, nextProfile);
  console.log(`  已写回 profile；备份=${backup || '(原文件不存在)'}`);
} else {
  console.log('  profile 受管区块已是最新，未改动');
}
console.log('  已写入 ' + store.paths.declarations);
