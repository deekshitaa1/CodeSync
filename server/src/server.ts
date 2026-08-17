import express from "express";
import cors from "cors";
import http from "node:http";
import crypto from "node:crypto";
import {
  WebSocketServer,
  WebSocket,
} from "ws";

import { executeCode } from "./execution/execute.js";

/* ======================================================
   PORT
   ====================================================== */

const PORT = Number(process.env.PORT) || 4000;

/* ======================================================
   EXPRESS
   ====================================================== */

const app = express();

app.use(
  cors({
    origin: true,
    credentials: false,
  })
);

app.use(express.json());

/* ======================================================
   HTTP ROUTES
   ====================================================== */

app.get("/", (_req, res) => {
  res.status(200).json({
    name: "CodeSync",
    status: "running",
    websocket: "/collaboration",
    room: "one-global-room",
    execution: "real-python",
    collaboration: "real-time",
    cursors: "enabled",
  });
});

/* ======================================================
   HTTP SERVER
   ====================================================== */

const server = http.createServer(app);

/* ======================================================
   WEBSOCKET SERVER
   ====================================================== */

const wss = new WebSocketServer({
  server,
  path: "/collaboration",
});

/* ======================================================
   TYPES
   ====================================================== */

type User = {
  id: string;
  name: string;
};

type CursorPosition = {
  lineNumber: number;
  column: number;
};

type SelectionPosition = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

type Client = {
  id: string;
  name: string;
  socket: WebSocket;

  cursor: CursorPosition | null;

  selection: SelectionPosition | null;
};

/* ======================================================
   CLIENTS
   ====================================================== */

const clients = new Map<string, Client>();

/* ======================================================
   SHARED CODE
   ====================================================== */

let sharedCode = `def hello():
    print("Hello from CodeSync!")

hello()
`;

/* ======================================================
   SAFE SEND
   ====================================================== */

