/* ==================================================================== *
 * 50-params.js —— 参数配置模式：用低代码表单按任务微调某个预设的参数，
 *                 实时预览渲染后的提示词；内置预设只读展示声明内容。
 *
 * 本文件是 part 片段（裸语句），被 scripts/build-client.mjs 按文件名升序
 * 拼进 client factory 的函数体：**不要** import / export，**不要**用 JSX。
 * 可用绑定：00-prelude.js、10-ui.js（UI 原语）、20-api.js（Api）、
 *           30-form.js（LcForm / ruleFromParams / valuesFromRule）、
 *           40-list.js（Lst* 工具与 LstEnableButton —— 拼接顺序保证它先加载）。
 * 顶层名字统一加 `Par` / `PAR_` 前缀。
 * ==================================================================== */

/** 参数占位：`{{ $name }}`，允许内部空格（CONTRACT §2.5）。 */
const PAR_PLACEHOLDER_RE = /\{\{\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** 本文件的行内布局常量（只使用主题 token 上色）。 */
const PAR_STYLE = {
  pane: { display: 'flex', flexDirection: 'column', gap: '10px' },
  header: { display: 'flex', flexDirection: 'column', gap: '4px' },
  title: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)', fontSize: '13px' },
  desc: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '1.6' },
  badges: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  muted: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
};

/* -------------------------------------------------------------------- *
 * 取值与渲染
 * -------------------------------------------------------------------- */

/** 单个值的展示文本：数组用「、」连接，布尔「是/否」，空值空串。 */
function ParValueText(value) {
  if (Array.isArray(value)) {
    var parts = [];
    for (var i = 0; i < value.length; i += 1) parts.push(String(value[i]));
    return parts.join('、');
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value === undefined || value === null) return '';
  return String(value);
}

/**
 * 与 CONTRACT §2.5 一致的本地渲染实现：只在 shell 的 `renderPrompt` 与
 * props.renderPrompt 都不可用时兜底，保证预览永不空白。
 */
function ParRenderLocal(prompt, values, params) {
  var text = String(prompt === undefined || prompt === null ? '' : prompt);
  var bag = values && typeof values === 'object' ? values : {};
  var spec = {};
  LstArray(params).forEach(function (item) {
    if (item && item.name) spec[item.name] = item;
  });
  return text.replace(PAR_PLACEHOLDER_RE, function (match, name) {
    var out = ParValueText(bag[name]);
    if (out === '' && spec[name]) out = ParValueText(spec[name].default);
    return out;
  });
}

/**
 * 渲染提示词：优先 shell 提供的全局 `renderPrompt`（CONTRACT §2.5），
 * 其次 props.renderPrompt，最后用本地实现。
 * 用 try 包住 typeof 是因为 `renderPrompt` 若以 let/const 声明且尚未初始化，
 * 直接 typeof 会抛 TDZ 错误。
 */
function ParRenderText(prompt, values, params, fallback) {
  try {
    if (typeof renderPrompt === 'function') {
      var viaShell = renderPrompt(prompt, values, params);
      if (typeof viaShell === 'string') return viaShell;
    }
  } catch (error) {
    console.error('[agent-preset-editor] shell 的 renderPrompt 不可用，改用本地实现', error);
  }
  try {
    if (typeof fallback === 'function') {
      var viaProps = fallback(prompt, values, params);
      if (typeof viaProps === 'string') return viaProps;
    }
  } catch (error) {
    console.error('[agent-preset-editor] props.renderPrompt 调用失败，改用本地实现', error);
  }
  return ParRenderLocal(prompt, values, params);
}

/** rule → 默认值（优先用 30-form.js 的实现）。 */
function ParValuesFromRule(rule) {
  if (typeof valuesFromRule === 'function') {
    try {
      var viaEngine = valuesFromRule(rule);
      if (viaEngine && typeof viaEngine === 'object') return viaEngine;
    } catch (error) {
      console.error('[agent-preset-editor] valuesFromRule 调用失败，改用本地实现', error);
    }
  }
  var out = {};
  LstArray(rule).forEach(function (item) {
    if (!item || !item.field) return;
    out[item.field] = item.value;
  });
  return out;
}

