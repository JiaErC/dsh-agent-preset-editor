/* ==================================================================== *
 * 40-list.js —— 列表模式：Agent 预设 / MCP / Skills 三张表，
 *               以及三个模式共用的「启用预设」动作。
 *
 * 本文件是 part 片段（裸语句），被 scripts/build-client.mjs 按文件名升序
 * 拼进 client factory 的函数体：**不要** import / export，**不要**用 JSX。
 * 可用绑定：00-prelude.js（React、h、hooks、cx、toPresetId、nowIso、常量…）、
 *           10-ui.js（UI 原语）、20-api.js（Api、Api.state）、30-form.js（LcForm 等）。
 * 顶层名字统一加 `Lst` / `LST_` 前缀，避免与其它 part 撞名。
 * ==================================================================== */

/** 列表模式顶部三选一。 */
const LST_TAB_OPTIONS = [
  { label: 'Agent预设', value: LIST_PRESETS, icon: 'preset' },
  { label: 'MCP', value: LIST_MCP, icon: 'mcp' },
  { label: 'Skills', value: LIST_SKILLS, icon: 'skill' },
];

/** 预设 id 的形状（与 CONTRACT §2.1 一致）。 */
const LST_PRESET_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
/** MCP / Skill 目录项 id 的形状：比预设 id 宽松，允许点与下划线。 */
const LST_CATALOG_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 会话已开始任务时，启用按钮的 title 说明（按钮**不** disabled，见下方注释）。 */
const LST_LOCKED_HINT =
  '当前会话已经开始任务，DSH 不允许再切换预设。仍可点击尝试——失败时由 DSH 给出权威原因；要换预设请新建会话。';

/** 新建预设时的起步内容：一个 role 参数 + 引用它的提示词，建好即可看到参数效果。 */
const LST_STARTER_PARAMS = [
  {
    name: 'role',
    label: '角色',
    type: 'text',
    default: '专业助手',
    description: '这个 Agent 的角色定位，会被写进提示词',
  },
];
const LST_STARTER_PROMPT = '你是 {{ $role }}。\n\n请按用户的要求完成任务。\n';

/** 行内布局常量：只使用主题 token 上色（CONTRACT §1.2），字面颜色仅 Icon 内部使用。 */
const LST_STYLE = {
  rowMain: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0', flex: '1 1 auto', cursor: 'pointer' },
  rowTitle: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  rowName: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  rowSub: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '1.5' },
  rowId: {
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: '11px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    opacity: '0.75',
  },
  rowErr: { color: 'var(--dsw-alias-label-error)', fontSize: '12px' },
  rowHint: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px' },
  actions: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: '0' },
  toolbarRow: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', flexWrap: 'wrap' },
  grow: { flex: '1 1 auto', minWidth: '140px' },
  note: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '1.7', padding: '0 2px' },
  stack: { display: 'flex', flexDirection: 'column', gap: '10px' },
  rows: { display: 'flex', flexDirection: 'column', gap: '4px' },
  pre: {
    margin: '0',
    padding: '10px',
    borderRadius: '8px',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '12px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    maxHeight: '340px',
    overflow: 'auto',
  },
};

/* -------------------------------------------------------------------- *
 * 小工具
 * -------------------------------------------------------------------- */

/** 安全取数组。 */
function LstArray(value) {
  return Array.isArray(value) ? value : [];
}

/** 浅拷贝并覆盖若干字段（比对象展开更明确，也便于阅读）。 */
function LstWith(source, extra) {
  var out = {};
  var key;
  var base = source && typeof source === 'object' ? source : {};
  for (key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
  }
  var patch = extra && typeof extra === 'object' ? extra : {};
  for (key in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
  }
  return out;
}

/** 从任意错误对象里取一句可展示的文案。 */
function LstErrorText(error) {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  return error.message ? String(error.message) : String(error);
}

/** 失败提示：console.error + toast（CONTRACT §7）。 */
function LstFail(toast, action, error) {
  console.error('[agent-preset-editor] ' + action + '失败', error);
  if (toast && typeof toast.show === 'function') {
    toast.show(action + '失败：' + LstErrorText(error), 'err');
  }
}

/** 成功提示。 */
function LstOk(toast, message) {
  if (toast && typeof toast.show === 'function') toast.show(message, 'ok');
}

/** 信息提示。 */
function LstInfo(toast, message) {
  if (toast && typeof toast.show === 'function') toast.show(message, 'info');
}

/** 把事件处理器包一层，阻止冒泡到可点击的行容器上。 */
function LstStop(handler) {
  return function (event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof handler === 'function') return handler(event);
    return undefined;
  };
}

/** 大小写不敏感的关键字匹配：任意一个字段命中即通过。 */
function LstMatches(query, fields) {
  var text = String(query === undefined || query === null ? '' : query).trim().toLowerCase();
  if (text === '') return true;
  for (var i = 0; i < fields.length; i += 1) {
    var field = fields[i];
    if (field !== undefined && field !== null && String(field).toLowerCase().indexOf(text) >= 0) return true;
  }
  return false;
}

/** 统一执行一个异步动作，带忙碌态 + 错误 toast。 */
function LstRun(setBusy, toast, action, work) {
  setBusy(true);
  return Promise.resolve()
    .then(work)
    .then(
      function (result) {
        setBusy(false);
        return result;
      },
      function (error) {
        setBusy(false);
        LstFail(toast, action, error);
        return undefined;
      }
    );
}

/* -------------------------------------------------------------------- *
 * 启用（切换会话预设）—— 列表模式与参数模式共用
 * -------------------------------------------------------------------- */

/**
 * 把当前会话切到某个预设。
 *
 * disabled 策略：`state.dsh.sessionPresetLocked` 只是**启发式前置提示**
 * （20-api.js 用 turnCount>0 推导），CONTRACT §1.5 明确「select 的错误才是最终
 * 裁决」。所以这里**不禁用**按钮，只把原因写进 title：禁用一个可能误判的按钮，
 * 会让用户永远拿不到权威错误，也没有任何补救路径。
 *
 * @param {object} options { ctx, sessionId, presetId, name, reload, toast }
 * @returns {Promise<boolean>} 是否成功。
 */
