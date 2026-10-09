#!/usr/bin/env node
/**
 * 候选预设的离线硬校验（不写盘、不联网）。
 *
 * 直接调用 host 半的真实模块，把「保存 → 渲染声明」这条链在内存里跑一遍：
 *   1) normalizePresetDefinition（validate.js）—— 形状/取值是否会被 400 拒绝；
 *   2) renderPrompt（declarations.js）—— 渲染后的提示词里还有没有未消费的占位；
 *   3) buildPresetRow + renderPatchDocument —— 生成的声明行与 YAML 是否可用。
 *
 * 用法：node scripts/validate-preset-draft.mjs <candidate.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePresetDefinition } from '../src/host/validate.js';
import { buildPresetRow, renderPatchDocument, renderPrompt, scanPlaceholders } from '../src/host/declarations.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];
if (!target) {
  console.error('用法：node scripts/validate-preset-draft.mjs <candidate.json>');
  process.exit(2);
}

const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

const raw = JSON.parse(fs.readFileSync(path.resolve(here, '..', target), 'utf8'));

/* 1) 形状与取值 ---------------------------------------------------------- */
let definition = null;
try {
  definition = normalizePresetDefinition(raw);
  notes.push(`normalizePresetDefinition 通过：id=${definition.id} order=${definition.order} params=${definition.params.length} plugins=${definition.plugins ? definition.plugins.length : '(无此字段)'}`);
} catch (error) {
  fail(`normalizePresetDefinition 抛错：${error && error.message ? error.message : String(error)}`);
}

