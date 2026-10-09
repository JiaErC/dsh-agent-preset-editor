/* ------------------------------------------------------------------ *
 * Edit mode — the authoring surface of the plugin.
 *
 * Five stacked sections, in the order a preset is actually authored:
 *   1. basics        id / name / description / order
 *   2. prompt        the persona text plus its `{{ $param }}` placeholders
 *   3. params        the ParamSpec table (name / label / type / default)
 *   4. form          the low-code rule that drives parameter mode
 *   5. mcp + skills  what this preset mounts on top of the base agent
 * A sticky action bar closes the view: save / save & publish / delete / back.
 *
 * The draft lives in component state; every write goes through `Api.*` and is
 * followed by `reload()`, so the host stays the single owner of the files.
 * ------------------------------------------------------------------ */

/** Param names a preset may declare (`ParamSpec.name` and `{{ $name }}`). */
const ED_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Preset ids — same shape `toPresetId` mints and the host validates. */
const ED_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
/** The `{{ $name }}` placeholder, source form so it can be re-instantiated. */
const ED_PLACEHOLDER_SOURCE = '\\{\\{\\s*\\$([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}';

/** ParamSpec types the editor offers (contract §2.4). */
const ED_PARAM_TYPES = [
  { label: '文本', value: 'text' },
  { label: '多行文本', value: 'textarea' },
  { label: '数字', value: 'number' },
  { label: '下拉选择', value: 'select' },
  { label: '单选组', value: 'radio' },
  { label: '多选组', value: 'checkbox' },
  { label: '开关', value: 'switch' },
  { label: '滑块', value: 'slider' },
];
/** Types that carry an `options` list. */
const ED_OPTION_TYPES = { select: true, radio: true, checkbox: true };
/** Types that carry `min` / `max` / `step`. */
const ED_RANGE_TYPES = { number: true, slider: true };
/** Low-code rule type ← ParamSpec type, for the local fallbacks only. */
const ED_RULE_TYPE_OF = {
  text: 'input',
  textarea: 'textarea',
  number: 'number',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  switch: 'switch',
  slider: 'slider',
};

const ED_CARD_STYLE = {
  border: '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.28))',
  borderRadius: 8,
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const ED_GRID2_STYLE = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
const ED_MUTED_STYLE = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: 12,
  lineHeight: 1.5,
  // Multi-line prose must wrap inside its own column instead of running under
  // the controls beside it.
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
};
const ED_NOTICE_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08))',
};
const ED_PRE_STYLE = {
  margin: 0,
  padding: 8,
  borderRadius: 6,
  background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08))',
  color: 'var(--dsw-alias-label-primary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 240,
  overflow: 'auto',
};
const ED_CODE_STYLE = {
  fontSize: 11,
  color: 'var(--dsw-alias-label-secondary, inherit)',
  wordBreak: 'break-all',
};
const ED_STACK_STYLE = { display: 'flex', flexDirection: 'column', gap: 8 };
const ED_CHIPROW_STYLE = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minWidth: 0 };
const ED_ROW_STYLE = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: '10px 8px',
  minWidth: 0,
  borderTop: '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.18))',
};
const ED_TOP_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
  paddingBottom: 8,
  borderBottom: '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.28))',
};
const ED_ACTIONS_STYLE = {
  position: 'sticky',
  bottom: 0,
  zIndex: 1,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
  padding: '8px 0',
  background: 'var(--dsw-alias-bg-layer-1, transparent)',
  borderTop: '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.28))',
};
const ED_SPACER_STYLE = { flex: '1 1 auto' };

/* ---------------------------- small helpers ---------------------------- */

/** Never-throwing string coercion (undefined/null → ''). */
function EdStr(value) {
  return value === undefined || value === null ? '' : String(value);
}

/** Coerce to an array; anything else becomes an empty one. */
function EdArr(value) {
  return Array.isArray(value) ? value : [];
}

/** Human/JSON text for an unknown value (used for read-only blob display). */
function EdText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return EdJson(value);
}

/** `JSON.stringify` that never throws. */
function EdJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return '';
  }
}