async function LstEnablePreset(options) {
  var ctx = options.ctx;
  var sessionId = options.sessionId;
  var presetId = options.presetId;
  var name = options.name || presetId;
  var toast = options.toast;
  var remote = ctx && ctx.remote ? ctx.remote : null;
  var agentPresets = remote && remote.agentPresets ? remote.agentPresets : null;

  if (agentPresets && typeof agentPresets.select === 'function' && sessionId) {
    try {
      await agentPresets.select(sessionId, presetId);
      LstOk(toast, '已切换到 ' + name);
      if (typeof options.reload === 'function') await options.reload();
      return true;
    } catch (error) {
      var code = error && error.code ? String(error.code) : '';
      var text = LstErrorText(error);
      if (code === 'agent-preset/locked' || /locked/i.test(text)) {
        if (toast && typeof toast.show === 'function') {
          toast.show('任务已开始，无法切换预设；请新建会话后再选「' + name + '」', 'err');
        }
      } else {
        LstFail(toast, '切换预设', error);
      }
      return false;
    }
  }

  // 没有会话，或宿主没暴露 select：退化为「把这个预设设为新会话的默认预设」。
  var settings = remote && remote.settings ? remote.settings : null;
  if (settings && typeof settings.update === 'function') {
    try {
      await settings.update(AGENT_PRESET_SETTINGS_NS, { selectedDefault: presetId });
      LstOk(toast, '已把「' + name + '」设为默认预设');
      if (typeof options.reload === 'function') await options.reload();
      return true;
    } catch (error) {
      LstFail(toast, '设置默认预设', error);
      return false;
    }
  }

  if (toast && typeof toast.show === 'function') toast.show('当前环境不支持切换预设', 'err');
  return false;
}

/** 「启用」按钮：自带忙碌态，锁定原因写进 title 但不禁用。 */
function LstEnableButton(props) {
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];
  var locked = props.locked === true;

  var onClick = function (event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (busy) return;
    LstRun(setBusy, props.toast, '切换预设', function () {
      return LstEnablePreset(props);
    });
  };

  return h(
    UiButton,
    {
      size: 'sm',
      variant: props.variant || 'primary',
      icon: 'play',
      disabled: busy,
      title: locked ? LST_LOCKED_HINT : '把当前会话切换到这个预设',
      onClick: onClick,
    },
    busy ? '切换中…' : props.label || '启用'
  );
}

/* -------------------------------------------------------------------- *
 * 列表骨架
 * -------------------------------------------------------------------- */

/** 顶部三选一（没有 setTab 时啥也不渲染，方便单表复用）。 */
function LstTabBar(props) {
  if (typeof props.setTab !== 'function') return null;
  return h(Segmented, {
    value: props.tab || LIST_PRESETS,
    onChange: props.setTab,
    options: LST_TAB_OPTIONS,
  });
}

/** 搜索框 + 添加按钮。 */
function LstListToolbar(props) {
  return h(
    Toolbar,
    null,
    h(
      'div',
      { style: LST_STYLE.toolbarRow },
      h('div', { style: LST_STYLE.grow }, h(UiSearch, {
        value: props.query,
        onChange: props.setQuery,
        placeholder: props.placeholder,
      })),
      h(
        UiButton,
        { variant: 'primary', size: 'sm', icon: 'plus', onClick: props.onAdd },
        props.addLabel || '添加'
      )
    )
  );
}

/** 说明段落。 */
function LstNote(props) {
  return h('div', { style: LST_STYLE.note }, props.children);
}

/** 二次确认弹窗：确认成功（resolve）后自动关闭，失败留在原地并 toast。 */
function LstConfirmModal(props) {
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];

  // 成功才关闭；失败留在这里，让用户能改条件后重试（错误走 toast）。
  var onConfirm = function () {
    if (busy) return;
    setBusy(true);
    Promise.resolve()
      .then(props.onConfirm)
      .then(
        function () {
          setBusy(false);
          if (typeof props.onClose === 'function') props.onClose();
        },
        function (error) {
          setBusy(false);
          LstFail(props.toast, props.failLabel || '操作', error);
        }
      );
  };

  return h(
    UiModal,
    {
      open: true,
      title: props.title || '确认操作',
      onClose: busy ? function () {} : props.onClose,
      footer: [
        h(UiButton, { key: 'cancel', variant: 'ghost', onClick: props.onClose, disabled: busy }, '取消'),
        h(
          UiButton,
          { key: 'ok', variant: props.variant || 'danger', icon: 'check', onClick: onConfirm, disabled: busy },
          busy ? '处理中…' : props.confirmLabel || '确认删除'
        ),
      ],
    },
    props.children || props.message
  );
}

/** 一个目录项（MCP / Skill）列表行的左半边。 */
function LstCatalogMain(props) {
  return h(
    'div',
    { style: LST_STYLE.rowMain, onClick: props.onOpen, title: '点击编辑' },
    h('div', { style: LST_STYLE.rowTitle }, h('span', { style: LST_STYLE.rowName }, props.title || props.id), props.badges),
    h('div', { style: LST_STYLE.rowSub }, props.subtitle || '（没有描述）'),
    h('div', { style: LST_STYLE.rowId }, props.id)
  );
}

/* -------------------------------------------------------------------- *
 * Agent 预设列表
 * -------------------------------------------------------------------- */

/**
 * 把 `state.presets`（用户预设）与 `state.dsh.roster`（DSH 实际可用的预设）
 * 合并成一行行数据。来源判定见 CONTRACT 与任务书：
 * 两边都有 → user 且标「覆盖内置」；只在 roster → system（只读）。
 */
function LstPresetRows(state) {
  var defs = LstArray(state && state.presets);
  var roster = LstArray(state && state.dsh && state.dsh.roster);
  var byId = {};
  var order = [];
  var i;

  for (i = 0; i < defs.length; i += 1) {
    var def = defs[i];
    if (!def || !def.id) continue;
    if (!byId[def.id]) {
      byId[def.id] = { id: def.id };
      order.push(def.id);
    }
    byId[def.id].def = def;
  }
  for (i = 0; i < roster.length; i += 1) {
    var entry = roster[i];
    if (!entry || !entry.id) continue;
    if (!byId[entry.id]) {
      byId[entry.id] = { id: entry.id };
      order.push(entry.id);
    }
    byId[entry.id].roster = entry;
  }

  var userRows = [];
  var systemRows = [];
  for (i = 0; i < order.length; i += 1) {
    var row = byId[order[i]];
    var userDef = row.def || null;
    var rosterEntry = row.roster || null;
    var numericOrder = userDef ? Number(userDef.order) : NaN;
    row.origin = userDef ? 'user' : 'system';
    row.overrides = !!(userDef && rosterEntry);
    row.name = (userDef && userDef.name) || (rosterEntry && rosterEntry.name) || row.id;
    row.description = (userDef && userDef.description) || (rosterEntry && rosterEntry.description) || '';
    row.broken = rosterEntry && rosterEntry.broken ? String(rosterEntry.broken) : '';
    row.isDefault = !!(rosterEntry && rosterEntry.isDefault);
    row.order = Number.isFinite(numericOrder) ? numericOrder : Number.MAX_SAFE_INTEGER;
    if (userDef) userRows.push(row);
    else systemRows.push(row);
  }

  userRows.sort(function (a, b) {
    if (a.order !== b.order) return a.order - b.order;
    return String(a.name).localeCompare(String(b.name));
  });
  return userRows.concat(systemRows);
}

