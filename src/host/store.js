/* ------------------------------------------------------------------ *
 * 存储层（CONTRACT §1.6 / §2）。
 *
 * 磁盘布局（根 = $DSH_HOME/agent-preset-editor）：
 *   presets/<id>.json      每个预设一份定义（§2.1）
 *   values/<id>.json       每个预设一份参数取值（§2.6）
 *   mcp.json               MCP 目录（§2.2，全局共享）
 *   skills.json            Skill 目录（§2.3，全局共享）
 *   skills/<id>/SKILL.md   inline 来源的 Skill 正文（apply 时落盘，供
 *                          @deepseek-ai/dsh-skill-filesystem 读取）
 *   applied.json           已经「发布到 DSH」的预设 id 列表，保序
 *   presets.patch.yml      由 applied.json + 当前定义渲染出的完整声明 YAML
 *
 * 所有写入都是原子的：先写同目录下的临时文件再 rename，失败时清掉临时
 * 文件。rename 覆盖目标文件在 Windows 与 POSIX 上都是「要么旧的、要么新
 * 的」，不会出现半截 JSON —— 用户已有的文件不会被写坏。
 * 所有 JSON 统一 UTF-8、2 空格缩进、末尾换行（§2）。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 插件在 $DSH_HOME 下的目录名。 */
export const STORE_DIR_NAME = 'agent-preset-editor';

/** $DSH_HOME，与 DSH 自己的规则一致（环境变量优先，否则 ~/.dsh）。 */
export function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return path.resolve(fromEnv.trim());
  return path.join(os.homedir(), '.dsh');
}

/** 存储根。可以在插件 config 里用 `root` 覆盖（测试/多实例时有用）。 */
export function resolveStoreRoot(config) {
  const explicit = config && (config.root || config.storageRoot);
  if (typeof explicit === 'string' && explicit.trim() !== '') return path.resolve(explicit.trim());
  return path.join(resolveDshHome(), STORE_DIR_NAME);
}

/**
 * config 是否显式指定了存储根（= 隔离根）。
 *
 * 单独暴露这个判断给 declarations.js 用：默认根代表「本机唯一的那份用户数据」，
 * 而隔离根只属于某个验证实例 —— 后者绝不允许靠启发式去猜 profile patch，
 * 否则一次测试就可能改写用户的真实配置（曾发生过）。
 * @param {object} config - 插件 config。
 * @returns {boolean} 是否显式配置了 root/storageRoot。
 */
export function hasExplicitStoreRoot(config) {
  const explicit = config && (config.root || config.storageRoot);
  return typeof explicit === 'string' && explicit.trim() !== '';
}

/** 契约要求的 JSON 文本形态：2 空格缩进 + 末尾换行。 */
export function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** 同一次进程内的临时文件名序号，避免同毫秒并发写撞名。 */
let tmpSeq = 0;