/** Deep copy of plain JSON data; falls back to the original on failure. */
function EdClone(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

/** The message of an unknown error value. */
function EdMessage(error) {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (error.message) return String(error.message);
  return String(error);
}

/** A finite number or the fallback. */
function EdNumber(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** The best default value for a ParamSpec type (contract §2.4). */
function EdDefaultForType(type) {
  if (type === 'switch') return false;
  if (type === 'checkbox') return [];
  if (type === 'number' || type === 'slider') return 0;
  return '';
}

/** `{ name: default }` for every parameter, used to preview the prompt. */
function EdDefaultValues(params) {
  var out = {};
  var list = EdArr(params);
  for (var i = 0; i < list.length; i += 1) {
    var param = list[i] || {};
    if (!param.name) continue;
    out[param.name] = param.default === undefined ? EdDefaultForType(param.type) : param.default;
  }
  return out;
}

/** A brand new ParamSpec, pre-filled the way its type wants to look. */
function EdNewParam(type) {
  var kind = type || 'text';
  var param = {
    name: '',
    label: '',
    type: kind,
    default: EdDefaultForType(kind),
    description: '',
    required: false,
  };
  if (ED_OPTION_TYPES[kind]) {
    param.options = [{ label: '选项一', value: 'option-1' }];
    if (kind !== 'checkbox') param.default = 'option-1';
  }
  if (ED_RANGE_TYPES[kind]) {
    param.min = 0;
    param.max = 100;
    param.step = 1;
    param.default = 0;
  }
  return param;
}

/** Re-type a ParamSpec, keeping what still makes sense and repairing the rest. */
function EdRetypeParam(param, type) {
  var current = param || {};
  var kind = type || 'text';
  var next = {
    name: EdStr(current.name),
    label: EdStr(current.label),
    type: kind,
    description: EdStr(current.description),
    required: current.required === true,
    default: EdDefaultForType(kind),
  };
  var options = EdArr(current.options);
  if (ED_OPTION_TYPES[kind]) {
    next.options = options.length ? EdClone(options) : [{ label: '选项一', value: 'option-1' }];
    if (kind === 'checkbox') {
      next.default = Array.isArray(current.default) ? current.default.slice() : [];
    } else {
      var kept = false;
      for (var i = 0; i < next.options.length; i += 1) {
        if (next.options[i] && next.options[i].value === current.default) kept = true;
      }
      next.default = kept ? current.default : next.options[0].value;
    }
    return next;
  }
  if (kind === 'switch') {
    next.default = typeof current.default === 'boolean' ? current.default : false;
    return next;
  }
  if (ED_RANGE_TYPES[kind]) {
    next.min = typeof current.min === 'number' ? current.min : 0;
    next.max = typeof current.max === 'number' ? current.max : 100;
    next.step = typeof current.step === 'number' ? current.step : 1;
    next.default = typeof current.default === 'number' ? current.default : next.min;
    return next;
  }
  next.default = typeof current.default === 'string' ? current.default : '';
  return next;
}

/** Normalise a ParamSpec down to the fields the contract defines. */
function EdCleanParam(param) {
  var source = param || {};
  var type = source.type || 'text';
  var out = {
    name: EdStr(source.name).trim(),
    label: EdStr(source.label),
    type: type,
    default: source.default === undefined ? EdDefaultForType(type) : source.default,
  };
  if (ED_OPTION_TYPES[type]) {
    out.options = EdArr(source.options).map(function (option) {
      return { label: EdStr(option && option.label), value: option && option.value };
    });
  }
  if (ED_RANGE_TYPES[type]) {
    out.min = EdNumber(source.min, 0);
    out.max = EdNumber(source.max, 100);
    out.step = EdNumber(source.step, 1);
  }
  if (source.description) out.description = EdStr(source.description);
  if (source.required === true) out.required = true;
  return out;
}

/** Every `{{ $name }}` in the text, de-duplicated, in order of appearance. */
function EdScanPlaceholders(text) {
  var source = EdStr(text);
  var re = new RegExp(ED_PLACEHOLDER_SOURCE, 'g');
  var found = [];
  var seen = {};
  var match = re.exec(source);
  while (match !== null) {
    if (!seen[match[1]]) {
      seen[match[1]] = true;
      found.push(match[1]);
    }
    match = re.exec(source);
  }
  return found;
}

/** Replace `[start, end)` of the text — the primitive behind cursor inserts. */
function EdReplaceRange(text, start, end, insert) {
  var source = EdStr(text);
  var from = clamp(EdNumber(start, source.length), 0, source.length);
  var to = clamp(EdNumber(end, from), from, source.length);
  return source.slice(0, from) + insert + source.slice(to);
}

/** `{ index, message }` for every parameter name that cannot be saved. */
function EdParamIssues(params) {
  var list = EdArr(params);
  var issues = [];
  var seen = {};
  for (var i = 0; i < list.length; i += 1) {
    var name = EdStr(list[i] && list[i].name).trim();
    if (!name) {
      issues.push({ index: i, message: '第 ' + (i + 1) + ' 个参数的参数名为空' });
    } else if (!ED_NAME_RE.test(name)) {
      issues.push({ index: i, message: '参数名「' + name + '」不合法：只能用字母、数字、下划线，且不能以数字开头' });
    } else if (seen[name]) {
      issues.push({ index: i, message: '参数名「' + name + '」重复' });
    } else {
      seen[name] = true;
    }
  }
  return issues;
}

/** Everything that blocks a save, as user-facing sentences (empty = ok). */
function EdValidateDraft(draft) {
  var source = draft || {};
  var issues = [];
  var id = EdStr(source.id).trim();
  if (!id) issues.push('预设 ID 不能为空');
  else if (!ED_ID_RE.test(id)) issues.push('预设 ID 只能用小写字母、数字和连字符，且以字母或数字开头');
  if (!EdStr(source.name).trim()) issues.push('预设名称不能为空');
  var paramIssues = EdParamIssues(EdArr(source.params));
  if (paramIssues.length) issues.push('参数定义有误：' + paramIssues[0].message);
  issues = issues.concat(EdPluginRowIssues(EdArr(source.plugins)));
  return issues;
}

/* ------------------------- Cordis 插件行（plugins） ------------------------- */

/* `id` 用 Loader 的 row id 规则；`name` 是包名或 cordis:group 之类的内置行。 */
const ED_PLUGIN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** 一行里允许出现的键；其余键一律丢弃（host 的 normalizePlugins 同样只认这些）。 */
const ED_PLUGIN_ROW_KEYS = ['id', 'name', 'config', 'disabled', 'inject', 'intercept', 'isolate', 'group'];

/**
 * 把任意输入洗成「一行」的形状。非对象、缺 id/name 的项一律丢弃，
 * 这样从 JSON 里读到脏数据也不会把声明文件写坏。
 * @returns {{ok: boolean, row: object|null, reason: string}}
 */
function EdCleanPluginRow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, row: null, reason: '不是 JSON 对象' };
  }
  var id = EdStr(value.id).trim();
  var name = EdStr(value.name).trim();
  if (!id) return { ok: false, row: null, reason: '缺少 id' };
  if (!ED_PLUGIN_ID_RE.test(id)) return { ok: false, row: null, reason: 'id「' + id + '」含非法字符' };
  if (!name) return { ok: false, row: null, reason: '缺少 name' };
  var row = { id: id, name: name };
  for (var i = 0; i < ED_PLUGIN_ROW_KEYS.length; i += 1) {
    var key = ED_PLUGIN_ROW_KEYS[i];
    if (key === 'id' || key === 'name') continue;
    if (value[key] === undefined || value[key] === null) continue;
    row[key] = EdClone(value[key]);
  }
  return { ok: true, row: row, reason: '' };
}

/** 整份插件清单的校验：返回面向用户的句子数组（空数组 = 没问题）。 */
function EdPluginRowIssues(list) {
  var issues = [];
  var rows = EdArr(list);
  var seen = {};
  for (var i = 0; i < rows.length; i += 1) {
    var cleaned = EdCleanPluginRow(rows[i]);
    if (!cleaned.ok) {
      issues.push('插件清单第 ' + (i + 1) + ' 行有误：' + cleaned.reason);
      continue;
    }
    if (seen[cleaned.row.id] === true) {
      issues.push('插件清单里行 id「' + cleaned.row.id + '」重复；同一预设内的行 id 必须唯一，否则加载器会撞名');
      continue;
    }
    seen[cleaned.row.id] = true;
  }
  return issues;
}

/**
 * 清洗整份插件清单（用于「应用 JSON」）。
 * @returns {{ok: boolean, rows: Array, message: string}}
 */
function EdCleanPluginList(value) {
  if (!Array.isArray(value)) return { ok: false, rows: [], message: '插件清单必须是一个数组（Row[]）' };
  var rows = [];
  var seen = {};
  for (var i = 0; i < value.length; i += 1) {
    var cleaned = EdCleanPluginRow(value[i]);
    if (!cleaned.ok) return { ok: false, rows: [], message: '第 ' + (i + 1) + ' 行有误：' + cleaned.reason };
    if (seen[cleaned.row.id] === true) return { ok: false, rows: [], message: '行 id「' + cleaned.row.id + '」重复' };
    seen[cleaned.row.id] = true;
    rows.push(cleaned.row);
  }
  return { ok: true, rows: rows, message: '' };
}

/** The stored (user-owned) definition for an id, or null. */
function EdPresetSource(state, presetId) {
  if (!state || !presetId || !Array.isArray(state.presets)) return null;
  for (var i = 0; i < state.presets.length; i += 1) {
    var preset = state.presets[i];
    if (preset && preset.id === presetId) return preset;
  }
  return null;
}

/** The live DSH roster entry for an id, or null. */
function EdRosterEntry(state, presetId) {
  var roster = state && state.dsh && Array.isArray(state.dsh.roster) ? state.dsh.roster : [];
  if (!presetId) return null;
  for (var i = 0; i < roster.length; i += 1) {
    if (roster[i] && roster[i].id === presetId) return roster[i];
  }
  return null;
}

/** How many stored presets reference a catalogue entry. */
function EdReferenceCount(state, key, id) {
  var presets = state && Array.isArray(state.presets) ? state.presets : [];
  var count = 0;
  for (var i = 0; i < presets.length; i += 1) {
    if (presets[i] && EdArr(presets[i][key]).indexOf(id) !== -1) count += 1;
  }
  return count;
}

/* --------------------- form-engine calls (contract §4.3) --------------------- */

/** The rule that drives a preset's parameter form. */
function EdRuleFromPreset(preset) {
  if (preset && preset.form && Array.isArray(preset.form.rule)) return EdClone(preset.form.rule);
  return EdRuleFromParams(preset ? preset.params : []);
}