/** 下一个可用的 order（用户预设最大 order + 10）。 */
function LstNextOrder(state) {
  var defs = LstArray(state && state.presets);
  var max = 0;
  for (var i = 0; i < defs.length; i += 1) {
    var value = defs[i] ? Number(defs[i].order) : NaN;
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max + 10;
}

/** 单行预设。 */
function LstPresetRow(props) {
  var row = props.row;
  var dsh = (props.state && props.state.dsh) || {};
  var isUser = row.origin === 'user';
  var isCurrent = dsh.sessionPreset === row.id;
  var locked = dsh.sessionPresetLocked === true;

  var badges = [];
  badges.push(
    h(
      UiBadge,
      {
        key: 'origin',
        tone: isUser ? 'default' : 'warn',
        title: isUser ? 'origin: user —— 本插件管理的用户预设' : 'origin: system —— DSH 自带，本插件只读',
      },
      isUser ? '用户(user)' : '内置(system)'
    )
  );
  if (row.overrides) badges.push(h(UiBadge, { key: 'override', tone: 'warn', title: 'DSH 里也有同名预设，当前使用的是这个用户预设' }, '覆盖内置'));
  if (isCurrent) badges.push(h(UiBadge, { key: 'current', tone: 'ok' }, '当前'));
  if (row.isDefault) badges.push(h(UiBadge, { key: 'default', tone: 'default' }, '默认'));
  if (row.broken) badges.push(h(UiBadge, { key: 'broken', tone: 'err', title: row.broken }, '声明损坏'));

  var main = h(
    'div',
    { style: LST_STYLE.rowMain, onClick: function () { props.onOpen(row.id); }, title: '点击进入参数配置模式' },
    h('div', { style: LST_STYLE.rowTitle }, h('span', { style: LST_STYLE.rowName }, row.name), badges),
    h('div', { style: LST_STYLE.rowSub }, row.description || '（没有描述）'),
    h('div', { style: LST_STYLE.rowId }, row.id),
    row.broken ? h('div', { style: LST_STYLE.rowErr }, '声明错误：' + row.broken) : null,
    !isUser
      ? h('div', { style: LST_STYLE.rowHint }, '内置预设由 DSH 提供，本插件只读；点「查看配置」看它的声明内容。')
      : null
  );

  var actions = [
    h(LstEnableButton, {
      key: 'enable',
      ctx: props.ctx,
      sessionId: props.sessionId,
      presetId: row.id,
      name: row.name,
      reload: props.reload,
      toast: props.toast,
      locked: locked,
    }),
  ];
  if (isUser) {
    actions.push(
      h(
        UiButton,
        {
          key: 'edit',
          size: 'sm',
          variant: 'ghost',
          icon: 'edit',
          title: '在编辑模式修改这个预设',
          onClick: LstStop(function () { props.onEdit(row.id); }),
        },
        '编辑'
      )
    );
    actions.push(
      h(UiButton, {
        key: 'delete',
        size: 'sm',
        variant: 'danger',
        icon: 'trash',
        title: '删除这个用户预设',
        onClick: LstStop(function () { props.onDelete(row); }),
      })
    );
  } else {
    actions.push(
      h(
        UiButton,
        {
          key: 'view',
          size: 'sm',
          variant: 'ghost',
          icon: 'sliders',
          title: '只读查看这个内置预设的声明内容',
          onClick: LstStop(function () { props.onOpen(row.id); }),
        },
        '查看配置'
      )
    );
  }

  return h(
    UiRow,
    {
      active: isCurrent,
      right: h('div', { style: LST_STYLE.actions }, actions),
    },
    main
  );
}

/** 新建预设弹窗：收集 id / 展示名 / 描述，建好后直接进编辑模式。 */
function LstAddPresetModal(props) {
  var namePair = useState('');
  var name = namePair[0];
  var setName = namePair[1];
  var idPair = useState('');
  var id = idPair[0];
  var setId = idPair[1];
  var descPair = useState('');
  var desc = descPair[0];
  var setDesc = descPair[1];
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];
  var idTouched = useRef(false);

  var existing = LstArray(props.existingIds);
  var nextOrder = LstNextOrder(props.state);

  var onName = function (next) {
    setName(next);
    // id 与展示名联动，直到用户自己动过 id 输入框。
    if (!idTouched.current) setId(toPresetId(next));
  };

  var submit = function () {
    var finalName = String(name || '').trim();
    var finalId = String(id || '').trim();
    var finalDesc = String(desc || '').trim();
    if (finalName === '') {
      LstInfo(props.toast, '请先填写展示名');
      return;
    }
    if (!LST_PRESET_ID_RE.test(finalId)) {
      LstInfo(props.toast, '预设 id 只能用小写字母、数字和连字符，且以字母或数字开头');
      return;
    }
    if (existing.indexOf(finalId) >= 0) {
      LstInfo(props.toast, 'id 已被占用：' + finalId);
      return;
    }

    var params = LST_STARTER_PARAMS.map(function (item) { return LstWith(item, {}); });
    var rule = typeof ruleFromParams === 'function' ? ruleFromParams(params) : [];
    var definition = {
      id: finalId,
      name: finalName,
      description: finalDesc,
      order: nextOrder,
      prompt: LST_STARTER_PROMPT,
      params: params,
      form: { rule: LstArray(rule) },
      mcp: [],
      skills: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    LstRun(setBusy, props.toast, '创建预设', function () {
      return Api.savePreset(definition).then(function () {
        return Promise.resolve(props.reload()).then(function () {
          LstOk(props.toast, '已创建预设 ' + finalName);
          props.onCreated(finalId);
        });
      });
    });
  };

  return h(
    UiModal,
    {
      open: true,
      title: '添加 Agent 预设',
      actions: h(LstAskAi, {
        ctx: props.ctx,
        sessionId: props.sessionId,
        kind: 'preset',
        toast: props.toast,
        onClose: props.onClose,
      }),
      onClose: busy ? function () {} : props.onClose,
      footer: [
        h(UiButton, { key: 'cancel', variant: 'ghost', onClick: props.onClose, disabled: busy }, '取消'),
        h(UiButton, { key: 'create', variant: 'primary', icon: 'check', onClick: submit, disabled: busy }, busy ? '创建中…' : '创建并编辑'),
      ],
    },
    h(
      'div',
      { style: LST_STYLE.stack },
      h(UiField, { label: '展示名', required: true, info: '列表与侧边栏上显示的名字' },
        h(UiInput, { value: name, onChange: onName, placeholder: '例如：设计文档 Agent', autoFocus: true })),
      h(UiField, { label: '预设 id', required: true, info: '小写字母、数字与连字符；等于 DSH 的预设 id，保存后不建议再改' },
        h(UiInput, {
          value: id,
          onChange: function (next) { idTouched.current = true; setId(next); },
          placeholder: 'design-doc-writer',
        })),
      h(UiField, { label: '一句话描述' },
        h(UiInput, { value: desc, onChange: setDesc, placeholder: '把需求转化为设计文档' })),
      h(LstNote, null, '创建后会写入 ' + ((props.state && props.state.paths && props.state.paths.root) || '$DSH_HOME/agent-preset-editor') + '，并直接进入编辑模式。')
    )
  );
}

/** 预设列表主体（由 PresetListMode 在 tab==='presets' 时渲染）。 */
function LstPresetPane(props) {
  var state = props.state;
  var queryPair = useState('');
  var query = queryPair[0];
  var setQuery = queryPair[1];
  var addPair = useState(false);
  var addOpen = addPair[0];
  var setAddOpen = addPair[1];
  var deletePair = useState(null);
  var deleteTarget = deletePair[0];
  var setDeleteTarget = deletePair[1];

  var rows = useMemo(function () { return LstPresetRows(state); }, [state]);
  var visible = useMemo(function () {
    var out = [];
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (LstMatches(query, [row.id, row.name, row.description])) out.push(row);
    }
    return out;
  }, [rows, query]);

  var existingIds = useMemo(function () {
    var out = [];
    for (var i = 0; i < rows.length; i += 1) out.push(rows[i].id);
    return out;
  }, [rows]);

  var openParams = function (id) {
    if (typeof props.setMode === 'function') props.setMode(MODE_PARAMS, { presetId: id });
  };
  var openEdit = function (id) {
    if (typeof props.setMode === 'function') props.setMode(MODE_EDIT, { presetId: id });
  };

  var body;
  if (visible.length === 0) {
    body = h(UiEmpty, {
      title: rows.length === 0 ? '还没有任何预设' : '没有匹配的预设',
      hint: rows.length === 0 ? '点右上角「添加预设」创建一个。' : '换个关键字再试试。',
    });
  } else {
    body = h(
      'div',
      { style: LST_STYLE.rows },
      visible.map(function (row) {
        return h(LstPresetRow, {
          key: row.id,
          row: row,
          state: state,
          ctx: props.ctx,
          sessionId: props.sessionId,
          reload: props.reload,
          toast: props.toast,
          onOpen: openParams,
          onEdit: openEdit,
          onDelete: setDeleteTarget,
        });
      })
    );
  }

  return h(
    Fragment,
    null,
    h(LstListToolbar, {
      query: query,
      setQuery: setQuery,
      placeholder: '搜索预设（名称 / 描述 / id）',
      addLabel: '添加预设',
      onAdd: function () { setAddOpen(true); },
    }),
    h(LstNote, null,
      '共 ' + rows.length + ' 个预设（含 DSH 内置）。点任意一行进入「参数配置」；「启用」把当前会话切到该预设。'),
    body,
    addOpen
      ? h(LstAddPresetModal, {
          state: state,
          existingIds: existingIds,
          // Same plumbing as the MCP / Skill dialogs: the「让 AI 帮我写」
          // button inside needs the session to write into.
          ctx: props.ctx,
          sessionId: props.sessionId,
          toast: props.toast,
          reload: props.reload,
          onClose: function () { setAddOpen(false); },
          onCreated: function (id) {
            setAddOpen(false);
            openEdit(id);
          },
        })
      : null,
    deleteTarget
      ? h(LstConfirmModal, {
          title: '删除预设',
          message: '确定删除用户预设「' + deleteTarget.name + '」（' + deleteTarget.id + '）吗？'
            + '对应的 presets/' + deleteTarget.id + '.json 会被移除，且不可撤销。',
          confirmLabel: '删除预设',
          failLabel: '删除预设',
          toast: props.toast,
          onClose: function () { setDeleteTarget(null); },
          onConfirm: function () {
            var id = deleteTarget.id;
            return Api.deletePreset(id).then(function () {
              return Promise.resolve(props.reload()).then(function () {
                LstOk(props.toast, '已删除预设 ' + id);
                if (typeof props.setMode === 'function') props.setMode(MODE_LIST, {});
                return true;
              });
            });
          },
        })
      : null
  );
}

