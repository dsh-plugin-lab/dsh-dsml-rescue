import { configDefaults, defineConfig } from 'vitest/config'

/**
 * Day-to-day test configuration (`pnpm test`).
 *
 * **Contract tests do not live here.** They hit the real upstream, need credentials and consume quota,
 * so they run on their own (`vitest.contract.config.ts`, weekly `contract.yml`). This repository has
 * none yet — the exclusion is here from the start so that the first contract test cannot quietly join
 * the day-to-day run and turn "green locally" into "green only with a network and a key".
 *
 * `exclude` starts from the official defaults and appends to them: copying that list by hand means
 * missing every entry upstream adds later.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/contract-live-*.test.ts'],
    environment: 'node',
  },
})