if (definition) {
  /* 2) 提示词渲染 -------------------------------------------------------- */
  const rendered = renderPrompt(definition.prompt, {}, definition.params);
  const leftovers = scanPlaceholders(rendered);
  if (leftovers.length > 0) fail(`渲染后仍有未消费占位：${leftovers.join(', ')}（检查 params 里是否缺这些 name）`);
  else notes.push('renderPrompt 渲染后无残留占位');

  const declared = new Set(definition.params.map((item) => item.name));
  const used = new Set(scanPlaceholders(definition.prompt));
  for (const name of used) if (!declared.has(name)) fail(`提示词引用了未声明的参数 {{ $${name} }}`);
  for (const name of declared) if (!used.has(name)) fail(`参数 ${name} 已声明但提示词从未消费它`);
  const badName = definition.params.map((item) => item.name).filter((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
  if (badName.length > 0) fail(`参数名非法：${badName.join(', ')}`);

  /* 3) 表单 rule 与参数必须一一对应 -------------------------------------- */
  const rule = (definition.form && Array.isArray(definition.form.rule)) ? definition.form.rule : [];
  const ruleFields = rule.filter((item) => item && item.type !== 'divider' && item.type !== 'title' && item.type !== 'prompt-preview').map((item) => item.field);
  for (const name of declared) if (!ruleFields.includes(name)) fail(`参数 ${name} 在 form.rule 里没有对应控件`);
  for (const field of ruleFields) if (!declared.has(field)) fail(`form.rule 的字段 ${field} 没有对应的 ParamSpec`);
  notes.push(`form.rule 共 ${rule.length} 项，其中控件 ${ruleFields.length} 个`);

  /* 4) 声明行 ------------------------------------------------------------ */
  const row = buildPresetRow(definition, {}, { mcp: [], skills: [] }, { override: false });
  const ids = row.config.plugins.map((item) => item.id);
  const dup = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (dup.length > 0) fail(`生成的行 id 重复：${[...new Set(dup)].join(', ')}`);
  if (row.rowId !== `preset-${definition.id}`) fail(`loader row id 约定不符：${row.rowId}`);

  const fsProviders = row.config.plugins.filter((item) => item.name === '@deepseek-ai/dsh-skill-filesystem');
  if (fsProviders.length > 1) fail(`@deepseek-ai/dsh-skill-filesystem 出现 ${fsProviders.length} 行；skill provider 按名唯一，第二行会让整棵预设子树激活失败`);
  if (ids[0] !== 'persona') fail(`第一行不是 persona，而是 ${ids[0]}`);

  // 必备能力覆盖：没有这些行，agent 在 Web profile 里没有任何工具
  const REQUIRED = {
    '读文件/写文件': ['@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-fs-search'],
    '执行 shell': ['@deepseek-ai/dsh-tool-pwsh', '@deepseek-ai/dsh-tool-bash'],
    '联网搜索与抓取': ['@deepseek-ai/dsh-tool-web'],
    '加载技能': ['@deepseek-ai/dsh-skill-filesystem', '@deepseek-ai/dsh-tool-skill'],
    '交付物卡片': ['@deepseek-ai/dsh-tool-present'],
    '待办清单': ['@deepseek-ai/dsh-tool-todo'],
  };
  const names = new Set(row.config.plugins.map((item) => item.name));
  for (const [label, group] of Object.entries(REQUIRED)) {
    if (!group.some((name) => names.has(name))) fail(`缺少「${label}」能力：${group.join(' 或 ')} 一行都没有`);
  }
  // 反向：web profile 已把 host 平面整体 disabled，未被 presets 使用的 agent 平面行不在这里判定

  const yamlSource = renderPatchDocument([row]);
  if (!yamlSource.includes(`id: preset-${definition.id}`)) fail('生成的 YAML 里找不到声明行');
  if (!yamlSource.includes('plugins:')) fail('生成的 YAML 里找不到 plugins 段');
  if (/\t/.test(yamlSource)) fail('生成的 YAML 含制表符（块标量缩进会出错）');

  // 平台条件：必须是真正的 `!!js` 标量。写成普通字符串会被 Loader 的
  // Boolean('...') 判成 true 而静默停用该行 —— 这是本项目里最容易踩的坑。
  const markers = [];
  const collectMarkers = (value, path) => {
    if (Array.isArray(value)) return value.forEach((item, index) => collectMarkers(item, `${path}[${index}]`));
    if (value && typeof value === 'object') {
      if (Object.keys(value).length === 1 && typeof value.__jsExpr === 'string') { markers.push(`${path}=${value.__jsExpr}`); return; }
      for (const key of Object.keys(value)) collectMarkers(value[key], `${path}.${key}`);
    }
  };
  collectMarkers(definition.plugins || [], 'plugins');
  if (markers.length === 0) fail('没有任何 !!js 表达式标记；平台条件会退化成普通字符串（Loader 恒判真 → 静默停用）');
  for (const marker of markers) {
    const expr = marker.split('=').slice(1).join('=');
    if (!yamlSource.includes(`!!js "${expr}"`)) fail(`表达式标记未按 !!js 标量发射：${marker}`);
  }
  // 反向：归一化之后不允许再有「裸字符串当 disabled」的形态。
  // 归一化器会把字符串升格成 {__jsExpr}，所以这里查的是**升格后**的结果 ——
  // 一旦发现字符串，说明升格逻辑被绕过或退化，落盘就会是静默停用。
  const bareDisabled = (definition.plugins || []).filter((item) => typeof item.disabled === 'string');
  if (bareDisabled.length > 0) fail(`plugins 里有 ${bareDisabled.length} 行 disabled 没被升格成表达式标记：${bareDisabled.map((item) => item.id).join(', ')}（Loader 会按 Boolean('...') 恒判真 → 静默停用）`);
  // 正向：声明文件里绝不允许出现普通字符串形态的 disabled
  const bareInYaml = /\n\s+disabled: ['"]/.test(yamlSource);
  if (bareInYaml) fail('生成的 YAML 里出现了普通字符串 disabled（应为 !!js 标量）');
  notes.push(`!!js 表达式 ${markers.length} 处，均按 !!js 标量发射：${markers.join(' | ')}`);
}

console.log('=== 候选预设离线校验 ===');
for (const note of notes) console.log('  · ' + note);
if (failures.length === 0) {
  console.log('\n结果：通过（0 个问题）');
  process.exit(0);
}
console.log(`\n结果：失败（${failures.length} 个问题）`);
for (const item of failures) console.log('  ✗ ' + item);
process.exit(1);
