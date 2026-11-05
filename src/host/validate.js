/* ------------------------------------------------------------------ *
 * 输入校验与规范化（CONTRACT §2 数据模型）。
 *
 * 职责边界：
 *   - 校验「形状」与「不变量」（id 形态、参数名、枚举、数值范围）；
 *   - 把缺失字段补成契约默认值，并按契约的字段顺序重建对象，
 *     这样落盘的 JSON 永远是可读、可比对的；
 *   - 一切失败都抛 ApiError，由 routes.js 统一转成
 *     `{ ok:false, error:{ code, message } }`。
 *
 * 不在这里做的事：不碰文件系统、不知道任何路由。
 * ------------------------------------------------------------------ */

/** §3 契约允许的错误码。 */
const CODES = {
  'bad-request': 400,
  'not-found': 404,
  conflict: 409,
  'io-error': 500,
  internal: 500,
};

/** 插件自有的错误类型：code 进响应包，status 直接当 HTTP 状态码。 */
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status === undefined ? CODES[code] || 500 : status;
  }
}

export const badRequest = (message) => new ApiError('bad-request', message);
export const notFound = (message) => new ApiError('not-found', message);
export const conflict = (message) => new ApiError('conflict', message);
export const ioError = (message) => new ApiError('io-error', message);
export const internal = (message) => new ApiError('internal', message);

/** 预设 id / MCP 目录 id / Skill 目录 id 的形态（= DSH preset id 规则）。 */
export const SLUG_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
/** 参数名形态：提示词里写成 `{{ $taskType }}`，所以必须是合法标识符。 */
export const PARAM_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** §2.4 允许的参数类型。 */
export const PARAM_TYPES = ['text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'switch', 'slider'];
/** §2.2 MCP 传输方式。 */
export const MCP_TRANSPORTS = ['stdio', 'http', 'sse'];
/** §2.3 Skill 来源。 */
export const SKILL_SOURCES = ['inline', 'path'];

/** 参数名上限：防止 UI 侧做出一个渲染都跑不动的巨型定义。 */
const MAX_PARAMS = 64;
/** 单个字符串字段的上限：Skill 正文可以很大，其它字段不该。 */
const MAX_TEXT = 200000;

/* ------------------------------ 基础取值 ------------------------------ */

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function asObject(value, what) {
  if (!isPlainObject(value)) throw badRequest(`${what} 必须是 JSON 对象`);
  return value;
}

/** 字符串字段：非字符串一律按「缺失」处理，不做隐式 JSON 化。 */
function text(value) {
  if (typeof value === 'string') return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function number(value, fallback) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function integer(value, fallback) {
  const n = number(value, NaN);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** 一个合法的 id：去空白、转小写，再按 SLUG_ID_RE 校验。 */
export function normalizeId(value, what) {
  const id = text(value).trim().toLowerCase();
  if (!SLUG_ID_RE.test(id)) {
    throw badRequest(`${what} "${id || '(空)'}" 不合法：只能用小写字母、数字和连字符，且以字母或数字开头`);
  }
  return id;
}

/** 从请求体里取一个必填 id 字段。 */
export function requireId(payload, field = 'id', what = 'id') {
  const body = asObject(payload, '请求体');
  if (body[field] === undefined || body[field] === null) throw badRequest(`缺少字段 "${field}"`);
  return normalizeId(body[field], what);
}

/* ------------------------------ 参数定义 ------------------------------ */

function normalizeOptions(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const label = text(item.label).trim();
    let optionValue = item.value;
    if (optionValue === undefined || optionValue === null) optionValue = label;
    else if (typeof optionValue !== 'string') optionValue = String(optionValue);
    if (label === '' && optionValue === '') continue;
    out.push({ label: label === '' ? optionValue : label, value: optionValue });
  }
  return out;
}

/** 按类型把 default 折成该类型该有的样子（checkbox→数组，switch→布尔，number→数字）。 */
function normalizeDefault(value, type) {
  if (type === 'checkbox') {
    if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : String(v)));
    if (value === undefined || value === null || value === '') return [];
    return [typeof value === 'string' ? value : String(value)];
  }
  if (type === 'switch') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false' || value === undefined || value === null) return false;
    return Boolean(value);
  }
  if (type === 'number' || type === 'slider') return number(value, 0);
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}

