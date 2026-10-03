/* ------------------------------------------------------------------ *
 * dsh-agent-preset-editor —— host 半入口。
 *
 * 只做三件事：定出存储根、建 store、把 /agent-preset-editor/api 挂到
 * webServer 上。所有注册都包在 ctx.effect(...) 里，插件卸载时路由会被
 * 自动摘掉（webServer.register 返回的就是注销函数）。
 *
 * 可选的插件 config（profile 的 cordis.patch.yml 里 `config: {...}`）：
 *   root         覆盖存储根，默认 $DSH_HOME/agent-preset-editor
 *   profilePatch 覆盖要注入受管区块的 profile 的 cordis.patch.yml
 *   hotApply     true 时 /preset/apply 额外尝试 loader 热挂载（默认 false）
 *
 * 契约见 docs/CONTRACT.md（§1.6 §2 §3）。
 * ------------------------------------------------------------------ */

import { createStore, resolveStoreRoot } from './src/host/store.js';
import { createRoutes, ROUTE_PREFIX } from './src/host/routes.js';

export const name = 'agent-preset-editor';

/** 只依赖宿主的 HTTP 服务；loader 是可选探测（见 declarations.js）。 */
export const inject = ['webServer'];

/**
 * 挂载 host 半。
 * @param {object} ctx - host Cordis 上下文。
 * @param {object} [config] - 插件 config。
 */
export function apply(ctx, config) {
  const settings = config && typeof config === 'object' ? config : {};
  const store = createStore(resolveStoreRoot(settings));
  const routes = createRoutes({ store, ctx, config: settings });

  // webServer 的注册表要求 (kind, path) 唯一：整棵 API 子树用一个 prefix 吃掉。
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: routes.handle }),
    'dsh-agent-preset-editor: /agent-preset-editor/api routes',
  );
}
