/**
 * Public API barrel for ts-task — Minimal TypeScript-native task runner.
 *
 * Re-exports all user-facing functions and types for programmatic usage.
 * Import from this module to access the task runner, logger, CLI utilities,
 * and type definitions.
 *
 * @example
 * ```typescript
 * import { runTasks, loadTasks, createLogger, type TaskContext } from "ts-task";
 *
 * const results = await runTasks({
 *   taskNames: ["build", "test"],
 *   parallel: true,
 *   cwd: process.cwd()
 * });
 * ```
 */

export type {
  TaskModule,
  TaskFn,
  TaskContext,
  TaskResult,
  RunOptions,
  TaskLogger,
  LogLevel,
} from "./types.js";

export {
  loadTasks,
  resolveDeps,
  runParallel,
  runTasks,
} from "./runner.js";

export {
  createLogger,
  type ScopedLogger,
} from "./logger.js";

export {
  main,
  parseArgs,
  findTasksFile,
} from "./cli.js";