/** §2.4 ParamSpec。name 必填且唯一（唯一性由调用方检查）。 */
function normalizeParam(raw, index) {
  const input = asObject(raw, `params[${index}]`);
  const name = text(input.name).trim();
  if (!PARAM_NAME_RE.test(name)) {
    throw badRequest(`params[${index}].name "${name || '(空)'}" 不合法：必须以字母或下划线开头，只含字母、数字和下划线`);
  }
  const type = PARAM_TYPES.includes(input.type) ? input.type : 'text';
  const out = { name, label: text(input.label).trim() || name, type, default: normalizeDefault(input.default, type) };
  const options = normalizeOptions(input.options);
  if (options.length > 0) out.options = options;
  if (input.min !== undefined) out.min = number(input.min, 0);
  if (input.max !== undefined) out.max = number(input.max, 100);
  if (input.step !== undefined) out.step = number(input.step, 1);
  // slider 需要 min/max/step 才能渲染；缺了就补一份可用的默认，避免 UI 出现「0~0」的滑块。
  if (type === 'slider') {
    if (out.min === undefined) out.min = 0;
    if (out.max === undefined || out.max <= out.min) out.max = out.min + 100;
    if (out.step === undefined || out.step <= 0) out.step = 1;
  }
  out.description = text(input.description);
  out.required = bool(input.required, false);
  return out;
}

export function normalizeParams(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest('params 必须是数组');
  if (value.length > MAX_PARAMS) throw badRequest(`params 最多 ${MAX_PARAMS} 项`);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const param = normalizeParam(value[i], i);
    if (seen.has(param.name)) throw badRequest(`参数名 "${param.name}" 重复`);
    // `parent` 留给「父预设的可继承提示词」—— 见 RESERVED_PARAM_NAMES 的说明。
    if (RESERVED_PARAM_NAMES.includes(param.name)) {
      throw badRequest(`参数名 "${param.name}" 是保留字（子预设用它引用父预设的可继承提示词），请换一个名字`);
    }
    seen.add(param.name);
    out.push(param);
  }
  return out;
}

/* --------------------- 低代码表单 / 引用 / 取值 --------------------- */

/** §2.1 form。rule 由 client 半的表单引擎拥有，host 只保证它是可序列化的对象数组。 */
function normalizeForm(value) {
  if (!isPlainObject(value)) return { rule: [] };
  const rule = Array.isArray(value.rule) ? value.rule.filter(isPlainObject) : [];
  return { rule };
}

/**
 * `!!js` 表达式标记：`{ __jsExpr: "表达式" }`。
 *
 * profile 的条目列表方言把 `!!js` 解析成这个形状（构造器见 dsh-app-boot 的
 * JsExpr），Loader 的 isJsExpr 也认它。声明文件发射器会把它还原成 `!!js "…"`。
 * 只有单个 `__jsExpr` 字符串键才算标记，别的形状一律当普通对象处理。
 */
export function isJsExprMarker(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === '__jsExpr' && typeof value.__jsExpr === 'string';
}

/** Cordis 行配置里允许出现的键（Loader 的 row 形态，见 cordis-composition-reference）。 */
const PLUGIN_ROW_KEYS = ['id', 'name', 'config', 'disabled', 'inject', 'intercept', 'isolate', 'group'];
/** 一行最多允许的额外字段数，够用即可，防止把声明文件撑成垃圾场。 */
const MAX_PLUGIN_ROWS = 128;

