/* ------------------------------------------------------------------ *
 * HTTP 路由（CONTRACT §3）。
 *
 * 一个 prefix 注册吃掉整个 `/agent-preset-editor/api` 子树，再在内部按
 * 「方法 + 子路径」分派 —— webServer 注册表要求 (kind, path) 唯一，路由越
 * 少越好，卸载时一个 ctx.effect 就能整块摘掉（见 index.js）。
 *
 * 响应包统一：成功 `{ok:true,data}`，失败 `{ok:false,error:{code,message}}`；
 * 状态码 200 / 400 / 404 / 409 / 500（§3）。handler 自己拥有 res 的生命
 * 周期，所以每一条路径都必须恰好写一次响应 —— 包括抛错路径。
 * ------------------------------------------------------------------ */

import { renderPrompt, resolvePreset, resolveProfilePatchFile, syncDeclarations, tryHotApplyLoader } from './declarations.js';
import { readPluginTemplate } from './plugin-template.js';
import {
  ApiError,
  badRequest,
  conflict,
  internal,
  ioError,
  normalizeMcpEntry,
  normalizePresetDefinition,
  normalizeSkillEntry,
  normalizeValues,
  notFound,
  requireId,
} from './validate.js';

/** §1.6 统一路由前缀。 */
export const ROUTE_PREFIX = '/agent-preset-editor/api';

/** 请求体上限：Skill 正文可以很长，但 8 MiB 之外的东西不属于这个插件。 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/* ------------------------------ 响应工具 ------------------------------ */

