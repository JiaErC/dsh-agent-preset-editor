/* ------------------------------------------------------------------ *
 * "让 AI 帮我写" —— hand the job back to the running conversation.
 *
 * The MCP and Skill dialogs are good at STORING a definition, not at
 * eliciting one: the user rarely has serverName/transport/command at hand,
 * but they can describe the thing in a sentence. So the dialogs carry a
 * button that drops a filled-in request into the CURRENT session's composer
 * and closes, leaving the user to complete the description and send it. The
 * agent then does the work through the plugin's HTTP API (see AI-USAGE.md).
 *
 * Reaching the composer goes through the conversation service:
 *
 *   conversation.input.for(sessionScope).setDraft(text)
 *
 * Both services are optional, so both are read with `safeGet` — a Cordis
 * context THROWS on a service that is not in `inject`, and neither
 * `conversation` nor `sessions` belongs in this plugin's inject list (the
 * editor must still render in a composition that has no conversation, e.g.
 * a settings-only shell).
 *
 * The wording follows the interface language, read from `<html lang>` (the
 * locale service keeps it in sync — see dsh-client-locale) and falling back
 * to the browser's own preference.
 * ------------------------------------------------------------------ */

/** The language the request is written in. */
function composeLanguage() {
  var tag = '';
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      tag = String(document.documentElement.lang || '');
    }
  } catch (error) { /* 无 DOM：走下面的兜底 */ }
  if (tag === '') {
    try {
      if (typeof navigator !== 'undefined') {
        tag = String(navigator.language || (navigator.languages && navigator.languages[0]) || '');
      }
    } catch (error) { /* 无 navigator：走默认 */ }
  }
  if (tag === '') return 'zh';
  return /^zh\b/i.test(tag) ? 'zh' : 'en';
}

/**
 * The request text per language and per catalogue.
 *
 * Two constraints shaped the wording: it has to be unambiguous to an agent
 * that has never seen this plugin, and it has to tell the USER what to fill
 * in — the agent cannot invent a server path or a SKILL.md body. So the
 * sentence names the destination, names the plugin, and lists the fields the
 * agent will need.
 */