/**
 * 几个内置插件的「必需 config」检查表 —— 把沉默的坏行前移到发布时的报错。
 *
 * 为什么需要：preset 的 plugins 是用户手写的，而 Web profile 把整个 agent 平面
 * （tool-* / skill-filesystem / plan-mode / compaction-* …）交给每个预设自己挂载。
 * 抄这份清单时漏掉一个必需字段，**保存和发布都不会报错**，只会在 profile boot 时
 * 让 `preset-<id>` 变成坏行：DSH 的预设列表里看得到它、却选不中，用户感受到的就是
 * 「点这个预设没反应」。而 dsh 不把这个失败写进 stderr，只能从 roster 的 broken 读。
 *
 * 实测受害者是 plan-mode 的 `section`（2.3 KB 长文本，最容易抄漏）：
 * `plan-mode (@deepseek-ai/dsh-plan-mode): PlanModeConfig needs a non-empty \`section\``。
 * 与其让用户去猜，不如在这里给一句能直接照做的话。
 */
const REQUIRED_PLUGIN_CONFIG = {
  '@deepseek-ai/dsh-plan-mode': { key: 'section' },
};

/**
 * 递归校验必需 config —— 必须递归，因为这类行常常藏在 `cordis:group` 的 config
 * 数组里（`planning` 组里的 `plan-mode` 就是这样），而 group 行的 config 是原样
 * 保留、不走下面逐字段规范化的。
 * @param {Array} rows - 原始 plugin 行（或 group 的内嵌条目）。
 * @param {string} where - 报错时用来定位的路径。
 */
function assertRequiredConfigs(rows, where) {
  if (!Array.isArray(rows)) return;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    const id = text(row.id).trim() || `#${i}`;
    const rule = REQUIRED_PLUGIN_CONFIG[text(row.name).trim()];
    if (rule) {
      const config = isPlainObject(row.config) ? row.config : null;
      const raw = config ? config[rule.key] : undefined;
      const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
      if (empty) {
        throw badRequest(
          `${where} 里第 ${i} 行（id: ${id}，${text(row.name).trim()}）缺少 config.${rule.key}；`
          + `不加它这个预设激活时会失败，在 DSH 里表现为「选中不了」。`
          + `从内置清单里补一份，或直接删掉这一行。`
        );
      }
    }
    if (Array.isArray(row.config)) assertRequiredConfigs(row.config, `${where} > ${id}`);
  }
}

/**
 * 预设自带的 Cordis 插件行（§2.1 plugins，可选）。
 *
 * 为什么需要它：Web profile 的 @deepseek-ai/dsh-web-app/cordis.patch.yml 把整个
 * agent 平面（tool-fs / tool-pwsh / tool-web / skill-filesystem / tool-skill /
 * tool-todo / tool-goal / plan-mode / compaction-* / agent-instructions …）在 host
 * 平面整体 disabled，改由**每个预设自己挂载**；declarations.js 的 buildPresetRow()
 * 只渲染 persona + mcp-* + skill-filesystem，所以没有这一段的预设装不进任何工具。
 *
 * 这里只做形状校验，不解释语义：一行必须是 { id, name, config?, … }，id 与 name
 * 必填且 id 唯一（Loader 的 row id 在同一个 entry 列表里必须唯一）。`config` 通常
 * 是 JSON 对象，但 `group: true` 的行例外（config 是嵌套条目数组）。`disabled`
 * 允许布尔或字符串（字符串是 loader 的 `!!js` 表达式形态，见
 * cordis-composition-reference：普通 patch 行按字面量处理，PRESET 平面才求值），
 * 因此这里不做拒绝，只保证是可序列化的标量。
 * @param {*} value - 原始 plugins 字段。
 * @returns {Array} 规范化后的行数组（缺省为空数组）。
 */
