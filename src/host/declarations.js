/* ------------------------------------------------------------------ *
 * 预设 → DSH 声明行的渲染与同步。
 *
 * 一座桥的两端：
 *   1) 渲染：PresetDefinition + 当前 ParamValues + 被引用的 MCP/Skill 目录项
 *      → 一行 `@deepseek-ai/dsh-agent-preset` 声明（CONTRACT §2.1 的 plugins）
 *      → 一段合法 YAML（自研发射器，不引任何 npm 包）。
 *   2) 同步：把渲染结果写进 <root>/presets.patch.yml，再注入 profile 的
 *      cordis.patch.yml 里的受管标记区块；块外内容逐字不动，改写前先备份。
 *
 * 为什么是「patch 写入」而不是热应用：profile 的 cordis.patch.yml 只在
 * profile boot 时被合并（见 @deepseek-ai/dsh 的 profile-boot），所以新声明
 * 要等下一次启动才生效；写入是确定性的、可回滚的、跨重启一致的。
 * 真正的动态行 API 是 ctx.loader.create/update，但它有副作用
 * （EntryTree.write() 会把运行中的整棵树持久化回 profile 的生成文件
 * cordis.yml，可能覆盖用户配置），且 create() 无法指定 `preset-<id>` 这个
 * 约定 id。因此热应用只在显式打开 config.hotApply 时尝试一次，失败静默
 * 回退到 patch 模式（见 tryHotApplyLoader）。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';

import { backupFile, hasExplicitStoreRoot, resolveDshHome, resolveStoreRoot, writeFileAtomic } from './store.js';

/** §1.6 路由前缀（index.js 也用它注册）。 */
export const API_PREFIX = '/agent-preset-editor/api';

/** 声明行的插件名（= @deepseek-ai/dsh-agent-preset 的 loader row name）。 */
export const DECLARATION_PLUGIN = '@deepseek-ai/dsh-agent-preset';
/** 提示词落点：composition persona 的 prefix。 */
export const PERSONA_PLUGIN = '@deepseek-ai/dsh-persona';
/** MCP 桥。 */
export const MCP_CLIENT_PLUGIN = '@deepseek-ai/dsh-mcp-client';
/** Skill 提供方。 */
export const SKILL_FS_PLUGIN = '@deepseek-ai/dsh-skill-filesystem';

/**
 * 一个预设里 Skill 行的固定 id（同一预设最多一行）。
 *
 * `@deepseek-ai/dsh-skill-filesystem` 的 `providerName` 默认就是 `"filesystem"`，
 * 而 `@deepseek-ai/dsh-skill` 的 provider 表按名唯一、撞名即抛
 * `a skill provider named "filesystem" is already registered in this scope`。
 * 所以逐 Skill 一行必然让第二个行激活失败、整个预设子树起不来。一个 provider
 * 本身就能扫多个根，因此所有 Skill 目录合并进这一行 —— 详见 buildPresetRow。
 */
const SKILL_FS_ROW_ID = 'skill-filesystem';

/**
 * Skill 目录去重用的比较键（只用于比较，不写进声明行）。
 *
 * 同一物理目录会有两种字面写法：inline 源的目录由 `path.join` 拼出（Windows 上是
 * 反斜杠），path 源的目录是用户填的字符串（常见正斜杠）。拿原字符串比较会漏掉这种
 * 「同目录不同写法」，provider 便把同一个根扫两遍。这里只做词法归一 —— 统一分隔符
 * 方向、去掉结尾分隔符 —— 不解析符号链接、也不改大小写。
 */
const skillDirKey = (dir) => String(dir).replace(/[\\/]+/g, '/').replace(/\/+$/, '');

/** profile 里受管区块的边界标记。 */
export const BLOCK_BEGIN = '# >>> dsh-agent-preset-editor BEGIN';
export const BLOCK_END = '# <<< dsh-agent-preset-editor END';

/** 声明行的 loader row id 约定。 */
export const LOADER_ROW_PREFIX = 'preset-';

/** DSH 随包发布的预设 id：没有 loader 服务时用它兜底判断「这是内置预设，要覆盖不要插入」。 */
const SHIPPED_PRESET_IDS = new Set(['standard', 'ptc', 'minimal', 'cordis']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* ============================ 提示词渲染 ============================ */

/** §2.5 占位正则：`{{ $name }}`，允许内部空格。 */
const PLACEHOLDER_SOURCE = '\\{\\{\\s*\\$([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}';

/** 取值 → 渲染字符串：数组用「、」连接，布尔 → 是/否。 */
export function stringifyValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyValue(item))
      .filter((text) => text !== '')
      .join('、');
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value === null || value === undefined) return '';
  return String(value);
}