/** Rule[] for ParamSpec[] — prefers the shared engine, keeps a local fallback. */
function EdRuleFromParams(params) {
  if (typeof ruleFromParams === 'function') {
    try {
      return EdClone(EdArr(ruleFromParams(params)));
    } catch (error) {
      console.error('[agent-preset-editor] ruleFromParams failed', error);
    }
  }
  var list = EdArr(params);
  var rule = [];
  for (var i = 0; i < list.length; i += 1) {
    var param = list[i] || {};
    var type = param.type || 'text';
    var item = {
      type: ED_RULE_TYPE_OF[type] || 'input',
      field: EdStr(param.name),
      title: EdStr(param.label || param.name),
      value: param.default === undefined ? EdDefaultForType(type) : param.default,
    };
    if (param.description) item.info = EdStr(param.description);
    var props = {};
    if (ED_OPTION_TYPES[type]) props.options = EdClone(EdArr(param.options));
    if (ED_RANGE_TYPES[type]) {
      props.min = param.min;
      props.max = param.max;
      props.step = param.step;
    }
    if (Object.keys(props).length) item.props = props;
    if (param.required === true) item.validate = [{ required: true, message: '必填' }];
    if (item.field) rule.push(item);
  }
  return rule;
}

/** ParamSpec[] for Rule[] — prefers the shared engine, keeps a local fallback. */
function EdParamsFromRule(rule) {
  if (typeof paramsFromRule === 'function') {
    try {
      return EdClone(EdArr(paramsFromRule(rule)));
    } catch (error) {
      console.error('[agent-preset-editor] paramsFromRule failed', error);
    }
  }
  var list = EdArr(rule);
  var params = [];
  for (var i = 0; i < list.length; i += 1) {
    var item = list[i] || {};
    if (!item.field) continue;
    var props = item.props || {};
    var type = item.type === 'input' ? 'text' : item.type;
    var known = false;
    for (var t = 0; t < ED_PARAM_TYPES.length; t += 1) {
      if (ED_PARAM_TYPES[t].value === type) known = true;
    }
    if (!known) type = 'text';
    var spec = {
      name: EdStr(item.field),
      label: EdStr(item.title || item.field),
      type: type,
      default: item.value === undefined ? EdDefaultForType(type) : item.value,
    };
    if (ED_OPTION_TYPES[type]) spec.options = EdClone(EdArr(props.options));
    if (ED_RANGE_TYPES[type]) {
      spec.min = props.min;
      spec.max = props.max;
      spec.step = props.step;
    }
    var validate = EdArr(item.validate);
    if (validate.length && validate[0] && validate[0].required === true) spec.required = true;
    if (item.info) spec.description = EdStr(item.info);
    params.push(spec);
  }
  return params;
}

/** `{ field: value }` from the rule's own `value` fields. */
function EdValuesFromRule(rule) {
  if (typeof valuesFromRule === 'function') {
    try {
      return valuesFromRule(rule) || {};
    } catch (error) {
      console.error('[agent-preset-editor] valuesFromRule failed', error);
    }
  }
  var out = {};
  var list = EdArr(rule);
  for (var i = 0; i < list.length; i += 1) {
    var item = list[i] || {};
    if (item.field) out[item.field] = item.value;
  }
  return out;
}

/** Write one control's value back into the rule (the form designer's onChange). */
function EdRuleSetValue(rule, field, value) {
  return EdArr(rule).map(function (item) {
    if (item && item.field === field) return Object.assign({}, item, { value: value });
    return item;
  });
}

/* ------------------------------ prompt rendering ------------------------------ */

/** Contract §2.5 rendering, used only while the shell's renderPrompt is absent. */
function EdRenderPromptLocal(prompt, values, params) {
  var list = EdArr(params);
  var map = {};
  for (var i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].name) map[list[i].name] = list[i];
  }
  var bag = values || {};
  return EdStr(prompt).replace(new RegExp(ED_PLACEHOLDER_SOURCE, 'g'), function (whole, name) {
    var spec = map[name];
    var value = Object.prototype.hasOwnProperty.call(bag, name) ? bag[name] : undefined;
    if (value === undefined || value === null || value === '') value = spec ? spec.default : undefined;
    if (value === undefined || value === null || value === '') return '';
    if (Array.isArray(value)) return value.join('、');
    if (typeof value === 'boolean') return value ? '是' : '否';
    return String(value);
  });
}

/** Render the prompt through the shell's renderer, falling back locally. */
function EdRenderPromptText(prompt, values, params) {
  if (typeof renderPrompt === 'function') {
    try {
      return EdStr(renderPrompt(prompt, values, params));
    } catch (error) {
      console.error('[agent-preset-editor] renderPrompt failed', error);
    }
  }
  return EdRenderPromptLocal(prompt, values, params);
}

/* ------------------------------- draft model ------------------------------- */

/** The editable draft for a preset id (a fresh one when the id is unknown). */
function EdDraftFrom(state, presetId) {
  var stored = EdPresetSource(state, presetId);
  var roster = EdRosterEntry(state, presetId);
  var source = stored || {};
  return {
    id: EdStr(stored ? stored.id : presetId),
    name: EdStr(source.name || (roster && roster.name) || ''),
    description: EdStr(source.description || (roster && roster.description) || ''),
    order: typeof source.order === 'number' ? source.order : 0,
    prompt: EdStr(source.prompt),
    params: EdClone(EdArr(source.params)) || [],
    rule: EdRuleFromPreset(stored),
    mcp: EdArr(source.mcp).slice(),
    skills: EdArr(source.skills).slice(),
    plugins: EdClone(EdArr(source.plugins)) || [],
  };
}

/** The PresetDefinition the host stores (timestamps belong to the host). */
function EdBuildDefinition(draft) {
  var source = draft || {};
  return {
    id: EdStr(source.id).trim(),
    name: EdStr(source.name).trim(),
    description: EdStr(source.description).trim(),
    order: EdNumber(source.order, 0),
    prompt: EdStr(source.prompt),
    params: EdArr(source.params).map(EdCleanParam),
    form: { rule: EdClone(EdArr(source.rule)) || [] },
    // 原始 Cordis 行必须显式带上：host 的 normalizePlugins 见到这个键才会替换，
    // 不带就等于「本次没提供插件清单」，store 会沿用上一次落盘的值。
    plugins: EdClone(EdArr(source.plugins)) || [],
    mcp: EdArr(source.mcp).slice(),
    skills: EdArr(source.skills).slice(),
  };
}

/* -------------------------------- section 1 -------------------------------- */
/* Top bar: jump to parameter mode, or make this preset the session's preset.  */

function EdTopBar(props) {
  var dsh = (props.state && props.state.dsh) || {};
  var draft = props.draft || {};
  var isCurrent = !!dsh.sessionPreset && dsh.sessionPreset === draft.id;
  return h('div', { style: ED_TOP_STYLE },
    h(UiButton, {
      size: 'sm',
      icon: 'sliders',
      disabled: !draft.id,
      title: '打开该预设的参数配置界面',
      onClick: props.onOpenParams,
    }, '参数配置'),
    h(UiButton, {
      size: 'sm',
      icon: 'play',
      variant: 'primary',
      disabled: props.busy || !draft.id,
      title: '把当前会话切换到该预设；已经开始任务的会话无法切换',
      onClick: props.onEnable,
    }, '启用此预设'),
    isCurrent ? h(UiBadge, { tone: 'ok' }, '当前会话') : null,
    dsh.sessionPresetLocked ? h(UiBadge, { tone: 'warn' }, '会话已锁定') : null
  );
}