export function normalizePlugins(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest('plugins 必须是数组');
  if (value.length > MAX_PLUGIN_ROWS) throw badRequest(`plugins 最多 ${MAX_PLUGIN_ROWS} 行`);
  assertRequiredConfigs(value, 'plugins');
  const out = [];
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const row = asObject(value[i], `plugins[${i}]`);
    const id = text(row.id).trim();
    const name = text(row.name).trim();
    if (id === '') throw badRequest(`plugins[${i}].id 不能为空`);
    if (name === '') throw badRequest(`plugins[${i}].name 不能为空`);
    if (seen.has(id)) throw badRequest(`plugins 行 id "${id}" 重复；同一预设里的行 id 必须唯一`);
    seen.add(id);
    const record = { id, name };
    for (const key of PLUGIN_ROW_KEYS) {
      if (key === 'id' || key === 'name') continue;
      const raw = row[key];
      if (raw === undefined || raw === null) continue;
      if (key === 'config') {
        // 普通行：config 必须是对象。`cordis:group` 行例外 —— 它的 config 是**嵌套
        // 条目列表**（见 cordis-composition-reference：`group: true` 时 config 是
        // 一个 entry 数组，patch 可以按 id 往里 insert）。所以先看 group 再判形状。
        const isGroup = row.group === true;
        if (isGroup) {
          if (!Array.isArray(raw)) throw badRequest(`plugins[${i}].config 是 cordis:group 行，必须是嵌套条目数组`);
          record.config = raw;
          continue;
        }
        if (!isPlainObject(raw)) throw badRequest(`plugins[${i}].config 必须是 JSON 对象`);
        record.config = raw;
        continue;
      }
      if (key === 'disabled') {
        // 布尔、`{ __jsExpr }` 标记，或表达式字符串。
        //
        // **字符串会被自动升格成 `{ __jsExpr: 字符串 }`**：Loader 的 disabledOf 对
        // 非标记值走 `Boolean(options.disabled)`，任何非空字符串恒为真 —— 一串看着像
        // 表达式的 `"process.platform === 'win32'"` 会把这一行在**所有平台**静默停用，
        // 不报错、不写日志，极难排查。与其拒绝（用户的本意显然是个表达式），不如按
        // 他的意图把它变成真正的表达式。见 docs/CONTRACT.md §2.7。
        if (typeof raw === 'boolean') record.disabled = raw;
        else if (isJsExprMarker(raw)) record.disabled = raw;
        else if (typeof raw === 'string') record.disabled = { __jsExpr: raw };
        else throw badRequest(`plugins[${i}].disabled 必须是布尔值、{ __jsExpr: "表达式" } 或表达式字符串`);
        continue;
      }
      if (key === 'inject') {
        if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) throw badRequest(`plugins[${i}].inject 必须是字符串数组`);
        record.inject = raw.slice();
        continue;
      }
      if (key === 'isolate') {
        if (!isPlainObject(raw)) throw badRequest(`plugins[${i}].isolate 必须是 JSON 对象`);
        record.isolate = raw;
        continue;
      }
      if (key === 'group') {
        if (typeof raw !== 'boolean') throw badRequest(`plugins[${i}].group 必须是布尔值`);
        record.group = raw;
        continue;
      }
      // intercept：形状自由，序列化时原样带上
      record.intercept = raw;
    }
    out.push(record);
  }
  return out;
}

