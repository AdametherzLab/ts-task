import * as path from "path";
import * as fs from "fs";
import type { TaskModule, TaskFn, TaskContext, TaskResult, RunOptions, TaskLogger, LogLevel } from "./types.js";

function createLogger(taskName: string, minLevel: LogLevel): TaskLogger {
  const shouldLog = (lvl: LogLevel) => lvl >= minLevel;
  return {
    debug: (m) => shouldLog(0) && console.debug(`[${taskName}] ${m}`),
    info: (m) => shouldLog(1) && console.info(`[${taskName}] ${m}`),
    warn: (m) => shouldLog(2) && console.warn(`[${taskName}] ${m}`),
    error: (m) => shouldLog(3) && console.error(`[${taskName}] ${m}`),
  };
}

/**
 * Load the tasks module from tasks.ts in the specified directory.
 * @param cwd - Working directory containing tasks.ts
 * @returns The loaded task module
 * @throws {Error} If tasks.ts does not exist or cannot be imported
 */
export async function loadTasks(cwd: string): Promise<TaskModule> {
  const tasksPath = path.join(cwd, "tasks.ts");
  if (!fs.existsSync(tasksPath)) {
    throw new Error(`tasks.ts not found in ${cwd}`);
  }
  return import(tasksPath) as Promise<TaskModule>;
}

/**
 * Resolve task execution order using topological sort.
 * @param taskModule - Loaded task module containing deps and task functions
 * @param taskNames - Target tasks to execute
 * @returns Array of task names in dependency-respecting order
 * @throws {Error} If circular dependencies detected, task not found, or dependency missing
 */
export function resolveDeps(taskModule: TaskModule, taskNames: readonly string[]): string[] {
  const deps = taskModule.deps ?? {};
  const isTaskFn = (k: string) => k !== "deps" && typeof taskModule[k] === "function";
  const allTasks = new Set([...Object.keys(taskModule).filter(isTaskFn), ...Object.keys(deps)]);
  
  for (const name of taskNames) {
    if (!allTasks.has(name)) throw new Error(`Task not found: ${name}`);
  }
  
  const required = new Set<string>();
  const visit = (task: string, stack: Set<string>): void => {
    if (stack.has(task)) throw new Error(`Circular dependency detected at: ${task}`);
    if (required.has(task)) return;
    stack.add(task);
    required.add(task);
    for (const dep of deps[task] ?? []) {
      if (!allTasks.has(dep)) throw new Error(`Task "${task}" depends on unknown task: ${dep}`);
      visit(dep, new Set(stack));
    }
  };
  
  for (const name of taskNames) visit(name, new Set());
  
  const inDegree = new Map<string, number>();
  for (const t of required) inDegree.set(t, 0);
  for (const t of required) {
    for (const d of deps[t] ?? []) {
      if (required.has(d)) inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
    }
  }
  
  const queue = [...required].filter(t => inDegree.get(t) === 0);
  const result: string[] = [];
  
  while (queue.length) {
    const current = queue.shift()!;
    result.push(current);
    for (const t of required) {
      if ((deps[t] ?? []).includes(current)) {
        const newDeg = (inDegree.get(t) ?? 0) - 1;
        inDegree.set(t, newDeg);
        if (newDeg === 0) queue.push(t);
      }
    }
  }
  
  if (result.length !== required.size) {
    throw new Error("Circular dependency detected in task graph");
  }
  return result;
}

async function executeTask(taskName: string, taskFn: TaskFn, logLevel: LogLevel, args: readonly string[]): Promise<TaskResult> {
  const startTime = new Date();
  const ctx: TaskContext = { taskName, logger: createLogger(taskName, logLevel), args };
  try {
    await taskFn(ctx);
    const endTime = new Date();
    return { taskName, success: true, durationMs: endTime.getTime() - startTime.getTime(), startTime, endTime };
  } catch (error) {
    const endTime = new Date();
    return { 
      taskName, 
      success: false, 
      durationMs: endTime.getTime() - startTime.getTime(), 
      startTime, 
      endTime, 
      error: error instanceof Error ? error : new Error(String(error)) 
    };
  }
}

/**
 * Run multiple independent tasks in parallel.
 * @param taskModule - Loaded task module
 * @param taskNames - Tasks to execute concurrently (must have no interdependencies)
 * @param logLevel - Minimum log level for output
 * @param taskArgs - Optional arguments to pass to tasks
 * @returns Array of task results
 * @throws {Error} If a specified task is not a function
 */
export async function runParallel(taskModule: TaskModule, taskNames: readonly string[], logLevel: LogLevel = 1, taskArgs: { [taskName: string]: readonly string[] } = {}): Promise<TaskResult[]> {
  return Promise.all(taskNames.map(async (name) => {
    const fn = taskModule[name] as TaskFn | undefined;
    if (typeof fn !== "function") throw new Error(`Task is not a function: ${name}`);
    const args = taskArgs[name] || [];
    return executeTask(name, fn, logLevel, args);
  }));
}

/**
 * Execute tasks with dependency resolution and optional parallelization.
 * @param options - Configuration for task execution
 * @returns Array of task results in execution order
 * @throws {Error} If tasks.ts not found, dependencies invalid, or execution fails
 * @example
 * const results = await runTasks({
 *   taskNames: ["build", "test"],
 *   parallel: false,
 *   cwd: process.cwd()
 * });
 */
export async function runTasks(options: RunOptions): Promise<TaskResult[]> {
  let { taskNames, parallel, logLevel = 1, cwd = process.cwd(), taskArgs = {} } = options;

  const mod = await loadTasks(cwd);

  if (taskNames.length === 0) {
    if (typeof mod.default === 'function') {
      taskNames = ['default'];
    } else {
      return []; // No tasks specified and no default task
    }
  }
  
  const order = resolveDeps(mod, taskNames);
  
  if (!parallel) {
    const results: TaskResult[] = [];
    for (const name of order) {
      const fn = mod[name] as TaskFn;
      if (typeof fn !== "function") throw new Error(`Task is not a function: ${name}`);
      const args = taskArgs[name] || [];
      const res = await executeTask(name, fn, logLevel, args);
      results.push(res);
      if (!res.success) break;
    }
    return results;
  }
  
  const deps = mod.deps ?? {};
  const levels = new Map<string, number>();
  const calcLevel = (t: string, visited = new Set<string>()): number => {
    if (visited.has(t)) return 0;
    if (levels.has(t)) return levels.get(t)!;
    visited.add(t);
    const d = deps[t] ?? [];
    const lvl = d.length === 0 ? 0 : Math.max(...d.map(x => calcLevel(x, new Set(visited)))) + 1;
    levels.set(t, lvl);
    return lvl;
  };
  order.forEach(t => calcLevel(t));
  
  const groups = new Map<number, string[]>();
  for (const t of order) {
    const l = levels.get(t) ?? 0;
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(t);
  }
  
  const results: TaskResult[] = [];
  for (const lvl of Array.from(groups.keys()).sort((a, b) => a - b)) {
    const batch = await runParallel(mod, groups.get(l)!, logLevel, taskArgs);
    results.push(...batch);
    if (batch.some(r => !r.success)) break;
  }
  return results;
}