/** 写一个 JSON 响应。handler 拥有 res，所以这里只写一次。 */
function sendJson(res, status, payload) {
  if (res.writableEnded || res.headersSent) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

const ok = (res, data) => sendJson(res, 200, { ok: true, data: data === undefined ? {} : data });

function fail(res, error) {
  const apiError = error instanceof ApiError ? error : internal('插件内部错误');
  if (!(error instanceof ApiError)) console.error('[agent-preset-editor] 未预期的错误', error);
  sendJson(res, apiError.status, { ok: false, error: { code: apiError.code, message: apiError.message } });
}

/** 读请求体并 JSON.parse。空体视作 `{}`。 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        finish(reject, badRequest(`请求体超过 ${Math.floor(MAX_BODY_BYTES / 1024 / 1024)} MiB 上限`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', (error) => finish(reject, badRequest(`读取请求体失败：${error && error.message ? error.message : String(error)}`)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (raw === '') {
        finish(resolve, {});
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        finish(reject, badRequest(`请求体不是合法 JSON：${error && error.message ? error.message : String(error)}`));
        return;
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        finish(reject, badRequest('请求体必须是一个 JSON 对象'));
        return;
      }
      finish(resolve, parsed);
    });
  });
}

/**
 * 校验子预设的父链接。
 *
 * 三条规则，都在保存时挡下来：① 不能把自己当父；② 父必须存在；③ **只允许一层** ——
 * 父自己不能再有 parentId。第三条是刻意的：多层继承会让 MCP/Skills 去重与提示词
 * 拼接都变成递归操作，而收益很小。数据形状（parentId）本来就够表达链，将来要放开
 * 不必改结构。
 *
 * 断链（父被删）**不在这里报错**：那是渲染期的事，resolvePreset 会退回顶层处理并
 * 带上 missingParent，让用户还能把预设改回来 —— 一条坏链接不该把编辑界面锁死。
 * @param {object} definition - 已规范化的预设定义。
 * @param {object} store - 存取层。
 */
function assertParentLink(definition, store) {
  const parentId = typeof definition.parentId === 'string' ? definition.parentId : '';
  if (parentId === '') return;
  if (parentId === definition.id) throw badRequest('预设不能把自己设为父预设');
  const all = (store.listPresets().presets || []);
  const parent = all.find((item) => item && item.id === parentId);
  if (!parent) throw notFound(`父预设「${parentId}」不存在，请先创建它`);
  if (typeof parent.parentId === 'string' && parent.parentId !== '') {
    throw badRequest(`「${parentId}」本身已经是子预设；只允许一层继承，它不能再当父预设`);
  }
}

/**
 * 建路由。
 * @param {{store: object, ctx: object, config: object}} options
 * @returns {{handle: (req, res) => Promise<void>, routes: Map<string, Function>}}
 */
export function createRoutes({ store, ctx, config }) {
  /** 把 IO 异常折成 io-error，别把 errno 细节糊到用户脸上。 */
  const guard = (fn) => async (payload) => {
    try {
      return await fn(payload);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const code = error && error.code ? String(error.code) : '';
      if (code === 'EACCES' || code === 'EPERM' || code === 'ENOSPC' || code === 'EBUSY' || code === 'EROFS' || code === 'ENOTDIR') {
        throw ioError(`文件操作失败（${code}）：${error.message}`);
      }
      throw internal(`插件内部错误：${error && error.message ? error.message : String(error)}`);
    }
  };

  /** 某个预设 id 是否已经有 loader 行（= 内置或已被别的 bundle 声明）。 */
  function hasLoaderRow(id) {
    const loader = ctx && ctx.loader;
    if (loader && typeof loader.resolve === 'function') {
      try {
        return Boolean(loader.resolve(`preset-${id}`));
      } catch {
        return false;
      }
    }
    return false;
  }

  /** 重新渲染声明并同步进 profile；失败就是真失败，交给上层报 io-error。 */
  function syncNow() {
    try {
      return syncDeclarations({ store, ctx, config });
    } catch (error) {
      console.error('[agent-preset-editor] 同步声明失败', error);
      throw ioError(`预设已保存，但生成 DSH 声明失败：${error && error.message ? error.message : String(error)}`);
    }
  }

  /** 副作用同步：失败只记日志，不让本来成功的写操作变成失败。 */
  function syncQuietly(reason) {
    try {
      return syncDeclarations({ store, ctx, config });
    } catch (error) {
      console.error(`[agent-preset-editor] ${reason}后同步声明失败（不影响本次写入）`, error);
      return null;
    }
  }

  const handlers = {
    /** GET /state → §3.2 EditorState。dsh 段是占位，client 半自己补。 */
    'GET /state': guard(async () => {
      const state = store.readState();
      let profilePatch = null;
      try {
        // ctx 传进去：运行中的 host 用 profileContext.patchPath 精确解析本 profile；
        // 空串 = 无法安全确定（隔离根），对 UI 来说就是「没有可写的 profile patch」。
        const resolved = resolveProfilePatchFile(config, ctx);
        profilePatch = resolved === '' ? null : resolved;
      } catch {
        profilePatch = null;
      }
      return {
        ...state,
        dsh: { roster: [], defaultId: null, sessionPreset: null, sessionPresetLocked: false },
        paths: { root: store.paths.root, declarations: store.paths.declarations, profilePatch },
      };
    }),

    /**
     * GET /plugin-template → 「预设该带的插件行」。
     *
     * Web profile 把整个 agent 平面交给每个预设自己挂载，所以新预设必须带一份完整
     * 插件清单；在此之前这份清单只能靠人从别处手抄，抄漏一个必需字段（plan-mode 的
     * `section`）就会让预设激活失败且不留日志。这个接口把清单变成一次可复现的读取，
     * 编辑模式的「填入内置工具面」和「让 AI 帮我写」的提示词都靠它。
     *
     * 读不到时**不报 500**：这是环境差异（非 npm 布局等），client 要能拿到 reason
     * 告诉用户「请手动填写」，而不是弹一个没有出路的错误。
     */
    'GET /plugin-template': guard(async (payload) => {
      const force = payload && (payload.refresh === true || payload.refresh === 'true');
      return readPluginTemplate({ refresh: force === true });
    }),

    /** POST /preset/save → 落盘定义；已发布过的顺带刷新声明。 */
    'POST /preset/save': guard(async (payload) => {
      const definition = normalizePresetDefinition(payload);
      assertParentLink(definition, store);
      store.writePreset(definition);
      // 保存任何预设后都重渲染一次，而不是只在「保存的恰好是已发布预设」时：
      // 父预设改 MCP / Skills / 可继承提示词后，已发布的**子预设**必须跟着变，
      // 而那一次保存的父预设自己可能根本没发布过。syncDeclarations 只在受管区块
      // 真有变化时才写盘，所以这里多调一次不会产生噪音。
      syncQuietly('预设已更新');
      return { id: definition.id };
    }),

    /** POST /preset/delete → 连同取值一起删；内置预设拒绝删除。 */
    'POST /preset/delete': guard(async (payload) => {
      const id = requireId(payload, 'id', '预设 id');
      const existed = store.deletePreset(id);
      const wasApplied = store.readApplied().includes(id);
      if (!existed) {
        if (hasLoaderRow(id)) {
          throw conflict(`「${id}」是内置预设（没有本地定义文件），不能删除；如需改变它的行为，请新建一个同 id 的预设来覆盖`);
        }
        throw notFound(`没有找到预设「${id}」`);
      }
      store.deleteValues(id);
      if (wasApplied) {
        store.unmarkApplied(id);
        syncQuietly('预设已删除');
      }
      return { id };
    }),

    /** POST /preset/values → 保存某个预设的参数取值。 */
    'POST /preset/values': guard(async (payload) => {
      const id = requireId(payload, 'id', '预设 id');
      if (!store.readPreset(id)) throw notFound(`没有找到预设「${id}」`);
      store.writeValues(id, normalizeValues(payload.values));
      return { id };
    }),

    /** POST /preset/apply → 渲染声明 → 写入 <root>/presets.patch.yml → 注入 profile 受管区块。 */
    'POST /preset/apply': guard(async (payload) => {
      const id = requireId(payload, 'id', '预设 id');
      const definition = store.readPreset(id);
      if (!definition) throw notFound(`没有找到预设「${id}」的本地定义，请先保存再发布`);

      store.markApplied(id);
      const report = syncNow();
      const row = report.rows.find((item) => item.presetId === id) || null;

      // 热应用是尽力而为的额外福利：默认关闭（config.hotApply），失败静默回退
      let mode = 'patch';
      let hotApplied = false;
      let note = report.note;
      if (config && config.hotApply === true && row) {
        try {
          const appliedRowId = await tryHotApplyLoader(ctx, row);
          if (appliedRowId !== null) {
            mode = 'loader';
            hotApplied = true;
            note = `${note} 另外已尝试通过 loader 热挂载 ${appliedRowId}。`;
          }
        } catch (error) {
          console.error('[agent-preset-editor] loader 热应用失败，已回退到 patch 模式', error);
        }
      }

      return {
        id,
        applied: true,
        mode,
        restartRequired: !hotApplied,
        note,
        // 契约之外的排查信息，UI 可忽略
        rowIds: report.rowIds,
        declarations: report.declarations,
        profilePatch: report.profilePatch,
        profileBackup: report.profileBackup,
        profileChanged: report.profileChanged,
      };
    }),

    'POST /mcp/save': guard(async (payload) => {
      const entry = normalizeMcpEntry(payload);
      store.saveMcp(entry);
      return { id: entry.id };
    }),

    'POST /mcp/delete': guard(async (payload) => {
      const id = requireId(payload, 'id', 'MCP id');
      if (!store.deleteMcp(id)) throw notFound(`没有找到 MCP 目录项「${id}」`);
      return { id };
    }),

    'POST /skill/save': guard(async (payload) => {
      const entry = normalizeSkillEntry(payload);
      store.saveSkill(entry);
      return { id: entry.id };
    }),

    'POST /skill/delete': guard(async (payload) => {
      const id = requireId(payload, 'id', 'Skill id');
      if (!store.deleteSkill(id)) throw notFound(`没有找到 Skill 目录项「${id}」`);
      return { id };
    }),

    /** POST /prompt/preview → 与 client 半完全一致的占位渲染（§2.5）。 */
    'POST /prompt/preview': guard(async (payload) => {
      const id = requireId(payload, 'id', '预设 id');
      const stored = store.readPreset(id);
      if (!stored) throw notFound(`没有找到预设「${id}」`);
      // 预览也必须走父子合并：子预设的 `{{ $parent }}` 只有在合并之后才有值，
      // 否则预览会比真机少一整段，反而误导人。
      const allPresets = store.listPresets().presets || [];
      const allValues = store.listValues() || {};
      const ownValues = payload.values === undefined
        ? (store.readValues(id) || {})
        : normalizeValues(payload.values);
      const resolved = resolvePreset(stored, allPresets, { ...allValues, [id]: ownValues });
      return {
        prompt: renderPrompt(resolved.definition.prompt, resolved.values, resolved.definition.params),
        parentId: resolved.parent ? resolved.parent.id : '',
        missingParent: resolved.missingParent,
      };
    }),
  };

  /** 已知子路径 → 允许的方法，用来把「方法不对」与「路径不存在」分开报。 */
  const pathMethods = new Map();
  for (const key of Object.keys(handlers)) {
    const at = key.indexOf(' ');
    const method = key.slice(0, at);
    const sub = key.slice(at + 1);
    const list = pathMethods.get(sub) || [];
    list.push(method);
    pathMethods.set(sub, list);
  }

  /** 请求路径 → 子路径（去掉注册用的前缀，含 query 的 req.url 由 URL 解析）。 */
  function stripPrefix(pathname) {
    const base = (typeof config?.prefix === 'string' && config.prefix !== '' ? config.prefix : ROUTE_PREFIX).replace(/\/+$/, '');
    if (pathname === base) return '/';
    if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
    return pathname;
  }

  async function handle(req, res) {
    let sub;
    try {
      sub = stripPrefix(new URL(req.url || '/', 'http://dsh.internal').pathname);
    } catch {
      fail(res, badRequest('无法解析请求路径'));
      return;
    }

    const method = String(req.method || 'GET').toUpperCase();
    const handler = handlers[`${method} ${sub}`];
    if (!handler) {
      const allowed = pathMethods.get(sub);
      if (allowed) fail(res, badRequest(`${sub} 不接受 ${method} 请求，请改用 ${allowed.join(' / ')}`));
      else fail(res, notFound(`未知的接口路径「${sub}」`));
      return;
    }

    try {
      const payload = method === 'GET' ? {} : await readJsonBody(req);
      ok(res, await handler(payload));
    } catch (error) {
      fail(res, error);
    }
  }

  return { handle, handlers, prefix: ROUTE_PREFIX };
}
