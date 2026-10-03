/* ------------------------------------------------------------------ *
 * The editor shell: the tab body that hosts the three modes, the sidebar
 * footer button that opens it, and the pieces the modes share — the prompt
 * renderer and the state loader.
 *
 * Mode transitions have one rule, taken from the user's own description
 * ("clicking a preset opens it in a NEW sidebar window, like a file row"):
 *
 *   - opening ANOTHER preset from a tab that has none (the list) mints a new
 *     tab, so every configured preset keeps its own window;
 *   - moving between the params and edit views of the SAME preset stays in
 *     the current tab, which is what the "switch to …" buttons mean.
 * ------------------------------------------------------------------ */

/** Booleans read as 是/否 in a prompt; nullish becomes an empty string. */
function formatParamValue(raw) {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    var parts = [];
    for (var i = 0; i < raw.length; i += 1) {
      var piece = formatParamValue(raw[i]);
      if (piece !== '') parts.push(piece);
    }
    return parts.join('、');
  }
  if (typeof raw === 'boolean') return raw ? '是' : '否';
  return String(raw);
}

/**
 * Expand `{{ $name }}` placeholders against the tuned values, falling back to
 * each parameter's declared default. The regex is the contract's §2.5 grammar;
 * index.js implements the identical rule for `/prompt/preview`.
 * @param {string} prompt - the template.
 * @param {object} values - the values the user tuned for this task.
 * @param {Array} params - the preset's ParamSpec list (defaults live here).
 * @returns {string} the prompt the agent would receive.
 */
