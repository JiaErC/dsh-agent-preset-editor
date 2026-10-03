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

/** §2.1 PresetDefinition。时间戳由 store 负责，这里不管。 */
export function normalizePresetDefinition(payload) {
  const raw = asObject(payload, 'PresetDefinition');
  const id = normalizeId(raw.id, '预设 id');
  return {
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