/** 原子写：临时文件 + rename。同目录保证 rename 不跨卷。 */
export function writeFileAtomic(file, text) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${(tmpSeq += 1).toString(36)}.tmp`);
  try {
    fs.writeFileSync(tmp, text, { encoding: 'utf8' });
    fs.renameSync(tmp, file);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* 临时文件清理失败不值得再抛一次，原始错误更重要 */
    }
    throw error;
  }
}

/** 备份一个已存在的文件（用于改写用户 profile 前留退路）。 */
export function backupFile(file, suffix = '.bak-agent-preset-editor') {
  if (!fs.existsSync(file)) return null;
  const target = file + suffix;
  fs.copyFileSync(file, target);
  return target;
}

/** 读 JSON：文件不存在不是错误（返回 missing），解析失败带上原因。 */
function readJsonFile(file) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { value: null, missing: true, error: null };
    return { value: null, missing: false, error: `读取失败：${error && error.message ? error.message : String(error)}` };
  }
  try {
    return { value: JSON.parse(source), missing: false, error: null };
  } catch (error) {
    return { value: null, missing: false, error: `JSON 解析失败：${error && error.message ? error.message : String(error)}` };
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 目录里的 *.json 文件（只要文件名，已排序，保证每次读出的顺序稳定）。 */
function jsonFilesIn(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
  return names.filter((name) => name.toLowerCase().endsWith('.json')).sort();
}

/** 预设的展示顺序：order 升序，其次 id。 */
function byPresetOrder(a, b) {
  const oa = Number.isFinite(a.order) ? a.order : 0;
  const ob = Number.isFinite(b.order) ? b.order : 0;
  if (oa !== ob) return oa - ob;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * 建一个存储实例。所有方法同步、无缓存 —— 文件是唯一事实来源，
 * 用户（或别的进程）手改 JSON 之后下一次请求就能看到。
 * @param {string} root - 存储根（绝对路径）。
 */
export function createStore(root) {
  const paths = {
    root,
    presets: path.join(root, 'presets'),
    values: path.join(root, 'values'),
    skills: path.join(root, 'skills'),
    mcp: path.join(root, 'mcp.json'),
    skillsIndex: path.join(root, 'skills.json'),
    applied: path.join(root, 'applied.json'),
    declarations: path.join(root, 'presets.patch.yml'),
  };

  const presetFile = (id) => path.join(paths.presets, `${id}.json`);
  const valuesFile = (id) => path.join(paths.values, `${id}.json`);

  /* ------------------------------ 预设 ------------------------------ */

  function readPreset(id) {
    const result = readJsonFile(presetFile(id));
    if (result.missing || result.error || !isPlainObject(result.value)) return null;
    return result.value;
  }

  function listPresets() {
    const out = [];
    const broken = [];
    for (const name of jsonFilesIn(paths.presets)) {
      const file = path.join(paths.presets, name);
      const result = readJsonFile(file);
      if (result.error) {
        broken.push({ file, reason: result.error });
        continue;
      }
      if (!isPlainObject(result.value) || typeof result.value.id !== 'string') {
        broken.push({ file, reason: '内容不是带 id 的预设对象' });
        continue;
      }
      out.push(result.value);
    }
    return { presets: out.sort(byPresetOrder), broken };
  }

  /** 落盘一个预设：createdAt 保留旧值，updatedAt 每次刷新。
   *  plugins 缺失时沿用上一次落盘的值（旧版编辑界面不带这个键，不能因此清空）。 */
  function writePreset(definition) {
    const previous = readPreset(definition.id);
    const now = new Date().toISOString();
    const incomingPlugins = Array.isArray(definition.plugins) ? definition.plugins : null;
    const previousPlugins = previous && Array.isArray(previous.plugins) ? previous.plugins : [];
    const record = {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      order: definition.order,
      prompt: definition.prompt,
      params: definition.params,
      form: definition.form,
      plugins: incomingPlugins === null ? previousPlugins : incomingPlugins,
      mcp: definition.mcp,
      skills: definition.skills,
      createdAt: previous && typeof previous.createdAt === 'string' ? previous.createdAt : now,
      updatedAt: now,
    };
    // 父子关系与「可继承提示词」：只在非空时写。空值不落字段，顶层预设的文件形状
    // 与引入这两个字段之前完全一致 —— 也让「清空父预设」这件事真的能把字段删掉
    // （否则旧值会一直留在文件里，子预设永远脱离不了父）。
    if (typeof definition.parentId === 'string' && definition.parentId !== '') {
      record.parentId = definition.parentId;
    }
    if (typeof definition.sharedPrompt === 'string' && definition.sharedPrompt !== '') {
      record.sharedPrompt = definition.sharedPrompt;
    }
    writeFileAtomic(presetFile(record.id), jsonText(record));
    return record;
  }

  function deletePreset(id) {
    const file = presetFile(id);
    if (!fs.existsSync(file)) return false;
    fs.rmSync(file, { force: true });
    return true;
  }

  /* ---------------------------- 参数取值 ---------------------------- */

  function readValues(id) {
    const result = readJsonFile(valuesFile(id));
    if (result.missing || result.error || !isPlainObject(result.value)) return null;
    const values = result.value.values;
    return isPlainObject(values) ? values : null;
  }

  function writeValues(id, values) {
    const now = new Date().toISOString();
    writeFileAtomic(valuesFile(id), jsonText({ presetId: id, values, updatedAt: now }));
    return values;
  }

  function deleteValues(id) {
    fs.rmSync(valuesFile(id), { force: true });
  }

  function listValues() {
    const out = {};
    for (const name of jsonFilesIn(paths.values)) {
      const result = readJsonFile(path.join(paths.values, name));
      if (result.error || !isPlainObject(result.value)) continue;
      const id = typeof result.value.presetId === 'string' ? result.value.presetId : name.replace(/\.json$/i, '');
      if (isPlainObject(result.value.values)) out[id] = result.value.values;
    }
    return out;
  }

  /* --------------------------- 目录（全局） --------------------------- */

  function readIndex(file) {
    const result = readJsonFile(file);
    if (result.missing) return { entries: [], broken: null };
    if (result.error) return { entries: [], broken: result.error };
    if (!Array.isArray(result.value)) return { entries: [], broken: '内容不是数组' };
    return { entries: result.value.filter(isPlainObject), broken: null };
  }

  /** 目录项的原子「插入或替换」，保序：同 id 就地替换，否则追加。 */
  function upsertEntry(file, entry) {
    const { entries } = readIndex(file);
    const now = new Date().toISOString();
    const previous = entries.find((item) => item.id === entry.id);
    const record = {
      ...entry,
      createdAt: previous && typeof previous.createdAt === 'string' ? previous.createdAt : now,
      updatedAt: now,
    };
    const next = entries.slice();
    const at = next.findIndex((item) => item.id === entry.id);
    if (at >= 0) next[at] = record;
    else next.push(record);
    writeFileAtomic(file, jsonText(next));
    return record;
  }

  function removeEntry(file, id) {
    const { entries } = readIndex(file);
    const next = entries.filter((item) => item.id !== id);
    if (next.length === entries.length) return false;
    writeFileAtomic(file, jsonText(next));
    return true;
  }

  const listMcp = () => readIndex(paths.mcp);
  const saveMcp = (entry) => upsertEntry(paths.mcp, entry);
  const deleteMcp = (id) => removeEntry(paths.mcp, id);
  const listSkills = () => readIndex(paths.skillsIndex);
  const saveSkill = (entry) => upsertEntry(paths.skillsIndex, entry);
  const deleteSkill = (id) => removeEntry(paths.skillsIndex, id);

  /* ---------------------------- 已发布集合 ---------------------------- */

  function readApplied() {
    const result = readJsonFile(paths.applied);
    if (!Array.isArray(result.value)) return [];
    return result.value.filter((id) => typeof id === 'string' && id !== '');
  }

  function writeApplied(ids) {
    writeFileAtomic(paths.applied, jsonText(ids));
    return ids;
  }

  /** 把 id 加进已发布集合（幂等，保序）。 */
  function markApplied(id) {
    const ids = readApplied();
    if (!ids.includes(id)) ids.push(id);
    return writeApplied(ids);
  }

  /** 把 id 从已发布集合移除（幂等）。 */
  function unmarkApplied(id) {
    return writeApplied(readApplied().filter((item) => item !== id));
  }

  /* ------------------------------ Skill 正文 ------------------------------ */

  /** inline Skill 的落盘目录（apply 时写入 SKILL.md）。 */
  const skillDir = (id) => path.join(paths.skills, id);

  function writeSkillFile(id, markdown) {
    const dir = skillDir(id);
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(path.join(dir, 'SKILL.md'), markdown);
    return path.join(dir, 'SKILL.md');
  }

  /* --------------------------- 声明 YAML 落盘 --------------------------- */

  function writePatchFile(yamlSource) {
    writeFileAtomic(paths.declarations, yamlSource);
    return paths.declarations;
  }

  function readPatchFile() {
    try {
      return fs.readFileSync(paths.declarations, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') return '';
      throw error;
    }
  }

  /* ------------------------------ 汇总 ------------------------------ */

  /** §3.2 EditorState 的 host 部分（dsh 段由 client 半补全）。 */
  function readState() {
    const presets = listPresets();
    const mcp = listMcp();
    const skills = listSkills();
    const warnings = [];
    for (const item of presets.broken) warnings.push(`预设文件无法读取：${item.file}（${item.reason}）`);
    if (mcp.broken) warnings.push(`${paths.mcp} 无法读取：${mcp.broken}`);
    if (skills.broken) warnings.push(`${paths.skillsIndex} 无法读取：${skills.broken}`);
    return {
      presets: presets.presets,
      mcp: mcp.entries,
      skills: skills.entries,
      values: listValues(),
      warnings,
    };
  }

  return {
    root,
    paths,
    skillDir,
    readPreset,
    listPresets,
    writePreset,
    deletePreset,
    readValues,
    writeValues,
    deleteValues,
    listValues,
    listMcp,
    saveMcp,
    deleteMcp,
    listSkills,
    saveSkill,
    deleteSkill,
    readApplied,
    writeApplied,
    markApplied,
    unmarkApplied,
    writeSkillFile,
    writePatchFile,
    readPatchFile,
    readState,
  };
}
