/* ------------------------------------------------------------------ *
 * 低代码表单引擎（契约 §4）。
 *
 * 同样是「裸语句片段」：没有 import / export，没有 JSX。依赖 00-prelude.js 的绑定，
 * 以及 10-ui.js 的 UI 原语（Icon / UiInput / UiField / …）和那里的 APE_CSS 样式表。
 *
 * 设计原则：
 *  - 全部是纯函数 + 一个受控组件，值不落地在本地 state（除校验结果），父组件说了算；
 *  - rule / value / params 任一为 null、字段缺失、类型不认识，都只是少渲染一点，绝不抛错。
 * ------------------------------------------------------------------ */

/* rule.type → ParamSpec.type（契约 §4.2 ↔ §2.4） */
const LC_PARAM_TYPE = {
  input: 'text',
  textarea: 'textarea',
  number: 'number',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  switch: 'switch',
  slider: 'slider',
};

/* ParamSpec.type → rule.type（反向） */
const LC_RULE_TYPE = {
  text: 'input',
  textarea: 'textarea',
  number: 'number',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  switch: 'switch',
  slider: 'slider',
};

/* 已知控件类型（契约 §4.2 全表；不在表内的按「未知」处理） */
const LC_TYPES = ['input', 'textarea', 'number', 'select', 'radio', 'checkbox', 'switch', 'slider', 'divider', 'title', 'prompt-preview'];

/* ParamSpec.name / {{ $name }} 的合法形状（契约 §2.4） */
const LC_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/* ------------------------------------------------------------------ *
 * rule / value 的归一化工具
 * ------------------------------------------------------------------ */

/** rule 归一化成数组（顺手兼容「只给一条 rule」的写法）。 */
function lcRules(rule) {
  if (Array.isArray(rule)) {
    const out = [];
    for (let i = 0; i < rule.length; i += 1) {
      if (rule[i] && typeof rule[i] === 'object') out.push(rule[i]);
    }
    return out;
  }
  if (rule && typeof rule === 'object') return [rule];
  return [];
}

/** rule 的透传 props（缺省给空对象，调用方不用再判空）。 */
function lcProps(rule) {
  return rule && rule.props && typeof rule.props === 'object' ? rule.props : {};
}

/** 从 rule.props 里取值，缺省用 fallback。 */
function lcProp(rule, name, fallback) {
  const bag = lcProps(rule);
  return bag[name] === undefined ? fallback : bag[name];
}

/** 栅格宽度（24 栅格制，缺省 24）。 */
function lcSpan(rule) {
  const col = rule && rule.col && typeof rule.col === 'object' ? rule.col : null;
  const span = col ? apeNum(col.span, 24) : 24;
  return clamp(Math.round(span), 1, 24);
}

/** rule.validate 归一化成数组。 */
function lcChecks(rule) {
  const raw = rule ? rule.validate : null;
  if (Array.isArray(raw)) {
    const out = [];
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i] && typeof raw[i] === 'object') out.push(raw[i]);
    }
    return out;
  }
  if (raw && typeof raw === 'object') return [raw];
  return [];
}

/** 是否声明为必填。 */
function lcRequired(rule) {
  const checks = lcChecks(rule);
  for (let i = 0; i < checks.length; i += 1) {
    if (checks[i].required === true) return true;
  }
  return false;
}

/** 「空」的定义：null / undefined / '' / []。注意 0 和 false 是有值的。 */
function lcEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** 把「存下来的值」掰成控件期望的形状（checkbox → 数组，switch → 布尔，number → 数字）。 */
function lcCoerce(rule, value) {
  const type = rule && typeof rule.type === 'string' ? rule.type : 'input';
  if (type === 'checkbox') {
    if (Array.isArray(value)) return value.slice();
    if (value === null || value === undefined || value === '') return [];
    return [value];
  }
  if (type === 'switch') {
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined || value === '' || value === 0 || value === '0' || value === 'false') return false;
    if (value === 1 || value === '1' || value === 'true') return true;
    return value !== false;
  }
  if (type === 'number' || type === 'slider') {
    if (value === null || value === undefined || value === '') {
      return type === 'slider' ? apeNum(lcProp(rule, 'min', undefined), 0) : '';
    }
    const n = apeNum(value, NaN);
    return Number.isFinite(n) ? n : '';
  }
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return value;
}