/** 参数配置模式要渲染的 rule：优先 preset.form.rule，为空时由 params 生成。 */
function ParRuleOf(preset) {
  if (!preset) return [];
  var fromForm = preset.form && Array.isArray(preset.form.rule) ? preset.form.rule : [];
  if (fromForm.length > 0) return fromForm;
  if (LstArray(preset.params).length > 0 && typeof ruleFromParams === 'function') {
    try {
      return LstArray(ruleFromParams(preset.params));
    } catch (error) {
      console.error('[agent-preset-editor] ruleFromParams 调用失败，界面将以空表单呈现', error);
    }
  }
  return [];
}

/** 该预设引用的 MCP / Skills 徽标（目录里找不到的标红）。 */
function ParRefBadges(props) {
  var catalog = LstArray(props.state ? (props.kind === 'mcp' ? props.state.mcp : props.state.skills) : null);
  var index = {};
  catalog.forEach(function (entry) {
    if (entry && entry.id) index[entry.id] = entry;
  });
  var ids = LstArray(props.ids);
  if (ids.length === 0) return h('div', { style: PAR_STYLE.muted }, props.emptyText);
  return h(
    'div',
    { style: PAR_STYLE.badges },
    ids.map(function (id) {
      var entry = index[id];
      var title = entry
        ? (entry.description || id) + (entry.enabled === false ? '（已在目录中停用，不会挂载）' : '')
        : '目录里没有这个条目，引用已失效';
      return h(
        UiBadge,
        { key: id, tone: entry ? (entry.enabled === false ? 'warn' : 'ok') : 'err', title: title },
        (entry && entry.name) || id
      );
    })
  );
}

/* -------------------------------------------------------------------- *
 * 内置（只读）预设
 * -------------------------------------------------------------------- */

/**
 * presetId 在 `state.presets` 里找不到 → 说明这是 DSH 自带或由其它来源声明的
 * 预设，本插件只读。用 ctx.remote.agentPresets.read(id) 拉它的声明内容展示。
 */