/** The basics: id (locked once it exists), name, description, order. */
function EdBasicsSection(props) {
  var draft = props.draft || {};
  var idError = '';
  if (draft.id && !ED_ID_RE.test(EdStr(draft.id))) idError = '只能用小写字母、数字、连字符';
  return h(UiSection, { title: '基础信息' },
    h(UiField, {
      label: '预设 ID',
      required: true,
      error: idError,
      info: props.idLocked
        ? 'ID 与 DSH 预设 id 相同，保存后不可修改（换 ID 等于新建一个预设）'
        : '保存后不可修改；留空会在保存时报错',
    }, h(UiInput, {
      value: EdStr(draft.id),
      disabled: props.idLocked || props.busy,
      placeholder: 'design-doc-writer',
      onChange: props.onId,
    })),
    props.showIdHelper
      ? h(UiButton, {
        size: 'sm',
        variant: 'ghost',
        disabled: !EdStr(draft.name).trim(),
        onClick: props.onIdFromName,
      }, '由名称生成 ID')
      : null,
    h(UiField, { label: '名称' }, h(UiInput, {
      value: EdStr(draft.name),
      placeholder: '设计文档 Agent',
      onChange: props.onName,
    })),
    h(UiField, { label: '描述' }, h(UiInput, {
      value: EdStr(draft.description),
      placeholder: '把需求转化为设计文档',
      onChange: props.onDescription,
    })),
    h(UiField, {
      label: '排序',
      info: '数字越小越靠前（列表中）',
    }, h(UiInput, {
      type: 'number',
      value: EdStr(draft.order),
      onChange: props.onOrder,
    })),
    props.overrideNotice
      ? h('div', { style: ED_NOTICE_STYLE },
        h('div', null, '「' + EdStr(draft.id) + '」当前来自 DSH 内置声明。'),
        h('div', { style: ED_MUTED_STYLE }, '保存后会在插件里生成一个同名预设，覆盖内置声明的展示；内置声明的原始内容只能只读查看。'),
        h('div', { style: ED_CHIPROW_STYLE },
          h(UiButton, {
            size: 'sm',
            icon: 'refresh',
            disabled: props.sourceLoading,
            onClick: props.onReadBuiltin,
          }, '查看内置声明'),
          props.sourceError ? h(UiBadge, { tone: 'err' }, props.sourceError) : null
        ),
        props.sourceContent
          ? h('pre', { style: ED_PRE_STYLE }, props.sourceContent)
          : null
      )
      : null
  );
}

/* -------------------------------- section 2 -------------------------------- */
/* The prompt itself: textarea, placeholder scan and cursor-accurate inserts.  */

/** One click-to-insert chip for a parameter placeholder. */
function EdPlaceholderChip(props) {
  return h(UiButton, {
    size: 'sm',
    variant: 'ghost',
    title: '在光标处插入 ' + props.text,
    onClick: props.onInsert,
  }, props.text);
}

function EdPromptSection(props) {
  var draft = props.draft || {};
  var params = EdArr(draft.params);
  var prompt = EdStr(draft.prompt);
  var wrapRef = useRef(null);
  var inputRef = useRef(null);
  var pendingCaret = useRef(null);

  /** The live <textarea>, via UiTextarea's inputRef (or a wrapper lookup). */
  function fieldNode() {
    var node = inputRef.current;
    if (node && typeof node.setSelectionRange === 'function') return node;
    var wrap = wrapRef.current;
    if (wrap && typeof wrap.querySelector === 'function') return wrap.querySelector('textarea');
    return null;
  }

  var detected = useMemo(function () { return EdScanPlaceholders(prompt); }, [prompt]);
  var defined = useMemo(function () {
    return EdArr(params).map(function (param) { return EdStr(param && param.name); }).filter(Boolean);
  }, [params]);
  var labelOf = useMemo(function () {
    var map = {};
    EdArr(params).forEach(function (param) {
      if (param && param.name) map[param.name] = EdStr(param.label || param.name);
    });
    return map;
  }, [params]);
  var missing = detected.filter(function (name) { return defined.indexOf(name) === -1; });
  var unused = defined.filter(function (name) { return detected.indexOf(name) === -1; });

  // Restore the caret after an insert re-rendered the textarea.
  useEffect(function () {
    if (pendingCaret.current === null) return;
    var caret = pendingCaret.current;
    pendingCaret.current = null;
    var node = fieldNode();
    if (!node) return;
    try {
      node.focus();
      var at = clamp(caret, 0, EdStr(node.value).length);
      node.setSelectionRange(at, at);
    } catch (error) {
      /* a textarea without selection support simply keeps focus */
    }
  });

  /** Insert `snippet` at the caret and park the caret `offset` chars later. */
  function insertSnippet(snippet, offset) {
    var node = fieldNode();
    var start = node ? node.selectionStart : prompt.length;
    var end = node ? node.selectionEnd : start;
    var next = EdReplaceRange(prompt, start, end, snippet);
    var caret = clamp(EdNumber(start, 0), 0, next.length) + EdNumber(offset, snippet.length);
    pendingCaret.current = clamp(caret, 0, next.length);
    props.onPrompt(next);
  }

  function addMissing() {
    var additions = missing.map(function (name) {
      var spec = EdNewParam('text');
      spec.name = name;
      spec.label = name;
      spec.default = '';
      return spec;
    });
    props.onParams(params.concat(additions));
    if (props.toast) props.toast.show('已为 ' + missing.length + ' 个未定义占位补上参数（请补默认值）', 'ok');
  }

  var preview = EdRenderPromptText(prompt, EdDefaultValues(params), params);

  return h(UiSection, {
    title: 'Agent 预设提示词',
    actions: h(EdPlaceholderChip, {
      text: '插入 {{ $ }}',
      onInsert: function () { insertSnippet('{{ $ }}', 4); },
    }),
  },
    h('div', { style: ED_MUTED_STYLE }, '这段文本会成为该预设的 persona 前缀。用 {{ $参数名 }} 把可变部分抽成参数，用户在「参数配置」模式里按任务微调。'),
    h('div', { ref: wrapRef }, h(UiTextarea, {
      value: prompt,
      rows: 10,
      inputRef: inputRef,
      placeholder: '你是 {{ $role }}。\n任务类型：{{ $taskType }}\n',
      onChange: props.onPrompt,
    })),
    defined.length
      ? h('div', { style: ED_CHIPROW_STYLE },
        h('span', { style: ED_MUTED_STYLE }, '点击插入已定义参数：'),
        defined.map(function (name) {
          var snippet = '{{ $' + name + ' }}';
          return h(EdPlaceholderChip, {
            key: name,
            text: labelOf[name] || name,
            onInsert: function () { insertSnippet(snippet, snippet.length); },
          });
        }))
      : null,
    h('div', { style: ED_NOTICE_STYLE },
      h('div', { style: ED_CHIPROW_STYLE },
        h('span', { style: ED_MUTED_STYLE }, '正文里识别到的参数：'),
        detected.length
          ? detected.map(function (name) {
            var known = defined.indexOf(name) !== -1;
            return h(UiBadge, { key: name, tone: known ? 'ok' : 'warn' },
              '{{ $' + name + ' }}' + (known ? '' : ' · 未定义'));
          })
          : h('span', { style: ED_MUTED_STYLE }, '（还没有占位）')
      ),
      missing.length
        ? h('div', { style: ED_CHIPROW_STYLE },
          h(UiBadge, { tone: 'warn' }, '正文中未定义参数 ' + missing.length + ' 个'),
          h(UiButton, { size: 'sm', icon: 'plus', onClick: addMissing }, '一键补全参数定义')
        )
        : null,
      unused.length
        ? h('div', { style: ED_MUTED_STYLE }, '已定义但正文未使用：' + unused.join('、'))
        : null
    ),
    h('div', null,
      h('div', { style: ED_MUTED_STYLE }, '按默认值实时预览：'),
      h('pre', { style: ED_PRE_STYLE }, preview || '（提示词为空）')
    )
  );
}

