import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

export type SupportedLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "java"
  | "c"
  | "cpp"
  | "go"
  | "rust";

export type ExecutionResult = {
  language: SupportedLanguage;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number;
  timedOut: boolean;
};

const LANGUAGE_CONFIG: Record<
  SupportedLanguage,
  {
    file: string;
    command: string;
    args: (file: string) => string[];
  }
> = {
  javascript: {
    file: "main.js",
    command: "node",
    args: (file) => [file],
  },

  typescript: {
    file: "main.ts",
    command: "npx",
    args: (file) => ["tsx", file],
  },

  python: {
    file: "main.py",
    command: "python",
    args: (file) => [file],
  },

  java: {
    file: "Main.java",
    command: "java",
    args: () => ["Main.java"],
  },

  c: {
    file: "main.c",
    command: "gcc",
    args: (file) => [file, "-o", "main.exe"],
  },

  cpp: {
    file: "main.cpp",
    command: "g++",
    args: (file) => [file, "-o", "main.exe"],
  },

  go: {
    file: "main.go",
    command: "go",
    args: (file) => ["run", file],
  },

  rust: {
    file: "main.rs",
    command: "rustc",
    args: (file) => [file, "-o", "main.exe"],
  },
};

function collectOutput(
  child: ReturnType<typeof spawn>,
  timeoutMs: number
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let finished = false;

    const finish = (exitCode: number | null) => {
      if (finished) return;

      finished = true;

      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
      });
    };

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();

      finish(null);
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      finish(code);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      stderr += error.message;
      finish(null);
    });
  });
}

export async function executeCode(
  language: SupportedLanguage,
  code: string
): Promise<ExecutionResult> {
  const config = LANGUAGE_CONFIG[language];

  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const executionId = crypto.randomUUID();

  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), `codesync-${executionId}-`)
  );

  const sourceFile = path.join(
    tempDirectory,
    config.file
  );

  const startedAt = performance.now();

  try {
    await fs.writeFile(sourceFile, code, "utf8");

    const child = spawn(
      config.command,
      config.args(sourceFile),
      {
        cwd: tempDirectory,
        shell: false,
        windowsHide: true,
      }
    );

    const result = await collectOutput(
      child,
      10_000
    );

    return {
      language,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      executionTime: Math.round(
        performance.now() - startedAt
      ),
      timedOut: result.timedOut,
    };
  } finally {
    await fs.rm(tempDirectory, {
      recursive: true,
      force: true,
    });
  }
}