function renderPrompt(prompt, values, params) {
  var text = typeof prompt === 'string' ? prompt : '';
  var vals = values && typeof values === 'object' ? values : {};
  var specs = Array.isArray(params) ? params : [];
  var byName = {};
  for (var i = 0; i < specs.length; i += 1) {
    var spec = specs[i];
    if (spec && typeof spec.name === 'string') byName[spec.name] = spec;
  }
  return text.replace(/\{\{\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, function (match, name) {
    var raw = vals[name];
    if (raw === undefined || raw === null || raw === '') {
      var spec = byName[name];
      raw = spec === undefined ? undefined : spec.default;
    }
    return formatParamValue(raw);
  });
}

/**
 * The fields of a preset the editor edits before it exists server-side.
 * @param {string} id - the preset identity.
 * @returns {object} a blank definition carrying that id.
 */
function blankPreset(id) {
  var stamp = nowIso();
  return {
    id: id,
    name: '',
    description: '',
    order: 100,
    prompt: '',
    params: [],
    form: { rule: [] },
    mcp: [],
    skills: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Look a preset definition up in the loaded state. */
function findPreset(state, presetId) {
  if (!state || !Array.isArray(state.presets) || !presetId) return undefined;
  for (var i = 0; i < state.presets.length; i += 1) {
    if (state.presets[i] && state.presets[i].id === presetId) return state.presets[i];
  }
  return undefined;
}

/** Whether a preset id exists anywhere: our own storage or the live roster. */
function presetSourceOf(state, presetId) {
  if (findPreset(state, presetId)) return 'user';
  var roster = state && state.dsh && Array.isArray(state.dsh.roster) ? state.dsh.roster : [];
  for (var i = 0; i < roster.length; i += 1) {
    if (roster[i] && roster[i].id === presetId) return 'system';
  }
  return 'unknown';
}

/** The roster row for a preset id, when the live deployment declares it. */
function rosterRowOf(state, presetId) {
  var roster = state && state.dsh && Array.isArray(state.dsh.roster) ? state.dsh.roster : [];
  for (var i = 0; i < roster.length; i += 1) {
    if (roster[i] && roster[i].id === presetId) return roster[i];
  }
  return undefined;
}

/**
 * Load the editor state and keep a `reload` the views can await after a write.
 * @param {object} ctx - the browser Cordis context.
 * @param {string|undefined} sessionId - the session the tab belongs to.
 * @returns {{state: object|null, loading: boolean, error: string|null, reload: Function}}
 */
function useEditorState(ctx, sessionId) {
  var pair = useState(null);
  var state = pair[0];
  var setState = pair[1];
  var loadPair = useState(true);
  var loading = loadPair[0];
  var setLoading = loadPair[1];
  var errPair = useState(null);
  var error = errPair[0];
  var setError = errPair[1];
  // A reload counter instead of a bare callback keeps `reload` identity stable
  // for the views while still re-running the effect.
  var bumpPair = useState(0);
  var bump = bumpPair[0];
  var setBump = bumpPair[1];
  var alive = useRef(true);

  useEffect(function () {
    alive.current = true;
    return function () { alive.current = false; };
  }, []);

  useEffect(function () {
    var cancelled = false;
    setLoading(true);
    loadEditorState(ctx, sessionId).then(function (next) {
      if (cancelled || !alive.current) return;
      setState(next);
      setError(null);
      setLoading(false);
    }, function (cause) {
      if (cancelled || !alive.current) return;
      setError(cause && cause.message ? cause.message : String(cause));
      setLoading(false);
    });
    return function () { cancelled = true; };
  }, [ctx, sessionId, bump]);

  var reload = useCallback(function () {
    setBump(function (n) { return n + 1; });
  }, []);

  return { state: state, loading: loading, error: error, reload: reload };
}

/** Open (or mint) an editor tab in the right Sidebar. */
function openEditorTab(ctx, params) {
  if (!ctx || !ctx.sidebarRight || typeof ctx.sidebarRight.openTab !== 'function') {
    console.error('[agent-preset-editor] sidebarRight.openTab is unavailable');
    return;
  }
  try {
    ctx.sidebarRight.openTab(TAB_KIND, { params: params || {} });
  } catch (error) {
    console.error('[agent-preset-editor] openTab failed', error);
  }
}

/** Whether a `select` rejection means the session already started its task. */
function isPresetLockedError(error) {
  if (!error) return false;
  if (error.code === 'agent-preset/locked') return true;
  var text = String(error.message || '');
  return text.indexOf('agent-preset/locked') >= 0 || text.indexOf('locked') >= 0;
}

/**
 * Move the current selection to another preset for this session. The host is
 * the only authority on whether that is still allowed — a session that has
 * started a turn rejects the write with `agent-preset/locked`, which is why
 * the button stays live even when the cached state looks locked.
 * @returns {Promise<{ok: boolean, message: string}>} the outcome to surface.
 */
async function enablePreset(ctx, sessionId, presetId, name) {
  var label = name || presetId;
  if (!ctx || !ctx.remote || !ctx.remote.agentPresets) {
    return { ok: false, message: '宿主未提供 agentPresets 服务' };
  }
  if (!sessionId) {
    return { ok: false, message: '没有可用会话，无法切换预设' };
  }
  try {
    await ctx.remote.agentPresets.select(sessionId, presetId);
    return { ok: true, message: '已把当前会话切换到「' + label + '」' };
  } catch (error) {
    if (isPresetLockedError(error)) {
      return { ok: false, message: '任务已开始，无法切换预设；请新建会话后再选「' + label + '」' };
    }
    return { ok: false, message: '切换失败：' + (error && error.message ? error.message : String(error)) };
  }
}

/** The top strip: mode switch plus the current preset's name. */
function ShellHeader(props) {
  var mode = props.mode;
  var onMode = props.onMode;
  var presetName = props.presetName;
  var onBack = props.onBack;
  var right = props.right;
  return h('div', { className: 'ape-shell-head' },
    h('div', { className: 'ape-shell-headline' },
      props.mode !== MODE_LIST && onBack
        ? h(UiButton, { variant: 'ghost', size: 'sm', icon: 'back', onClick: onBack, title: '返回预设列表' }, '列表')
        : null,
      h('span', { className: 'ape-shell-title' }, presetName || 'Agent 预设'),
    ),
    h('div', { className: 'ape-shell-headright' },
      mode === MODE_LIST ? null : h(Segmented, {
        value: mode,
        onChange: onMode,
        options: [
          { label: '参数配置', value: MODE_PARAMS, icon: 'sliders' },
          { label: '编辑模式', value: MODE_EDIT, icon: 'edit' },
        ],
      }),
      right || null,
    ),
  );
}

/** The tab body the right Sidebar renders. */
function EditorTabBody(props) {
  var ctx = props.ctx;
  var sessionId = props.sessionId;
  var framework = props.useTabInfo;
  var info = typeof framework === 'function' ? framework() : null;
  var nav = info && info.tab && info.tab.navigation ? info.tab.navigation : null;
  var navParams = (nav && nav.params) || {};
  var navRevision = nav ? nav.revision : 0;

  var modePair = useState(navParams.mode || MODE_LIST);
  var mode = modePair[0];
  var setModeRaw = modePair[1];
  var presetPair = useState(navParams.presetId || null);
  var presetId = presetPair[0];
  var setPresetId = presetPair[1];
  var tabPair = useState(navParams.tab || LIST_PRESETS);
  var listTab = tabPair[0];
  var setListTab = tabPair[1];

  // A repeated navigation into the same tab (reveal, retarget) re-seeds the
  // selection; the revision is the only signal that navigation happened.
  var lastRev = useRef(navRevision);
  useEffect(function () {
    if (lastRev.current === navRevision) return;
    lastRev.current = navRevision;
    if (navParams.presetId) setPresetId(navParams.presetId);
    if (navParams.mode) setModeRaw(navParams.mode);
    if (navParams.tab) setListTab(navParams.tab);
  }, [navRevision, navParams.presetId, navParams.mode, navParams.tab]);

  var store = useEditorState(ctx, sessionId);
  var toast = useToast();
  var tip = useRef(null);
  tip.current = toast;

  /**
   * The one entry point the views use for navigation.
   *
   * A tab with no preset is the list: choosing a preset there mints a NEW
   * window, which is the interaction the user asked for. Inside a preset's own
   * window the two modes swap in place.
   */
  var setMode = useCallback(function (nextMode, opts) {
    var options = opts || {};
    var target = options.presetId === undefined ? presetId : options.presetId;
    if (options.tab !== undefined) setListTab(options.tab);
    if (target && target !== presetId) {
      openEditorTab(ctx, {
        presetId: target,
        mode: nextMode || MODE_PARAMS,
        tab: options.tab === undefined ? listTab : options.tab,
      });
      return;
    }
    if (!target && options.presetId && nextMode && nextMode !== MODE_LIST) {
      // The list asked to open a preset that does not exist yet: keep the view
      // in the current tab instead of minting one for an empty id.
      setPresetId(options.presetId);
    }
    setModeRaw(nextMode || MODE_LIST);
  }, [ctx, presetId, listTab]);

  var showToast = useCallback(function (message, tone) {
    if (tip.current && typeof tip.current.show === 'function') tip.current.show(message, tone || 'info');
  }, []);

  var enabledPreset = findPreset(store.state, presetId);
  var rosterRow = presetId ? rosterRowOf(store.state, presetId) : undefined;
  var presetName = enabledPreset && enabledPreset.name
    ? enabledPreset.name
    : (rosterRow && rosterRow.name ? rosterRow.name : presetId);

  var shared = {
    ctx: ctx,
    sessionId: sessionId,
    state: store.state,
    reload: store.reload,
    setMode: setMode,
    toast: { show: showToast },
    showToast: showToast,
    renderPrompt: renderPrompt,
    sourceOf: function (id) { return presetSourceOf(store.state, id); },
    rosterRowOf: function (id) { return rosterRowOf(store.state, id); },
    blankPreset: blankPreset,
    enable: function (id, name) { return enablePreset(ctx, sessionId, id, name); },
  };

  var body = null;
  if (store.loading && store.state === null) {
    body = h(UiSpinner, null);
  } else if (store.error && store.state === null) {
    body = h(UiEmpty, {
      title: '无法读取插件数据',
      hint: store.error + '（检查 dsh 宿主是否加载了 dsh-agent-preset-editor 的 host 半）',
    });
  } else if (mode === MODE_EDIT) {
    body = h(EditMode, Object.assign({}, shared, { presetId: presetId, mode: mode }));
  } else if (mode === MODE_PARAMS && presetId) {
    body = h(ParamsMode, Object.assign({}, shared, { presetId: presetId, mode: mode }));
  } else if (mode === MODE_PARAMS && !presetId) {
    body = h(UiEmpty, { title: '还没有选中预设', hint: '回到列表点一个预设再进入参数配置' });
  } else if (listTab === LIST_MCP) {
    body = h(McpListMode, Object.assign({}, shared, { tab: listTab, setTab: setListTab }));
  } else if (listTab === LIST_SKILLS) {
    body = h(SkillListMode, Object.assign({}, shared, { tab: listTab, setTab: setListTab }));
  } else {
    body = h(PresetListMode, Object.assign({}, shared, { tab: listTab, setTab: setListTab }));
  }

  return h('div', { className: 'ape-shell', 'data-dsh-agent-preset-editor': '' },
    h(ShellHeader, {
      mode: mode,
      presetName: presetName,
      onMode: function (next) { setMode(next, { presetId: presetId }); },
      onBack: function () { setMode(MODE_LIST); },
      right: store.loading && store.state !== null ? h(UiSpinner, null) : null,
    }),
    h('div', { className: 'ape-shell-body' }, body),
    toast.node,
  );
}

/** The compact button the sidebar foot renders beside Settings. */
function SidebarFooterButton(props) {
  var ctx = props.ctx;
  var wide = props.wide !== false;
  var onClick = useCallback(function () { openEditorTab(ctx, {}); }, [ctx]);
  if (!wide) {
    return h('button', {
      type: 'button',
      className: 'ape-foot rail',
      title: 'Agent 预设',
      'aria-label': 'Agent 预设',
      onClick: onClick,
    }, h(Icon, { name: 'preset', size: 16 }));
  }
  return h('button', {
    type: 'button',
    className: 'ape-foot',
    title: 'Agent 预设',
    onClick: onClick,
  }, h(Icon, { name: 'preset', size: 16 }), h('span', null, 'Agent 预设'));
}

/** The tab chip: the preset's own name once a window is bound to one. */
function EditorTabTitle(props) {
  var framework = props.useTabInfo;
  var info = typeof framework === 'function' ? framework() : null;
  var nav = info && info.tab && info.tab.navigation ? info.tab.navigation : null;
  var navParams = (nav && nav.params) || {};
  var fallback = info && info.tab && info.tab.title ? info.tab.title : 'Agent 预设';
  return h('span', { className: 'ape-chip' }, navParams.presetId ? navParams.presetId : fallback);
}
