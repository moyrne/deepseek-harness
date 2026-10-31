/** Resolve packaged Office engine manifests from their complete, unpacked resource directories. */
import { registerHooks, type ModuleHooks } from 'node:module'
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Locate the archive containing a packaged runtime.
 * @param runtimeDir - Prepared or ASAR-contained runtime directory.
 * @returns Parent archive path, or undefined for a prepared directory.
 */
export function runtimeArchivePath(runtimeDir: string): string | undefined {
  const parent = dirname(runtimeDir)
  return basename(parent) === 'app.asar' ? parent : undefined
}

/** Marker set on the wrapped report reader so repeated installs in one process stay idempotent. */
const LINUX_PROBE_COMPATIBILITY = Symbol.for('@deepseek-ai/dsh-desktop-host/linux-engine-probe-compatibility')

/** Diagnostic report shape the engine probe reads; the full report stays opaque here. */
interface EngineProbeReport {
  readonly header?: { glibcVersionRuntime?: string } & Record<string, unknown>
}

/**
 * Keep LibreOffice Kit's engine probe on WASM for Linux runtimes without a native engine.
 * The kit selects a native engine from `process.report.getReport().header.glibcVersionRuntime` and
 * then treats an installed-package probe miss inside an ASAR archive as "engine present", because
 * Electron's ASAR `lstatSync` reports a missing entry as null and the probe checks `!== undefined`.
 * No Linux engine package is published, so the probe can never succeed; hiding the glibc marker
 * sends the kit to its WASM fallback. A runtime that actually carries a native engine keeps it.
 * @param runtimeDir - Prepared or ASAR-contained dsh runtime directory.
 */
export function installLinuxEngineProbeCompatibility(runtimeDir: string): void {
  if (process.platform !== 'linux') return
  const getReport = process.report.getReport as ReturnType<typeof process.report.getReport> & {
    [LINUX_PROBE_COMPATIBILITY]?: boolean
  }
  if (getReport[LINUX_PROBE_COMPATIBILITY] === true) return
  const details = process.report.getReport() as EngineProbeReport
  const target = details.header?.glibcVersionRuntime === undefined ? undefined
    : `libreoffice-kit-linux-${process.arch}-glibc`
  if (target === undefined) return
  const manifest = join(runtimeDir, 'node_modules', '@deepseek-ai', target, 'package.json')
  if (existsSync(manifest)) return
  const original = process.report.getReport.bind(process.report)
  const wrapped = (() => {
    const report = original() as EngineProbeReport
    if (report.header !== undefined) {
      delete report.header.glibcVersionRuntime
    }
    return report
  }) as typeof process.report.getReport & { [LINUX_PROBE_COMPATIBILITY]?: boolean }
  wrapped[LINUX_PROBE_COMPATIBILITY] = true
  process.report.getReport = wrapped
}

/**
 * Keep engine executable and resource paths usable by native child processes outside Electron.
 * Hooks apply only to this thread; worker threads must install their own resolver.
 * @param runtimeDir - Prepared or ASAR-contained dsh runtime directory.
 * @returns Installed resolver for the Host lifetime, or undefined for a non-ASAR runtime.
 */
export function installOfficeEngineResolution(runtimeDir: string): ModuleHooks | undefined {
  if (runtimeArchivePath(runtimeDir) === undefined) return undefined
  const root = realpathSync(runtimeDir)
  const archive = dirname(root)
  const source = pathToFileURL(join(root, 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
  const destination = pathToFileURL(join(`${archive}.unpacked`, relative(archive, root), 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context)
      if (!resolved.url.startsWith('file:')) return resolved
      const engineRequest = /^@deepseek-ai\/libreoffice-kit-(?:darwin|win32|linux)-/u.test(specifier)
      const engineTarget = /\/node_modules\/@deepseek-ai\/libreoffice-kit-(?:darwin|win32|linux)-[^/]+\//u
        .test(new URL(resolved.url).pathname)
      if (!engineRequest && !engineTarget) return resolved
      const canonical = pathToFileURL(realpathSync(fileURLToPath(resolved.url))).href
      if (!canonical.startsWith(source)) {
        if (canonical.startsWith(pathToFileURL(archive + '/').href)) {
          throw new Error(`desktop Office engine resolved outside the runtime package directory: ${resolved.url}`)
        }
        return resolved
      }
      const physical = realpathSync(fileURLToPath(destination + canonical.slice(source.length)))
      return { ...resolved, url: pathToFileURL(physical).href }
    },
  })
}