/** 「没设过」：缺失、null、空串、空数组。false 与 0 都算「设过」。 */
function isBlank(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * §2.5 的渲染规则：值优先，缺失或空则用参数默认值，再无则替换为空串。
 * client 半在 70-shell.js 里有一份等价实现（两边各自持有，不共享文件：
 * host 是 ESM，client 是拼接片段）。
 * @param {string} prompt - 提示词模板。
 * @param {object} values - ParamValues.values。
 * @param {Array} params - ParamSpec[]。
 * @returns {string} 渲染后的提示词。
 */
export function renderPrompt(prompt, values, params) {
  const template = typeof prompt === 'string' ? prompt : '';
  const bag = isPlainObject(values) ? values : {};
  const specByName = new Map();
  if (Array.isArray(params)) {
    for (const spec of params) {
      if (isPlainObject(spec) && typeof spec.name === 'string') specByName.set(spec.name, spec);
    }
  }
  return template.replace(new RegExp(PLACEHOLDER_SOURCE, 'g'), (match, name) => {
    let value = bag[name];
    if (isBlank(value)) {
      const spec = specByName.get(name);
      value = spec ? spec.default : undefined;
    }
    if (isBlank(value)) return '';
    return stringifyValue(value);
  });
}

/** 正文里出现过的占位名（保序、去重），供 UI 做「未定义参数」告警。 */
export function scanPlaceholders(prompt) {
  const found = [];
  const seen = new Set();
  const regex = new RegExp(PLACEHOLDER_SOURCE, 'g');
  let match = regex.exec(typeof prompt === 'string' ? prompt : '');
  while (match !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      found.push(match[1]);
    }
    match = regex.exec(typeof prompt === 'string' ? prompt : '');
  }
  return found;
}

/* ============================ YAML 发射器 ============================
 * 只覆盖我们自己的数据形态：对象 / 数组 / 字符串 / 数字 / 布尔 / null。
 * 保守策略 —— 拿不准就用引号，宁可难看也不能让 profile 解析失败。
 * ================================================================== */

const PAD = (indent) => ' '.repeat(indent);