/** rule 的默认值（已经是控件期望的形状）。 */
function lcDefault(rule) {
  return lcCoerce(rule, rule ? rule.value : undefined);
}

/** 取某条 rule 在当前值集合里的当前值，缺失时落到 rule.value。 */
function lcValueOf(rule, values) {
  const field = rule && typeof rule.field === 'string' ? rule.field.trim() : '';
  if (field && values && typeof values === 'object' && values[field] !== undefined) {
    return lcCoerce(rule, values[field]);
  }
  return lcDefault(rule);
}

/** 把 options 洗成 ParamSpec 允许的 {label,value}[]。 */
function lcPlainOptions(list) {
  const options = apeOptions(list);
  const out = [];
  for (let i = 0; i < options.length; i += 1) {
    out.push({ label: options[i].label, value: options[i].value });
  }
  return out;
}

/** 校验错误文案。 */
function lcMessage(check, rule, field) {
  if (typeof check.message === 'string' && check.message !== '') return check.message;
  const label = rule && typeof rule.title === 'string' && rule.title !== '' ? rule.title : field;
  if (check.required === true) return label + ' 必填';
  if (check.pattern) return label + ' 格式不正确';
  if (check.min !== undefined || check.max !== undefined) return label + ' 超出取值范围';
  if (check.minLength !== undefined || check.maxLength !== undefined) return label + ' 长度不正确';
  return label + ' 不合法';
}

/* ------------------------------------------------------------------ *
 * 契约 §4.3：取值 / 设值 / 校验 / 互转
 * ------------------------------------------------------------------ */

/**
 * 由 rule 取一份值对象。
 * @param {Array|object} rule - Rule[]。
 * @returns {object} { field: value }，checkbox 是数组、switch 是布尔。
 */
function valuesFromRule(rule) {
  const out = {};
  const list = lcRules(rule);
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const field = typeof item.field === 'string' ? item.field.trim() : '';
    if (!field) continue;
    out[field] = lcDefault(item);
  }
  return out;
}

/**
 * 校验：目前支持 required / pattern / min / max / minLength / maxLength / validator。
 * @param {Array|object} rule - Rule[]。
 * @param {object} value - 当前值。
 * @returns {{ok: boolean, errors: object}} errors 是 { field: 文案 }。
 */
