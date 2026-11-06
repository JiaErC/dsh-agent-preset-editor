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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizePresetDefinition, normalizePlugins, isJsExprMarker, RESERVED_PARAM_NAMES } from '../src/host/validate.js';
import { buildPresetRow, renderPatchDocument, toYaml, resolvePreset, resolveProfilePatchFile } from '../src/host/declarations.js';
import { flattenRows, groupServicePlugins } from '../src/host/plugin-template.js';

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

/* 6. 内置插件清单的提取（拍平）--------------------------------------------- */
// 「预设该带的插件行」是从 dsh 自带的 bundle patch 里读的，而 patch 会把行裹在
// `insert:` 块或 cordis:group 的 config 数组里 —— 拍平这一步漏掉一层，提取结果就是
// 空的（第一版原型正是这么失败的：得到 0 行）。这里锁住拍平本身。
check('flattenRows 会下降进 insert 块', () => {
  const rows = flattenRows([
    { insert: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
    { id: 'c', name: 'C' },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b', 'c']);
});

check('flattenRows 会下降进 cordis:group 的 config 数组', () => {
  const rows = flattenRows([
    { id: 'planning', name: 'cordis:group', group: true, config: [{ id: 'plan-mode', name: 'P' }] },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['plan-mode']);
});

check('flattenRows 递归到底，并跳过没有 id 的节点', () => {
  const rows = flattenRows([
    { insert: [{ id: 'outer', name: 'O', config: [{ insert: [{ id: 'deep', name: 'D' }] }] }] },
    { name: '没有 id', config: { not: 'an array' } },
    null,
    'not an object',
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['deep']);
});

check('flattenRows 对非数组输入返回空数组', () => {
  assert.deepEqual(flattenRows(undefined), []);
  assert.deepEqual(flattenRows(null), []);
  assert.deepEqual(flattenRows({ id: 'x' }), []);
});

/* 7. 注册 service 的插件必须被 isolate -------------------------------- */
// 这一段是线上事故的还原：把 agent 平面拍平后直接当 plugins 用，四个 service 就注册到
// 共享 scope，激活时报 “service \"planMode\" has been registered …”，整个预设选不中。
// groupServicePlugins 负责把它们收回 isolate 组 —— 少做这一步，预设就是坏的。
check('groupServicePlugins 把四个 service 收进三个 isolate 组', () => {
  const flat = [
    { id: 'persona', name: '@deepseek-ai/dsh-persona' },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode' },
    { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
    { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
    { id: 'tool-result-pruner', name: '@deepseek-ai/dsh-compaction-tool-result-pruner' },
    { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc' },
    { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow' },
    { id: 'mcp-docx', name: '@deepseek-ai/dsh-mcp-client' },
  ];
  const out = groupServicePlugins(flat);
  // 非 service 行原样保留且顺序不变
  assert.deepEqual(out.filter((r) => !r.group).map((r) => r.id), ['persona', 'tool-fs', 'mcp-docx']);
  const groups = out.filter((r) => r.group === true);
  assert.deepEqual(groups.map((g) => g.id), ['planning', 'compaction', 'delegation']);
  // isolate 键必须覆盖对应 service
  assert.deepEqual(groups[0].isolate, { planMode: true });
  assert.deepEqual(groups[1].isolate, { compaction: true, toolResultPruner: true });
  assert.deepEqual(groups[2].isolate, { workflowEngine: true });
  // 组内成员正确
  assert.deepEqual(groups[0].config.map((r) => r.id), ['plan-mode']);
  assert.deepEqual(groups[1].config.map((r) => r.id), ['compaction-basic', 'command-compact', 'tool-result-pruner']);
  assert.deepEqual(groups[2].config.map((r) => r.id), ['workflow-ptc', 'tool-workflow']);
});

check('groupServicePlugins 的结果能被 normalizePlugins 接受', () => {
  const out = groupServicePlugins([
    { id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', config: { section: 'x' } },
  ]);
  // 组行的 config 是嵌套数组，normalizePlugins 认得；同时必需 config 校验要能钻进去
  assert.equal(normalizePlugins(out).length, 1);
});

check('groupServicePlugins 在没有 service 插件时不造空组', () => {
  const out = groupServicePlugins([{ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }]);
  assert.equal(out.length, 1);
  assert.ok(!out.some((r) => r.group === true));
});

check('groupServicePlugins 不覆盖调用方已有的同名组', () => {
  const out = groupServicePlugins([
    { id: 'planning', name: 'cordis:group', group: true, isolate: { planMode: true }, config: [] },
    { id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode' },
  ]);
  const planning = out.filter((r) => r.id === 'planning');
  assert.equal(planning.length, 1, '同名组只能有一个');
});

check('groupServicePlugins 对空输入返回空数组', () => {
  assert.deepEqual(groupServicePlugins(undefined), []);
  assert.deepEqual(groupServicePlugins([]), []);
});

/* 8. 子预设：继承 MCP / Skills / plugins 与「可继承提示词」------------------- */
// 继承是**运行时合并**，子预设从不缓存父的内容 —— 这样父改了这些，子预设的声明
// 下次渲染就自动跟随，不需要任何同步动作。下面几条把合并规则与那个「先渲染再注入」
// 的顺序都钉住。
{
  const parent = {
    id: 'p1', name: '父', prompt: '父自己的提示词',
    sharedPrompt: '共享段：{{ $tone }}',
    params: [{ name: 'tone', type: 'text', default: '正式' }],
    mcp: ['docx', 'excel'], skills: ['docx-skill'],
    plugins: [{ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }],
  }
  const child = {
    id: 'c1', parentId: 'p1', name: '子',
    prompt: '子。继承：{{ $parent }}。自有：{{ $mine }}',
    params: [{ name: 'mine', type: 'text', default: 'X' }],
    mcp: ['excel', 'playwright'], skills: ['my-skill'],
    plugins: [{ id: 'tool-fs', name: 'CHILD-OVERRIDE' }, { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web' }],
  }
  const bags = { p1: { tone: '轻松' }, c1: { mine: 'Y' } }
  const r = resolvePreset(child, [parent, child], bags)

  check('父的 MCP 在前，子的追加，重复的被去掉',
    () => assert.deepEqual(r.definition.mcp, ['docx', 'excel', 'playwright']))
  check('Skills 同样合并',
    () => assert.deepEqual(r.definition.skills, ['docx-skill', 'my-skill']))
  check('plugins 按 id 去重且父的优先（子不能覆盖父挂载的）',
    () => assert.equal(r.definition.plugins[0].name, '@deepseek-ai/dsh-tool-fs'))
  check('子里独有的 plugin 行仍然保留',
    () => assert.ok(r.definition.plugins.some((p) => p.id === 'tool-web')))

  check('父的 sharedPrompt 用父自己的参数渲染后注入为 $parent',
    () => assert.equal(r.values.parent, '共享段：轻松'))
  check('子自己的取值不受影响', () => assert.equal(r.values.mine, 'Y'))

  const row = buildPresetRow(r.definition, r.values, { mcp: [], skills: [] }, {})
  check('最终提示词含渲染后的父文本', () => assert.ok(row.config.plugins[0].config.prefix.includes('共享段：轻松')))
  check('最终提示词不含未替换的 $parent 占位',
    () => assert.ok(!row.config.plugins[0].config.prefix.includes('{{ $parent }}')))

  const orphan = resolvePreset(child, [child], bags)
  check('父不存在时不抛错，退回顶层并报告 missingParent', () => {
    assert.equal(orphan.parent, null)
    assert.equal(orphan.missingParent, 'p1')
  })
  check('断链时不会凭空注入 parent 值', () => assert.equal(orphan.values.parent, undefined))

  const noShared = resolvePreset(child, [{ ...parent, sharedPrompt: undefined }, child], bags)
  check('父没写可继承提示词时不注入空串（否则会误以为继承失效）',
    () => assert.equal(noShared.values.parent, undefined))

  const solo = resolvePreset({ id: 'top', name: '顶层', prompt: 'x', mcp: ['a'], skills: [] }, [], {})
  check('顶层预设原样返回', () => {
    assert.equal(solo.parent, null)
    assert.equal(solo.values.parent, undefined)
  })
}

check('parent 是保留参数名，用户不能定义', () => {
  assert.deepEqual(RESERVED_PARAM_NAMES, ['parent'])
  assert.throws(() => normalizePresetDefinition({ id: 'x', name: 'x', params: [{ name: 'parent', type: 'text' }] }), /保留字/)
})

check('parentId / sharedPrompt 空串不落字段，顶层预设形状不变', () => {
  const top = normalizePresetDefinition({ id: 'x', name: 'x', parentId: '', sharedPrompt: '' })
  assert.equal(top.parentId, undefined)
  assert.equal(top.sharedPrompt, undefined)
  const child = normalizePresetDefinition({ id: 'y', name: 'y', parentId: 'p1', sharedPrompt: '共享' })
  assert.equal(child.parentId, 'p1')
  assert.equal(child.sharedPrompt, '共享')
})

/* 9. profile patch 的归属解析 ---------------------------------------------- */
// 真机事故：隔离验证 profile（config.root 指向测试根）没有显式 profilePatch，
// 旧实现靠 mtime 猜到了用户的 web profile，把 e2e 测试预设写进用户的受管区块，
// 真实预设整块丢失。下面锁死「运行中用 profileContext 精确解析」「隔离根宁可
// 不写也不猜」「默认根优先已有受管区块的 profile」三条规则。

/** 在临时 DSH_HOME 里跑一段测试，结束后恢复环境变量并删目录。 */
function withTempDshHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-profile-patch-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  try {
    return fn(dir);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 造一个 profile 目录；返回它的 cordis.patch.yml 路径。 */
function writeProfile(home, name, options = {}) {
  const dir = path.join(home, 'profiles', name);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { name: 'profile-' + name, dependencies: {} };
  if (options.owns !== false) manifest.dependencies['dsh-agent-preset-editor'] = 'link:x';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  const patchFile = path.join(dir, 'cordis.patch.yml');
  const source = options.patch === undefined ? '[]\n' : options.patch;
  fs.writeFileSync(patchFile, source);
  if (options.mtime !== undefined) {
    const when = new Date(options.mtime);
    fs.utimesSync(patchFile, when, when);
  }
  return patchFile;
}

/** 一个只有 profileContext.patchPath 的假 host 上下文。 */
const contextWithPatch = (patchPath) => ({ get: (name) => (name === 'profileContext' ? { patchPath } : undefined) });

check('显式 config.profilePatch 优先于 profileContext', () => {
  withTempDshHome((home) => {
    const explicit = writeProfile(home, 'explicit');
    const fromCtx = writeProfile(home, 'ctx');
    assert.equal(
      resolveProfilePatchFile({ profilePatch: explicit }, contextWithPatch(fromCtx)),
      explicit,
    );
  });
});

check('运行中按 profileContext.patchPath 精确解析，不猜 mtime', () => {
  withTempDshHome((home) => {
    // web 的 patch 更新 —— 旧实现会选中它；正解是上下文里那个 profile。
    writeProfile(home, 'web', { patch: '[]\n', mtime: 2000000000000 });
    const mine = writeProfile(home, 'ape-verify', { patch: '[]\n', mtime: 1000000000000 });
    assert.equal(resolveProfilePatchFile({ root: path.join(home, 'verify-store') }, contextWithPatch(mine)), mine);
  });
});

check('隔离根 + 无上下文：只认 patch 里声明了同一 root 的 profile', () => {
  withTempDshHome((home) => {
    const storeRoot = path.join(home, 'agent-preset-editor-verify');
    writeProfile(home, 'web', {
      patch: '# >>> dsh-agent-preset-editor BEGIN\n[]\n# <<< dsh-agent-preset-editor END\n',
      mtime: 2000000000000,
    });
    const verifyPatch = writeProfile(home, 'ape-verify', {
      patch: `- id: agent-preset-editor\n  name: dsh-agent-preset-editor\n  config:\n    root: '${storeRoot.replace(/'/g, "''")}'\n`,
    });
    assert.equal(resolveProfilePatchFile({ root: storeRoot }), verifyPatch);
  });
});

check('隔离根 + 无上下文 + 找不到主人：返回空串（宁可不写，不写错 profile）', () => {
  withTempDshHome((home) => {
    writeProfile(home, 'web', { patch: '[]\n' });
    writeProfile(home, 'other', { patch: '[]\n' });
    assert.equal(resolveProfilePatchFile({ root: path.join(home, 'nowhere') }), '');
  });
});

check('默认根 + 无上下文：优先已经有受管区块的 profile，而不是最近改动的', () => {
  withTempDshHome((home) => {
    writeProfile(home, 'recent-but-unmanaged', { patch: '[]\n', mtime: 2000000000000 });
    const managed = writeProfile(home, 'web', {
      patch: '# >>> dsh-agent-preset-editor BEGIN\n[]\n# <<< dsh-agent-preset-editor END\n',
      mtime: 1000000000000,
    });
    assert.equal(resolveProfilePatchFile({}), managed);
  });
});

check('profileContext 读取抛错时退回启发式而不是崩掉', () => {
  withTempDshHome((home) => {
    const managed = writeProfile(home, 'web', {
      patch: '# >>> dsh-agent-preset-editor BEGIN\n[]\n# <<< dsh-agent-preset-editor END\n',
    });
    const angryCtx = { get: () => { throw new Error('cannot get property "profileContext" without inject'); } };
    assert.equal(resolveProfilePatchFile({}, angryCtx), managed);
  });
});

console.log(`\n${process.exitCode ? '失败' : '通过'}：${passed} 项`);