/** 出现在 plain 标量里就必须加引号的字符。保守到「有冒号就加引号」。 */
const PLAIN_UNSAFE_CHARS = /["'\\:#,{}[\]&*!|>%@`\t]/;
/** plain 标量不能以这些指示符开头。 */
const PLAIN_UNSAFE_START = /^[-?:,[\]{}#&*!|>'"%@` ]/;
/** 会被解析成布尔/null 的字面量。 */
const PLAIN_RESERVED = /^(?:true|false|yes|no|on|off|null|~)$/i;
/** 会被解析成数字的字面量。 */
const PLAIN_NUMBER = /^[-+]?(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][-+]?\d+)?$|^[-+]?\.(?:inf|nan)$/i;

function plainSafe(text) {
  if (text === '') return false;
  if (PLAIN_UNSAFE_CHARS.test(text)) return false;
  if (PLAIN_UNSAFE_START.test(text)) return false;
  if (/^\s|\s$/.test(text)) return false;
  if (PLAIN_RESERVED.test(text)) return false;
  if (PLAIN_NUMBER.test(text)) return false;
  return true;
}

/** 双引号标量：唯一能安全承载换行与控制字符的形态。 */
function doubleQuoted(text) {
  const escaped = String(text)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `"${escaped}"`;
}

/** 单引号标量：内部除 `'`→`''` 外全是字面量（反斜杠也字面）。 */
function singleQuoted(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

/** 一行内的标量。 */
function inlineScalar(value) {
  if (typeof value === 'string') {
    if (plainSafe(value)) return value;
    if (value.includes('\n') || value.includes('\r')) return doubleQuoted(value);
    return singleQuoted(value);
  }
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  return singleQuoted(String(value));
}

/**
 * `!!js` 表达式标量。
 *
 * profile 的条目列表方言把 `!!js` 注册成标量 tag（见 dsh-app-boot 的 JsExpr：
 * `new yaml.Type("tag:yaml.org,2002:js", { kind: 'scalar', construct: (data) => ({ __jsExpr: data }) })`），
 * 解析出来就是一个带 `__jsExpr` 的标记对象，Loader 在**条目激活时**才求值。
 *
 * 因此编辑器里用 `{ "__jsExpr": "表达式" }` 表达一个表达式值，发射时还原成
 * `!!js "表达式"` —— 与手写 profile patch 的写法完全一致，能被人手改回。
 * 没有这一层，插件行里的平台条件只能写成普通字符串，而 Loader 对字符串按
 * `Boolean('...')` 处理（见 cordis-plugin-loader 的 disabledOf），结果恒为真、
 * 该行会被静默停用。
 */
const JS_EXPR_KEY = '__jsExpr';

function isJsExprMarker(value) {
  return isPlainObject(value) && Object.keys(value).length === 1 && typeof value[JS_EXPR_KEY] === 'string';
}

/** `!!js "表达式"`：表达式本体永远用双引号，保证换行/引号都不会破坏 YAML 结构。 */
function jsExprScalar(expr) {
  return '!!js ' + doubleQuoted(expr);
}

/**
 * 多行字符串 → 块标量（`|-` 不带尾换行，`|` 保留一个尾换行）。
 * 任何会让缩进探测有歧义的情形（首行缩进、行尾空白、多个结尾换行、
 * 控制字符）一律放弃，退回双引号。
 */
function blockScalar(text) {
  if (typeof text !== 'string' || !text.includes('\n')) return null;
  if (/[\r\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  let body = text;
  let header = '|-';
  if (body.endsWith('\n')) {
    body = body.slice(0, -1);
    header = '|';
    if (body.endsWith('\n')) return null;
  }
  const lines = body.split('\n');
  // 纯空白内容用块标量表达不可靠（缩进探测 + clip 语义），退回双引号
  if (lines.every((line) => line === '')) return null;
  const firstNonEmpty = lines.find((line) => line.trim() !== '');
  if (firstNonEmpty !== undefined && /^[ \t]/.test(firstNonEmpty)) return null;
  if (lines.some((line) => /[ \t]$/.test(line))) return null;
  return { header, lines };
}

/** 标量 → 行内形态或块形态。 */
function emitScalar(value) {
  // 表达式标记优先于一切：它必须是行内 `!!js` 标量，绝不能落到块形态或对象分支
  if (isJsExprMarker(value)) return { inline: jsExprScalar(value[JS_EXPR_KEY]) };
  if (typeof value === 'string') {
    const block = blockScalar(value);
    if (block !== null) return block;
    return { inline: inlineScalar(value) };
  }
  return { inline: inlineScalar(value) };
}

function emitObject(obj, indent, out) {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const keyText = inlineScalar(key);
    // `!!js` 表达式标记必须赶在「对象 → 嵌套映射」之前拦下：它虽然是个对象，
    // 但语义上是标量，落成嵌套映射就再也不是表达式了。
    if (isJsExprMarker(value)) {
      out.push(`${PAD(indent)}${keyText}: ${jsExprScalar(value[JS_EXPR_KEY])}`);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        out.push(`${PAD(indent)}${keyText}: []`);
        continue;
      }
      out.push(`${PAD(indent)}${keyText}:`);
      emitArray(value, indent + 2, out);
      continue;
    }
    if (isPlainObject(value)) {
      if (Object.keys(value).length === 0) {
        out.push(`${PAD(indent)}${keyText}: {}`);
        continue;
      }
      out.push(`${PAD(indent)}${keyText}:`);
      emitObject(value, indent + 2, out);
      continue;
    }
    const scalar = emitScalar(value);
    if (scalar.header !== undefined) {
      out.push(`${PAD(indent)}${keyText}: ${scalar.header}`);
      for (const line of scalar.lines) out.push(line === '' ? '' : PAD(indent + 2) + line);
      continue;
    }
    out.push(`${PAD(indent)}${keyText}: ${scalar.inline}`);
  }
}

function emitArray(arr, indent, out) {
  for (const item of arr) {
    // 同上：表达式标记是标量，不能走「对象 → 紧凑块序列」那条路
    if (isJsExprMarker(item)) {
      out.push(`${PAD(indent)}- ${jsExprScalar(item[JS_EXPR_KEY])}`);
      continue;
    }
    if (Array.isArray(item)) {
      out.push(`${PAD(indent)}-`);
      emitArray(item, indent + 2, out);
      continue;
    }
    if (isPlainObject(item)) {
      const inner = [];
      emitObject(item, indent + 2, inner);
      if (inner.length === 0) {
        out.push(`${PAD(indent)}- {}`);
        continue;
      }
      // 把映射的第一个键提到 `- ` 后面（标准的紧凑块序列写法）
      inner[0] = `${PAD(indent)}- ${inner[0].slice(indent + 2)}`;
      for (const line of inner) out.push(line);
      continue;
    }
    const scalar = emitScalar(item);
    if (scalar.header !== undefined) {
      out.push(`${PAD(indent)}- ${scalar.header}`);
      for (const line of scalar.lines) out.push(line === '' ? '' : PAD(indent + 2) + line);
      continue;
    }
    out.push(`${PAD(indent)}- ${scalar.inline}`);
  }
}

/** 任意 JSON 值 → YAML 文本（末尾带一个换行）。 */
export function toYaml(value) {
  const out = [];
  if (Array.isArray(value)) emitArray(value, 0, out);
  else if (isPlainObject(value)) emitObject(value, 0, out);
  else out.push(inlineScalar(value));
  return `${out.join('\n')}\n`;
}

/* ======================== 声明行的构建与渲染 ======================== */

/** Skill 目录项 → 提供给 @deepseek-ai/dsh-skill-filesystem 的目录。 */
export function skillDirOf(entry, store) {
  if (entry.source === 'path') {
    const raw = typeof entry.path === 'string' ? entry.path.trim() : '';
    if (raw === '') return '';
    // 允许用户直接指到 SKILL.md，提供方要的是目录
    return path.basename(raw).toLowerCase() === 'skill.md' ? path.dirname(raw) : raw;
  }
  return store.skillDir(entry.id);
}

/**
 * inline Skill 的落盘正文：补一份最小 YAML frontmatter。
 * @deepseek-ai/dsh-skill-filesystem 会解析 frontmatter 拿 name/description，
 * 用户自己写了就以用户的为准。
 */
export function ensureSkillFrontmatter(content, entry) {
  const body = typeof content === 'string' ? content : '';
  if (/^---\r?\n/.test(body.replace(/^\s+/, ''))) return body;
  const description = String(entry.description || entry.name || entry.id).replace(/\s+/g, ' ').trim();
  return `---\nname: ${doubleQuoted(entry.id)}\ndescription: ${doubleQuoted(description)}\n---\n\n${body.replace(/^\n+/, '')}`;
}

/**
 * 把「子预设 + 父预设」解析成一份可直接渲染的扁平定义。
 *
 * 继承规则（三条都是使用者确认过的）：
 *  1. 子预设继承父的 MCP / Skills / plugins / 可继承提示词；
 *  2. 子预设只能**追加**自己的 MCP 与 Skills —— 父挂载的既不能删也不能改，合并时
 *     父的在前、按 id 去重，所以即使子预设写了同名引用也只是重复一次而已；
 *  3. 只允许一层（父预设自己不能再有 parentId）。
 *
 * **提示词的合成顺序是这个函数最要紧的一点**：父的 `sharedPrompt` 先在**父自己的
 * 上下文里**渲染（用父的 params 与父的 values），得到一段成品文本，再作为 `parent`
 * 这个值注入子预设的渲染。反过来「先注入、后统一渲染」会让父的占位符被子预设的
 * 参数解释 —— 那是两套完全独立的参数空间，串了就会渲染出莫名其妙的内容。
 *
 * 父预设不存在时**不报错**：按顶层预设处理，并在返回值里带上 `missingParent`，
 * 让调用方决定怎么提示。理由是一条断掉的继承不该把整个发布流程卡死。
 *
 * @param {object} definition - 已规范化的 PresetDefinition（可能是子预设）。
 * @param {object[]} presets - 全部预设定义，用于查父。
 * @param {object} valuesByPreset - `{ presetId: values }`，父与子都要给。
 * @returns {{definition: object, values: object, parent: object|null, missingParent: string}}
 */
export function resolvePreset(definition, presets, valuesByPreset) {
  const list = Array.isArray(presets) ? presets : [];
  const bags = isPlainObject(valuesByPreset) ? valuesByPreset : {};
  const own = isPlainObject(bags[definition.id]) ? bags[definition.id] : {};

  const parentId = typeof definition.parentId === 'string' ? definition.parentId : '';
  if (parentId === '') {
    return { definition, values: own, parent: null, missingParent: '' };
  }

  const parent = list.find((item) => isPlainObject(item) && item.id === parentId);
  if (!parent) {
    return { definition, values: own, parent: null, missingParent: parentId };
  }

  const parentValues = isPlainObject(bags[parent.id]) ? bags[parent.id] : {};

  // 父的可继承提示词先在自己的上下文里渲染成成品文本。
  const sharedText = typeof parent.sharedPrompt === 'string' && parent.sharedPrompt !== ''
    ? renderPrompt(parent.sharedPrompt, parentValues, parent.params)
    : '';

  const mergeRefs = (inherited, ownRefs) => {
    const out = [];
    for (const id of [...(Array.isArray(inherited) ? inherited : []), ...(Array.isArray(ownRefs) ? ownRefs : [])]) {
      if (typeof id === 'string' && id !== '' && !out.includes(id)) out.push(id);
    }
    return out;
  };

  // plugins 按行 id 去重，且**父的优先** —— 与「不能修改父预设挂载的东西」保持一致。
  const mergePlugins = (inherited, ownRows) => {
    const out = [];
    const seen = new Set();
    for (const row of [...(Array.isArray(inherited) ? inherited : []), ...(Array.isArray(ownRows) ? ownRows : [])]) {
      if (!isPlainObject(row)) continue;
      const key = typeof row.id === 'string' ? row.id : '';
      if (key !== '') {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(row);
    }
    return out;
  };

  const merged = {
    ...definition,
    mcp: mergeRefs(parent.mcp, definition.mcp),
    skills: mergeRefs(parent.skills, definition.skills),
    plugins: mergePlugins(parent.plugins, definition.plugins),
  };

  // `parent` 只在这一层注入；它不写进 ParamValues 的落盘文件，所以父预设改了
  // 可继承提示词，子预设下次渲染立刻跟随，不需要任何同步动作。
  return {
    definition: merged,
    values: sharedText === '' ? own : { ...own, parent: sharedText },
    parent,
    missingParent: '',
  };
}

/**
 * 渲染一个预设的声明行。
 * @param {object} definition - 已规范化的 PresetDefinition。
 * @param {object} values - 该预设当前的 ParamValues.values。
 * @param {{mcp: object[], skills: object[]}} catalogs - 目录。
 * @param {{override?: boolean, store?: object}} options - override=true 表示用
 *   「按 id 覆盖」而不是 insert；store 用于推出 inline Skill 的落盘目录。
 * @returns {{rowId: string, name: string, config: object, override: boolean}}
 */
export function buildPresetRow(definition, values, catalogs, options = {}) {
  const mcpById = new Map((catalogs.mcp || []).filter(isPlainObject).map((entry) => [entry.id, entry]));
  const skillById = new Map((catalogs.skills || []).filter(isPlainObject).map((entry) => [entry.id, entry]));

  const plugins = [
    {
      id: 'persona',
      name: PERSONA_PLUGIN,
      config: { prefix: renderPrompt(definition.prompt, values, definition.params) },
    },
  ];

  // 预设自带的 Cordis 行（§2.1 plugins）。位置很关键：排在 persona 之后、MCP 与
  // Skill 行之前 —— persona 是提示词落点，必须最先；MCP/Skill 行由目录加进来，
  // 放在最后便于和用户手写的部分区分。
  //
  // 为什么必须有这一段：Web profile 的 @deepseek-ai/dsh-web-app/cordis.patch.yml
  // 把整个 agent 平面在 host 平面 disabled（tool-fs / tool-pwsh / tool-fs-search /
  // tool-jobs / skill-filesystem / tool-skill / tool-goal / command-goal / plan-mode /
  // compaction-* / tool-subagent* / workflow-ptc / tool-workflow / agent-instructions /
  // tool-todo / tool-web …），改由每个预设自己挂载。只渲染 persona 的预设会让 agent
  // 一个工具都没有：既读不了文件，也搜不了网。手写行让预设能自带完整工具面。
  //
  // 行 id 的唯一性由 validate.js 的 normalizePlugins 保证；这里的行对象已经是
  // 规范化后的副本，直接展开即可（数组/对象由用户负责，加载器会照原样解释）。
  const customPlugins = Array.isArray(definition.plugins) ? definition.plugins : [];
  plugins.push(...customPlugins);

  for (const ref of definition.mcp || []) {
    const entry = mcpById.get(ref);
    if (!entry || entry.enabled === false) continue;
    plugins.push({ id: `mcp-${entry.id}`, name: MCP_CLIENT_PLUGIN, config: { ...entry.server } });
  }

  // 该预设引用到的所有 Skill 目录合并成唯一一行 skill-filesystem。
  //
  // 这里不能「一个 Skill 一行」：SKILL_FS_PLUGIN 的 providerName 默认是
  // "filesystem"，而 @deepseek-ai/dsh-skill 的 provider 表按名唯一，第二行会抛
  //   a skill provider named "filesystem" is already registered in this scope
  // 于是整棵预设子树激活不到 active、preset-<id> 变成坏行（现象就是「勾了两个
  // Skill 之后这个预设选不了」）。一个 provider 能扫多个根，所以合并成一行、
  // 把目录全放进 customSkillDirs：去重、跳过空目录、一个都没有时不生成该行。
  const skillDirs = [];
  const seenSkillDirs = new Set();
  for (const ref of definition.skills || []) {
    const entry = skillById.get(ref);
    if (!entry || entry.enabled === false) continue;
    const dir = typeof entry.dir === 'string' && entry.dir !== '' ? entry.dir : skillDirOf(entry, options.store);
    if (dir === '') continue;
    const key = skillDirKey(dir);
    if (seenSkillDirs.has(key)) continue;
    seenSkillDirs.add(key);
    skillDirs.push(dir);
  }
  if (skillDirs.length > 0) {
    plugins.push({ id: SKILL_FS_ROW_ID, name: SKILL_FS_PLUGIN, config: { customSkillDirs: skillDirs } });
  }

  return {
    rowId: LOADER_ROW_PREFIX + definition.id,
    name: DECLARATION_PLUGIN,
    config: {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      order: definition.order,
      plugins,
    },
    override: options.override === true,
  };
}

/** 声明行 → patch 条目（insert 的成员，或顶层覆盖条目）。 */
function rowEntry(row) {
  return { id: row.rowId, name: row.name, config: row.config };
}

/**
 * 把若干声明行渲染成完整的 patch 文件（顶层 YAML 数组）。
 * 需要覆盖内置预设的行放在顶层（按 id 覆盖），其余收进一个 insert。
 */
export function renderPatchDocument(rows) {
  const inserts = rows.filter((row) => !row.override).map(rowEntry);
  const overrides = rows.filter((row) => row.override).map(rowEntry);
  const document = [];
  if (inserts.length > 0) document.push({ insert: inserts });
  for (const entry of overrides) document.push(entry);

  const header = [
    '# 由 dsh-agent-preset-editor 生成，请勿手改 —— 改动会在下一次「保存并发布」时被覆盖。',
    '#',
    '# 内容 = 用户在插件里「保存并发布到 DSH」过的全部预设（<root>/applied.json）按当前定义渲染。',
    '# 本文件会被注入 profile 的 cordis.patch.yml 受管标记区块，profile boot 时合并；',
    '# 合并顺序：各 bundle 层 → profile 的 cordis.patch.yml → --patch 覆盖。',
    '#',
    `# 声明行插件：${DECLARATION_PLUGIN}；loader row id 约定：${LOADER_ROW_PREFIX}<预设 id>。`,
    '# 一条声明都没有时写 `[]`（空 patch 层），而不是留一段纯注释 —— 纯注释解析出 null，',
    '# 那不是合法的 patch 层。',
  ];
  // 一条都没有：保持空流式集合的形态（与 profile 脚手架一致），别产出 null
  const payload = document.length === 0 ? '[]\n' : toYaml(document);
  return `${header.join('\n')}\n\n${payload}`;
}

/* ============================ 受管区块注入 ============================ */

/**
 * 探测一份 patch 文件的「形状」。
 * 关键动机：profile 脚手架生成的空 patch 文件内容就是 `[]`（一个**流式**
 * 序列）。在它后面直接追加块序列是非法 YAML —— 流式节点之后不能再跟块
 * 节点，整份 profile 会解析失败。所以必须先认出这个空文档再覆盖它。
 * @returns {{kind: 'blank'|'flow-empty'|'content', start?: number, end?: number}}
 */
function scanDocument(source) {
  const lineRe = /([^\r\n]*)(\r?\n|$)/g;
  let flowStart = -1;
  let flowEnd = -1;
  let match = lineRe.exec(source);
  while (match !== null && match[0] !== '') {
    // 去掉行尾注释再判断；只关心「整行就是一个空流式集合」
    const token = match[1].replace(/\s+#.*$/, '').trim();
    if (token !== '' && !token.startsWith('#')) {
      if (token !== '[]' && token !== '{}') return { kind: 'content' };
      if (flowStart !== -1) return { kind: 'content' };
      flowStart = match.index;
      flowEnd = match.index + match[0].length;
    }
    match = lineRe.exec(source);
  }
  if (flowStart !== -1) return { kind: 'flow-empty', start: flowStart, end: flowEnd };
  return { kind: 'blank' };
}

/**
 * 把一段 YAML 注入文本的受管标记区块。
 * 块外的每一个字节原样保留（唯一的例外：文件若只是一个空流式集合
 * `[]`/`{}` —— 那是脚手架生成的空文档，追加会产出非法 YAML，这种空文档
 * 会被本函数直接替换掉）。块不存在时追加到文件末尾，换行风格跟随原文件
 * （CRLF 的文件继续用 CRLF），避免整文件重写。
 * @param {string} text - 现有文件内容（可为空串）。
 * @param {string} body - 要放进块里的 YAML（LF 分隔）。
 * @returns {string} 新内容（未变化时与输入逐字相同）。
 */
export function injectManagedBlock(text, body) {
  const source = typeof text === 'string' ? text : '';
  const nl = source.includes('\r\n') ? '\r\n' : '\n';
  const normalized = String(body).replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const block = [BLOCK_BEGIN, ...normalized.split('\n'), BLOCK_END].join(nl) + nl;

  const beginAt = source.indexOf(BLOCK_BEGIN);
  if (beginAt !== -1) {
    const endAt = source.indexOf(BLOCK_END, beginAt);
    if (endAt !== -1) {
      let after = endAt + BLOCK_END.length;
      if (source.startsWith('\r\n', after)) after += 2;
      else if (source.startsWith('\n', after)) after += 1;
      return source.slice(0, beginAt) + block + source.slice(after);
    }
  }

  const shape = scanDocument(source);
  if (shape.kind === 'flow-empty') {
    // 空文档：去掉那个 `[]`，其余（注释、空行）逐字保留
    return source.slice(0, shape.start) + block + source.slice(shape.end);
  }

  // 追加：只保证「块之前的内容」以一个换行结束，别的一个字节都不动
  const base = source === '' || source.endsWith('\n') || source.endsWith('\r') ? source : source + nl;
  return base + block;
}

/**
 * 从运行中的 host 上下文读出「本进程所属 profile」的受管 patch 路径。
 *
 * `profileContext` 是 launcher 在 profile boot 时提供的普通服务（dsh 自己的
 * base bundle 也用它判断「是否在 profile 里」），字段 `patchPath` 就是该 profile
 * 的 cordis.patch.yml 绝对路径。这是唯一**精确**的来源 —— 不依赖目录扫描，
 * 更不依赖 mtime 猜测。
 * @param {object} ctx - host 的 Cordis 上下文；离线脚本没有。
 * @returns {string} 绝对路径；不在 profile 里或服务缺失时返回空串。
 */
function profilePatchFromContext(ctx) {
  if (!ctx || typeof ctx.get !== 'function') return '';
  let profile;
  try {
    profile = ctx.get('profileContext');
  } catch {
    return '';
  }
  if (!profile || typeof profile !== 'object') return '';
  const patchPath = typeof profile.patchPath === 'string' ? profile.patchPath.trim() : '';
  return patchPath === '' ? '' : path.resolve(patchPath);
}

/** 扫 $DSH_HOME/profiles：带上 owns（依赖本插件）与 hasBlock（已有受管区块）。 */
function discoverProfileCandidates() {
  const profilesDir = path.join(resolveDshHome(), 'profiles');
  let names = [];
  try {
    names = fs.readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }

  const candidates = [];
  for (const name of names) {
    const dir = path.join(profilesDir, name);
    const patchFile = path.join(dir, 'cordis.patch.yml');
    let stat;
    try {
      stat = fs.statSync(patchFile);
    } catch {
      continue;
    }
    let source = '';
    try {
      source = fs.readFileSync(patchFile, 'utf8');
    } catch {
      source = '';
    }
    candidates.push({
      patchFile,
      dir,
      mtime: stat.mtimeMs,
      owns: profileOwnsPlugin(dir),
      hasBlock: source.includes(BLOCK_BEGIN),
    });
  }
  return candidates;
}

/**
 * profile 的 patch 里是否**自己声明了**同一个存储根（隔离根场景的归属证明）。
 *
 * 保守的字符串判断，不解析 YAML：路径的 `/` 与 `\` 两种写法都先归一再比。
 * 判断失败最坏只是「认不出来 → 不写 profile」，这正是想要的失败方向。
 * @param {{patchFile: string}} candidate - 一个 profile 候选。
 * @param {string} root - 显式配置的存储根绝对路径。
 * @returns {boolean} 该 profile 是否就是这份存储根的主人。
 */
function profileDeclaresRoot(candidate, root) {
  if (!candidate || root === '') return false;
  let source = '';
  try {
    source = fs.readFileSync(candidate.patchFile, 'utf8');
  } catch {
    return false;
  }
  if (!source.includes('agent-preset-editor')) return false;
  return source.replace(/\\/g, '/').includes(root.replace(/\\/g, '/'));
}

/**
 * 找到要注入受管区块的 profile cordis.patch.yml。
 *
 * 优先级（前两条是确定的，后两条只服务离线脚本）：
 *  1. `config.profilePatch` / `config.profile` —— 调用方显式指定；
 *  2. 运行中 host 的 `profileContext.patchPath` —— 本进程自己的 profile，精确；
 *  3. 隔离存储根（`config.root` 指到别处）：只认 patch 里明确写了同一个 root 的
 *     profile；认不出来就返回空串 —— 宁可不写，也不写错 profile；
 *  4. 默认存储根：`$DSH_HOME/profiles` 里依赖本插件的 profile，优先已经带受管
 *     区块的那个（= 本插件历来发布到那里），再优先名字 `web`，最后按 mtime。
 *
 * 第 3 条是拿真机事故换来的：隔离验证 profile（ape-verify，`config.root` 指到
 * 测试根）既没有显式 profilePatch，也没有被旧实现问过「你是谁」——只剩 mtime
 * 猜测，于是测试把 e2e 预设写进了用户的 web profile 受管区块，用户真实的预设
 * 被整块替换，重启后 DSH roster 里只剩测试预设。写别人配置的猜测不可接受。
 *
 * @param {object} config - 插件 config。
 * @param {object} [ctx] - host 的 Cordis 上下文；离线脚本可省略。
 * @returns {string} profile patch 绝对路径；无法安全确定时返回空串（调用方应跳过注入）。
 */
export function resolveProfilePatchFile(config, ctx) {
  const explicit = config && (config.profilePatch || config.profile);
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    const resolved = path.resolve(explicit.trim());
    return path.basename(resolved) === 'cordis.patch.yml' ? resolved : path.join(resolved, 'cordis.patch.yml');
  }

  // 运行中：本进程自己的 profile 是唯一正确目标，任何猜测都不如它。
  const fromContext = profilePatchFromContext(ctx);
  if (fromContext !== '') return fromContext;

  const isolatedRoot = hasExplicitStoreRoot(config) ? resolveStoreRoot(config) : '';
  const candidates = discoverProfileCandidates();

  if (candidates.length === 0) {
    if (isolatedRoot !== '') return '';
    return path.join(resolveDshHome(), 'profiles', 'web', 'cordis.patch.yml');
  }

  if (isolatedRoot !== '') {
    // 隔离根：只认自己在 patch 里声明了同一 root 的 profile，且必须唯一。
    const declared = candidates.filter((item) => profileDeclaresRoot(item, isolatedRoot));
    return declared.length === 1 ? declared[0].patchFile : '';
  }

  const mine = candidates.filter((item) => item.owns);
  const web = candidates.filter((item) => path.basename(item.dir) === 'web');
  const pool = (mine.length > 0 ? mine : web.length > 0 ? web : candidates).slice();
  pool.sort((a, b) => {
    if (a.hasBlock !== b.hasBlock) return a.hasBlock ? -1 : 1;
    const aWeb = path.basename(a.dir) === 'web' ? 1 : 0;
    const bWeb = path.basename(b.dir) === 'web' ? 1 : 0;
    if (aWeb !== bWeb) return bWeb - aWeb;
    return b.mtime - a.mtime;
  });
  return pool[0].patchFile;
}

/** profile 的 package.json 依赖或 bundle 栈里是否有本插件。 */
function profileOwnsPlugin(dir) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const deps = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
    if (Object.keys(deps).some((name) => name === 'dsh-agent-preset-editor' || name.endsWith('/dsh-agent-preset-editor'))) return true;
    const bundles = manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles;
    return Array.isArray(bundles) && bundles.some((name) => String(name).endsWith('dsh-agent-preset-editor'));
  } catch {
    return false;
  }
}

/** 判断某个预设 id 是否已经有 loader 行（= 内置/已声明的预设，要覆盖而不是插入）。 */
export function hasDeclarationRow(ctx, id) {
  const loader = ctx && ctx.loader;
  if (loader && typeof loader.resolve === 'function') {
    try {
      return Boolean(loader.resolve(LOADER_ROW_PREFIX + id));
    } catch {
      return SHIPPED_PRESET_IDS.has(id);
    }
  }
  return SHIPPED_PRESET_IDS.has(id);
}

/* ============================ 同步主流程 ============================ */

/**
 * 按当前存储重新生成声明并同步到 profile。
 * 幂等：同样的存储内容永远产出同样的文件；块外内容永不被触碰。
 * @param {{store: object, ctx: object, config: object}} options
 * @returns {{applied: string[], rows: object[], declarations: string, profilePatch: string|null, profileBackup: string|null, profileCreated: boolean, profileChanged: boolean, note: string}}
 */
export function syncDeclarations(options) {
  const { store, ctx, config } = options;
  const catalogs = { mcp: store.listMcp().entries, skills: store.listSkills().entries };
  const skillById = new Map(catalogs.skills.map((entry) => [entry.id, entry]));

  const appliedIds = store.readApplied();
  const rows = [];
  const kept = [];
  let skillFiles = 0;

  // 父子合并要看得到全部预设与全部取值，所以在循环外取一次。
  const allPresets = (store.listPresets().presets || []);
  const allValues = store.listValues() || {};

  for (const id of appliedIds) {
    const stored = store.readPreset(id);
    if (!stored) continue; // 定义已被删除：从已发布集合里静默摘掉
    const ownValues = store.readValues(id) || {};
    // 子预设的 MCP / Skills / plugins / 可继承提示词在这里并入 —— 父预设改了，
    // 下一次 sync 就自动跟随，不需要任何同步动作（子预设从不缓存父的内容）。
    const resolved = resolvePreset(stored, allPresets, { ...allValues, [id]: ownValues });
    const definition = resolved.definition;
    const values = resolved.values;

    // inline Skill 需要先把正文写到磁盘，声明行才有目录可指
    const resolvedSkills = [];
    for (const ref of definition.skills || []) {
      const entry = skillById.get(ref);
      if (!entry) continue;
      if (entry.enabled === false) continue;
      if (entry.source === 'inline') {
        store.writeSkillFile(entry.id, ensureSkillFrontmatter(entry.content, entry));
        skillFiles += 1;
      }
      resolvedSkills.push({ ...entry, dir: skillDirOf(entry, store) });
    }

    const row = buildPresetRow(definition, values, { mcp: catalogs.mcp, skills: resolvedSkills }, {
      override: hasDeclarationRow(ctx, definition.id),
      store,
    });
    rows.push({ ...row, order: definition.order, presetId: definition.id });
    kept.push(id);
  }

  rows.sort((a, b) => (a.order === b.order ? a.presetId.localeCompare(b.presetId) : a.order - b.order));
  if (kept.length !== appliedIds.length) store.writeApplied(kept);

  const yamlSource = renderPatchDocument(rows);
  const declarations = store.writePatchFile(yamlSource);

  // ctx 传进去：运行中的 host 用 profileContext.patchPath 精确锁定本 profile；
  // 隔离根在缺少 ctx 时无法安全判定归属，会返回空串（见 resolveProfilePatchFile）。
  const profilePatch = resolveProfilePatchFile(config, ctx);
  let profileBackup = null;
  let profileCreated = false;
  let profileChanged = false;
  let note;

  if (profilePatch === '') {
    note = `声明已渲染到 ${declarations}，但无法安全确定要注入哪个 profile 的 cordis.patch.yml，本次没有写 profile`
      + '（隔离存储根请显式配置插件 config.profilePatch）。';
  } else {
    try {
      let existing = '';
      try {
        existing = fs.readFileSync(profilePatch, 'utf8');
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error;
        profileCreated = true;
      }
      const next = injectManagedBlock(existing, yamlSource);
      if (next !== existing) {
        if (existing !== '') profileBackup = backupFile(profilePatch);
        writeFileAtomic(profilePatch, next);
        profileChanged = true;
      }
      note = profileChanged
        ? `声明已写入 ${profilePatch} 的受管区块；DSH 的 profile HMR 会热加载它（未生效时重启一次 dsh）。`
        : `声明已是最新，${profilePatch} 无需改动；重启 dsh 后生效。`;
    } catch (error) {
      note = `声明已渲染到 ${declarations}，但写入 profile patch 失败：${error && error.message ? error.message : String(error)}。请手动复制该文件内容。`;
    }
  }

  return {
    applied: kept,
    rows,
    rowIds: rows.map((row) => row.rowId),
    declarations,
    profilePatch: profilePatch === '' ? null : profilePatch,
    profileBackup,
    profileCreated,
    profileChanged,
    skillFiles,
    note,
  };
}

/**
 * 尽力而为的热应用：把声明行作为运行时 loader 行挂上去。
 * 只在 config.hotApply === true 时被调用；任何异常都由调用方静默吞掉并
 * 回退到 patch 模式 —— 这个函数永远不该让 /preset/apply 失败。
 * @returns {Promise<string|null>} 成功的 loader row id，失败返回 null。
 */
export async function tryHotApplyLoader(ctx, row) {
  const loader = ctx && ctx.loader;
  if (!loader || typeof loader.create !== 'function' || typeof loader.resolve !== 'function') return null;
  let existing = null;
  try {
    existing = loader.resolve(row.rowId);
  } catch {
    existing = null;
  }
  if (existing) {
    if (typeof loader.update !== 'function') return null;
    await loader.update(row.rowId, { name: row.name, config: row.config });
    return row.rowId;
  }
  const created = await loader.create({ id: row.rowId, name: row.name, config: row.config });
  return typeof created === 'string' ? created : row.rowId;
}