function validateRule(rule, value) {
  const errors = {};
  const list = lcRules(rule);
  const values = value && typeof value === 'object' ? value : {};
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const field = typeof item.field === 'string' ? item.field.trim() : '';
    if (!field) continue;
    const checks = lcChecks(item);
    if (checks.length === 0) continue;
    const current = values[field] !== undefined ? lcCoerce(item, values[field]) : lcDefault(item);
    const empty = lcEmpty(current);
    for (let j = 0; j < checks.length; j += 1) {
      const check = checks[j];
      if (!check || typeof check !== 'object') continue;
      if (check.required === true && empty) {
        errors[field] = lcMessage(check, item, field);
        break;
      }
      if (empty) continue;
      let failed = false;
      if (typeof check.pattern === 'string' && check.pattern !== '') {
        try {
          if (!new RegExp(check.pattern).test(String(current))) failed = true;
        } catch (error) { /* 正则写错不阻塞用户 */ }
      }
      if (!failed && typeof check.min === 'number' && Number(current) < check.min) failed = true;
      if (!failed && typeof check.max === 'number' && Number(current) > check.max) failed = true;
      if (!failed && typeof check.minLength === 'number' && String(current).length < check.minLength) failed = true;
      if (!failed && typeof check.maxLength === 'number' && String(current).length > check.maxLength) failed = true;
      if (!failed && typeof check.validator === 'function') {
        try {
          const result = check.validator(current, values);
          if (result === false) failed = true;
          else if (typeof result === 'string' && result !== '') {
            errors[field] = result;
            break;
          }
        } catch (error) { /* 自定义校验自己抛错不算表单错误 */ }
      }
      if (failed) {
        errors[field] = lcMessage(check, item, field);
        break;
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors: errors };
}

/** ParamSpec.default → rule.value。 */
function lcSpecDefault(spec, type) {
  const raw = spec ? spec.default : undefined;
  if (type === 'checkbox') {
    if (Array.isArray(raw)) return raw.slice();
    if (raw === null || raw === undefined || raw === '') return [];
    return [raw];
  }
  if (type === 'switch') return raw === true || raw === 'true' || raw === 1 || raw === '1';
  if (type === 'number' || type === 'slider') {
    const n = apeNum(raw, NaN);
    if (Number.isFinite(n)) return n;
    return type === 'slider' ? apeNum(spec ? spec.min : undefined, 0) : '';
  }
  if (raw === null || raw === undefined || typeof raw === 'object') return '';
  return raw;
}

/**
 * 由 ParamSpec[] 生成默认 rule（编辑器与用户都用它兜底）。
 * @param {Array} params - ParamSpec[]。
 * @returns {Array} Rule[]。
 */
function ruleFromParams(params) {
  const list = Array.isArray(params) ? params : [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const spec = list[i];
    if (!spec || typeof spec !== 'object') continue;
    const field = typeof spec.name === 'string' ? spec.name.trim() : '';
    if (!field) continue;
    const type = LC_RULE_TYPE[typeof spec.type === 'string' ? spec.type : ''] || 'input';
    const label = typeof spec.label === 'string' && spec.label !== '' ? spec.label : field;
    const rule = {
      type: type,
      field: field,
      title: label,
      value: lcSpecDefault(spec, type),
      info: typeof spec.description === 'string' ? spec.description : '',
      props: {},
      validate: spec.required === true ? [{ required: true, message: label + ' 必填' }] : [],
      col: { span: 24 },
    };
    const options = lcPlainOptions(spec.options);
    if (options.length > 0) rule.props.options = options;
    const min = apeNum(spec.min, NaN);
    const max = apeNum(spec.max, NaN);
    const step = apeNum(spec.step, NaN);
    if (type === 'number' || type === 'slider') {
      if (Number.isFinite(min)) rule.props.min = min;
      if (Number.isFinite(max)) rule.props.max = max;
      if (Number.isFinite(step)) rule.props.step = step;
    }
    if (type === 'textarea') {
      const rows = apeNum(spec.rows, NaN);
      if (Number.isFinite(rows)) rule.props.rows = clamp(Math.round(rows), 1, 40);
    }
    out.push(rule);
  }
  return out;
}

/**
 * 由 rule 反推 ParamSpec[]（保存预设时同步 params 字段）。
 * 无 field 的项（divider / title / prompt-preview）跳过；非法或重名的 field 跳过。
 * @param {Array|object} rule - Rule[]。
 * @returns {Array} ParamSpec[]。
 */
function paramsFromRule(rule) {
  const list = lcRules(rule);
  const out = [];
  const seen = {};
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const field = typeof item.field === 'string' ? item.field.trim() : '';
    if (!field) continue;
    if (!LC_NAME_RE.test(field)) continue;
    if (seen[field] === true) continue;
    seen[field] = true;
    const type = LC_PARAM_TYPE[typeof item.type === 'string' ? item.type : ''] || 'text';
    const spec = {
      name: field,
      label: typeof item.title === 'string' && item.title !== '' ? item.title : field,
      type: type,
      default: lcDefault(item),
    };
    const options = lcPlainOptions(lcProp(item, 'options', null));
    if (options.length > 0) spec.options = options;
    if (type === 'number' || type === 'slider') {
      const min = apeNum(lcProp(item, 'min', undefined), NaN);
      const max = apeNum(lcProp(item, 'max', undefined), NaN);
      const step = apeNum(lcProp(item, 'step', undefined), NaN);
      if (Number.isFinite(min)) spec.min = min;
      if (Number.isFinite(max)) spec.max = max;
      if (Number.isFinite(step)) spec.step = step;
    }
    if (typeof item.info === 'string' && item.info !== '') spec.description = item.info;
    if (lcRequired(item)) spec.required = true;
    out.push(spec);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 渲染：rule → 控件
 * ------------------------------------------------------------------ */

/** 数字输入的中间态（'-'、'1e' 这种半成品原样保留，不强行变 NaN）。 */
function lcNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  const n = apeNum(raw, NaN);
  return Number.isFinite(n) ? n : String(raw);
}

/** 按 rule.type 生成控件。未知类型给提示条，不抛错。 */
function lcControl(rule, type, current, setValue, disabled) {
  const bagDisabled = disabled === true || lcProp(rule, 'disabled', false) === true;
  const rawPlaceholder = lcProp(rule, 'placeholder', '');
  const placeholder = typeof rawPlaceholder === 'string' ? rawPlaceholder : '';
  switch (type) {
    case 'input':
      return h(UiInput, {
        value: apeStr(current, ''),
        onChange: setValue,
        placeholder: placeholder,
        disabled: bagDisabled,
        type: 'text',
      });
    case 'textarea':
      return h(UiTextarea, {
        value: apeStr(current, ''),
        onChange: setValue,
        placeholder: placeholder,
        disabled: bagDisabled,
        rows: apeNum(lcProp(rule, 'rows', undefined), 3),
      });
    case 'number':
      return h(UiInput, {
        value: current === '' || current === null || current === undefined ? '' : apeStr(current, ''),
        onChange: function (raw) { setValue(lcNumber(raw)); },
        placeholder: placeholder,
        disabled: bagDisabled,
        type: 'number',
        min: lcProp(rule, 'min', undefined),
        max: lcProp(rule, 'max', undefined),
        step: lcProp(rule, 'step', undefined),
      });
    case 'select':
      return h(UiSelect, {
        value: current,
        onChange: setValue,
        options: apeOptions(lcProp(rule, 'options', null)),
        disabled: bagDisabled,
        multiple: lcProp(rule, 'multiple', false) === true,
      });
    case 'radio':
      return h(UiRadioGroup, {
        value: current,
        onChange: setValue,
        options: apeOptions(lcProp(rule, 'options', null)),
        disabled: bagDisabled,
        vertical: lcProp(rule, 'vertical', false) === true,
      });
    case 'checkbox':
      return h(UiCheckGroup, {
        value: Array.isArray(current) ? current : [],
        onChange: setValue,
        options: apeOptions(lcProp(rule, 'options', null)),
        disabled: bagDisabled,
        vertical: lcProp(rule, 'vertical', false) === true,
      });
    case 'switch':
      return h(UiSwitch, {
        checked: current === true,
        onChange: setValue,
        disabled: bagDisabled,
      });
    case 'slider':
      return h(UiSlider, {
        value: current,
        onChange: setValue,
        min: lcProp(rule, 'min', undefined),
        max: lcProp(rule, 'max', undefined),
        step: lcProp(rule, 'step', undefined),
        disabled: bagDisabled,
      });
    default:
      return h('div', { className: 'ape-form-unknown' },
        h(Icon, { name: 'alert', size: 13 }),
        h('span', null, '未知控件类型「' + apeStr(type, '?') + '」，已按提示条渲染'));
  }
}

/**
 * prompt-preview 的文本来源：
 * 1) props.renderPrompt 回调。上层实际出现了两种写法，这里按「第一个非空字符串胜出」
 *    依次试探，谁都不会让另一种写法失效：
 *      a. renderPrompt()                 —— 50-params.js 的写法：不给参数就渲染当前预设的提示词；
 *      b. renderPrompt(props.prompt, 值)  —— 60-edit.js / shell 的写法：(prompt, values, params)；
 *      c. renderPrompt(rule, 值) 等常见变体；
 * 2) rule.props.prompt 字面量（没有回调或回调全都给不出内容时）。
 */
function lcPreviewText(renderPrompt, rule, values) {
  const own = lcProp(rule, 'prompt', '');
  const fallback = typeof own === 'string' ? own : '';
  if (typeof renderPrompt !== 'function') return fallback;
  const attempts = [
    function () { return renderPrompt(); },
    function () { return renderPrompt(fallback, values); },
    function () { return renderPrompt(rule, values); },
    function () { return renderPrompt(values, rule); },
    function () { return renderPrompt(rule); },
    function () { return renderPrompt(values); },
  ];
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const out = attempts[i]();
      if (typeof out === 'string' && out !== '') return out;
    } catch (error) { /* 签名不匹配，换下一个 */ }
  }
  return fallback;
}

