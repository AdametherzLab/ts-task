import { LogLevel, TaskLogger } from "./types.js";

const ANSI = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
} as const;

/**
 * A scoped logger for a specific task execution, extending TaskLogger with
 * lifecycle management capabilities.
 */
export interface ScopedLogger extends TaskLogger {
  /**
   * Mark the task as completed and print a summary line with duration.
   * @param success - Whether the task completed successfully (determines color)
   * @returns The elapsed execution time in milliseconds
   */
  finish(success: boolean): number;
}

/**
 * Creates a logger scoped to a specific task name with ANSI-colored output.
 * Records the start time immediately upon creation.
 *
 * @param taskName - The name of the task to display in log prefixes
 * @param minLevel - Minimum log level to display (defaults to LogLevel.Info)
 * @returns A ScopedLogger instance bound to the task
 * @example
 * const logger = createLogger("build", LogLevel.Debug);
 * logger.info("Compiling...");
 * logger.warn("Deprecated API used");
 * const duration = logger.finish(true);
 */
export function createLogger(
  taskName: string,
  minLevel: LogLevel = LogLevel.Info
): ScopedLogger {
  const startTime = Date.now();
  const prefix = `${ANSI.cyan}[${taskName}]${ANSI.reset}`;

  const log = (level: LogLevel, color: string, message: string): void => {
    if (level >= minLevel) {
      console.log(`${prefix} ${color}${message}${ANSI.reset}`);
    }
  };

  return {
    debug(message: string): void {
      log(LogLevel.Debug, ANSI.dim, message);
    },

    info(message: string): void {
      log(LogLevel.Info, "", message);
    },

    warn(message: string): void {
      log(LogLevel.Warn, ANSI.yellow, message);
    },

    error(message: string): void {
      log(LogLevel.Error, ANSI.red, message);
    },

    finish(success: boolean): number {
      const duration = Date.now() - startTime;
      const statusColor = success ? ANSI.green : ANSI.red;
      const icon = success ? "✓" : "✗";

      if (minLevel <= LogLevel.Info) {
        console.log(
          `${prefix} ${statusColor}${icon} ${duration}ms${ANSI.reset}`
        );
      }

      return duration;
    },
  };
}