import * as path from "path";
import * as fs from "fs";
// REMOVED external import: import * as process from "process";
import { fileURLToPath } from "url";
import type { RunOptions, TaskModule, TaskResult } from "./types.js";
import { runTasks } from "./runner.js";

const TASKS_FILE_NAME = "tasks.ts";

/**
 * Search for tasks.ts file by walking up directory tree.
 * @param startDir - Directory to start searching from
 * @returns Absolute path to tasks.ts if found, null otherwise
 */
function findTasksFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (true) {
    const candidatePath = path.join(currentDir, TASKS_FILE_NAME);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
    if (currentDir === root) {
      return null;
    }
    currentDir = path.dirname(currentDir);
  }
}

/**
 * Extract task function names from loaded module.
 * @param module - The imported tasks module
 * @returns Array of task names (excluding 'deps' and non-functions)
 */
function extractTaskNames(module: TaskModule): string[] {
  return Object.entries(module)
    .filter(([key, value]) => key !== "deps" && typeof value === "function")
    .map(([key]) => key);
}

/**
 * Generate help text showing usage and available tasks.
 * @param version - Package version string
 * @param tasksPath - Absolute path to discovered tasks.ts
 * @param taskNames - Array of available task names
 * @returns Formatted help string
 */
function generateHelp(version: string, tasksPath: string, taskNames: string[]): string {
  const lines = [
    `ts-task v${version}`,
    "",
    "Usage: ts-task [options] <task1> [task2] ...",
    "",
    "Options:",
    "  --parallel    Run independent tasks in parallel",
    "  --help, -h    Show this help message",
    "  --version, -v Show version number",
    "",
    `Tasks file: ${tasksPath}`,
    "",
    "Available tasks:",
    ...taskNames.map(name => `  ${name}`),
  ];
  return lines.join("\n");
}

interface ParsedArgs {
  readonly taskNames: readonly string[];
  readonly parallel: boolean;
  readonly showHelp: boolean;
  readonly showVersion: boolean;
  readonly cwd: string;
}

/**
 * Parse command line arguments.
 * @param argv - process.argv array
 * @returns Parsed arguments object
 * @throws {Error} If unknown options or missing values provided
 */
function parseArguments(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const taskNames: string[] = [];
  let parallel = false;
  let showHelp = false;
  let showVersion = false;
  let cwd = process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--parallel") {
      parallel = true;
    } else if (arg === "--help" || arg === "-h") {
      showHelp = true;
    } else if (arg === "--version" || arg === "-v") {
      showVersion = true;
    } else if (arg === "--cwd") {
      const nextArg = args[++i];
      if (!nextArg) {
        throw new Error("--cwd requires a path argument");
      }
      cwd = path.resolve(nextArg);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      taskNames.push(arg);
    }
  }

  return {
    taskNames: taskNames satisfies readonly string[],
    parallel,
    showHelp,
    showVersion,
    cwd,
  };
}

/**
 * Read version from package.json.
 * @returns Version string or "0.0.0" if not found
 */
async function getPackageVersion(): Promise<string> {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const packagePath = path.join(path.dirname(currentFile), "..", "package.json");
    const content = await fs.promises.readFile(packagePath, "utf-8");
    const pkg = JSON.parse(content) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Main entry point for the CLI.
 * Parses arguments, discovers tasks.ts, and executes requested tasks.
 * Exits process with code 0 on success, 1 on failure.
 * @returns Promise that resolves when CLI completes
 * @example
 * // In bin/ts-task:
 * import { main } from "../src/cli.js";
 * main();
 */
export async function main(): Promise<void> {
  try {
    const args = parseArguments(process.argv);
    const version = await getPackageVersion();

    if (args.showVersion) {
      console.log(version);
      process.exit(0);
    }

    const tasksFilePath = findTasksFile(args.cwd);
    if (!tasksFilePath) {
      console.error(`Error: No ${TASKS_FILE_NAME} found in ${args.cwd} or parent directories.`);
      console.error("");
      console.error("Create a tasks.ts file in your project root:");
      console.error("  export async function build(ctx: TaskContext) {");
      console.error("    ctx.logger.info('Building...');");
      console.error("  }");
      process.exit(1);
    }

    const tasksModule = await import(tasksFilePath) as TaskModule;
    const availableTasks = extractTaskNames(tasksModule);

    if (args.showHelp || args.taskNames.length === 0) {
      console.log(generateHelp(version, tasksFilePath, availableTasks));
      process.exit(0);
    }

    const unknownTasks = args.taskNames.filter(name => !availableTasks.includes(name));
    if (unknownTasks.length > 0) {
      console.error(`Error: Unknown task(s): ${unknownTasks.join(", ")}`);
      console.error("");
      console.error("Available tasks:");
      availableTasks.forEach(task => console.error(`  ${task}`));
      process.exit(1);
    }

    const runOptions: RunOptions = {
      taskNames: args.taskNames,
      parallel: args.parallel,
      cwd: path.dirname(tasksFilePath),
    };

    const results: TaskResult[] = await runTasks(runOptions);
    const hasFailures = results.some(result => !result.success);

    process.exit(hasFailures ? 1 : 0);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred");
    }
    process.exit(1);
  }
}

if (import.meta.url === fileURLToPath(import.meta.url)) {
  main();
}