/** 目录项引用列表：只保留形如 id 的字符串，去重且保序。 */
export function normalizeRefs(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest('引用列表必须是数组');
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const id = text(item).trim().toLowerCase();
    if (!SLUG_ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** §2.6 ParamValues.values：一层深的标量/数组，null 视为「没设过」而丢掉。 */
export function normalizeValues(value) {
  const input = asObject(value === undefined || value === null ? {} : value, 'values');
  const out = {};
  for (const key of Object.keys(input)) {
    if (key === '' || key === '__proto__' || key === 'constructor') continue;
    const raw = input[key];
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      out[key] = raw.filter((v) => v !== undefined && v !== null && !isPlainObject(v)).map((v) => (typeof v === 'string' ? v : String(v)));
      continue;
    }
    if (isPlainObject(raw)) throw badRequest(`values["${key}"] 不能是对象`);
    out[key] = raw;
  }
  return out;
}

/* ------------------------------ 三种实体 ------------------------------ */

/**
 * 子预设不能拿来当参数名的保留字。
 *
 * `parent` 是子预设引用父预设「可继承提示词」的占位名（写 `{{ $parent }}`）。
 * 它由渲染层注入，不来自 ParamValues；如果允许用户定义同名参数，两者会抢同一个
 * 占位符 —— 到底取用户填的值还是父预设的文本将变得无法解释。所以直接不允许。
 */
export const RESERVED_PARAM_NAMES = ['parent'];

/** §2.1 PresetDefinition。时间戳由 store 负责，这里不管。
 *  plugins 是可选字段：没有这个键时**不写进返回值**，store 层据此区分
 *  「本次保存没带插件清单」与「用户确实清空了插件清单」，避免旧版编辑界面
 *  保存一次就把已有插件默默清掉。 */
export function normalizePresetDefinition(payload) {
  const raw = asObject(payload, 'PresetDefinition');
  const id = normalizeId(raw.id, '预设 id');
  const definition = {
    id,
    name: text(raw.name).trim() || id,
    description: text(raw.description).trim(),
    order: integer(raw.order, 0),
    prompt: text(raw.prompt),
    params: normalizeParams(raw.params),
    form: normalizeForm(raw.form),
    mcp: normalizeRefs(raw.mcp),
    skills: normalizeRefs(raw.skills),
  };
  if (raw.plugins !== undefined) definition.plugins = normalizePlugins(raw.plugins);
  // 子预设：指向父预设。只允许一层，环与自引用由 routes 层在保存时校验（那里才知道
  // 全部预设）。空串等同「没有父」，不留字段 —— 顶层预设的对象形状保持不变。
  if (raw.parentId !== undefined && raw.parentId !== null && String(raw.parentId).trim() !== '') {
    definition.parentId = normalizeId(raw.parentId, '父预设 id');
  }
  // 父预设的「可继承提示词」：子预设用 `{{ $parent }}` 取它。空串不留字段。
  const sharedPrompt = text(raw.sharedPrompt);
  if (sharedPrompt !== '') definition.sharedPrompt = sharedPrompt;
  return definition;
}

function normalizeEnv(value) {
  if (!isPlainObject(value)) return {};
  const out = {};
  for (const key of Object.keys(value)) {
    if (key === '' || key === '__proto__') continue;
    const v = value[key];
    out[key] = v === undefined || v === null ? '' : typeof v === 'string' ? v : String(v);
  }
  return out;
}

/** §2.2 McpEntry。server 直接映射到 @deepseek-ai/dsh-mcp-client 的 config。 */
export function normalizeMcpEntry(payload) {
  const raw = asObject(payload, 'McpEntry');
  const id = normalizeId(raw.id, 'MCP id');
  const server = isPlainObject(raw.server) ? raw.server : {};
  const transport = MCP_TRANSPORTS.includes(server.transport) ? server.transport : 'stdio';
  const args = Array.isArray(server.args) ? server.args.filter((v) => v !== undefined && v !== null && !isPlainObject(v)).map((v) => String(v)) : [];
  return {
    id,
    name: text(raw.name).trim() || id,
    description: text(raw.description).trim(),
    enabled: bool(raw.enabled, true),
    server: {
      serverName: text(server.serverName).trim() || id,
      transport,
      command: text(server.command).trim(),
      args,
      cwd: text(server.cwd).trim(),
      env: normalizeEnv(server.env),
      url: text(server.url).trim(),
      toolCallTimeoutMs: integer(server.toolCallTimeoutMs, 120000),
    },
  };
}

/** §2.3 SkillEntry。source==='inline' 必须有正文，否则写出来的 SKILL.md 是空壳。 */
export function normalizeSkillEntry(payload) {
  const raw = asObject(payload, 'SkillEntry');
  const id = normalizeId(raw.id, 'Skill id');
  const source = SKILL_SOURCES.includes(raw.source) ? raw.source : 'inline';
  const content = text(raw.content);
  const dir = text(raw.path).trim();
  if (source === 'path' && dir === '') throw badRequest('source 为 path 时必须填写 Skill 目录的绝对路径');
  if (source === 'inline' && content.trim() === '') throw badRequest('source 为 inline 时必须填写 Skill 正文（SKILL.md 内容）');
  return {
    id,
    name: text(raw.name).trim() || id,
    description: text(raw.description).trim(),
    enabled: bool(raw.enabled, true),
    source,
    content: source === 'inline' ? content : '',
    path: source === 'path' ? dir : '',
  };
}
