/** Resolve Linux packaging worker limits; Linux packages are unsigned, so no signing settings exist. */

/**
 * Validate the tarball packing worker limit without accessing signing hardware.
 * @param {NodeJS.ProcessEnv} environment Loaded packaging settings and inherited build environment.
 * @returns {{packConcurrency: number}} Worker limit defaulting to four.
 */
export function resolveLinuxPackageSettings(environment) {
  const pack = environment.DSH_DESKTOP_LINUX_PACK_CONCURRENCY ?? '4'
  if (!/^[1-9]\d*$/u.test(pack) || !Number.isSafeInteger(Number(pack))) {
    throw new Error('desktop package: DSH_DESKTOP_LINUX_PACK_CONCURRENCY must be a positive integer')
  }
  return { packConcurrency: Number(pack) }
}
