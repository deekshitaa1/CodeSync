import { spawn } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
};

export type Language = "python" | "javascript";

export async function executeCode(
  language: Language,
  code: string
): Promise<ExecutionResult> {
  const tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), "codesync-")
  );

  const fileName =
    language === "python"
      ? "main.py"
      : "main.js";

  const filePath = path.join(
    tempDirectory,
    fileName
  );

  try {
    await writeFile(
      filePath,
      code,
      "utf8"
    );

    const command =
      language === "python"
        ? process.platform === "win32"
          ? "python"
          : "python3"
        : "node";

    return await runProcess(
      command,
      [filePath],
      10000
    );
  } finally {
    await rm(tempDirectory, {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn(
      command,
      args,
      {
        shell: false,
        windowsHide: true,
      }
    );

    let stdout = "";
    let stderr = "";
    let finished = false;

    const finish = (
      result: ExecutionResult
    ) => {
      if (finished) {
        return;
      }

      finished = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}

      finish({
        stdout,
        stderr:
          stderr +
          "\nExecution timed out after 10 seconds.",
        exitCode: -1,
        success: false,
      });
    }, timeoutMs);

    child.stdout.on(
      "data",
      (data: Buffer) => {
        stdout += data.toString();
      }
    );

    child.stderr.on(
      "data",
      (data: Buffer) => {
        stderr += data.toString();
      }
    );

    child.on(
      "error",
      (error) => {
        clearTimeout(timer);

        finish({
          stdout,
          stderr:
            stderr +
            `\n${error.message}`,
          exitCode: -1,
          success: false,
        });
      }
    );

    child.on(
      "close",
      (code) => {
        clearTimeout(timer);

        finish({
          stdout,
          stderr,
          exitCode: code ?? -1,
          success: code === 0,
        });
      }
    );
  });
}