const COMPOSE_TEXT = {
  mcp: {
    zh: '给 Agent 预设插件添加以下 MCP：\n'
      + '<在这里补充它的信息：项目位置 / 启动命令与参数 / 传输方式（stdio、http 或 sse）/ 用途>\n\n'
      + '登记完记得把它挂到需要它的预设上，并「保存并发布到 DSH」—— 只登记不挂载不会生效。',
    en: 'Add the following MCP to the Agent preset plugin:\n'
      + '<fill in the details here — where the project lives, the start command and its arguments, '
      + 'the transport (stdio, http or sse), and what it is for>\n\n'
      + 'After registering it, mount it on the presets that need it and publish to DSH — '
      + 'registering alone has no effect.',
  },
  skill: {
    zh: '给 Agent 预设插件添加以下 Skill：\n'
      + '<在这里补充它的信息：名称 / 用途 / SKILL.md 正文或所在目录>\n\n'
      + '登记完记得把它挂到需要它的预设上，并「保存并发布到 DSH」—— 只登记不挂载不会生效。',
    en: 'Add the following Skill to the Agent preset plugin:\n'
      + '<fill in the details here — its name, what it is for, and the SKILL.md body or the directory it lives in>\n\n'
      + 'After registering it, mount it on the presets that need it and publish to DSH — '
      + 'registering alone has no effect.',
  },
  // The preset request needs one extra word of care: "Agent preset plugin" and
  // "Agent preset" sit next to each other in the sentence, so the plugin is
  // named with its own display title and set off by quotes. Everything after
  // the colon is the user's to fill in — the agent cannot invent a purpose.
  //
  // 第二段是这份提示词的关键：预设有 plugins 字段，而 Web profile 把整个 agent
  // 平面交给每个预设自己挂载，所以这份清单漏一行就会让预设激活失败 —— 而且是
  // **静默**失败（DSH 里看得到、选不中，stderr 什么都不写）。让 AI 自己拼这份清单
  // 等于让它去踩这个坑，所以这里明确要求它先取现成的。
  // {templateUrl} 由 composeRequestText 换成绝对地址。
  preset: {
    zh: '给「Agent 预设编辑器」新增一个 Agent 预设：\n'
      + '<说明它的用途：面向什么任务、AI 该扮演什么角色、需要哪些参数 / MCP / Skills>\n\n'
      + '预设的 plugins 字段不要自己写：先 GET {templateUrl} 拿到现成的插件清单，原样放进 plugins。'
      + '这份清单是必须的，少一行会让预设激活失败、在 DSH 里选不中。',
    en: 'Add a new Agent preset to the Agent Preset Editor:\n'
      + '<describe its purpose — the task it targets, the role the agent should play, '
      + 'and the parameters, MCP servers or Skills it needs>\n\n'
      + "Do not hand-write the preset's plugins field: GET {templateUrl} first and use the rows it returns "
      + 'as-is. That list is required — one missing row makes the preset fail to activate, so it cannot be '
      + 'selected in DSH.',
  },
  // 给**已存在的**预设加子预设：和普通预设的关键差别是继承 —— 子预设不用重复描述父已经
  // 挂载的 MCP / Skills，也不必复制父的共享段落，所以提示词要把这层关系讲清楚，否则 AI
  // 会照普通预设那样重写一遍，结果与继承叠加成重复内容。
  // {parentName} 由 composeRequestText 填成父预设的展示名。
  subpreset: {
    zh: '给「Agent 预设编辑器」里的 Agent 预设「{parentName}」添加一个子 Agent 预设：\n'
      + '<说明这个子预设的用途：它要在父预设的基础上做什么、AI 该扮演什么角色、需要哪些额外参数 / MCP / Skills>\n\n'
      + '子预设会继承父预设的 MCP、Skills 和可继承提示词（在 prompt 里写 {{ $parent }} 取到），'
      + '所以只描述它额外需要的部分；父挂载的 MCP 与 Skills 不能删改。\n'
      + '它同样需要自己的 plugins 清单：先 GET {templateUrl} 拿到现成的行，原样放进 plugins。',
    en: 'Add a child Agent preset to the preset "{parentName}" in the Agent Preset Editor:\n'
      + '<describe what this child preset is for — what it does on top of the parent, the role the agent '
      + 'should play, and the extra parameters, MCP servers or Skills it needs>\n\n'
      + "A child preset inherits the parent's MCP servers, Skills and shared prompt (referenced in its prompt "
      + 'as {{ $parent }}), so describe only what it adds — the parent mounts cannot be removed or changed.\n'
      + 'It still needs its own plugins list: GET {templateUrl} first and use the rows it returns as-is.',
  },
};

/**
 * 插件 API 的绝对地址。
 *
 * 提示词要让**执行它的 agent** 自己去取插件清单，而 agent 是在会话里跑命令、发请求的，
 * 拿不到 client 半用的相对路径，所以这里拼成绝对地址。前缀取自 Api.base —— 路由前缀
 * 将来变了，提示词会自动跟着变，不会留下一个写死的路径慢慢烂掉。
 * @param {string} path - 以 / 开头的 API 子路径。
 * @returns {string} 绝对地址；非浏览器环境（测试 / SSR）退回相对路径。
 */
function composeApiUrl(path) {
  var origin = '';
  try {
    if (typeof location !== 'undefined' && location && typeof location.origin === 'string') {
      origin = location.origin;
    }
  } catch (error) {
    origin = '';
  }
  return origin + Api.base + path;
}

/**
 * The request text for one catalogue in the current interface language.
 * @param {'mcp'|'skill'|'preset'} kind - which catalogue the button belongs to.
 * @returns {string} the text to place in the composer.
 */
