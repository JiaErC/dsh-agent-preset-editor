/* ------------------------------------------------------------------ *
 * The host API client. Every write goes through index.js; the browser half
 * never touches the filesystem and never mints a preset declaration itself.
 * ------------------------------------------------------------------ */

/** One JSON round trip against the host half, with the envelope unwrapped. */
async function apiRequest(method, path, body) {
  var init = { method: method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  var response;
  try {
    response = await fetch(API_BASE + path, init);
  } catch (cause) {
    var netError = new Error('无法连接插件后端：' + (cause && cause.message ? cause.message : String(cause)));
    netError.code = 'network';
    throw netError;
  }
  var payload = null;
  try {
    payload = await response.json();
  } catch (cause) {
    payload = null;
  }
  if (!response.ok || !payload || payload.ok !== true) {
    var info = payload && payload.error ? payload.error : {};
    var error = new Error(info.message || ('请求失败 (HTTP ' + response.status + ')'));
    error.code = info.code || ('http-' + response.status);
    throw error;
  }
  return payload.data;
}

/**
 * Build the state a view renders, merging the host's stored definition with
 * the live roster the browser alone can read. The host's `dsh` block is a
 * placeholder; everything authoritative about the running deployment is
 * filled in here.
 * @param {object} ctx - the browser Cordis context.
 * @param {string|undefined} sessionId - the session the tab belongs to.
 * @returns {Promise<object>} the merged editor state.
 */
async function loadEditorState(ctx, sessionId) {
  var state = await Api.state();
  var dsh = { roster: [], defaultId: null, sessionPreset: null, sessionPresetLocked: false };
  var remote = ctx && ctx.remote;
  if (remote && remote.agentPresets && typeof remote.agentPresets.list === 'function') {
    try {
      var roster = await remote.agentPresets.list();
      dsh.roster = (roster && roster.presets) || [];
    } catch (error) {
      console.error('[agent-preset-editor] agentPresets.list failed', error);
    }
    var fallback = null;
    for (var i = 0; i < dsh.roster.length; i += 1) {
      if (dsh.roster[i].isDefault) { fallback = dsh.roster[i].id; break; }
    }
    dsh.defaultId = fallback;
  }
  // `sessions` is a declared dependency (see 99-epilogue.js): the inject-free
  // `ctx.get` read does not reach a reflect.provide service.
  var sessions = ctx ? ctx.sessions : undefined;
  if (sessionId !== undefined && sessionId !== null && sessions && sessions.list) {
    try {
      var snapshot = sessions.list.getSnapshot();
      var entry = snapshot && snapshot.byId ? snapshot.byId[sessionId] : undefined;
      if (entry) {
        dsh.sessionPreset = entry.agentPreset === undefined ? null : entry.agentPreset;
        // The roster records a broken composition; a session that already ran
        // a turn keeps the revision it started with. Neither field answers
        // "has this task started" outright — `agentPresets.select` does, and
        // the shell defers to its `agent-preset/locked` error.
        dsh.sessionPresetLocked = entry.turnCount !== undefined ? entry.turnCount > 0 : false;
      }
    } catch (error) {
      console.error('[agent-preset-editor] session lookup failed', error);
    }
  }
  state.dsh = dsh;
  return state;
}

/** Every host call the UI may make. */
const Api = {
  base: API_BASE,
  request: apiRequest,

  /** @returns {Promise<object>} the stored definitions, catalogues and values. */
  state() { return apiRequest('GET', '/state'); },
  /** @param {object} definition - the preset to store. */
  savePreset(definition) { return apiRequest('POST', '/preset/save', definition); },
  /** @param {string} id - the preset to remove. */
  deletePreset(id) { return apiRequest('POST', '/preset/delete', { id: id }); },
  /** @param {string} id - preset id. @param {object} values - tuned parameter values. */
  saveValues(id, values) { return apiRequest('POST', '/preset/values', { id: id, values: values }); },
  /** @param {string} id - the preset to publish as a DSH declaration. */
  applyPreset(id) { return apiRequest('POST', '/preset/apply', { id: id }); },
  /** @param {object} entry - the MCP catalogue entry. */
  saveMcp(entry) { return apiRequest('POST', '/mcp/save', entry); },
  /** @param {string} id - the MCP entry to remove. */
  deleteMcp(id) { return apiRequest('POST', '/mcp/delete', { id: id }); },
  /** @param {object} entry - the Skill catalogue entry. */
  saveSkill(entry) { return apiRequest('POST', '/skill/save', entry); },
  /** @param {string} id - the Skill entry to remove. */
  deleteSkill(id) { return apiRequest('POST', '/skill/delete', { id: id }); },
  /** @param {string} id - preset id. @param {object} values - the values to render with. */
  previewPrompt(id, values) { return apiRequest('POST', '/prompt/preview', { id: id, values: values }); },
};
