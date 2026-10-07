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

import { backupFile, resolveDshHome, writeFileAtomic } from './store.js';

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
 * 找到当前 profile 的 cordis.patch.yml。
 * 依据优先级：config.profilePatch → $DSH_HOME/profiles 里依赖/声明了本插件的
 * profile → 最近改动的 profile → profiles/web（dsh 的 Web profile 名）。
 */
export function resolveProfilePatchFile(config) {
  const explicit = config && (config.profilePatch || config.profile);
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    const resolved = path.resolve(explicit.trim());
    return path.basename(resolved) === 'cordis.patch.yml' ? resolved : path.join(resolved, 'cordis.patch.yml');
  }

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
    candidates.push({ patchFile, dir, mtime: stat.mtimeMs, owns: profileOwnsPlugin(dir) });
  }

  if (candidates.length === 0) return path.join(profilesDir, 'web', 'cordis.patch.yml');

  // 1) 明确依赖/声明了本插件的 profile；2) Web profile（本插件只跑在 Web GUI 里）；
  // 3) 最近改动过的 profile。三层都是确定性的，不做随机猜测。
  const mine = candidates.filter((item) => item.owns);
  const web = candidates.filter((item) => path.basename(item.dir) === 'web');
  const pool = mine.length > 0 ? mine : web.length > 0 ? web : candidates;
  pool.sort((a, b) => b.mtime - a.mtime);
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

  for (const id of appliedIds) {
    const definition = store.readPreset(id);
    if (!definition) continue; // 定义已被删除：从已发布集合里静默摘掉
    const values = store.readValues(id) || {};

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

  const profilePatch = resolveProfilePatchFile(config);
  let profileBackup = null;
  let profileCreated = false;
  let profileChanged = false;
  let note;

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
      ? `声明已写入 ${profilePatch} 的受管区块；重启 dsh（或重新加载 profile）后生效。`
      : `声明已是最新，${profilePatch} 无需改动；重启 dsh 后生效。`;
  } catch (error) {
    note = `声明已渲染到 ${declarations}，但写入 profile patch 失败：${error && error.message ? error.message : String(error)}。请手动复制该文件内容。`;
  }

  return {
    applied: kept,
    rows,
    rowIds: rows.map((row) => row.rowId),
    declarations,
    profilePatch,
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
