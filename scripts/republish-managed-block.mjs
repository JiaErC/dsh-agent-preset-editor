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
 * 用法：node scripts/republish-managed-block.mjs [--dry-run] [--patch <profile 目录或 cordis.patch.yml>]
 *
 * `--patch` 是给隔离/多 profile 场景的保险：不给时用 resolveProfilePatchFile 的
 * 启发式（默认存储根 → 带受管区块的 profile 优先）。运行中的 dsh 进程永远用
 * profileContext.patchPath，不会走这个猜测。
 */

import fs from 'node:fs';

import { injectManagedBlock, renderPatchDocument, buildPresetRow, hasDeclarationRow, resolveProfilePatchFile, resolvePreset } from '../src/host/declarations.js';
import { backupFile, createStore, resolveDshHome, resolveStoreRoot, writeFileAtomic } from '../src/host/store.js';

const dryRun = process.argv.includes('--dry-run');
const patchFlagAt = process.argv.indexOf('--patch');
const explicitPatch = patchFlagAt >= 0 ? process.argv[patchFlagAt + 1] : '';

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

// 父子合并也要看得见全部预设与取值：与 syncDeclarations 的渲染路径保持一致。
const allPresets = store.listPresets().presets || [];
const allValues = store.listValues() || {};

const rows = [];
for (const id of appliedIds) {
  const stored = store.readPreset(id);
  if (!stored) {
    console.log(`  ! ${id}：没有本地定义，跳过（下次 sync 会把它从 applied 里摘掉）`);
    continue;
  }
  const ownValues = store.readValues(id) || {};
  const merged = resolvePreset(stored, allPresets, { ...allValues, [id]: ownValues });
  const definition = merged.definition;
  const values = merged.values;
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
// 不给 --patch 时走启发式；隔离 / 多 profile 场景请显式指定，别让它猜。
const profilePatch = resolveProfilePatchFile(explicitPatch !== '' ? { profilePatch: explicitPatch } : {});

console.log('=== 重放受管区块 ===');
console.log(`  DSH_HOME=${resolveDshHome()}`);
console.log(`  存储根=${store.paths.root}`);
console.log(`  applied=${JSON.stringify(appliedIds)}`);
for (const row of rows) {
  const ids = row.config.plugins.map((item) => item.id);
  console.log(`  ${row.rowId}：${ids.length} 行 → ${ids.join(' / ')}`);
}
if (profilePatch === '') {
  console.error('  ✗ 无法安全确定要注入哪个 profile 的 cordis.patch.yml；请用 --patch <profile 目录或文件> 指定。');
  process.exit(1);
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