/** 列表模式入口：顶部三选一 + 对应的表。 */
function PresetListMode(props) {
  var tab = props.tab || LIST_PRESETS;
  if (tab === LIST_MCP) return h(McpListMode, props);
  if (tab === LIST_SKILLS) return h(SkillListMode, props);
  return h(
    Fragment,
    null,
    h(LstTabBar, { tab: tab, setTab: props.setTab }),
    h(LstPresetPane, props)
  );
}

/* -------------------------------------------------------------------- *
 * MCP 目录
 * -------------------------------------------------------------------- */

/** 引用了某个目录项的预设（返回预设对象数组，用于「被 N 个预设引用」）。 */
function LstReferrers(state, key, id) {
  var presets = LstArray(state && state.presets);
  var out = [];
  for (var i = 0; i < presets.length; i += 1) {
    var preset = presets[i];
    if (!preset) continue;
    if (LstArray(preset[key]).indexOf(id) >= 0) out.push(preset);
  }
  return out;
}

/** 引用徽标：被 N 个预设引用（title 里列出名字）。 */
function LstRefBadge(props) {
  var refs = LstArray(props.refs);
  if (refs.length === 0) {
    return h(UiBadge, { tone: 'warn', title: '还没有任何预设引用它，所以它现在不产生任何效果' }, '未被引用');
  }
  var names = refs.map(function (preset) { return preset.name || preset.id; }).join('、');
  return h(UiBadge, { tone: 'ok', title: '被这些预设引用：' + names }, '被 ' + refs.length + ' 个预设引用');
}

