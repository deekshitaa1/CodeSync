import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { execa } from "execa";
import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 4000;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "100kb" }));

/* =========================================================
   TYPES
========================================================= */

type Language =
  | "javascript"
  | "typescript"
  | "python"
  | "c"
  | "cpp"
  | "java"
  | "go"
  | "rust";

type Client = {
  socket: WebSocket;
  id: string;
  name: string;
};

type Room = {
  id: string;
  code: string;
  language: Language;
  clients: Map<string, Client>;
};

/* =========================================================
   LANGUAGES
========================================================= */

const allowedLanguages: Language[] = [
  "javascript",
  "typescript",
  "python",
  "c",
  "cpp",
  "java",
  "go",
  "rust",
];

const DEFAULT_CODE: Record<Language, string> = {
  javascript: `console.log("Hello from CodeSync!");`,

  typescript: `const message: string = "Hello from CodeSync!";
console.log(message);`,

  python: `print("Hello from CodeSync!")`,

  c: `#include <stdio.h>

int main() {
    printf("Hello from CodeSync!\\n");
    return 0;
}`,

  cpp: `#include <iostream>

int main() {
    std::cout << "Hello from CodeSync!" << std::endl;
    return 0;
}`,

  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from CodeSync!");
    }
}`,

  go: `package main

import "fmt"