function ParBuiltinView(props) {
  var id = props.presetId;
  var infoPair = useState({ loading: true, error: null, data: null, unsupported: false });
  var info = infoPair[0];
  var setInfo = infoPair[1];

  useEffect(function () {
    var alive = true;
    var remote = props.ctx && props.ctx.remote ? props.ctx.remote : null;
    var agentPresets = remote && remote.agentPresets ? remote.agentPresets : null;

    setInfo({ loading: true, error: null, data: null, unsupported: false });
    if (!id || !agentPresets || typeof agentPresets.read !== 'function') {
      setInfo({ loading: false, error: null, data: null, unsupported: true });
      return undefined;
    }
    Promise.resolve()
      .then(function () { return agentPresets.read(id); })
      .then(
        function (data) {
          if (alive) setInfo({ loading: false, error: null, data: data || null, unsupported: false });
        },
        function (error) {
          if (alive) setInfo({ loading: false, error: error, data: null, unsupported: false });
        }
      );
    return function () { alive = false; };
  }, [id]);

  var entry = props.rosterEntry || {};
  var name = entry.name || id;
  var badges = [
    h(UiBadge, { key: 'origin', tone: 'warn', title: 'origin: system —— DSH 自带，本插件只读' }, '内置(system)'),
  ];
  if (entry.broken) badges.push(h(UiBadge, { key: 'broken', tone: 'err', title: String(entry.broken) }, '声明损坏'));

  var content;
  if (info.loading) {
    content = h('div', { style: PAR_STYLE.muted }, h(UiSpinner, null));
  } else if (info.unsupported) {
    content = h(LstNote, null,
      '当前环境没有暴露 agentPresets.read，无法读取这个内置预设的声明内容；它的提示词与参数也不在本插件的管理范围内。');
  } else if (info.error) {
    content = h('div', { style: PAR_STYLE.muted }, '读取声明失败：' + LstErrorText(info.error));
  } else {
    var data = info.data || {};
    content = h(
      'div',
      { style: PAR_STYLE.pane },
      data.description ? h('div', { style: PAR_STYLE.desc }, data.description) : null,
      h('div', { style: PAR_STYLE.muted }, '声明内容（只读）：'),
      h('pre', { style: LST_STYLE.pre }, data.content || data.agentPreset || '（没有内容）')
    );
  }

  return h(
    'div',
    { style: PAR_STYLE.pane },
    h(
      Toolbar,
      null,
      h(
        'div',
        { style: LST_STYLE.toolbarRow },
        h(LstEnableButton, {
          key: 'enable',
          ctx: props.ctx,
          sessionId: props.sessionId,
          presetId: id,
          name: name,
          reload: props.reload,
          toast: props.toast,
          locked: !!(props.state && props.state.dsh && props.state.dsh.sessionPresetLocked),
        }),
        h(
          UiButton,
          {
            key: 'back',
            size: 'sm',
            variant: 'ghost',
            icon: 'back',
            onClick: function () { if (props.setMode) props.setMode(MODE_LIST, {}); },
          },
          '返回列表'
        )
      )
    ),
    h(
      UiSection,
      { title: name },
      h(
        'div',
        { style: PAR_STYLE.header },
        h('div', { style: PAR_STYLE.badges }, badges.concat([
          h('span', {
            key: 'id',
            style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
          }, id),
        ])),
        h(LstNote, null,
          '这个预设不属于本插件（state.presets 里没有它），所以参数配置模式只能看、不能改。'
          + '要按你的需要定制它，请到「编辑」模式用相同的 id 新建一个用户预设——同名用户预设会覆盖内置定义，列表里会标出「覆盖内置」。'),
        content
      )
    )
  );
}

/* -------------------------------------------------------------------- *
 * 参数配置模式
 * -------------------------------------------------------------------- */