/** 一个新的 MCP 目录项（未保存）。 */
function LstNewMcpEntry() {
  return {
    id: '',
    name: '',
    description: '',
    enabled: true,
    server: {
      serverName: '',
      transport: 'stdio',
      command: '',
      args: [],
      cwd: '',
      env: {},
      url: '',
      toolCallTimeoutMs: 120000,
    },
    createdAt: '',
    updatedAt: '',
  };
}

/** McpEntry → 弹窗里用的扁平草稿（args 一行一个、超时用字符串）。 */
function LstMcpDraft(entry) {
  var base = entry && typeof entry === 'object' ? entry : LstNewMcpEntry();
  var server = base.server && typeof base.server === 'object' ? base.server : {};
  var timeout = server.toolCallTimeoutMs;
  return {
    id: String(base.id || ''),
    name: String(base.name || ''),
    description: String(base.description || ''),
    enabled: base.enabled !== false,
    serverName: String(server.serverName || ''),
    transport: server.transport || 'stdio',
    command: String(server.command || ''),
    argsText: LstArray(server.args).join('\n'),
    cwd: String(server.cwd || ''),
    url: String(server.url || ''),
    timeoutText: timeout === undefined || timeout === null ? '' : String(timeout),
  };
}

/** 草稿 → McpEntry（保留原条目里我们没有暴露的字段，如 env）。 */
function LstMcpEntryFromDraft(draft, original) {
  var base = original && typeof original === 'object' ? original : {};
  var server = LstWith(base.server, {});
  var args = [];
  String(draft.argsText || '').split('\n').forEach(function (line) {
    var text = line.trim();
    if (text !== '') args.push(text);
  });
  var timeout = Number(draft.timeoutText);
  if (!Number.isFinite(timeout) || timeout <= 0) timeout = 120000;
  var id = String(draft.id || '').trim();

  server.serverName = String(draft.serverName || '').trim() || id;
  server.transport = draft.transport || 'stdio';
  server.command = String(draft.command || '').trim();
  server.args = args;
  server.cwd = String(draft.cwd || '').trim();
  server.url = String(draft.url || '').trim();
  server.toolCallTimeoutMs = timeout;

  return {
    id: id,
    name: String(draft.name || '').trim() || id,
    description: String(draft.description || '').trim(),
    enabled: draft.enabled !== false,
    server: server,
    createdAt: base.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

/**
 * 弹窗头部右侧的「让 AI 帮我写」按钮。
 *
 * 这两个弹窗擅长「存」一个定义，不擅长「问出」一个定义：用户手上通常没有
 * serverName / transport / command 这些字段，但能用一句话描述这个东西。所以
 * 按钮把一句填好格式的请求塞进**当前会话**的输入框，关掉弹窗并把焦点交给输入
 * 框，剩下的由用户补完、由 AI 通过插件的 HTTP API 落库（见 AI-USAGE.md）。
 */
function LstAskAi(props) {
  var kind = props.kind === 'skill' ? 'skill' : (props.kind === 'preset' ? 'preset' : 'mcp');
  var what = kind === 'skill' ? 'Skill' : (kind === 'preset' ? 'Agent 预设' : 'MCP');
  return h(UiButton, {
    variant: 'ghost',
    size: 'sm',
    icon: 'edit',
    title: '把「给 Agent 预设插件添加以下 ' + what + '：」写进当前会话的输入框；你补完信息后由 AI 写入插件',
    onClick: function () {
      var result = composeAskAi(props.ctx, props.sessionId, kind);
      if (result.ok) {
        LstOk(props.toast, '已写入输入框：补完信息后发送，AI 会把它加进插件');
        props.onClose();
      } else {
        // 原因逐项具体化：一句笼统的「当前会话不可用」曾把排查带偏一整轮。
        LstInfo(props.toast, '没能写入输入框——' + result.message);
      }
    },
  }, '让 AI 帮我写');
}

/** MCP 新增 / 编辑弹窗。 */
function LstMcpEditModal(props) {
  var isNew = props.isNew === true;
  var draftPair = useState(function () { return LstMcpDraft(props.entry); });
  var draft = draftPair[0];
  var setDraft = draftPair[1];
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];

  var set = function (field, value) {
    setDraft(function (previous) {
      var next = LstWith(previous, {});
      next[field] = value;
      return next;
    });
  };
  var field = function (name) {
    return function (value) { set(name, value); };
  };

  var submit = function () {
    var id = String(draft.id || '').trim();
    if (!LST_CATALOG_ID_RE.test(id)) {
      LstInfo(props.toast, 'MCP id 只能由字母、数字、点、下划线、连字符组成，且以字母或数字开头');
      return;
    }
    if (isNew && LstArray(props.existingIds).indexOf(id) >= 0) {
      LstInfo(props.toast, 'MCP id 已存在：' + id);
      return;
    }
    if (draft.transport === 'stdio' && String(draft.command || '').trim() === '') {
      LstInfo(props.toast, 'transport=stdio 时必须填写 command');
      return;
    }
    if (draft.transport !== 'stdio' && String(draft.url || '').trim() === '') {
      LstInfo(props.toast, 'transport=' + draft.transport + ' 时必须填写 url');
      return;
    }

    var entry = LstMcpEntryFromDraft(draft, isNew ? null : props.entry);
    LstRun(setBusy, props.toast, '保存 MCP', function () {
      return Api.saveMcp(entry).then(function () {
        return Promise.resolve(props.reload()).then(function () {
          LstOk(props.toast, '已保存 MCP ' + entry.name);
          props.onClose();
        });
      });
    });
  };

  var stdio = draft.transport === 'stdio';

  return h(
    UiModal,
    {
      open: true,
      title: isNew ? '添加 MCP 服务器' : '编辑 MCP 服务器',
      actions: h(LstAskAi, {
        ctx: props.ctx,
        sessionId: props.sessionId,
        kind: 'mcp',
        toast: props.toast,
        onClose: props.onClose,
      }),
      onClose: busy ? function () {} : props.onClose,
      footer: [
        h(UiButton, { key: 'cancel', variant: 'ghost', onClick: props.onClose, disabled: busy }, '取消'),
        h(UiButton, { key: 'save', variant: 'primary', icon: 'save', onClick: submit, disabled: busy }, busy ? '保存中…' : '保存'),
      ],
    },
    h(
      'div',
      { style: LST_STYLE.stack },
      h(UiField, { label: 'id', required: true, info: '预设通过这个 id 引用本条目；已存在的条目不可改名' },
        h(UiInput, { value: draft.id, onChange: field('id'), disabled: !isNew, placeholder: 'docx' })),
      h(UiField, { label: '名称' }, h(UiInput, { value: draft.name, onChange: field('name'), placeholder: 'Word 文档处理' })),
      h(UiField, { label: '描述' }, h(UiInput, { value: draft.description, onChange: field('description'), placeholder: '42 个 Word 工具' })),
      h(UiSwitch, { checked: draft.enabled, onChange: field('enabled'), label: '在目录中启用（停用后即使被预设引用也不会挂载）' }),
      h(UiField, { label: 'server.serverName', info: '留空则与 id 相同' },
        h(UiInput, { value: draft.serverName, onChange: field('serverName'), placeholder: 'docx' })),
      h(UiField, { label: 'server.transport', required: true },
        h(UiSelect, {
          value: draft.transport,
          onChange: field('transport'),
          options: [
            { label: 'stdio（本地进程）', value: 'stdio' },
            { label: 'http', value: 'http' },
            { label: 'sse', value: 'sse' },
          ],
        })),
      h(UiField, { label: 'server.command', required: stdio, info: stdio ? '可执行文件路径' : 'transport 不是 stdio 时忽略' },
        h(UiInput, { value: draft.command, onChange: field('command'), disabled: !stdio, placeholder: 'D:/python/envs/mcp/python.exe' })),
      h(UiField, { label: 'server.args', info: '每行一个参数' },
        h(UiTextarea, { value: draft.argsText, onChange: field('argsText'), rows: 3, disabled: !stdio, placeholder: 'E:/AI_mcp_projects/Docx_MCP_cj/final_complete_server.py' })),
      h(UiField, { label: 'server.cwd', info: '工作目录' },
        h(UiInput, { value: draft.cwd, onChange: field('cwd'), disabled: !stdio, placeholder: 'E:/AI_mcp_projects/Docx_MCP_cj' })),
      h(UiField, { label: 'server.url', required: !stdio, info: stdio ? 'transport=stdio 时忽略' : 'http/sse 的服务地址' },
        h(UiInput, { value: draft.url, onChange: field('url'), disabled: stdio, placeholder: 'http://127.0.0.1:3000/mcp' })),
      h(UiField, { label: 'server.toolCallTimeoutMs', info: '工具调用超时（毫秒），默认 120000' },
        h(UiInput, { value: draft.timeoutText, onChange: field('timeoutText'), type: 'number', placeholder: '120000' })),
      h(LstNote, null, '保存只改这个目录项本身，不会影响任何预设；预设要在编辑模式里勾选它才会挂载。')
    )
  );
}

/** MCP 列表模式。 */
function McpListMode(props) {
  var state = props.state;
  var queryPair = useState('');
  var query = queryPair[0];
  var setQuery = queryPair[1];
  var editPair = useState(null);
  var editing = editPair[0];
  var setEditing = editPair[1];
  var deletePair = useState(null);
  var deleteTarget = deletePair[0];
  var setDeleteTarget = deletePair[1];

  var entries = useMemo(function () { return LstArray(state && state.mcp); }, [state]);
  var visible = useMemo(function () {
    var out = [];
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      if (!entry) continue;
      var server = entry.server || {};
      if (LstMatches(query, [entry.id, entry.name, entry.description, server.serverName, server.command, server.url])) out.push(entry);
    }
    return out;
  }, [entries, query]);
  var existingIds = useMemo(function () {
    return entries.map(function (entry) { return entry && entry.id; });
  }, [entries]);

  var toggle = function (entry, next) {
    var updated = LstWith(entry, { enabled: next, updatedAt: nowIso() });
    Promise.resolve()
      .then(function () { return Api.saveMcp(updated); })
      .then(function () { return props.reload(); })
      .then(
        function () { LstOk(props.toast, (next ? '已启用 ' : '已停用 ') + (entry.name || entry.id)); },
        function (error) { LstFail(props.toast, '更新 MCP', error); }
      );
  };

  var rows = visible.map(function (entry) {
    var refs = LstReferrers(state, 'mcp', entry.id);
    var server = entry.server || {};
    var summary = server.transport === 'stdio'
      ? 'stdio · ' + (server.command || '（未配置 command）')
      : String(server.transport || '') + ' · ' + (server.url || '（未配置 url）');
    return h(
      UiRow,
      {
        key: entry.id,
        right: h(
          'div',
          { style: LST_STYLE.actions },
          h('div', { onClick: LstStop() }, h(UiSwitch, {
            checked: entry.enabled !== false,
            onChange: function (next) { toggle(entry, next); },
          })),
          h(UiButton, {
            size: 'sm',
            variant: 'ghost',
            icon: 'edit',
            title: '编辑这个 MCP 条目',
            onClick: LstStop(function () { setEditing({ entry: entry, isNew: false }); }),
          }),
          h(UiButton, {
            size: 'sm',
            variant: 'danger',
            icon: 'trash',
            title: '删除这个 MCP 条目',
            onClick: LstStop(function () { setDeleteTarget({ entry: entry, refs: refs }); }),
          })
        ),
      },
      h(LstCatalogMain, {
        id: entry.id,
        title: entry.name,
        subtitle: summary + (entry.description ? ' · ' + entry.description : ''),
        onOpen: function () { setEditing({ entry: entry, isNew: false }); },
        badges: [
          h('span', { key: 'ref', style: { display: 'inline-flex' } }, h(LstRefBadge, { refs: refs })),
          entry.enabled === false
            ? h(UiBadge, { key: 'off', tone: 'warn', title: '停用状态：不会被任何预设挂载' }, '已停用')
            : null,
        ],
      })
    );
  });

  return h(
    Fragment,
    null,
    h(LstTabBar, { tab: props.tab || LIST_MCP, setTab: props.setTab }),
    h(LstListToolbar, {
      query: query,
      setQuery: setQuery,
      placeholder: '搜索 MCP（id / 名称 / 描述 / 命令）',
      addLabel: '添加 MCP',
      onAdd: function () { setEditing({ entry: LstNewMcpEntry(), isNew: true }); },
    }),
    h(LstNote, null,
      'MCP 目录是全局共享的：这里新增、修改或停用一行，都不会影响任何预设本身；'
      + '只有某个预设勾选了它，这个 MCP 服务器才会随该预设一起挂载。反过来，删除一个仍被引用的条目会让对应预设失去它。'),
    rows.length === 0
      ? h(UiEmpty, {
          title: entries.length === 0 ? 'MCP 目录还是空的' : '没有匹配的 MCP',
          hint: entries.length === 0 ? '点右上角「添加 MCP」登记一个服务器。' : '换个关键字再试试。',
        })
      : h('div', { style: LST_STYLE.rows }, rows),
    editing
      ? h(LstMcpEditModal, {
          key: editing.isNew ? 'new' : editing.entry.id,
          entry: editing.entry,
          isNew: editing.isNew,
          existingIds: existingIds,
          // ctx + sessionId must ride along: the dialog's「让 AI 帮我写」
          // button writes into this session's composer. Dropping them here
          // made the button report「页面上下文缺失」.
          ctx: props.ctx,
          sessionId: props.sessionId,
          toast: props.toast,
          reload: props.reload,
          onClose: function () { setEditing(null); },
        })
      : null,
    deleteTarget
      ? h(LstConfirmModal, {
          title: '删除 MCP 条目',
          message: '确定删除 MCP「' + (deleteTarget.entry.name || deleteTarget.entry.id) + '」（' + deleteTarget.entry.id + '）吗？'
            + (deleteTarget.refs.length > 0
              ? '注意：它正被 ' + deleteTarget.refs.length + ' 个预设引用（'
                + deleteTarget.refs.map(function (preset) { return preset.name || preset.id; }).join('、')
                + '），删除后这些预设会失去这个 MCP。'
              : '它目前没有被任何预设引用。'),
          confirmLabel: '删除条目',
          failLabel: '删除 MCP',
          toast: props.toast,
          onClose: function () { setDeleteTarget(null); },
          onConfirm: function () {
            var id = deleteTarget.entry.id;
            return Api.deleteMcp(id).then(function () {
              return Promise.resolve(props.reload()).then(function () {
                LstOk(props.toast, '已删除 MCP ' + id);
                return true;
              });
            });
          },
        })
      : null
  );
}

