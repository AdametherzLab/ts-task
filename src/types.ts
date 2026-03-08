/**
 * Severity levels for task execution logging.
 */
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Silent = 4,
}

/**
 * Logging interface provided to tasks for scoped output.
 */
export interface TaskLogger {
  /**
   * Log a debug message.
   * @param message - The message to log
   */
  debug(message: string): void;

  /**
   * Log an informational message.
   * @param message - The message to log
   */
  info(message: string): void;

  /**
   * Log a warning message.
   * @param message - The message to log
   */
  warn(message: string): void;

  /**
   * Log an error message.
   * @param message - The message to log
   */
  error(message: string): void;
}

/**
 * Context object passed to each task function during execution.
 */
export interface TaskContext {
  /** The name of the currently executing task */
  readonly taskName: string;
  /** Scoped logger for this task instance */
  readonly logger: TaskLogger;
}

/**
 * Async function signature for a task.
 * Tasks receive a context with logging capabilities and may return a value or void.
 */
export type TaskFn = (ctx: TaskContext) => Promise<unknown | void>;

/**
 * Dependency declaration mapping task names to their dependencies.
 * Each key is a task name, value is array of task names that must complete first.
 */
export type TaskDeps = {
  readonly [taskName: string]: readonly string[];
};

/**
 * Represents the exported shape of a tasks.ts module.
 * Contains task functions and optional dependency declarations.
 */
export interface TaskModule {
  /** Dependency graph declaring which tasks depend on others */
  readonly deps?: TaskDeps;
  /** Task functions keyed by name */
  readonly [taskName: string]: TaskFn | TaskDeps | undefined;
}

/**
 * Outcome of a single task execution including timing metadata.
 */
export interface TaskResult {
  /** Name of the executed task */
  readonly taskName: string;
  /** Whether the task completed successfully */
  readonly success: boolean;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Timestamp when execution started */
  readonly startTime: Date;
  /** Timestamp when execution completed */
  readonly endTime: Date;
  /** Error object if task failed, undefined otherwise */
  readonly error?: Error;
}

/**
 * Configuration options for task execution.
 */
export interface RunOptions {
  /** Names of tasks to execute */
  readonly taskNames: readonly string[];
  /** Whether to run independent tasks in parallel */
  readonly parallel: boolean;
  /** Minimum log level to display (defaults to Info) */
  readonly logLevel?: LogLevel;
  /** Working directory for resolving tasks.ts (defaults to process.cwd()) */
  readonly cwd?: string;
}