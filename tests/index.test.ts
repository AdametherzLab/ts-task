import { describe, it, expect } from "bun:test";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import {
  resolveDeps,
  runParallel,
  createLogger,
  findTasksFile,
  LogLevel,
  type TaskModule,
  type TaskFn,
  runTasks,
} from "../src/index.ts";

describe("ts-task", () => {
  it("resolveDeps orders dependencies before dependent tasks", () => {
    const build: TaskFn = async () => {};
    const clean: TaskFn = async () => {};
    const test: TaskFn = async () => {};

    const module: TaskModule = {
      build,
      clean,
      test,
      deps: {
        build: ["clean"],
        test: ["build"],
      },
    };

    const order = resolveDeps(module, ["test"]);
    expect(order).toEqual(["clean", "build", "test"]);
  });

  it("resolveDeps throws descriptive error on circular dependencies", () => {
    const a: TaskFn = async () => {};
    const b: TaskFn = async () => {};
    const c: TaskFn = async () => {};

    const module: TaskModule = {
      a,
      b,
      c,
      deps: {
        a: ["b"],
        b: ["c"],
        c: ["a"],
      },
    };

    expect(() => resolveDeps(module, ["a"])).toThrow("Circular dependency detected");
  });

  it("runParallel executes independent tasks concurrently", async () => {
    const executionLog: string[] = [];

    const taskA: TaskFn = async () => {
      executionLog.push("A-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionLog.push("A-end");
    };
    const taskB: TaskFn = async () => {
      executionLog.push("B-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionLog.push("B-end");
    };

    const module: TaskModule = {
      taskA,
      taskB,
    };

    const results = await runParallel(module, ["taskA", "taskB"], LogLevel.Silent);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[0].taskName).toBe("taskA");
    expect(results[1].taskName).toBe("taskB");
    expect(executionLog).toContain("A-start");
    expect(executionLog).toContain("B-start");
  });

  it("createLogger finish returns non-negative duration in milliseconds", () => {
    const logger = createLogger("test-task", LogLevel.Silent);
    const duration = logger.finish(true);

    expect(typeof duration).toBe("number");
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(duration)).toBe(true);
  });

  it("findTasksFile returns null when tasks.ts not found in directory tree", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-task-test-"));

    try {
      const result = findTasksFile(tempDir);
      expect(result).toBeNull();
    } finally {
      fs.rmdirSync(tempDir);
    }
  });

  it("task function receives arguments", async () => {
    const taskWithArgs: TaskFn = async (ctx) => {
      expect(ctx.args).toEqual(["arg1", "arg2"]);
      ctx.logger.info(`Received args: ${ctx.args.join(', ')}`);
    };

    const module: TaskModule = {
      taskWithArgs,
    };

    const results = await runParallel(module, ["taskWithArgs"], LogLevel.Silent, { taskWithArgs: ["arg1", "arg2"] });
    expect(results[0].success).toBe(true);
  });

  it("runTasks executes default tasks if no task name is provided and 'default' is defined", async () => {
    const defaultTask: TaskFn = async (ctx) => {
      ctx.logger.info("Running default task");
    };
    const module: TaskModule = {
      default: defaultTask,
    };

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-task-default-test-"));
    const tasksFilePath = path.join(tempDir, "tasks.ts");
    fs.writeFileSync(tasksFilePath, `export const default = async (ctx) => { ctx.logger.info("Running default task"); };`);

    try {
      const results = await runTasks({
        taskNames: [], // No task names provided
        parallel: false,
        logLevel: LogLevel.Silent,
        cwd: tempDir,
      });
      expect(results).toHaveLength(1);
      expect(results[0].taskName).toBe("default");
      expect(results[0].success).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("runTasks does nothing if no task name is provided and 'default' is not defined", async () => {
    const someTask: TaskFn = async (ctx) => {
      ctx.logger.info("Running some task");
    };
    const module: TaskModule = {
      someTask,
    };

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-task-no-default-test-"));
    const tasksFilePath = path.join(tempDir, "tasks.ts");
    fs.writeFileSync(tasksFilePath, `export const someTask = async (ctx) => { ctx.logger.info("Running some task"); };`);

    try {
      const results = await runTasks({
        taskNames: [], // No task names provided
        parallel: false,
        logLevel: LogLevel.Silent,
        cwd: tempDir,
      });
      expect(results).toHaveLength(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
