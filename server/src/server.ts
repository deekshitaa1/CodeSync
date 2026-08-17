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
  })
);

app.use(express.json());

/* ======================================================
   HTTP ROUTES
   ====================================================== */

app.get("/", (_req, res) => {
  res.json({
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

  cursor?: CursorPosition;

  selection?: SelectionPosition;
};

/* ======================================================
   ONE GLOBAL ROOM
   ====================================================== */

/*
 * CodeSync currently uses ONE shared room.
 *
 * Anyone who connects joins the same collaborative
 * document.
 *
 * The roomId sent by the frontend is currently only
 * used by the frontend/share URL.
 */

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
   SEND MESSAGE
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
   GET USERS
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
   SEND CURRENT COLLABORATOR CURSORS
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
      selection: client.selection ?? null,
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

            /*
             * Prevent duplicate registration
             * for the same WebSocket.
             */

            if (
              clients.has(clientId)
            ) {
              return;
            }

            const client: Client = {
              id: clientId,
              name,
              socket,
            };

            clients.set(
              clientId,
              client
            );

            console.log(
              `${name} joined CodeSync`
            );

            /* ==========================================
               SEND CURRENT SHARED STATE
               ========================================== */

            send(socket, {
              type: "state",
              code: sharedCode,
              users: getUsers(),
            });

            /* ==========================================
               SEND EXISTING REMOTE CURSORS
               ========================================== */

            sendExistingCursors(
              socket,
              clientId
            );

            /* ==========================================
               UPDATE USER LIST
               ========================================== */

            broadcastToEveryone({
              type: "users",
              users: getUsers(),
            });

            return;
          }

          /* ==============================================
             FIND CLIENT
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

            /*
             * Update shared source of truth.
             */

            sharedCode =
              message.code;

            console.log(
              `${client.name} edited shared code`
            );

            /*
             * Send complete code to
             * every other collaborator.
             */

            broadcast(
              {
                type:
                  "code-change",

                code:
                  sharedCode,

                senderId:
                  clientId,
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
            const lineNumber =
              Number(
                message.position
                  ?.lineNumber
              );

            const column =
              Number(
                message.position
                  ?.column
              );

            /*
             * Validate Monaco position.
             */

            if (
              !Number.isInteger(
                lineNumber
              ) ||
              !Number.isInteger(
                column
              ) ||
              lineNumber < 1 ||
              column < 1
            ) {
              return;
            }

            client.cursor = {
              lineNumber,
              column,
            };

            /* ==========================================
               SELECTION
               ========================================== */

            let selection:
              | SelectionPosition
              | undefined;

            if (
              message.selection &&
              Number.isInteger(
                message.selection
                  .startLineNumber
              ) &&
              Number.isInteger(
                message.selection
                  .startColumn
              ) &&
              Number.isInteger(
                message.selection
                  .endLineNumber
              ) &&
              Number.isInteger(
                message.selection
                  .endColumn
              )
            ) {
              selection = {
                startLineNumber:
                  message.selection
                    .startLineNumber,

                startColumn:
                  message.selection
                    .startColumn,

                endLineNumber:
                  message.selection
                    .endLineNumber,

                endColumn:
                  message.selection
                    .endColumn,
              };

              client.selection =
                selection;
            } else {
              client.selection =
                undefined;
            }

            /*
             * Broadcast cursor to every
             * other collaborator.
             */

            broadcast(
              {
                type:
                  "cursor-change",

                senderId:
                  clientId,

                name:
                  client.name,

                position:
                  client.cursor,

                selection:
                  selection ?? null,
              },
              clientId
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
              undefined;

            client.selection =
              undefined;

            broadcast(
              {
                type:
                  "cursor-clear",

                senderId:
                  clientId,
              },
              clientId
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

            /*
             * Execute the server's shared code.
             */

            const result =
              await executeCode(
                "python",
                sharedCode
              );

            console.log(
              `Execution finished with exit code ${result.exitCode}`
            );

            /*
             * Send execution result
             * to EVERYONE.
             */

            broadcastToEveryone({
              type:
                "run-result",

              result,
            });

            return;
          }

          /* ==============================================
             UNKNOWN MESSAGE
             ============================================== */

          send(socket, {
            type: "error",
            message:
              `Unknown message type: ${message.type}`,
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

          /*
           * Tell remaining collaborators
           * to remove this user's cursor.
           */

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

        /* ==============================================
           UPDATE USERS
           ============================================== */

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
          "WebSocket error:",
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
      "       CodeSync Server"
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