/** 参数配置模式：顶端动作条 + 低代码表单 + 实时提示词预览 + 引用徽标。 */
function ParamsMode(props) {
  var state = props.state;
  var presetId = props.presetId;

  var presets = LstArray(state && state.presets);
  var preset = null;
  var i;
  for (i = 0; i < presets.length; i += 1) {
    if (presets[i] && presets[i].id === presetId) {
      preset = presets[i];
      break;
    }
  }
  var roster = LstArray(state && state.dsh && state.dsh.roster);
  var rosterEntry = null;
  for (i = 0; i < roster.length; i += 1) {
    if (roster[i] && roster[i].id === presetId) {
      rosterEntry = roster[i];
      break;
    }
  }

  // —— 所有 hook 都无条件执行，分支只发生在 return 处 ——
  var rule = useMemo(function () { return ParRuleOf(preset); }, [preset]);
  var defaults = useMemo(function () { return ParValuesFromRule(rule); }, [rule]);
  var stored = state && state.values && presetId ? state.values[presetId] : null;
  var initial = useMemo(function () {
    var base = Object.assign({}, defaults);
    if (stored && typeof stored === 'object') {
      var key;
      for (key in stored) {
        if (Object.prototype.hasOwnProperty.call(stored, key)) base[key] = stored[key];
      }
    }
    return base;
  }, [defaults, stored]);
  var draftPair = useState(null);
  var draft = draftPair[0];
  var setDraft = draftPair[1];
  var savePair = useState(false);
  var saving = savePair[0];
  var setSaving = savePair[1];

  // 换了预设就把本地草稿丢掉，避免把上一个预设的取值带过来。
  useEffect(function () { setDraft(null); }, [presetId]);

  var values = draft === null ? initial : draft;
  var dirty = draft !== null && !shallowEqual(draft, initial);
  var preview = useMemo(function () {
    if (!preset) return '';
    return ParRenderText(preset.prompt, values, preset.params, props.renderPrompt);
  }, [preset, values, props.renderPrompt]);

  var saveValues = function () {
    if (!preset || saving) return;
    var snapshot = LstWith(values, {});
    LstRun(setSaving, props.toast, '保存参数值', function () {
      return Api.saveValues(preset.id, snapshot).then(function () {
        return Promise.resolve(props.reload()).then(function () {
          setDraft(null);
          LstOk(props.toast, '已保存为我的默认值');
        });
      });
    });
  };

  var resetValues = function () {
    if (!preset || saving) return;
    var fresh = ParValuesFromRule(rule);
    setDraft(fresh);
    LstRun(setSaving, props.toast, '恢复默认值', function () {
      return Api.saveValues(preset.id, fresh).then(function () {
        return Promise.resolve(props.reload()).then(function () {
          setDraft(null);
          LstOk(props.toast, '已恢复为预设定义的默认值');
        });
      });
    });
  };

  if (!state) {
    return h(UiEmpty, { title: '正在读取预设配置…', hint: '如果一直没有变化，回到列表刷新一次。' });
  }
  if (!presetId) {
    return h(UiEmpty, { title: '没有指定预设', hint: '回到列表点一行，进入它的参数配置。' });
  }
  if (!preset) {
    return h(ParBuiltinView, {
      ctx: props.ctx,
      sessionId: props.sessionId,
      state: state,
      presetId: presetId,
      rosterEntry: rosterEntry,
      reload: props.reload,
      setMode: props.setMode,
      toast: props.toast,
    });
  }

  var locked = !!(state.dsh && state.dsh.sessionPresetLocked);
  var fromForm = !!(preset.form && Array.isArray(preset.form.rule) && preset.form.rule.length > 0);
  var userBadges = [
    h(UiBadge, { key: 'origin', tone: 'default', title: 'origin: user —— 本插件管理的用户预设' }, '用户(user)'),
  ];
  if (rosterEntry) userBadges.push(h(UiBadge, { key: 'override', tone: 'warn', title: 'DSH 里也有同名预设，当前生效的是这个用户预设' }, '覆盖内置'));
  if (state.dsh && state.dsh.sessionPreset === preset.id) userBadges.push(h(UiBadge, { key: 'current', tone: 'ok' }, '当前'));
  if (rosterEntry && rosterEntry.isDefault) userBadges.push(h(UiBadge, { key: 'default', tone: 'default' }, '默认'));
  if (dirty) userBadges.push(h(UiBadge, { key: 'dirty', tone: 'warn' }, '有未保存的修改'));

  var form;
  if (rule.length === 0) {
    form = h(UiEmpty, {
      title: '这个预设还没有参数',
      hint: '到「编辑」模式添加参数，或点「从参数生成界面」生成低代码表单。',
    });
  } else {
    form = h(LcForm, {
      rule: rule,
      value: values,
      ctx: props.ctx,
      mode: 'fill',
      renderPrompt: function (first, second) {
        // LcForm 的 prompt-preview 控件会按 (rule,values)/(values,rule)/(rule)/(values)
        // 四种签名轮流试探（见 30-form.js 的 lcPreviewText），所以这里不假定第一个参数
        // 是提示词文本：字符串就是文本；对象若是 rule 项且带 props.prompt 字面量
        // （CONTRACT §4.2）就用它；否则一律渲染本预设的 prompt。
        var item = null;
        if (first && typeof first === 'object' && !Array.isArray(first) && (first.type || first.field)) item = first;
        else if (second && typeof second === 'object' && !Array.isArray(second) && (second.type || second.field)) item = second;
        var literal = item && item.props && typeof item.props.prompt === 'string' && item.props.prompt !== ''
          ? item.props.prompt
          : null;
        var text = typeof first === 'string' ? first : (typeof second === 'string' ? second : (literal || preset.prompt));
        return ParRenderText(text, values, preset.params, props.renderPrompt);
      },
      onChange: function (next) {
        setDraft(next && typeof next === 'object' ? LstWith(next, {}) : LstWith(values, {}));
      },
    });
  }

  return h(
    'div',
    { style: PAR_STYLE.pane },
    h(
      Toolbar,
      null,
      h(
        'div',
        { style: LST_STYLE.toolbarRow },
        h(LstEnableButton, {
          key: 'enable',
          ctx: props.ctx,
          sessionId: props.sessionId,
          presetId: preset.id,
          name: preset.name || preset.id,
          reload: props.reload,
          toast: props.toast,
          locked: locked,
          label: '启用此预设',
        }),
        h(
          UiButton,
          {
            key: 'edit',
            size: 'sm',
            icon: 'edit',
            onClick: function () { if (props.setMode) props.setMode(MODE_EDIT, { presetId: preset.id }); },
          },
          '切换到编辑模式'
        ),
        h(
          UiButton,
          {
            key: 'back',
            size: 'sm',
            variant: 'ghost',
            icon: 'back',
            onClick: function () { if (props.setMode) props.setMode(MODE_LIST, {}); },
          },
          '返回列表'
        )
      )
    ),
    h(
      UiSection,
      { title: preset.name || preset.id },
      h(
        'div',
        { style: PAR_STYLE.header },
        h('div', { style: PAR_STYLE.badges }, userBadges),
        h('div', { style: PAR_STYLE.desc }, preset.description || '（没有描述）'),
        h('div', { style: LST_STYLE.rowId }, preset.id)
      )
    ),
    h(
      UiSection,
      {
        title: '参数（按本次任务微调）',
        actions: h(
          'div',
          { style: LST_STYLE.actions },
          h(
            UiButton,
            { size: 'sm', icon: 'save', disabled: saving || !dirty, onClick: saveValues, title: dirty ? '把当前取值存为该预设的默认值' : '没有改动' },
            saving ? '保存中…' : '保存为我的默认值'
          ),
          h(
            UiButton,
            { size: 'sm', variant: 'ghost', icon: 'refresh', disabled: saving, onClick: resetValues, title: '丢弃已保存的取值，回到预设定义的默认值' },
            '恢复默认值'
          )
        ),
      },
      h(
        'div',
        { style: PAR_STYLE.form },
        h(LstNote, null,
          '界面来源：' + (fromForm ? '预设自带的低代码 rule（form.rule）' : '由参数定义自动生成（params → rule）')
          + '。这里的取值只影响「' + (preset.name || preset.id) + '」这一个预设，保存后立即生效，不必重启。'),
        form
      )
    ),
    h(
      UiSection,
      { title: '引用（由编辑模式决定）' },
      h(
        'div',
        { style: PAR_STYLE.form },
        h('div', { style: PAR_STYLE.muted }, 'MCP'),
        h(ParRefBadges, { state: state, kind: 'mcp', ids: preset.mcp, emptyText: '没有引用任何 MCP。' }),
        h('div', { style: PAR_STYLE.muted }, 'Skills'),
        h(ParRefBadges, { state: state, kind: 'skills', ids: preset.skills, emptyText: '没有引用任何 Skill。' })
      )
    ),
    h(
      UiSection,
      { title: '渲染后的提示词（实时预览）' },
      h(
        'div',
        { style: PAR_STYLE.form },
        h(LstNote, null, '正文里的 ' + '{{ $参数名 }}' + ' 已按上面的取值替换；空值回落到参数默认值。'),
        h('pre', { style: LST_STYLE.pre }, preview === '' ? '（提示词为空）' : preview)
      )
    )
  );
}