func main() {
    fmt.Println("Hello from CodeSync!")
}`,

  rust: `fn main() {
    println!("Hello from CodeSync!");
}`,
};

function isLanguage(value: unknown): value is Language {
  return (
    typeof value === "string" &&
    allowedLanguages.includes(value as Language)
  );
}

function getDefaultCode(language: Language): string {
  return DEFAULT_CODE[language];
}

/* =========================================================
   ROOMS
========================================================= */

const rooms = new Map<string, Room>();

function normalizeRoomId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

function createRoom(
  roomId: string,
  language: Language,
): Room {
  const room: Room = {
    id: roomId,
    code: getDefaultCode(language),
    language,
    clients: new Map(),
  };

  rooms.set(roomId, room);

  return room;
}

/* =========================================================
   WEBSOCKET HELPERS
========================================================= */

function send(
  socket: WebSocket,
  data: unknown,
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function broadcast(
  room: Room,
  data: unknown,
  exceptId?: string,
): void {
  for (const client of room.clients.values()) {
    if (client.id !== exceptId) {
      send(client.socket, data);
    }
  }
}

function getUsers(room: Room) {
  return Array.from(room.clients.values()).map(
    (client) => ({
      id: client.id,
      name: client.name,
    }),
  );
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",
  (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "codesync-api",
      timestamp: new Date().toISOString(),
      rooms: rooms.size,
    });
  },
);

/* =========================================================
   CREATE ROOM
========================================================= */

app.post(
  "/api/rooms",
  (
    req: Request,
    res: Response,
  ) => {
    const roomId = normalizeRoomId(
      req.body?.room,
    );

    const languageValue =
      typeof req.body?.language === "string"
        ? req.body.language.trim()
        : "javascript";

    if (!roomId) {
      return res.status(400).json({
        success: false,
        error: "Room code is required.",
      });
    }

    if (!isLanguage(languageValue)) {
      return res.status(400).json({
        success: false,
        error: "Unsupported programming language.",
      });
    }

    if (rooms.has(roomId)) {
      return res.status(409).json({
        success: false,
        error: "Room already exists.",
      });
    }

    const room = createRoom(
      roomId,
      languageValue,
    );

    return res.status(201).json({
      success: true,
      room: room.id,
      language: room.language,
    });
  },
);

/* =========================================================
   CHECK ROOM
========================================================= */

app.get(
  "/api/rooms/:roomId",
  (
    req: Request,
    res: Response,
  ) => {
    /*
     * Express params can be typed as string | string[].
     * Therefore we normalize it safely instead of calling
     * .trim() directly.
     */

    const rawRoomId =
      req.params.roomId;

    const roomId =
      typeof rawRoomId === "string"
        ? rawRoomId.trim()
        : "";

    if (!roomId) {
      return res.status(400).json({
        success: false,
        exists: false,
        error: "Room code is required.",
      });
    }

    const room = getRoom(roomId);

    if (!room) {
      return res.status(404).json({
        success: false,
        exists: false,
        error: "Room does not exist.",
      });
    }

    return res.json({
      success: true,
      exists: true,
      room: room.id,
      language: room.language,
      users: room.clients.size,
    });
  },
);

/* =========================================================
   EXECUTION HELPERS
========================================================= */

function executionResponse(
  res: Response,
  success: boolean,
  stdout: string,
  stderr: string,
  exitCode: number,
) {
  return res.json({
    success,
    stdout,
    stderr,
    exitCode,
  });
}

/* =========================================================
   CODE EXECUTION
========================================================= */

app.post(
  "/api/execute",
  async (
    req: Request,
    res: Response,
  ) => {
    const languageValue =
      req.body?.language;

    const code =
      req.body?.code;

    if (!isLanguage(languageValue)) {
      return executionResponse(
        res,
        false,
        "",
        "Unsupported programming language.",
        -1,
      );
    }

    if (typeof code !== "string") {
      return executionResponse(
        res,
        false,
        "",
        "Code must be a string.",
        -1,
      );
    }

    if (code.length > 50000) {
      return executionResponse(
        res,
        false,
        "",
        "Code exceeds the 50KB limit.",
        -1,
      );
    }

    const language =
      languageValue;

    const executionId =
      crypto.randomUUID();

    const workDir =
      await fs.mkdtemp(
        path.join(
          os.tmpdir(),
          `codesync-${executionId}-`,
        ),
      );

    try {
      /* =====================================================
         JAVASCRIPT
      ===================================================== */

      if (language === "javascript") {
        const sourceFile =
          path.join(
            workDir,
            "main.js",
          );

        await fs.writeFile(
          sourceFile,
          code,
          "utf8",
        );

        const result =
          await execa(
            "node",
            [sourceFile],
            {
              cwd: workDir,
              timeout: 5000,
              reject: false,
            },
          );

        return executionResponse(
          res,
          result.exitCode === 0,
          result.stdout ?? "",
          result.stderr ?? "",
          result.exitCode ?? 0,
        );
      }

      /* =====================================================
         TYPESCRIPT
      ===================================================== */

      if (language === "typescript") {
        const sourceFile =
          path.join(
            workDir,
            "main.ts",
          );

        await fs.writeFile(
          sourceFile,
          code,
          "utf8",
        );

        const result =
          await execa(
            "npx",
            [
              "--yes",
              "tsx",
              sourceFile,
            ],
            {
              cwd: workDir,
              timeout: 10000,
              reject: false,
            },
          );

        return executionResponse(
          res,
          result.exitCode === 0,
          result.stdout ?? "",
          result.stderr ?? "",
          result.exitCode ?? 0,
        );
      }

      /* =====================================================
         PYTHON
      ===================================================== */

      if (language === "python") {
        const sourceFile =
          path.join(
            workDir,
            "main.py",
          );

        await fs.writeFile(
          sourceFile,
          code,
          "utf8",
        );

        const pythonCommand =
          process.platform === "win32"
            ? "python"
            : "python3";

        const result =
          await execa(
            pythonCommand,
            [sourceFile],
            {
              cwd: workDir,
              timeout: 5000,
              reject: false,
            },
          );

        return executionResponse(
          res,
          result.exitCode === 0,
          result.stdout ?? "",
          result.stderr ?? "",
          result.exitCode ?? 0,
        );
      }

      /* =====================================================
         C
      ===================================================== */

      if (language === "c") {
        const sourceFile =
          path.join(
            workDir,
            "main.c",
          );

        const executable =
          process.platform === "win32"
            ? path.join(
                workDir,
                "main.exe",
              )
            : path.join(
                workDir,
                "main",
              );

        await fs.writeFile(
          sourceFile,
          code,
          "utf8",
        );

        const compile =
          await execa(
            "gcc",
            [
              sourceFile,
              "-o",
              executable,
            ],
            {
              cwd: workDir,
              timeout: 10000,
              reject: false,
            },
          );

        if (
          compile.exitCode !== 0
        ) {
          return executionResponse(
            res,
            false,
            compile.stdout ?? "",
            compile.stderr ||
              "C compilation failed.",
            compile.exitCode ?? 1,
          );
        }

        const result =
          await execa(
            executable,
            [],
            {
              cwd: workDir,
              timeout: 5000,
              reject: false,
            },
          );

        return executionResponse(
          res,
          result.exitCode === 0,
          result.stdout ?? "",
          result.stderr ?? "",
          result.exitCode ?? 0,
        );
      }

      /* =====================================================
         C++
      ===================================================== */

      if (language === "cpp") {
        const sourceFile =
          path.join(
            workDir,
            "main.cpp",
          );

        const executable =
          process.platform === "win32"
            ? path.join(
                workDir,
                "main.exe",
              )
            : path.join(
                workDir,
                "main",
              );

        await fs.writeFile(
          sourceFile,
          code,
          "utf8",
        );

        const compile =
          await execa(
            "g++",
            [
              sourceFile,
              "-o",
              executable,
            ],
            {
              cwd: workDir,
              timeout: 10000,
              reject: false,
            },
          );

        if (
          compile.exitCode !== 0
        ) {
          return executionResponse(
            res,
            false,
            compile.stdout ?? "",
            compile.stderr ||
              "C++ compilation failed.",
            compile.exitCode ?? 1,
          );
        }

        const result =
          await execa(
            executable,
            [],
            {
              cwd: workDir,
              timeout: 5000,
              reject: false,
            },
          );

        return executionResponse(
          res,
          result.exitCode === 0,
          result.stdout ?? "",
          result.stderr ?? "",
          result.exitCode ?? 0,
        );
      }

      /* =====================================================
         JAVA
      ===================================================== */

      if (language === "java") {
        const sourceFile =
          path.join(
            workDir,
            "Main.java",
          );

        await fs.writeFile(
          sourceFile,
          code,
          "utf8",
        );

        const compile =
          await execa(
            "javac",
            [sourceFile],
            {
              cwd: workDir,
              timeout: 10000,
              reject: false,
            },
          );

        if (
          compile.exitCode !== 0
        ) {
          return executionResponse(
            res,
            false,
            compile.stdout ?? "",
            compile.stderr ||
              "Java compilation failed.",
            compile.exitCode ?? 1,
          );
        }

        const result =
          await execa(
            "java",
            [
              "-cp",
              workDir,
              "Main",
            ],
            {
              cwd: workDir,
              timeout: 5000,
              reject: false,
            },
          );

        return executionResponse(
          res,
          result.exitCode === 0,
          result.stdout ?? "",
          result.stderr ?? "",
          result.exitCode ?? 0,
        );
      }

      /* =====================================================
         GO
      ===================================================== */

      if (language === "go") {
        const sourceFile =
          path.join(
            workDir,
            "main.go",
          );

        await fs.writeFile(
          sourceFile,
          code,
          "utf8",
        );

        const result =
          await execa(
            "go",
            [
              "run",
              sourceFile,
            ],
            {
              cwd: workDir,
              timeout: 10000,
              reject: false,
            },
          );

        return executionResponse(
          res,
          result.exitCode === 0,
          result.stdout ?? "",
          result.stderr ?? "",
          result.exitCode ?? 0,
        );
      }

      /* =====================================================
         RUST
      ===================================================== */

      if (language === "rust") {
        const sourceFile =
          path.join(
            workDir,
            "main.rs",
          );

        const executable =
          process.platform === "win32"
            ? path.join(
                workDir,
                "main.exe",
              )
            : path.join(
                workDir,
                "main",
              );

        await fs.writeFile(
          sourceFile,
          code,
          "utf8",
        );

        const compile =
          await execa(
            "rustc",
            [
              sourceFile,
              "-o",
              executable,
            ],
            {
              cwd: workDir,
              timeout: 10000,
              reject: false,
            },
          );

        if (
          compile.exitCode !== 0
        ) {
          return executionResponse(
            res,
            false,
            compile.stdout ?? "",
            compile.stderr ||
              "Rust compilation failed.",
            compile.exitCode ?? 1,
          );
        }

        const result =
          await execa(
            executable,
            [],
            {
              cwd: workDir,
              timeout: 5000,
              reject: false,
            },
          );

        return executionResponse(
          res,
          result.exitCode === 0,
          result.stdout ?? "",
          result.stderr ?? "",
          result.exitCode ?? 0,
        );
      }

      return executionResponse(
        res,
        false,
        "",
        "Execution handler not found.",
        -1,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Execution failed.";

      return executionResponse(
        res,
        false,
        "",
        message,
        -1,
      );
    } finally {
      await fs.rm(
        workDir,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);

/* =========================================================
   WEBSOCKET
========================================================= */

const wss =
  new WebSocketServer({
    server,
    path: "/collaboration",
  });

wss.on(
  "connection",
  (socket: WebSocket) => {
    console.log(
      "WebSocket client connected",
    );

    let currentRoom:
      | Room
      | null = null;

    let currentClient:
      | Client
      | null = null;

    socket.on(
      "message",
      (raw) => {
        try {
          const message =
            JSON.parse(
              raw.toString(),
            );

          /* ===============================================
             JOIN EXISTING ROOM
          =============================================== */

          if (
            message.type === "join"
          ) {
            const roomId =
              normalizeRoomId(
                message.room,
              );

            const name =
              normalizeName(
                message.name,
              );

            if (
              !roomId ||
              !name
            ) {
              send(socket, {
                type: "error",
                message:
                  "Room code and name are required.",
              });

              return;
            }

            /*
             * IMPORTANT:
             *
             * JOIN NEVER CREATES A ROOM.
             */

            const room =
              getRoom(roomId);

            if (!room) {
              send(socket, {
                type: "error",
                message:
                  "Room does not exist. Ask the host for the correct room code.",
              });

              return;
            }

            const id =
              `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`;

            const client: Client = {
              socket,
              id,
              name,
            };

            room.clients.set(
              id,
              client,
            );

            currentRoom =
              room;

            currentClient =
              client;

            send(socket, {
              type: "joined",
              room: room.id,
              clientId: id,
              code: room.code,
              language:
                room.language,
            });

            broadcast(room, {
              type: "users",
              users:
                getUsers(room),
            });

            console.log(
              `${name} joined room ${roomId}`,
            );

            return;
          }

          /* ===============================================
             CREATE ROOM
          =============================================== */

          if (
            message.type ===
            "create-room"
          ) {
            const roomId =
              normalizeRoomId(
                message.room,
              );

            const name =
              normalizeName(
                message.name,
              );

            const languageValue =
              typeof message.language ===
              "string"
                ? message.language.trim()
                : "javascript";

            if (
              !roomId ||
              !name
            ) {
              send(socket, {
                type: "error",
                message:
                  "Room code and name are required.",
              });

              return;
            }

            if (
              !isLanguage(
                languageValue,
              )
            ) {
              send(socket, {
                type: "error",
                message:
                  "Unsupported programming language.",
              });

              return;
            }

            if (
              rooms.has(roomId)
            ) {
              send(socket, {
                type: "error",
                message:
                  "Room already exists. Choose another room code.",
              });

              return;
            }

            const room =
              createRoom(
                roomId,
                languageValue,
              );

            const id =
              `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`;

            const client: Client = {
              socket,
              id,
              name,
            };

            room.clients.set(
              id,
              client,
            );

            currentRoom =
              room;

            currentClient =
              client;

            send(socket, {
              type:
                "room-created",
              room: room.id,
              clientId: id,
              code: room.code,
              language:
                room.language,
            });

            broadcast(room, {
              type: "users",
              users:
                getUsers(room),
            });

            console.log(
              `${name} created room ${roomId}`,
            );

            return;
          }

          /* ===============================================
             ROOM REQUIRED
          =============================================== */

          if (
            !currentRoom ||
            !currentClient
          ) {
            send(socket, {
              type: "error",
              message:
                "You must join a room first.",
            });

            return;
          }

          /* ===============================================
             CODE CHANGE
          =============================================== */

          if (
            message.type ===
            "code-change"
          ) {
            if (
              typeof message.code !==
              "string"
            ) {
              return;
            }

            currentRoom.code =
              message.code;

            broadcast(
              currentRoom,
              {
                type:
                  "code-change",
                code:
                  currentRoom.code,
                userId:
                  currentClient.id,
              },
              currentClient.id,
            );

            return;
          }

          /* ===============================================
             LANGUAGE CHANGE
          =============================================== */

          if (
            message.type ===
            "language-change"
          ) {
            const language =
              typeof message.language ===
              "string"
                ? message.language.trim()
                : "";

            if (
              !isLanguage(
                language,
              )
            ) {
              send(socket, {
                type: "error",
                message:
                  "Unsupported programming language.",
              });

              return;
            }

            currentRoom.language =
              language;

            currentRoom.code =
              getDefaultCode(
                language,
              );

            broadcast(
              currentRoom,
              {
                type:
                  "language-change",
                language,
                code:
                  currentRoom.code,
                userId:
                  currentClient.id,
              },
              currentClient.id,
            );

            return;
          }

          /* ===============================================
             CURSOR
          =============================================== */

          if (
            message.type ===
            "cursor"
          ) {
            broadcast(
              currentRoom,
              {
                type: "cursor",
                userId:
                  currentClient.id,
                name:
                  currentClient.name,
                line:
                  message.line,
                column:
                  message.column,
              },
              currentClient.id,
            );

            return;
          }

          /* ===============================================
             RUN RESULT
          =============================================== */

          if (
            message.type ===
            "run-result"
          ) {
            broadcast(
              currentRoom,
              {
                type:
                  "run-result",
                result:
                  message.result,
                userId:
                  currentClient.id,
              },
              currentClient.id,
            );

            return;
          }
        } catch (error) {
          console.error(
            "Invalid WebSocket message:",
            error,
          );

          send(socket, {
            type: "error",
            message:
              "Invalid message format.",
          });
        }
      },
    );

    /* ===============================================
       DISCONNECT
    =============================================== */

    socket.on(
      "close",
      () => {
        if (
          !currentRoom ||
          !currentClient
        ) {
          return;
        }

        currentRoom.clients.delete(
          currentClient.id,
        );

        broadcast(
          currentRoom,
          {
            type: "users",
            users:
              getUsers(
                currentRoom,
              ),
          },
        );

        console.log(
          `${currentClient.name} disconnected from ${currentRoom.id}`,
        );
      },
    );
  },
);

/* =========================================================
   START SERVER
========================================================= */

server.listen(
  PORT,
  () => {
    console.log("");
    console.log(
      "==========================================",
    );
    console.log(
      "        CodeSync Server Running",
    );
    console.log(
      "==========================================",
    );
    console.log(
      `API:       http://localhost:${PORT}`,
    );
    console.log(
      `Health:    http://localhost:${PORT}/health`,
    );
    console.log(
      `Execute:   http://localhost:${PORT}/api/execute`,
    );
    console.log(
      `WebSocket: ws://localhost:${PORT}/collaboration`,
    );
    console.log(
      "==========================================",
    );
    console.log("");
  },
);
