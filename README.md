[![CI](https://github.com/AdametherzLab/ts-task/actions/workflows/ci.yml/badge.svg)](https://github.com/AdametherzLab/ts-task/actions) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# ⚡️ ts-task

The zero-config task runner that treats your `tasks.ts` like a Makefile, but with actual TypeScript and zero YAML trauma. Export named async functions, declare dependencies with simple arrays, and run them with beautiful, scoped logs.

## ✨ Features

- ✅ **Zero Config** — No `ts-task.config.ts`, no plugins, no DSL to learn
- ✅ **TypeScript Native** — Write tasks in actual TS with full IntelliSense and type safety
- ✅ **Smart Dependencies** — Declare deps with `export const buildDeps = ['lint']` and let topological sort handle the rest
- ✅ **Scoped Logging** — Every task gets its own color-coded logger with start time, duration, and pass/fail status
- ✅ **Parallel Ready** — Opt-in parallelism with `--parallel` for independent tasks

## 📦 Installation

```bash
npm install --save-dev @adametherzlab/ts-task
# or
bun add --dev @adametherzlab/ts-task
```

## 🚀 Quick Start

Create a `tasks.ts` in your project root:

```typescript
// tasks.ts
import { $ } from "bun"; // or use node:child_process, zx, etc.

export async function lint(): Promise<void> {
  await $`eslint src/`;
}

export async function build(): Promise<void> {
  await $`tsc --build`;
}

// Declare that build depends on lint passing first
export const buildDeps = ["lint"];
```

Then run:

```bash
npx ts-task build
# or with Bun:
bunx ts-task build
```

## 🖥️ CLI Usage

```bash
# Run single task
ts-task build

# Run multiple tasks sequentially (respecting deps)
ts-task lint test

# Run independent tasks in parallel
ts-task --parallel build test

# Specify working directory
ts-task --cwd ./packages/core build
```

## 🔗 The `deps` Convention

```typescript
// tasks.ts
export async function clean(): Promise<void> {
  await rm("./dist", { recursive: true, force: true });
}

export async function build(): Promise<void> {
  await $`tsc --build`;
}

export async function test(): Promise<void> {
  await $`vitest run`;
}

export const buildDeps = ["clean"];
export const testDeps = ["build"];
```

Running `ts-task test` automatically executes `clean` → `build` → `test` in the correct order.

## 📚 API Reference

```typescript
import { 
  runTasks, 
  createLogger, 
  loadTasks, 
  resolveDeps, 
  runParallel,
  parseArgs,
  findTasksFile,
  LogLevel 
} from "@adametherzlab/ts-task";
```

### `runTasks(options: RunOptions): Promise<TaskResult[]>`

- **Param** `options.taskNames` — Array of task names to execute
- **Param** `options.parallel` — Run independent tasks concurrently (default: `false`)
- **Param** `options.cwd` — Working directory containing tasks.ts (default: `process.cwd()`)
- **Param** `options.logLevel` — Minimum log level for output (default: `LogLevel.Info`)
- **Returns** Array of task results with timing, status, and returned values
- **Throws** If tasks.ts not found, dependencies invalid, or execution fails

```typescript
const results = await runTasks({
  taskNames: ["build", "test"],
  parallel: true,
  cwd: process.cwd()
});
```

### `createLogger(taskName: string, minLevel?: LogLevel): ScopedLogger`

- **Param** `taskName` — Display name shown in log prefixes
- **Param** `minLevel` — Minimum level to display (Debug, Info, Warn, Error)
- **Returns** ScopedLogger with `info`, `warn`, `error`, `debug`, and `finish` methods

```typescript
const logger = createLogger("deploy", LogLevel.Info);
logger.info("Uploading assets...");
const duration = logger.finish(true); // Marks success, returns elapsed ms
```

### `loadTasks(cwd: string): Promise<TaskModule>`

- **Param** `cwd` — Directory containing tasks.ts
- **Returns** TaskModule containing task functions and dependency declarations
- **Throws** If tasks.ts does not exist or cannot be imported

```typescript
const tasks = await loadTasks(process.cwd());
console.log(Object.keys(tasks)); // ['build', 'test', ...]
```

### `resolveDeps(taskModule: TaskModule, taskNames: readonly string[]): string[]`

- **Param** `taskModule` — Loaded task module containing deps and task functions
- **Param** `taskNames` — Target tasks to execute
- **Returns** Array of task names in dependency-respecting execution order
- **Throws** If circular dependencies detected, task not found, or dependency missing

```typescript
const order = resolveDeps(taskModule, ["test"]);
// Returns: ['clean', 'build', 'test']
```

### `runParallel(taskModule: TaskModule, taskNames: readonly string[], logLevel?: LogLevel): Promise<TaskResult[]>`

- **Param** `taskModule` — Loaded task module
- **Param** `taskNames` — Tasks to execute concurrently
- **Param** `logLevel` — Minimum log level for output
- **Returns** Array of task results
- **Throws** If a specified task is not a function or if any task fails

```typescript
const results = await runParallel(taskModule, ["lint", "typecheck"]);
```

### `findTasksFile(cwd: string): string`

Discover the tasks.ts file in the specified directory.

- **Param** `cwd` — Directory to search
- **Returns** Absolute path to tasks.ts
- **Throws** If no tasks.ts found in directory

```typescript
const path = findTasksFile("./packages/core");
```

### `parseArgs(argv: string[]): { taskNames: string[]; parallel: boolean; cwd: string; logLevel: LogLevel }`

- **Param** `argv` — Process arguments array (excluding node/bin paths)
- **Returns** Parsed options object with task names, flags, and settings

```typescript
const args = parseArgs(process.argv.slice(2));
// args: { taskNames: ['build'], parallel: true, cwd: '.', logLevel: 1 }
```

### `main(): Promise<void>`

Main entry point for the CLI. Parses arguments, discovers tasks.ts, and executes requested tasks. Exits