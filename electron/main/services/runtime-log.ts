import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { inspect } from 'util'

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error'

let initialized = false

function formatArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`
  }

  if (typeof arg === 'string') {
    return arg
  }

  return inspect(arg, {
    depth: 5,
    breakLength: Infinity,
    maxArrayLength: 50,
  })
}

function writeLine(path: string, level: string, args: unknown[]): void {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(formatArg).join(' ')}\n`
  appendFileSync(path, line, 'utf-8')
}

export function initRuntimeLogging(filename: string): void {
  if (initialized) return
  initialized = true

  app.setAppLogsPath()
  const logsDir = app.getPath('logs')
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true })
  }

  const logPath = join(logsDir, filename)
  const methods: ConsoleMethod[] = ['log', 'info', 'warn', 'error']

  for (const method of methods) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      try {
        writeLine(logPath, method.toUpperCase(), args)
      } catch (error) {
        original('[runtime-log] Failed to append to log file:', error)
      }
      original(...args)
    }
  }

  process.on('uncaughtException', (error) => {
    console.error('[runtime-log] uncaughtException', error)
  })

  process.on('unhandledRejection', (reason) => {
    console.error('[runtime-log] unhandledRejection', reason)
  })

  console.info(`[runtime-log] Writing main-process logs to ${logPath}`)
}
