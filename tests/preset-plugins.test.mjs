#!/usr/bin/env node
/**
 * 回归测试：预设自带插件行的渲染（重点在 `!!js` 表达式标记）。
 *
 * 覆盖三个曾经踩过的坑：
 *  1. `{ __jsExpr: "..." }` 必须渲染成 `!!js "..."` 标量，而不是嵌套映射；
 *  2. `disabled` 写成普通字符串会被 Loader 的 Boolean('...') 判成 true（静默停用该行），
 *     所以必须被 validate.js 的归一化器原样保留为标记 —— 这里只锁渲染行为；
 *  3. `cordis:group` 行的 config 是嵌套条目数组，不能被当成「config 必须是对象」拒绝。
 *
 * 用法：node tests/preset-plugins.test.mjs
 */

import assert from 'node:assert/strict';

import { normalizePresetDefinition, normalizePlugins, isJsExprMarker } from '../src/host/validate.js';
import { buildPresetRow, renderPatchDocument, toYaml } from '../src/host/declarations.js';

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error && error.message ? error.message : String(error)}`);
    process.exitCode = 1;
  }
};

console.log('preset plugins 回归测试');

/* 1. 表达式标记的识别与渲染 ------------------------------------------------ */
check('isJsExprMarker 只认单个 __jsExpr 字符串键', () => {
  assert.equal(isJsExprMarker({ __jsExpr: 'a' }), true);
  assert.equal(isJsExprMarker({ __jsExpr: 'a', extra: 1 }), false);
  assert.equal(isJsExprMarker({ __jsExpr: 1 }), false);
  assert.equal(isJsExprMarker('a'), false);
  assert.equal(isJsExprMarker(null), false);
});

check('toYaml 把表达式标记渲染成 !!js 标量（顶层）', () => {
  assert.equal(toYaml({ disabled: { __jsExpr: "process.platform === 'win32'" } }).trim(),
    `disabled: !!js "process.platform === 'win32'"`);
});

check('toYaml 在数组里也渲染成 !!js 标量，而不是紧凑块序列', () => {
  assert.equal(toYaml([{ __jsExpr: 'a' }]).trim(), '- !!js "a"');
});

check('表达式里的双引号与换行被转义，YAML 结构不被破坏', () => {
  const yaml = toYaml({ disabled: { __jsExpr: 'a "b"\nc' } }).trim();
  assert.match(yaml, /^disabled: !!js "/);
  assert.ok(!yaml.includes('\n'), '标量内不能出现裸换行');
});

/* 2. 归一化 ------------------------------------------------------------------ */
check('normalizePlugins 保留布尔 disabled，并把字符串升格为表达式标记', () => {
  const rows = normalizePlugins([
    { id: 'a', name: 'x', disabled: true },
    { id: 'b', name: 'x', disabled: "process.platform === 'win32'" },
    { id: 'c', name: 'x', disabled: { __jsExpr: 'p' } },
  ]);
  assert.equal(rows[0].disabled, true);
  // 字符串必须升格：原样留着会被 Loader 的 Boolean('...') 判成 true、全平台静默停用
  assert.deepEqual(rows[1].disabled, { __jsExpr: "process.platform === 'win32'" });
  assert.deepEqual(rows[2].disabled, { __jsExpr: 'p' });
});

check('字符串 disabled 走完整链路后也发射成 !!js 标量', () => {
  const def = normalizePresetDefinition({
    id: 'demo2', name: 'D', prompt: 'x',
    plugins: [{ id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: "process.platform !== 'win32'" }],
  });
  const yaml = renderPatchDocument([buildPresetRow(def, {}, { mcp: [], skills: [] }, {})]);
  assert.ok(yaml.includes(`!!js "process.platform !== 'win32'"`), '字符串没有被升格成表达式');
  assert.ok(!yaml.includes("disabled: 'process.platform"), '表达式被当成普通字符串发射了');
});

check('normalizePlugins 允许 cordis:group 的数组 config', () => {
  const rows = normalizePlugins([
    { id: 'g', name: 'cordis:group', group: true, config: [{ id: 'child', name: 'y' }] },
  ]);
  assert.equal(rows[0].group, true);
  assert.equal(rows[0].config.length, 1);
});

check('normalizePlugins 拒绝普通行的数组 config、重复 id、空 name', () => {
  assert.throws(() => normalizePlugins([{ id: 'a', name: 'x', config: [] }]), /config 必须是 JSON 对象/);
  assert.throws(() => normalizePlugins([{ id: 'a', name: 'x' }, { id: 'a', name: 'y' }]), /重复/);
  assert.throws(() => normalizePlugins([{ id: 'a', name: '' }]), /name 不能为空/);
});

check('normalizePresetDefinition：不带 plugins 时不产出该键（避免清空已存清单）', () => {
  const without = normalizePresetDefinition({ id: 'p', name: 'P' });
  assert.equal('plugins' in without, false);
  const withRows = normalizePresetDefinition({ id: 'p', name: 'P', plugins: [] });
  assert.deepEqual(withRows.plugins, []);
});

/* 3. 声明行 --------------------------------------------------------------- */
const definition = normalizePresetDefinition({
  id: 'demo',
  name: 'Demo',
  order: 7,
  prompt: 'hello {{ $who }}',
  params: [{ name: 'who', label: 'Who', type: 'text', default: 'world' }],
  plugins: [
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: { __jsExpr: "process.platform !== 'win32'" } },
  ],
});

check('persona 永远第一，自带行紧随其后', () => {
  const row = buildPresetRow(definition, {}, { mcp: [], skills: [] }, {});
  assert.deepEqual(row.config.plugins.map((item) => item.id), ['persona', 'tool-fs', 'tool-pwsh']);
  assert.equal(row.config.plugins[0].config.prefix, 'hello world');
  assert.equal(row.rowId, 'preset-demo');
});

check('声明行 YAML 里出现 !!js 标量', () => {
  const row = buildPresetRow(definition, {}, { mcp: [], skills: [] }, {});
  const yaml = renderPatchDocument([row]);
  assert.ok(yaml.includes(`!!js "process.platform !== 'win32'"`), '缺少 !!js 标量');
  assert.ok(!/disabled:\n\s+__jsExpr/.test(yaml), '表达式被渲染成了嵌套映射');
});

check('skill-filesystem 与 persona 不会被自带行重复挂载', () => {
  // 注意两层引用：definition.skills 是**目录项 id**，catalogs.skills 才是目录本体。
  // 只给 catalogs 不给 definition.skills，循环根本不会执行（这正是本测试第一版写错的地方）。
  const withSkill = normalizePresetDefinition({
    id: 'demo', name: 'Demo', order: 7, prompt: 'hello {{ $who }}',
    params: [{ name: 'who', label: 'Who', type: 'text', default: 'world' }],
    plugins: [
      { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
      { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: { __jsExpr: "process.platform !== 'win32'" } },
    ],
    skills: ['docx'],
  });
  const row = buildPresetRow(
    withSkill,
    {},
    { mcp: [], skills: [{ id: 'docx', name: 'docx', enabled: true, source: 'path', path: 'X:/skills/docx' }] },
    { store: { skillDir: () => 'X:/inline' } },
  );
  // options.store 只用于 inline Skill 目录；传错位置不会报错，只会让 skillDirOf 崩掉。
  const names = row.config.plugins.map((item) => item.name);
  assert.deepEqual(names, [
    '@deepseek-ai/dsh-persona',
    '@deepseek-ai/dsh-tool-fs',
    '@deepseek-ai/dsh-tool-pwsh',
    '@deepseek-ai/dsh-skill-filesystem',
  ]);
  const fsRows = row.config.plugins.filter((item) => item.name === '@deepseek-ai/dsh-skill-filesystem');
  assert.equal(fsRows.length, 1);
  assert.deepEqual(fsRows[0].config.customSkillDirs, ['X:/skills/docx']);
});

check('没有引用 Skill 时不生成 skill-filesystem 行', () => {
  const row = buildPresetRow(definition, {}, { mcp: [], skills: [] }, {});
  assert.ok(!row.config.plugins.some((item) => item.name === '@deepseek-ai/dsh-skill-filesystem'));
});

/* 5. 必需 config 校验（plan-mode 的 section）-------------------------------- */
// 用户实测踩到的坑：手抄内置插件清单时漏掉 plan-mode 的 config.section，
// 保存与发布都不报错，只在 profile boot 时让 preset-<id> 变成坏行 ——
// DSH 里看得到这个预设却选不中。所以校验必须前移到 normalizePlugins。
check('缺 section 的 plan-mode 被拒绝（顶层）', () => {
  assert.throws(
    () => normalizePlugins([{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode' }]),
    /section/,
  );
});

check('缺 section 的 plan-mode 被拒绝（藏在 cordis:group 的 config 里）', () => {
  assert.throws(() => normalizePlugins([{
    id: 'planning',
    name: 'cordis:group',
    group: true,
    isolate: { planMode: true },
    config: [{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode' }],
  }]), /section/);
});

check('section 为空串或纯空白同样被拒绝', () => {
  for (const bad of ['', '   ']) {
    assert.throws(
      () => normalizePlugins([{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', config: { section: bad } }]),
      /section/,
    );
  }
});

check('带 section 的 plan-mode 正常通过，无关插件不受影响', () => {
  const withSection = normalizePlugins([{
    id: 'planning',
    name: 'cordis:group',
    group: true,
    isolate: { planMode: true },
    config: [{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', config: { section: 'You are in plan mode.' } }],
  }]);
  assert.equal(withSection.length, 1);
  assert.equal(normalizePlugins([{ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }]).length, 1);
  assert.deepEqual(normalizePlugins(undefined), []);
});

console.log(`\n${process.exitCode ? '失败' : '通过'}：${passed} 项`);