/* ------------------------------------------------------------------ *
 * LcForm —— 契约 §4.3
 * props: { rule: Rule[], value: object, onChange(nextValue, field, val),
 *          ctx, mode: 'edit'|'fill', renderPrompt }
 * 额外（可选）：showErrors=false 关掉即时错误显示，disabled 整体禁用。
 * 栅格：24 栅格；窄容器（<430px，右栏常态）自动退化成单列。
 * ------------------------------------------------------------------ */
function LcForm(props) {
  const p = props || {};
  const ruleInput = p.rule;
  const list = useMemo(function () { return lcRules(ruleInput); }, [ruleInput]);
  const values = p.value && typeof p.value === 'object' ? p.value : {};
  const mode = p.mode === 'edit' ? 'edit' : 'fill';
  const showErrors = p.showErrors !== false;
  const disabled = p.disabled === true;
  const renderPrompt = p.renderPrompt;
  const errors = useMemo(function () { return validateRule(list, values).errors; }, [list, values]);

  const emit = function (field, next) {
    if (!field) return;
    if (typeof p.onChange !== 'function') return;
    const nextValue = {};
    for (const key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) nextValue[key] = values[key];
    }
    nextValue[field] = next;
    p.onChange(nextValue, field, next);
  };

  if (list.length === 0) {
    return h(Fragment, null,
      apeStyle(),
      h('div', { className: cx('ape-form', p.className) },
        h(UiEmpty, {
          title: '这个界面还没有字段',
          hint: '在「编辑模式 → 低代码界面开发」里添加控件，或点「从参数生成界面」由参数一键生成。',
        })));
  }

  const cells = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const type = typeof item.type === 'string' && item.type !== '' ? item.type : 'input';
    const field = typeof item.field === 'string' ? item.field.trim() : '';
    const span = lcSpan(item);
    const key = 'lc-cell-' + i;

    if (type === 'divider') {
      cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span 24' } },
        h('div', { className: 'ape-form-divider' })));
      continue;
    }

    if (type === 'title') {
      const text = typeof item.title === 'string' ? item.title : '';
      cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span 24' } },
        h('div', { className: 'ape-form-title' }, text)));
      continue;
    }

    if (type === 'prompt-preview') {
      cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span 24' } },
        h(UiField, {
          label: typeof item.title === 'string' && item.title !== '' ? item.title : '提示词预览',
          info: typeof item.info === 'string' ? item.info : '',
        }, h('pre', { className: 'ape-form-preview' }, lcPreviewText(renderPrompt, item, values)))));
      continue;
    }

    if (!field) {
      cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span ' + span } },
        h(UiField, { label: typeof item.title === 'string' ? item.title : '' },
          h('div', { className: 'ape-form-unknown' },
            h(Icon, { name: 'alert', size: 13 }),
            h('span', null, '这条 rule（' + type + '）没有 field，已跳过')))));
      continue;
    }

    const current = lcValueOf(item, values);
    const control = lcControl(item, type, current, function (next) { emit(field, next); }, disabled);
    const actions = mode === 'edit'
      ? h(Fragment, null,
        h('span', { className: 'ape-mono ape-dim' }, field),
        h(UiBadge, { tone: LC_TYPES.indexOf(type) >= 0 ? 'default' : 'warn' }, type))
      : undefined;

    cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span ' + span } },
      h(UiField, {
        label: typeof item.title === 'string' && item.title !== '' ? item.title : field,
        info: typeof item.info === 'string' ? item.info : '',
        error: showErrors && errors[field] ? errors[field] : undefined,
        required: lcRequired(item),
        actions: actions,
      }, control)));
  }

  return h(Fragment, null,
    apeStyle(),
    h('div', { className: cx('ape-form', p.className), 'data-lc-mode': mode },
      h('div', { className: 'ape-form-grid' }, cells)));
}
