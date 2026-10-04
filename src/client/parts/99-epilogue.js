/* ------------------------------------------------------------------ *
 * Epilogue: the factory's return value.
 *
 * `inject` gates activation on the services the registrations need.
 *
 * Two services are deliberately NOT declared here, and the reason differs:
 *
 * - `sidebarRightTabs` is resolved through `ctx.inject` INSIDE apply, because
 *   the seat declares its slot before it provides the registry: injecting it
 *   eagerly would leave the plugin permanently inactive.
 * - `conversation` is probed with `ctx.get('conversation')` at click time —
 *   that is the documented way to reach it (see dsh-better-sidebar's
 *   context-types: "the composer draft face … lazy `ctx.get` probe").
 *
 * `sessions` IS declared, even though `ctx.get` would be the inject-free
 * read: it is a Context service published through `reflect.provide`, and the
 * app's own plugins declare it exactly this way (dsh-better-sidebar:
 * `inject = ['slots', 'sessions', 'locale', …]`). Reading it through `ctx.get`
 * returned nothing, which is what made「让 AI 帮我写」fail on a live session.
 * ------------------------------------------------------------------ */
return {
  name: PKG,
  inject: ['slots', 'sessions', 'remote', 'remote.agentPresets', 'remote.settings'],
  apply: apply,
};