function send(
  socket: WebSocket,
  data: unknown
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

/* ======================================================
   USERS
   ====================================================== */

function getUsers(): User[] {
  return Array.from(clients.values()).map(
    (client) => ({
      id: client.id,
      name: client.name,
    })
  );
}

/* ======================================================
   BROADCAST
   ====================================================== */

function broadcast(
  data: unknown,
  exceptId?: string
): void {
  for (const client of clients.values()) {
    if (client.id === exceptId) {
      continue;
    }

    send(client.socket, data);
  }
}

/* ======================================================
   BROADCAST TO EVERYONE
   ====================================================== */

function broadcastToEveryone(
  data: unknown
): void {
  for (const client of clients.values()) {
    send(client.socket, data);
  }
}

/* ======================================================
   VALIDATE CURSOR POSITION
   ====================================================== */

function isValidCursorPosition(
  position: unknown
): position is CursorPosition {
  if (
    !position ||
    typeof position !== "object"
  ) {
    return false;
  }

  const value =
    position as Record<string, unknown>;

  return (
    Number.isInteger(
      value.lineNumber
    ) &&
    Number.isInteger(
      value.column
    ) &&
    Number(value.lineNumber) >= 1 &&
    Number(value.column) >= 1
  );
}

/* ======================================================
   VALIDATE SELECTION
   ====================================================== */

function isValidSelection(
  selection: unknown
): selection is SelectionPosition {
  if (
    !selection ||
    typeof selection !== "object"
  ) {
    return false;
  }

  const value =
    selection as Record<string, unknown>;

  return (
    Number.isInteger(
      value.startLineNumber
    ) &&
    Number.isInteger(
      value.startColumn
    ) &&
    Number.isInteger(
      value.endLineNumber
    ) &&
    Number.isInteger(
      value.endColumn
    ) &&
    Number(value.startLineNumber) >= 1 &&
    Number(value.startColumn) >= 1 &&
    Number(value.endLineNumber) >= 1 &&
    Number(value.endColumn) >= 1
  );
}

/* ======================================================
   SEND EXISTING CURSORS
   ====================================================== */

function sendExistingCursors(
  socket: WebSocket,
  exceptId: string
): void {
  for (const client of clients.values()) {
    if (client.id === exceptId) {
      continue;
    }

    if (!client.cursor) {
      continue;
    }

    send(socket, {
      type: "cursor-change",
      senderId: client.id,
      name: client.name,
      position: client.cursor,
      selection: client.selection,
    });
  }
}

/* ======================================================
   WEBSOCKET CONNECTION
   ====================================================== */

wss.on(
  "connection",
  (socket) => {
    const clientId =
      crypto.randomUUID();

    console.log(
      `WebSocket connected: ${clientId}`
    );

    /* ==================================================
       SEND CLIENT ID
       ================================================== */

    send(socket, {
      type: "connected",
      clientId,
    });

    /* ==================================================
       MESSAGE HANDLER
       ================================================== */

    socket.on(
      "message",
      async (raw) => {
        try {
          const message =
            JSON.parse(
              raw.toString()
            );

          if (
            !message ||
            typeof message !== "object"
          ) {
            send(socket, {
              type: "error",
              message:
                "Invalid message format.",
            });

            return;
          }

          /* ==============================================
             JOIN
             ============================================== */

          if (
            message.type === "join"
          ) {
            const name =
              String(
                message.name ?? ""
              ).trim();

            if (!name) {
              send(socket, {
                type: "error",
                message:
                  "Name is required.",
              });

              return;
            }

            if (
              clients.has(clientId)
            ) {
              return;
            }

            const client: Client = {
              id: clientId,
              name,
              socket,
              cursor: null,
              selection: null,
            };

            clients.set(
              clientId,
              client
            );

            console.log(
              `${name} joined CodeSync`
            );

            /* ==========================================
               SEND SHARED STATE
               ========================================== */

            send(socket, {
              type: "state",
              code: sharedCode,
              users: getUsers(),
            });

            /* ==========================================
               SEND EXISTING CURSORS
               ========================================== */

            sendExistingCursors(
              socket,
              clientId
            );

            /* ==========================================
               UPDATE USERS
               ========================================== */

            broadcastToEveryone({
              type: "users",
              users: getUsers(),
            });

            return;
          }

          /* ==============================================
             REQUIRE JOIN
             ============================================== */

          const client =
            clients.get(clientId);

          if (!client) {
            send(socket, {
              type: "error",
              message:
                "You must join CodeSync first.",
            });

            return;
          }

          /* ==============================================
             CODE CHANGE
             ============================================== */

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

            sharedCode =
              message.code;

            console.log(
              `${client.name} edited shared code`
            );

            broadcast(
              {
                type: "code-change",
                code: sharedCode,
                senderId: clientId,
              },
              clientId
            );

            return;
          }

          /* ==============================================
             CURSOR CHANGE
             ============================================== */

          if (
            message.type ===
            "cursor-change"
          ) {
            if (
              !isValidCursorPosition(
                message.position
              )
            ) {
              return;
            }

            const cursor: CursorPosition = {
              lineNumber:
                Number(
                  message.position
                    .lineNumber
                ),

              column:
                Number(
                  message.position
                    .column
                ),
            };

            client.cursor =
              cursor;

            /* ==========================================
               SELECTION
               ========================================== */

            let selection:
              | SelectionPosition
              | null = null;

            if (
              isValidSelection(
                message.selection
              )
            ) {
              selection = {
                startLineNumber:
                  Number(
                    message.selection
                      .startLineNumber
                  ),

                startColumn:
                  Number(
                    message.selection
                      .startColumn
                  ),

                endLineNumber:
                  Number(
                    message.selection
                      .endLineNumber
                  ),

                endColumn:
                  Number(
                    message.selection
                      .endColumn
                  ),
              };
            }

            client.selection =
              selection;

            /* ==========================================
               SEND TO OTHER USERS
               ========================================== */

            broadcast(
              {
                type: "cursor-change",

                senderId:
                  client.id,

                name:
                  client.name,

                position:
                  client.cursor,

                selection:
                  client.selection,
              },
              client.id
            );

            return;
          }

          /* ==============================================
             CURSOR CLEAR
             ============================================== */

          if (
            message.type ===
            "cursor-clear"
          ) {
            client.cursor =
              null;

            client.selection =
              null;

            broadcast(
              {
                type:
                  "cursor-clear",

                senderId:
                  client.id,
              },
              client.id
            );

            return;
          }

          /* ==============================================
             RUN CODE
             ============================================== */

          if (
            message.type ===
            "run"
          ) {
            console.log(
              `${client.name} requested code execution`
            );

            try {
              const result =
                await executeCode(
                  "python",
                  sharedCode
                );

              console.log(
                `Execution finished with exit code ${result.exitCode}`
              );

              broadcastToEveryone({
                type:
                  "run-result",

                result,
              });
            } catch (error) {
              console.error(
                "Code execution error:",
                error
              );

              send(socket, {
                type: "error",
                message:
                  "Code execution failed.",
              });
            }

            return;
          }

          /* ==============================================
             UNKNOWN MESSAGE
             ============================================== */

          send(socket, {
            type: "error",
            message:
              `Unknown message type: ${String(
                message.type
              )}`,
          });
        } catch (error) {
          console.error(
            "WebSocket message error:",
            error
          );

          send(socket, {
            type: "error",
            message:
              "Invalid WebSocket message.",
          });
        }
      }
    );

    /* ==================================================
       DISCONNECT
       ================================================== */

    socket.on(
      "close",
      () => {
        const client =
          clients.get(clientId);

        if (client) {
          console.log(
            `${client.name} disconnected`
          );

          broadcast(
            {
              type:
                "cursor-clear",

              senderId:
                clientId,
            },
            clientId
          );
        }

        clients.delete(
          clientId
        );

        broadcastToEveryone({
          type: "users",
          users: getUsers(),
        });
      }
    );

    /* ==================================================
       SOCKET ERROR
       ================================================== */

    socket.on(
      "error",
      (error) => {
        console.error(
          `WebSocket error for ${clientId}:`,
          error
        );
      }
    );
  }
);

/* ======================================================
   START SERVER
   ====================================================== */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "======================================"
    );

    console.log(
      "          CodeSync Server"
    );

    console.log(
      "======================================"
    );

    console.log(
      `HTTP:      http://0.0.0.0:${PORT}`
    );

    console.log(
      `WebSocket: ws://0.0.0.0:${PORT}/collaboration`
    );

    console.log(
      "Room:      ONE SHARED ROOM"
    );

    console.log(
      "Execution: REAL PYTHON"
    );

    console.log(
      "Cursors:   REAL-TIME"
    );

    console.log(
      "======================================"
    );
  }
);