/* -------------------------------- section 3 -------------------------------- */
/* The ParamSpec table: name / label / type / default / description.          */

/** Editor for one entry of `options` (select / radio / checkbox only). */
function EdParamOptionsEditor(props) {
  var options = EdArr(props.options);
  function patchAt(index, field, value) {
    props.onChange(options.map(function (option, i) {
      if (i !== index) return option;
      var next = Object.assign({}, option || {});
      next[field] = value;
      return next;
    }));
  }
  return h('div', { style: ED_STACK_STYLE },
    h('div', { style: ED_MUTED_STYLE }, '选项（标签 = 用户看到的文字，值 = 传给提示词的值）'),
    options.map(function (option, index) {
      return h('div', {
        key: index,
        style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, alignItems: 'center' },
      },
        h(UiInput, {
          value: EdStr(option && option.label),
          placeholder: '标签',
          onChange: function (value) { patchAt(index, 'label', value); },
        }),
        h(UiInput, {
          value: EdStr(option && option.value),
          placeholder: '值',
          onChange: function (value) { patchAt(index, 'value', value); },
        }),
        h(UiButton, {
          size: 'sm',
          variant: 'ghost',
          icon: 'trash',
          title: '删除该选项',
          onClick: function () {
            props.onChange(options.filter(function (_option, i) { return i !== index; }));
          },
        })
      );
    }),
    h(UiButton, {
      size: 'sm',
      icon: 'plus',
      onClick: function () {
        props.onChange(options.concat([{ label: '选项' + (options.length + 1), value: '' }]));
      },
    }, '添加选项')
  );
}

/** Default-value editor whose control follows the parameter's type. */
function EdParamDefaultEditor(props) {
  var param = props.param || {};
  var type = param.type || 'text';
  if (type === 'switch') {
    return h(UiSwitch, {
      checked: param.default === true,
      label: param.default === true ? '默认开启' : '默认关闭',
      onChange: props.onChange,
    });
  }
  if (ED_OPTION_TYPES[type]) {
    var options = EdArr(param.options).filter(function (option) { return option && option.value !== undefined; });
    if (!options.length) {
      return h(UiInput, {
        value: EdStr(param.default),
        placeholder: '默认值（先添加选项）',
        onChange: props.onChange,
      });
    }
    if (type === 'checkbox') {
      return h(UiCheckGroup, {
        value: EdArr(param.default),
        options: options,
        onChange: props.onChange,
      });
    }
    return h(UiSelect, {
      value: EdStr(param.default),
      options: options,
      onChange: props.onChange,
    });
  }
  if (ED_RANGE_TYPES[type]) {
    return h(UiInput, {
      type: 'number',
      value: EdStr(param.default),
      onChange: function (text) { props.onChange(text === '' ? '' : Number(text)); },
    });
  }
  return h(UiInput, {
    value: EdStr(param.default),
    placeholder: '默认值',
    onChange: props.onChange,
  });
}

/** One parameter definition, as a card (the sidebar is too narrow for a grid). */
function EdParamCard(props) {
  var param = props.param || {};
  var type = param.type || 'text';
  function patch(partial) {
    props.onChange(Object.assign({}, param, partial));
  }
  return h('div', { style: ED_CARD_STYLE },
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'end' } },
      h(UiField, {
        label: '参数名',
        required: true,
        error: props.issue,
        info: '提示词里用 {{ $' + EdStr(param.name || 'name') + ' }} 引用',
      }, h(UiInput, {
        value: EdStr(param.name),
        placeholder: 'taskType',
        onChange: function (value) { patch({ name: value.trim() }); },
      })),
      h(UiButton, {
        size: 'sm',
        variant: 'ghost',
        icon: 'trash',
        title: '删除该参数',
        onClick: props.onRemove,
      })
    ),
    h('div', { style: ED_GRID2_STYLE },
      h(UiField, { label: '标签' }, h(UiInput, {
        value: EdStr(param.label),
        placeholder: '任务类型',
        onChange: function (value) { patch({ label: value }); },
      })),
      h(UiField, { label: '类型' }, h(UiSelect, {
        value: type,
        options: ED_PARAM_TYPES,
        onChange: props.onRetype,
      }))
    ),
    h(UiField, {
      label: '默认值',
      info: '默认值 = 该预设的最优值；用户可在参数配置模式里按任务微调',
    }, h(EdParamDefaultEditor, {
      param: param,
      onChange: function (value) { patch({ default: value }); },
    })),
    h(UiField, { label: '说明' }, h(UiInput, {
      value: EdStr(param.description),
      placeholder: '可选，显示在表单控件下方',
      onChange: function (value) { patch({ description: value }); },
    })),
    ED_OPTION_TYPES[type]
      ? h(EdParamOptionsEditor, {
        options: param.options,
        onChange: function (value) { patch({ options: value }); },
      })
      : null,
    h(UiSwitch, {
      checked: param.required === true,
      label: '必填',
      onChange: function (value) { patch({ required: value }); },
    })
  );
}

function EdParamsSection(props) {
  var params = EdArr(props.params);
  var issues = EdParamIssues(params);
  var issueOf = {};
  for (var i = 0; i < issues.length; i += 1) {
    if (issueOf[issues[i].index] === undefined) issueOf[issues[i].index] = issues[i].message;
  }
  return h(UiSection, {
    title: '参数定义（' + params.length + '）',
    actions: h(UiButton, {
      size: 'sm',
      icon: 'plus',
      onClick: function () { props.onChange(params.concat([EdNewParam('text')])); },
    }, '添加参数'),
  },
    h('div', { style: ED_MUTED_STYLE }, '每个参数都要给一个「最优默认值」——那是这个预设推荐的做法；用户在参数配置模式里只做按任务的微调，不动定义。'),
    params.length
      ? h('div', { style: ED_STACK_STYLE }, params.map(function (param, index) {
        return h(EdParamCard, {
          key: index,
          param: param,
          issue: issueOf[index] || '',
          onChange: function (next) {
            props.onChange(params.map(function (item, i) { return i === index ? next : item; }));
          },
          onRetype: function (type) {
            props.onChange(params.map(function (item, i) {
              return i === index ? EdRetypeParam(item, type) : item;
            }));
          },
          onRemove: function () {
            props.onChange(params.filter(function (_item, i) { return i !== index; }));
          },
        });
      }))
      : h(UiEmpty, { title: '还没有参数', hint: '参数让提示词可以在不改正文的前提下按任务变化。' }),
    issues.length
      ? h('div', { style: ED_CHIPROW_STYLE }, h(UiBadge, { tone: 'err' }, issues.length + ' 处参数名需要修正'))
      : null
  );
}

/* -------------------------------- section 4 -------------------------------- */
/* Low-code form design: the very rule the parameter mode renders.            */

