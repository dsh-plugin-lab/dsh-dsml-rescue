import type { UserConfig } from 'tsdown'

/**
 * Host-only bundle.
 *
 * The template renders a second entry for a browser half; this plugin has none
 * (`--host-only` drops `src/client/`), so the config is a single ESM entry with
 * type declarations. Keeping the template's second entry would fail the build
 * on an entry module that does not exist.
 *
 * `neverBundle` names the modules the host already provides. They must stay
 * external: a bundled copy would give the plugin its own instance of host
 * helpers, and identity checks those helpers rely on would then disagree with
 * the running host.
 */
export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: true,
    deps: {
      neverBundle: ['@deepseek-ai/cordis', '@deepseek-ai/schemastery'],
    },
  },
] satisfies UserConfig[]