/* -------------------------------------------------------------------- *
 * Skills 目录
 * -------------------------------------------------------------------- */

/** 一个新的 Skill 目录项（未保存）。 */
function LstNewSkillEntry() {
  return {
    id: '',
    name: '',
    description: '',
    enabled: true,
    source: 'inline',
    content: '',
    path: '',
    createdAt: '',
    updatedAt: '',
  };
}

/** Skill 新增 / 编辑弹窗。 */
function LstSkillEditModal(props) {
  var isNew = props.isNew === true;
  var draftPair = useState(function () {
    return LstWith(props.entry && typeof props.entry === 'object' ? props.entry : LstNewSkillEntry(), {});
  });
  var draft = draftPair[0];
  var setDraft = draftPair[1];
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];

  var set = function (field, value) {
    setDraft(function (previous) {
      var next = LstWith(previous, {});
      next[field] = value;
      return next;
    });
  };
  var field = function (name) {
    return function (value) { set(name, value); };
  };

  var submit = function () {
    var id = String(draft.id || '').trim();
    var source = draft.source === 'path' ? 'path' : 'inline';
    if (!LST_CATALOG_ID_RE.test(id)) {
      LstInfo(props.toast, 'Skill id 只能由字母、数字、点、下划线、连字符组成，且以字母或数字开头');
      return;
    }
    if (isNew && LstArray(props.existingIds).indexOf(id) >= 0) {
      LstInfo(props.toast, 'Skill id 已存在：' + id);
      return;
    }
    if (source === 'path' && String(draft.path || '').trim() === '') {
      LstInfo(props.toast, 'source=path 时必须填写 SKILL.md 所在目录');
      return;
    }
    if (source === 'inline' && String(draft.content || '').trim() === '') {
      LstInfo(props.toast, 'source=inline 时必须填写 SKILL.md 正文');
      return;
    }

    var entry = {
      id: id,
      name: String(draft.name || '').trim() || id,
      description: String(draft.description || '').trim(),
      enabled: draft.enabled !== false,
      source: source,
      content: source === 'inline' ? String(draft.content || '') : '',
      path: source === 'path' ? String(draft.path || '').trim() : '',
      createdAt: draft.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    LstRun(setBusy, props.toast, '保存 Skill', function () {
      return Api.saveSkill(entry).then(function () {
        return Promise.resolve(props.reload()).then(function () {
          LstOk(props.toast, '已保存 Skill ' + entry.name);
          props.onClose();
        });
      });
    });
  };

  var isInline = draft.source !== 'path';

  return h(
    UiModal,
    {
      open: true,
      title: isNew ? '添加 Skill' : '编辑 Skill',
      actions: h(LstAskAi, {
        ctx: props.ctx,
        sessionId: props.sessionId,
        kind: 'skill',
        toast: props.toast,
        onClose: props.onClose,
      }),
      onClose: busy ? function () {} : props.onClose,
      footer: [
        h(UiButton, { key: 'cancel', variant: 'ghost', onClick: props.onClose, disabled: busy }, '取消'),
        h(UiButton, { key: 'save', variant: 'primary', icon: 'save', onClick: submit, disabled: busy }, busy ? '保存中…' : '保存'),
      ],
    },
    h(
      'div',
      { style: LST_STYLE.stack },
      h(UiField, { label: 'id', required: true, info: '预设通过这个 id 引用本条目；已存在的条目不可改名' },
        h(UiInput, { value: draft.id, onChange: field('id'), disabled: !isNew, placeholder: 'design-doc-authoring' })),
      h(UiField, { label: '名称' }, h(UiInput, { value: draft.name, onChange: field('name'), placeholder: '设计文档写作' })),
      h(UiField, { label: '描述' }, h(UiInput, { value: draft.description, onChange: field('description'), placeholder: '把模糊需求转成可执行的设计文档' })),
      h(UiSwitch, { checked: draft.enabled !== false, onChange: field('enabled'), label: '在目录中启用（停用后即使被预设引用也不会挂载）' }),
      h(UiField, { label: 'source', required: true, info: 'inline = 正文写在下面；path = 指向磁盘上的 SKILL.md 目录' },
        h(UiSelect, {
          value: isInline ? 'inline' : 'path',
          onChange: field('source'),
          options: [
            { label: 'inline（正文内联）', value: 'inline' },
            { label: 'path（磁盘目录）', value: 'path' },
          ],
        })),
      isInline
        ? h(UiField, { label: 'content', required: true, info: 'SKILL.md 全文' },
            h(UiTextarea, { value: draft.content, onChange: field('content'), rows: 14, placeholder: '# 设计文档写作\n…' }))
        : h(UiField, { label: 'path', required: true, info: '包含 SKILL.md 的绝对目录' },
            h(UiInput, { value: draft.path, onChange: field('path'), placeholder: 'E:/skills/design-doc-authoring' })),
      h(LstNote, null, '保存只改这个目录项本身，不会影响任何预设；预设要在编辑模式里勾选它才会挂载。')
    )
  );
}