function EdFormSection(props) {
  var draft = props.draft || {};
  var rule = EdArr(draft.rule);
  var ruleJson = useMemo(function () { return EdJson(rule); }, [rule]);
  var values = useMemo(function () { return EdValuesFromRule(rule); }, [rule]);
  var jsonState = useState(ruleJson);
  var jsonText = jsonState[0];
  var setJsonText = jsonState[1];
  var touchedState = useState(false);
  var jsonTouched = touchedState[0];
  var setJsonTouched = touchedState[1];

  // Follow the rule unless the user is mid-edit in the JSON box.
  useEffect(function () {
    if (!jsonTouched) setJsonText(ruleJson);
  }, [ruleJson, jsonTouched]);

  function onFormChange(nextValue, field, val) {
    var value = val === undefined ? (nextValue ? nextValue[field] : undefined) : val;
    props.onRule(EdRuleSetValue(rule, field, value));
  }

  function generateRule() {
    var next = EdRuleFromParams(EdArr(draft.params));
    props.onRule(next);
    if (props.toast) props.toast.show('已按 ' + EdArr(draft.params).length + ' 个参数生成界面（rule 共 ' + next.length + ' 项）', 'ok');
  }

  function backfillParams() {
    var next = EdParamsFromRule(rule);
    props.onParams(next);
    if (props.toast) props.toast.show('已用界面回填 ' + next.length + ' 个参数定义', 'ok');
  }

  function applyJson() {
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      if (props.toast) props.toast.show('rule JSON 解析失败：' + EdMessage(error), 'err');
      return;
    }
    if (!Array.isArray(parsed)) {
      if (props.toast) props.toast.show('rule 必须是一个数组（Rule[]），当前不是，已保留原内容', 'err');
      return;
    }
    setJsonTouched(false);
    props.onRule(parsed);
    if (props.toast) props.toast.show('已应用 rule JSON（' + parsed.length + ' 项）', 'ok');
  }

  var formNode = typeof LcForm === 'function'
    ? h(LcForm, {
      rule: rule,
      value: values,
      onChange: onFormChange,
      ctx: props.ctx,
      mode: 'edit',
      renderPrompt: EdRenderPromptText,
    })
    : h(UiEmpty, { title: '表单引擎未就绪', hint: '缺少 LcForm（src/client/parts/30-form.js）' });

  return h(UiSection, {
    title: '低代码界面开发',
    actions: h('div', { style: ED_CHIPROW_STYLE },
      h(UiButton, { size: 'sm', icon: 'refresh', onClick: generateRule }, '从参数生成界面'),
      h(UiButton, { size: 'sm', icon: 'check', onClick: backfillParams }, '从界面回填参数')
    ),
  },
    h('div', { style: ED_MUTED_STYLE },
      '下面这个表单就是用户在「参数配置」模式里看到的界面本身（rule）。改某个控件的取值，等于改它在该界面上的默认值；',
      '控件的类型、标题、字段名和列宽请在下面的 rule JSON 里改。',
      '「从参数生成界面」会用参数表重建它，「从界面回填参数」则把界面里的字段同步回参数表。'),
    formNode,
    h(UiField, {
      label: 'rule JSON',
      info: '直接编辑后点「应用 JSON」；解析失败或不是数组时不会覆盖现有界面',
    }, h(UiTextarea, {
      value: jsonText,
      rows: 8,
      placeholder: '[]',
      onChange: function (value) {
        setJsonTouched(true);
        setJsonText(value);
      },
    })),
    h('div', { style: ED_CHIPROW_STYLE },
      h(UiButton, { size: 'sm', variant: 'primary', icon: 'check', disabled: !jsonTouched, onClick: applyJson }, '应用 JSON'),
      h(UiButton, {
        size: 'sm',
        variant: 'ghost',
        disabled: !jsonTouched,
        onClick: function () { setJsonTouched(false); setJsonText(ruleJson); },
      }, '放弃 JSON 改动'),
      jsonTouched ? h(UiBadge, { tone: 'warn' }, 'JSON 有未应用的改动') : h(UiBadge, { tone: 'default' }, 'JSON 与界面一致')
    )
  );
}

/* ------------------------ section 4b: 原始 Cordis 插件行 ------------------------ */
/* Web profile 把整个 agent 平面交给预设自己挂载，所以这一节常常是「有没有工具」的分水岭。 */

function EdPluginsSection(props) {
  var draft = props.draft || {};
  var list = EdArr(draft.plugins);
  var listJson = useMemo(function () { return EdJson(list); }, [list]);
  var jsonState = useState(listJson);
  var jsonText = jsonState[0];
  var setJsonText = jsonState[1];
  var touchedState = useState(false);
  var jsonTouched = touchedState[0];
  var setJsonTouched = touchedState[1];

  // Follow the row list unless the user is mid-edit in the JSON box.
  useEffect(function () {
    if (!jsonTouched) setJsonText(listJson);
  }, [listJson, jsonTouched]);

  var issues = EdPluginRowIssues(list);
  var ids = [];
  for (var i = 0; i < list.length; i += 1) {
    var cleaned = EdCleanPluginRow(list[i]);
    if (cleaned.ok) ids.push(cleaned.row.id);
  }

  function applyJson() {
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      if (props.toast) props.toast.show('插件清单 JSON 解析失败：' + EdMessage(error), 'err');
      return;
    }
    var cleaned = EdCleanPluginList(parsed);
    if (!cleaned.ok) {
      if (props.toast) props.toast.show('插件清单不可用：' + cleaned.message + '（已保留原内容）', 'err');
      return;
    }
    setJsonTouched(false);
    props.onPlugins(cleaned.rows);
    if (props.toast) props.toast.show('已应用插件清单（' + cleaned.rows.length + ' 行）', 'ok');
  }

  return h(UiSection, {
    title: '挂载插件（原始 Cordis 行）',
    actions: h('span', { style: ED_CODE_STYLE },
      list.length + ' 行' + (ids.length ? '：' + ids.join(' / ') : '')),
  },
    h('div', { style: ED_MUTED_STYLE },
      '这一节写的是这个预设自己要挂载的 Cordis 行（Row）。Web 界面把 agent 平面交给了预设：',
      '不在这里挂 tool-fs / tool-pwsh / tool-web / skill-filesystem / tool-skill 等行，',
      '这个预设的 agent 就读不了文件、跑不了命令、上不了网。'),
    h('div', { style: ED_NOTICE_STYLE },
      '第 1 行固定是 persona（由提示词渲染，不用手写）；这里写的行会插在 persona 之后、MCP 与 Skills 行之前。',
      '行 id 在同一预设内必须唯一；config 里的 !!js 表达式在本编辑器里只能按字符串保存，',
      '需要求值的表达式请直接改 profile 的 cordis.patch.yml。'),
    issues.length
      ? h('div', { style: ED_NOTICE_STYLE }, '存在会被加载器拒绝的问题：', h('br', null), issues.join('；'))
      : null,
    h(UiField, {
      label: '插件行 JSON',
      info: '数组，每项至少 { id, name }，可带 config / disabled / inject / isolate / group。改完点「应用 JSON」才会写进草稿。',
    }, h(UiTextarea, {
      value: jsonText,
      rows: 12,
      placeholder: '[]',
      onChange: function (value) {
        setJsonTouched(true);
        setJsonText(value);
      },
    })),
    h('div', { style: ED_CHIPROW_STYLE },
      h(UiButton, { size: 'sm', variant: 'primary', icon: 'check', disabled: !jsonTouched, onClick: applyJson }, '应用 JSON'),
      h(UiButton, {
        size: 'sm',
        variant: 'ghost',
        disabled: !jsonTouched,
        onClick: function () { setJsonTouched(false); setJsonText(listJson); },
      }, '放弃 JSON 改动'),
      jsonTouched ? h(UiBadge, { tone: 'warn' }, 'JSON 有未应用的改动') : h(UiBadge, { tone: 'default' }, 'JSON 与草稿一致'),
      issues.length ? h(UiBadge, { tone: 'err' }, '有 ' + issues.length + ' 个问题') : null
    )
  );
}

/* ------------------------------ section 5 / 6 ------------------------------ */
/* Which catalogue entries this preset actually mounts.                       */