function composeRequestText(kind, extra) {
  var entry = COMPOSE_TEXT[kind] || COMPOSE_TEXT.mcp;
  var text = entry[composeLanguage()] || entry.zh;
  // {parentName} 只有 subpreset 用得到；没传就退回一个可读占位，不把花括号模板漏给 AI。
  var info = extra && typeof extra === 'object' ? extra : {};
  var parentName = typeof info.parentName === 'string' && info.parentName !== '' ? info.parentName : '（父预设）';
  return text
    .split('{templateUrl}').join(composeApiUrl('/plugin-template'))
    .split('{parentName}').join(parentName);
}

/* ---------------------------------------------------------------- *
 * Composer draft insertion.
 *
 * The conversation service exposes the draft as one string
 * (`getSnapshot().draft` + `setDraft`) and has no caret API, so the live
 * caret is read from the composer's own <textarea> and the text is spliced
 * there — matching how the text would land if the user typed it. An
 * unresolvable caret falls back to appending, which is the pre-existing
 * behaviour rather than a failure.
 * ---------------------------------------------------------------- */

/** Locate the composer textarea of the conversation column. */
function composeTextarea() {
  if (typeof document === 'undefined') return null;
  var column = document.querySelector('#root [data-slot="conversation"]');
  var find = function (scope) {
    return scope.querySelector('textarea[data-phase]') || scope.querySelector('textarea');
  };
  return column !== null && column !== undefined
    ? find(column)
    : document.querySelector('textarea[data-phase]');
}

/** The composer's live caret, or null when it cannot be trusted. */
function composeCaret(draft) {
  var el = composeTextarea();
  if (el === null || el === undefined) return null;
  if (el.disabled === true || el.readOnly === true) return null;
  // A caret is only meaningful against the draft it was measured on.
  if (el.value !== draft) return null;
  var start = el.selectionStart;
  var end = el.selectionEnd;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  start = Math.max(0, Math.min(start, draft.length));
  end = Math.max(start, Math.min(end, draft.length));
  return { start: start, end: end };
}

/**
 * Splice `text` into `draft` at `caret`, replacing any live selection, with
 * single-space joins that never double an existing whitespace.
 * @returns {{draft: string, caretAfter: number}} the new draft and the caret
 *   index that sits right after the inserted text.
 */
function composeSplice(draft, text, caret) {
  if (caret === null || draft === '') {
    var appended = draft.trim() === '' ? text : draft + ' ' + text;
    return { draft: appended, caretAfter: appended.length };
  }
  var prefix = draft.slice(0, caret.start);
  var suffix = draft.slice(caret.end);
  if (prefix === '' && suffix === '') return { draft: text, caretAfter: text.length };
  var left = prefix === '' || /\s$/.test(prefix) ? '' : ' ';
  var right = suffix === '' || /^\s/.test(suffix) ? '' : ' ';
  return {
    draft: prefix + left + text + right + suffix,
    caretAfter: prefix.length + left.length + text.length,
  };
}

/**
 * Put the caret right after the inserted text once the controlled textarea
 * has committed the new value — a programmatic draft change resets it.
 * Retried across a couple of frames and abandoned when the value moved on.
 */
function composePlaceCaret(expectedDraft, caretIndex) {
  var remaining = 2;
  var schedule = function (fn) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
    else if (typeof setTimeout === 'function') setTimeout(fn, 0);
  };
  var place = function () {
    if (remaining <= 0) return;
    remaining -= 1;
    var el = composeTextarea();
    if (el === null || el === undefined || el.disabled === true || el.readOnly === true) return;
    if (el.value !== expectedDraft) { schedule(place); return; }
    var at = Math.max(0, Math.min(caretIndex, el.value.length));
    try { el.setSelectionRange(at, at); } catch (error) { /* 某些宿主不支持：忽略 */ }
  };
  schedule(place);
}

/** Move keyboard focus to the composer once the dialog has finished closing. */
function composeFocusSoon() {
  var focus = function () {
    var el = composeTextarea();
    if (el === null || el === undefined) return;
    try { el.focus(); } catch (error) { /* 不可聚焦：忽略 */ }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { requestAnimationFrame(focus); });
  else if (typeof setTimeout === 'function') setTimeout(focus, 32);
}