/** Skills 列表模式。 */
function SkillListMode(props) {
  var state = props.state;
  var queryPair = useState('');
  var query = queryPair[0];
  var setQuery = queryPair[1];
  var editPair = useState(null);
  var editing = editPair[0];
  var setEditing = editPair[1];
  var deletePair = useState(null);
  var deleteTarget = deletePair[0];
  var setDeleteTarget = deletePair[1];

  var entries = useMemo(function () { return LstArray(state && state.skills); }, [state]);
  var visible = useMemo(function () {
    var out = [];
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      if (!entry) continue;
      if (LstMatches(query, [entry.id, entry.name, entry.description, entry.path])) out.push(entry);
    }
    return out;
  }, [entries, query]);
  var existingIds = useMemo(function () {
    return entries.map(function (entry) { return entry && entry.id; });
  }, [entries]);

  var toggle = function (entry, next) {
    var updated = LstWith(entry, { enabled: next, updatedAt: nowIso() });
    Promise.resolve()
      .then(function () { return Api.saveSkill(updated); })
      .then(function () { return props.reload(); })
      .then(
        function () { LstOk(props.toast, (next ? '已启用 ' : '已停用 ') + (entry.name || entry.id)); },
        function (error) { LstFail(props.toast, '更新 Skill', error); }
      );
  };

  var rows = visible.map(function (entry) {
    var refs = LstReferrers(state, 'skills', entry.id);
    var source = entry.source === 'path' ? 'path · ' + (entry.path || '（未配置路径）') : 'inline · ' + String(entry.content || '').length + ' 字符';
    return h(
      UiRow,
      {
        key: entry.id,
        right: h(
          'div',
          { style: LST_STYLE.actions },
          h('div', { onClick: LstStop() }, h(UiSwitch, {
            checked: entry.enabled !== false,
            onChange: function (next) { toggle(entry, next); },
          })),
          h(UiButton, {
            size: 'sm',
            variant: 'ghost',
            icon: 'edit',
            title: '编辑这个 Skill 条目',
            onClick: LstStop(function () { setEditing({ entry: entry, isNew: false }); }),
          }),
          h(UiButton, {
            size: 'sm',
            variant: 'danger',
            icon: 'trash',
            title: '删除这个 Skill 条目',
            onClick: LstStop(function () { setDeleteTarget({ entry: entry, refs: refs }); }),
          })
        ),
      },
      h(LstCatalogMain, {
        id: entry.id,
        title: entry.name,
        subtitle: source + (entry.description ? ' · ' + entry.description : ''),
        onOpen: function () { setEditing({ entry: entry, isNew: false }); },
        badges: [
          h('span', { key: 'ref', style: { display: 'inline-flex' } }, h(LstRefBadge, { refs: refs })),
          entry.enabled === false
            ? h(UiBadge, { key: 'off', tone: 'warn', title: '停用状态：不会被任何预设挂载' }, '已停用')
            : null,
        ],
      })
    );
  });

  return h(
    Fragment,
    null,
    h(LstTabBar, { tab: props.tab || LIST_SKILLS, setTab: props.setTab }),
    h(LstListToolbar, {
      query: query,
      setQuery: setQuery,
      placeholder: '搜索 Skill（id / 名称 / 描述）',
      addLabel: '添加 Skill',
      onAdd: function () { setEditing({ entry: LstNewSkillEntry(), isNew: true }); },
    }),
    h(LstNote, null,
      'Skills 目录同样是全局共享的：这里的条目本身不产生任何效果，只有被某个预设勾选后，'
      + '才会随该预设一起挂到 DSH 上；inline 的正文会由 host 写成 SKILL.md 再声明给 dsh-skill-filesystem。'),
    rows.length === 0
      ? h(UiEmpty, {
          title: entries.length === 0 ? 'Skills 目录还是空的' : '没有匹配的 Skill',
          hint: entries.length === 0 ? '点右上角「添加 Skill」登记一个技能。' : '换个关键字再试试。',
        })
      : h('div', { style: LST_STYLE.rows }, rows),
    editing
      ? h(LstSkillEditModal, {
          key: editing.isNew ? 'new' : editing.entry.id,
          entry: editing.entry,
          isNew: editing.isNew,
          existingIds: existingIds,
          // See LstMcpEditModal above: the button inside needs the session.
          ctx: props.ctx,
          sessionId: props.sessionId,
          toast: props.toast,
          reload: props.reload,
          onClose: function () { setEditing(null); },
        })
      : null,
    deleteTarget
      ? h(LstConfirmModal, {
          title: '删除 Skill 条目',
          message: '确定删除 Skill「' + (deleteTarget.entry.name || deleteTarget.entry.id) + '」（' + deleteTarget.entry.id + '）吗？'
            + (deleteTarget.refs.length > 0
              ? '注意：它正被 ' + deleteTarget.refs.length + ' 个预设引用（'
                + deleteTarget.refs.map(function (preset) { return preset.name || preset.id; }).join('、')
                + '），删除后这些预设会失去这个 Skill。'
              : '它目前没有被任何预设引用。'),
          confirmLabel: '删除条目',
          failLabel: '删除 Skill',
          toast: props.toast,
          onClose: function () { setDeleteTarget(null); },
          onConfirm: function () {
            var id = deleteTarget.entry.id;
            return Api.deleteSkill(id).then(function () {
              return Promise.resolve(props.reload()).then(function () {
                LstOk(props.toast, '已删除 Skill ' + id);
                return true;
              });
            });
          },
        })
      : null
  );
}