function EdCatalogPicker(props) {
  var entries = EdArr(props.entries);
  var selected = EdArr(props.selected);
  var searchState = useState('');
  var query = searchState[0];
  var setQuery = searchState[1];
  var needle = query.trim().toLowerCase();
  var visible = useMemo(function () {
    if (!needle) return entries;
    return entries.filter(function (entry) {
      var hay = (EdStr(entry && entry.id) + ' ' + EdStr(entry && entry.name) + ' ' + EdStr(entry && entry.description)).toLowerCase();
      return hay.indexOf(needle) !== -1;
    });
  }, [entries, needle]);
  var known = {};
  for (var i = 0; i < entries.length; i += 1) {
    if (entries[i] && entries[i].id) known[entries[i].id] = true;
  }
  var orphan = selected.filter(function (id) { return !known[id]; });

  return h(UiSection, {
    title: props.title + '（' + selected.length + '）',
    actions: h(UiButton, { size: 'sm', icon: 'plus', onClick: props.onOpenCatalog }, props.createLabel),
  },
    h('div', { style: ED_MUTED_STYLE }, props.note),
    entries.length > 3
      ? h(UiSearch, { value: query, onChange: setQuery, placeholder: '搜索' + props.title })
      : null,
    orphan.length
      ? h('div', { style: ED_CHIPROW_STYLE },
        h(UiBadge, { tone: 'warn' }, '引用了不存在的条目：' + orphan.join('、')),
        h('div', { style: ED_MUTED_STYLE }, '它仍会写进预设，但发布时会被 host 跳过或报错，建议改成现有条目。'))
      : null,
    visible.length
      ? h('div', null, visible.map(function (entry) {
        var id = EdStr(entry && entry.id);
        var checked = selected.indexOf(id) !== -1;
        var refs = EdReferenceCount(props.state, props.refKey, id);
        return h('div', { key: id, style: ED_ROW_STYLE },
          h(UiSwitch, {
            checked: checked,
            onChange: function (value) { props.onToggle(id, value); },
          }),
          h('div', { style: { flex: '1 1 auto', minWidth: 0, maxWidth: '100%', wordBreak: 'break-word', overflowWrap: 'anywhere' } },
            h('div', { style: ED_CHIPROW_STYLE },
              h('span', null, EdStr(entry.name || id)),
              h('code', { style: ED_CODE_STYLE }, id),
              entry && entry.enabled === false ? h(UiBadge, { tone: 'warn' }, '已停用') : null,
              checked && entry && entry.enabled === false ? h(UiBadge, { tone: 'err' }, '本预设仍会引用') : null
            ),
            entry && entry.description
              ? h('div', { style: ED_MUTED_STYLE }, EdStr(entry.description))
              : null,
            h('div', { style: ED_MUTED_STYLE }, '被 ' + refs + ' 个预设引用')
          )
        );
      }))
      : h(UiEmpty, {
        title: entries.length ? '没有匹配的条目' : '目录还是空的',
        hint: entries.length ? '换个关键词试试。' : '先在' + props.title + '页签里新建一个，再回来勾选。',
      })
  );
}

/* -------------------------------- action bar -------------------------------- */

function EdActionBar(props) {
  return h('div', { style: ED_ACTIONS_STYLE },
    h(UiButton, { size: 'sm', icon: 'back', onClick: props.onBack }, '返回列表'),
    props.dirty ? h(UiBadge, { tone: 'warn' }, '有未保存改动') : h(UiBadge, { tone: 'default' }, '已同步'),
    h('div', { style: ED_SPACER_STYLE }),
    props.canDelete
      ? h(UiButton, {
        size: 'sm',
        variant: 'danger',
        icon: 'trash',
        disabled: props.busy,
        onClick: props.onDelete,
      }, '删除')
      : null,
    h(UiButton, {
      size: 'sm',
      icon: 'save',
      disabled: props.busy || !props.dirty,
      onClick: props.onSave,
    }, '保存'),
    h(UiButton, {
      size: 'sm',
      variant: 'primary',
      icon: 'check',
      disabled: props.busy,
      onClick: props.onPublish,
    }, '保存并发布到 DSH')
  );
}

/* --------------------------------- the view --------------------------------- */

