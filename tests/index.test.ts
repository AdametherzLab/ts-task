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
});