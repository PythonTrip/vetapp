// Resolve the owner's ESLint plugins from its workspace; apply them at repo scope
// so the extracted packages are checked together with their standalone host.
export { default } from "./apps/owner-web/eslint.config.mjs";
