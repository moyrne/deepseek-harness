/** Resolve Linux packaging worker limits; Linux packages are unsigned, so no signing settings exist. */

/**
 * Validate the tarball packing worker limit without accessing signing hardware.
 * @param environment Loaded packaging settings and inherited build environment.
 * @returns Worker limit defaulting to four.
 */
export function resolveLinuxPackageSettings(environment: NodeJS.ProcessEnv): { readonly packConcurrency: number }