function EditMode(props) {
  var state = props.state;
  var toast = props.toast;
  var presetId = EdStr(props.presetId);
  var stored = EdPresetSource(state, presetId);
  var rosterEntry = EdRosterEntry(state, presetId);
  var canDelete = !!stored;

  var draftState = useState(null);
  var draft = draftState[0];
  var setDraft = draftState[1];
  var baselineState = useState('');
  var baseline = baselineState[0];
  var setBaseline = baselineState[1];
  var busyState = useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var confirmState = useState(null);
  var confirm = confirmState[0];
  var setConfirm = confirmState[1];
  var sourceState = useState(null);
  var sourceView = sourceState[0];
  var setSourceView = sourceState[1];
  var adoptState = useState(false);
  var adopt = adoptState[0];
  var setAdopt = adoptState[1];

  // Re-seed the draft whenever another preset (or a fresh load) shows up.
  var seedKey = presetId + '|' + (stored ? EdStr(stored.updatedAt) : (rosterEntry ? 'roster' : 'new'));
  useEffect(function () {
    var next = EdDraftFrom(props.state, presetId);
    setDraft(next);
    setBaseline(EdJson(next));
    setSourceView(null);
  }, [seedKey]);

  if (!state) {
    return h(UiEmpty, { title: '暂无数据', hint: '正在连接插件后端；若持续如此，请检查 host 半是否加载。' });
  }
  if (!draft) {
    return h('div', { style: ED_STACK_STYLE }, h(UiSpinner, null));
  }
  // A preset id that is neither stored nor in the live roster: the tab is
  // stale (deleted elsewhere, or opened against another profile). Say so
  // instead of quietly turning into a "create a preset with this id" form.
  if (presetId && !stored && !rosterEntry && !adopt) {
    return h('div', { style: ED_STACK_STYLE },
      h(UiEmpty, {
        title: '找不到预设「' + presetId + '」',
        hint: '它可能已被删除，或这个标签页打开时的数据已经过期。',
      }),
      h('div', { style: ED_CHIPROW_STYLE },
        h(UiButton, {
          size: 'sm',
          icon: 'back',
          onClick: function () { props.setMode(MODE_LIST, {}); },
        }, '返回列表'),
        h(UiButton, {
          size: 'sm',
          variant: 'primary',
          icon: 'plus',
          onClick: function () { setAdopt(true); },
        }, '以此 ID 新建预设')
      )
    );
  }

  var dirty = EdJson(draft) !== baseline;

  function patchDraft(partial) {
    setDraft(function (current) { return (current ? Object.assign({}, current, partial) : current); });
  }

  function notify(message, tone) {
    if (toast) toast.show(message, tone);
  }

  function fail(prefix, error) {
    console.error('[agent-preset-editor] ' + prefix, error);
    notify(prefix + '：' + EdMessage(error), 'err');
  }

  function toggleSelection(key, id, checked) {
    var list = EdArr(draft[key]).slice();
    var index = list.indexOf(id);
    if (checked && index === -1) list.push(id);
    if (!checked && index !== -1) list.splice(index, 1);
    var partial = {};
    partial[key] = list;
    patchDraft(partial);
  }

  async function save(options) {
    if (busy) return false;
    var issues = EdValidateDraft(draft);
    if (issues.length) {
      notify(issues[0], 'err');
      return false;
    }
    setBusy(true);
    try {
      await Api.savePreset(EdBuildDefinition(draft));
      setBaseline(EdJson(draft));
      if (props.reload) await props.reload();
      // Publishing chains onto save(); it reports once, with the publish result.
      if (!options || options.silent !== true) {
        notify('已保存预设「' + (draft.name || draft.id) + '」', 'ok');
      }
      return true;
    } catch (error) {
      fail('保存失败', error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    var id = EdStr(draft.id).trim();
    var ok = await save({ silent: true });
    if (!ok) return;
    setBusy(true);
    try {
      var result = await Api.applyPreset(id);
      var text = '已发布到 DSH';
      if (result && result.mode) text += '（' + result.mode + '）';
      if (result && result.restartRequired) text += '；需要重启 DSH 后生效';
      if (result && result.note) text += '；' + result.note;
      notify(text, 'ok');
    } catch (error) {
      fail('发布失败', error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await Api.deletePreset(draft.id);
      notify('已删除预设「' + (draft.name || draft.id) + '」', 'ok');
      if (props.reload) await props.reload();
      if (props.setMode) props.setMode(MODE_LIST, {});
    } catch (error) {
      fail('删除失败', error);
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    var remote = props.ctx && props.ctx.remote;
    if (!remote || !remote.agentPresets || typeof remote.agentPresets.select !== 'function') {
      notify('当前环境不支持切换预设', 'err');
      return;
    }
    setBusy(true);
    try {
      await remote.agentPresets.select(props.sessionId, draft.id);
      notify('已切换到「' + (draft.name || draft.id) + '」', 'ok');
      if (props.reload) await props.reload();
    } catch (error) {
      var message = EdMessage(error);
      if ((error && error.code === 'agent-preset/locked') || /locked/i.test(message)) {
        notify('任务已开始，无法切换预设；请新建会话后再选「' + (draft.name || draft.id) + '」', 'err');
      } else {
        notify('切换失败：' + message, 'err');
      }
    } finally {
      setBusy(false);
    }
  }

  async function readBuiltin() {
    var remote = props.ctx && props.ctx.remote;
    if (!remote || !remote.agentPresets || typeof remote.agentPresets.read !== 'function') {
      notify('当前环境无法读取内置预设', 'err');
      return;
    }
    setSourceView({ loading: true, content: '', error: '' });
    try {
      var result = await remote.agentPresets.read(draft.id);
      setSourceView({
        loading: false,
        content: EdText(result && (result.content !== undefined ? result.content : result.agentPreset)).slice(0, 20000),
        error: '',
      });
    } catch (error) {
      console.error('[agent-preset-editor] read builtin preset failed', error);
      setSourceView({ loading: false, content: '', error: EdMessage(error) });
    }
  }

  function back() {
    if (dirty) {
      setConfirm({
        title: '放弃未保存的改动？',
        body: '「' + (draft.name || draft.id || '未命名预设') + '」还有未保存的改动，返回列表后这些改动会丢失。',
        confirmLabel: '放弃改动并返回',
        danger: true,
        onConfirm: function () { props.setMode(MODE_LIST, {}); },
      });
      return;
    }
    props.setMode(MODE_LIST, {});
  }

  function askDelete() {
    setConfirm({
      title: '删除预设？',
      body: '将删除插件里保存的「' + (draft.name || draft.id) + '」（id: ' + draft.id + '）。已发布到 DSH 的声明需要重新发布才会更新。',
      confirmLabel: '删除',
      danger: true,
      onConfirm: remove,
    });
  }

  var heading = stored
    ? '编辑预设'
    : (rosterEntry ? '编辑内置预设' : '新建预设');
  // The id may only be typed while it does not already mean something.
  var idLocked = !!stored || !!rosterEntry;
  var sourceLabel = stored
    ? h(UiBadge, { tone: 'ok' }, '用户预设')
    : (rosterEntry ? h(UiBadge, { tone: 'warn' }, '内置预设') : h(UiBadge, { tone: 'default' }, '未保存'));

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    h('div', { style: ED_CHIPROW_STYLE },
      h('strong', null, heading),
      sourceLabel,
      dirty ? h(UiBadge, { tone: 'warn' }, '未保存') : null,
      busy ? h(UiSpinner, null) : null
    ),
    h(EdTopBar, {
      state: state,
      draft: draft,
      busy: busy,
      onOpenParams: function () { props.setMode(MODE_PARAMS, { presetId: draft.id }); },
      onEnable: enable,
    }),
    h(EdBasicsSection, {
      draft: draft,
      busy: busy,
      idLocked: idLocked,
      showIdHelper: !idLocked,
      overrideNotice: !stored && !!rosterEntry,
      sourceLoading: !!(sourceView && sourceView.loading),
      sourceContent: sourceView ? sourceView.content : '',
      sourceError: sourceView ? sourceView.error : '',
      onId: function (value) { patchDraft({ id: value.trim().toLowerCase() }); },
      onIdFromName: function () { patchDraft({ id: toPresetId(draft.name) }); },
      onName: function (value) { patchDraft({ name: value }); },
      onDescription: function (value) { patchDraft({ description: value }); },
      onOrder: function (value) { patchDraft({ order: value === '' ? 0 : Number(value) }); },
      onReadBuiltin: readBuiltin,
    }),
    h(EdPromptSection, {
      draft: draft,
      toast: toast,
      onPrompt: function (value) { patchDraft({ prompt: value }); },
      onParams: function (value) { patchDraft({ params: value }); },
    }),
    h(EdParamsSection, {
      params: draft.params,
      onChange: function (value) { patchDraft({ params: value }); },
    }),
    h(EdFormSection, {
      draft: draft,
      ctx: props.ctx,
      toast: toast,
      onRule: function (value) { patchDraft({ rule: value }); },
      onParams: function (value) { patchDraft({ params: value }); },
    }),
    h(EdPluginsSection, {
      draft: draft,
      toast: toast,
      onPlugins: function (value) { patchDraft({ plugins: value }); },
    }),
    h(EdCatalogPicker, {
      title: 'MCP 配置',
      note: '只有这里勾选的 MCP 才会挂到这个预设上（一个预设一份，互不影响）。目录本身是全局的，没被勾选就不会影响任何预设。',
      createLabel: '新建 MCP',
      entries: state.mcp,
      selected: draft.mcp,
      state: state,
      refKey: 'mcp',
      onToggle: function (id, checked) { toggleSelection('mcp', id, checked); },
      onOpenCatalog: function () { props.setMode(MODE_LIST, { tab: LIST_MCP }); },
    }),
    h(EdCatalogPicker, {
      title: 'Skills 配置',
      note: '只有勾选的 Skill 才会注入这个预设。Skill 正文可以在 Skills 页签里编辑，勾选顺序不影响加载。',
      createLabel: '新建 Skill',
      entries: state.skills,
      selected: draft.skills,
      state: state,
      refKey: 'skills',
      onToggle: function (id, checked) { toggleSelection('skills', id, checked); },
      onOpenCatalog: function () { props.setMode(MODE_LIST, { tab: LIST_SKILLS }); },
    }),
    h(EdActionBar, {
      dirty: dirty,
      busy: busy,
      canDelete: canDelete,
      onBack: back,
      onDelete: askDelete,
      onSave: save,
      onPublish: publish,
    }),
    h(UiModal, {
      open: !!confirm,
      title: confirm ? confirm.title : '',
      onClose: function () { setConfirm(null); },
      footer: confirm
        ? h('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
          h(UiButton, { size: 'sm', onClick: function () { setConfirm(null); } }, '取消'),
          h(UiButton, {
            size: 'sm',
            variant: confirm.danger ? 'danger' : 'primary',
            onClick: function () {
              var action = confirm.onConfirm;
              setConfirm(null);
              if (action) action();
            },
          }, confirm.confirmLabel))
        : null,
    }, confirm ? h('div', { style: ED_MUTED_STYLE }, confirm.body) : null)
  );
}