/**
 * Insert `text` into a session's composer draft at the live caret.
 * @param {object} ctx - the browser Cordis context.
 * @param {string} sessionId - the session whose composer receives the text.
 * @param {string} text - the text to insert.
 * @returns {{ok: boolean, reason: string, detail?: string}} the outcome; the
 *   reason is what the user-facing message is built from.
 */
function composeInsert(ctx, sessionId, text) {
  if (!ctx) return { ok: false, reason: 'no-ctx' };
  // `sessions` is a declared dependency (see 99-epilogue.js): the inject-free
  // `ctx.get` read returned nothing for this service, and every 「让 AI 帮我写」
  // click failed with a message that blamed the wrong thing.
  var sessions = ctx.sessions;
  if (!sessions || typeof sessions.scope !== 'function') return { ok: false, reason: 'no-sessions-service' };
  if (!sessionId) return { ok: false, reason: 'no-session' };
  var scope;
  try {
    scope = sessions.scope(sessionId);
  } catch (error) {
    console.warn('[agent-preset-editor] sessions.scope 抛错', error);
    return { ok: false, reason: 'no-scope', detail: sessionId };
  }
  if (scope === undefined || scope === null) return { ok: false, reason: 'no-scope', detail: sessionId };
  // `conversation` stays an inject-free probe: that IS the documented way to
  // reach it, and a composition without a conversation must still render the
  // editor.
  var conversation = safeGet(ctx, 'conversation');
  if (!conversation || !conversation.input || typeof conversation.input.for !== 'function') {
    return { ok: false, reason: 'no-conversation' };
  }
  var input;
  try {
    input = conversation.input.for(scope);
  } catch (error) {
    console.warn('[agent-preset-editor] conversation.input.for 抛错', error);
    return { ok: false, reason: 'no-input' };
  }
  if (!input || !input.state || typeof input.setDraft !== 'function') return { ok: false, reason: 'no-input' };
  try {
    var draft = input.state.getSnapshot().draft;
    var spliced = composeSplice(draft, text, composeCaret(draft));
    input.setDraft(spliced.draft);
    composePlaceCaret(spliced.draft, spliced.caretAfter);
    return { ok: true, reason: 'ok' };
  } catch (error) {
    console.error('[agent-preset-editor] 草稿写入失败', error);
    return { ok: false, reason: 'write-failed', detail: error && error.message ? error.message : String(error) };
  }
}

/**
 * Failure reason → the sentence the user reads. Deliberately specific: one
 * generic "当前会话不可用" for six different causes cost a full round of
 * misdiagnosis, so each cause now names itself.
 */
const COMPOSE_REASON_TEXT = {
  'no-ctx': '页面上下文缺失',
  'no-session': '这个窗口没有绑定会话',
  'no-sessions-service': '宿主没有提供 sessions 服务',
  'no-scope': '这个会话的作用域还没就绪',
  'no-conversation': '宿主没有提供 conversation 服务（够不到输入机）',
  'no-input': '会话的输入机不可用',
  'write-failed': '写入输入框时出错',
};

/**
 * The dialogs' "让 AI 帮我写" action: put the request into the current
 * session's composer, hand focus to it, and report what happened so the
 * dialog can close and the user can be told.
 *
 * @param {object} ctx - the browser Cordis context.
 * @param {string} sessionId - the session whose composer receives the text.
 * @param {'mcp'|'skill'} kind - which catalogue the request is about.
 * @returns {{ok: boolean, reason: string, message: string, text: string}}
 */
function composeAskAi(ctx, sessionId, kind, extra) {
  var text = composeRequestText(kind, extra);
  var result = composeInsert(ctx, sessionId, text);
  if (result.ok) composeFocusSoon();
  var reason = result.reason || 'unknown';
  var message = COMPOSE_REASON_TEXT[reason] || ('未知原因：' + reason);
  if (reason === 'no-scope' && result.detail) message = message + '（' + result.detail + '）';
  if (reason === 'write-failed' && result.detail) message = message + '：' + result.detail;
  return { ok: result.ok, reason: reason, message: message, text: text };
}
