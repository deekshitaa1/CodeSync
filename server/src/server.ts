import express from "express";
import cors from "cors";
import http from "node:http";
import crypto from "node:crypto";

import {
  WebSocketServer,
  WebSocket,
} from "ws";


import {
  executeCode,
} from "./execution/execute.js";

const PORT = 4000;

/*
 * ======================================================
 * EXPRESS
 * ======================================================
 */

const app = express();

app.use(
  cors({
    origin: true,
  })
);

app.use(express.json());

/*
 * ======================================================
 * HTTP ROUTES
 * ======================================================
 */

app.get("/", (_req, res) => {
  res.json({
    name: "CodeSync",
    status: "running",
    websocket: "/collaboration",
    room: "one-global-room",
    execution: "real-python",
  });
});

/*
 * ======================================================
 * HTTP SERVER
 * ======================================================
 */

const server = http.createServer(app);

/*
 * ======================================================
 * WEBSOCKET SERVER
 * ======================================================
 */

const wss = new WebSocketServer({
  server,
  path: "/collaboration",
});

/*
 * ======================================================
 * TYPES
 * ======================================================
 */

type User = {
  id: string;
  name: string;
};

type Client = {
  id: string;
  name: string;
  socket: WebSocket;
};

/*
 * ======================================================
 * ONE GLOBAL ROOM
 * ======================================================
 *
 * There is ONLY ONE shared room.
 *
 * Anyone opening the application and entering
 * their name joins this same room.
 *
 * No room ID.
 * No secret.
 * No authentication.
 *
 * The shared URL is enough to access the application.
 */

/*
 * ======================================================
 * CLIENTS
 * ======================================================
 */

const clients = new Map<
  string,
  Client
>();

/*
 * ======================================================
 * SHARED CODE
 * ======================================================
 */

let sharedCode = `def hello():
    print("Hello from CodeSync!")

hello()
`;

/*
 * ======================================================
 * SEND MESSAGE
 * ======================================================
 */

function send(
  socket: WebSocket,
  data: unknown
) {
  if (
    socket.readyState ===
    WebSocket.OPEN
  ) {
    socket.send(
      JSON.stringify(data)
    );
  }
}

/*
 * ======================================================
 * GET USERS
 * ======================================================
 */

function getUsers(): User[] {
  return Array.from(
    clients.values()
  ).map((client) => ({
    id: client.id,
    name: client.name,
  }));
}

/*
 * ======================================================
 * BROADCAST
 * ======================================================
 *
 * Sends a message to every connected user.
 *
 * exceptId is optional.
 */

function broadcast(
  data: unknown,
  exceptId?: string
) {
  for (
    const client of clients.values()
  ) {
    if (
      client.id === exceptId
    ) {
      continue;
    }

    send(
      client.socket,
      data
    );
  }
}

/*
 * ======================================================
 * BROADCAST TO EVERYONE
 * ======================================================
 */

function broadcastToEveryone(
  data: unknown
) {
  for (
    const client of clients.values()
  ) {
    send(
      client.socket,
      data
    );
  }
}

/*
 * ======================================================
 * WEBSOCKET CONNECTION
 * ======================================================
 */

wss.on(
  "connection",
  (socket) => {
    const clientId =
      crypto.randomUUID();

    console.log(
      `WebSocket connected: ${clientId}`
    );

    /*
     * Tell the browser its unique ID.
     */

    send(socket, {
      type: "connected",
      clientId,
    });

    /*
     * ==================================================
     * MESSAGE HANDLER
     * ==================================================
     */

    socket.on(
      "message",
      async (raw) => {
        try {
          const message =
            JSON.parse(
              raw.toString()
            );

          /*
           * ==============================================
           * JOIN
           * ==============================================
           */

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

            /*
             * Send the CURRENT shared code
             * to the person who just joined.
             */

            send(socket, {
              type: "state",
              code: sharedCode,
              users: getUsers(),
            });

            /*
             * Tell EVERYONE that the
             * collaborator list changed.
             */

            broadcastToEveryone({
              type: "users",
              users: getUsers(),
            });

            return;
          }

          /*
           * ==============================================
           * FIND CLIENT
           * ==============================================
           */

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

          /*
           * ==============================================
           * CODE CHANGE
           * ==============================================
           */

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
             * Update the SINGLE shared
             * source of truth.
             */

            sharedCode =
              message.code;

            console.log(
              `${client.name} edited shared code`
            );

            /*
             * Send the complete new code
             * to EVERY OTHER USER.
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

          /*
           * ==============================================
           * RUN CODE
           * ==============================================
           *
           * REAL PYTHON EXECUTION.
           *
           * The server executes the exact
           * latest sharedCode.
           */

          if (
            message.type === "run"
          ) {
            console.log(
              `${client.name} requested code execution`
            );

            const result =
              await executeCode(
                "python",
                sharedCode
              );

            console.log(
              `Execution finished with exit code ${result.exitCode}`
            );

            /*
             * Send the REAL execution result
             * to EVERYONE.
             *
             * Therefore:
             *
             * Person A clicks Run
             *        ↓
             * Python executes on server
             *        ↓
             * Person A sees output
             * Person B sees output
             */

            broadcastToEveryone({
              type:
                "run-result",

              result,
            });

            return;
          }

          /*
           * ==============================================
           * UNKNOWN MESSAGE
           * ==============================================
           */

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

    /*
     * ==================================================
     * DISCONNECT
     * ==================================================
     */

    socket.on(
      "close",
      () => {
        const client =
          clients.get(clientId);

        if (client) {
          console.log(
            `${client.name} disconnected`
          );
        }

        clients.delete(
          clientId
        );

        /*
         * Update collaborators
         * for remaining users.
         */

        broadcastToEveryone({
          type: "users",
          users: getUsers(),
        });
      }
    );

    /*
     * ==================================================
     * SOCKET ERROR
     * ==================================================
     */

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

/*
 * ======================================================
 * START SERVER
 * ======================================================
 */

server.listen(
  PORT,
  () => {
    console.log("");
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
      `HTTP:      http://localhost:${PORT}`
    );
    console.log(
      `WebSocket: ws://localhost:${PORT}/collaboration`
    );
    console.log(
      "Room:      ONE GLOBAL SHARED ROOM"
    );
    console.log(
      "Auth:      NONE"
    );
    console.log(
      "Execution: REAL PYTHON"
    );
    console.log(
      "======================================"
    );
    console.log("");
  }
);
