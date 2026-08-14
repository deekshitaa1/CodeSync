import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: true,
  })
);

app.use(express.json());

type Client = {
  socket: WebSocket;
  id: string;
  name: string;
};

type Room = {
  code: string;
  clients: Map<string, Client>;
};

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
  let room = rooms.get(roomId);

  if (!room) {
    room = {
      code: `function hello() {\n  console.log("Hello from CodeSync!");\n}\n\nhello();`,
      clients: new Map(),
    };

    rooms.set(roomId, room);
  }

  return room;
}

function send(socket: WebSocket, data: unknown) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function broadcast(room: Room, data: unknown, exceptId?: string) {
  for (const client of room.clients.values()) {
    if (client.id !== exceptId) {
      send(client.socket, data);
    }
  }
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "codesync-api",
    timestamp: new Date().toISOString(),
    rooms: rooms.size,
  });
});

const wss = new WebSocketServer({
  server,
  path: "/collaboration",
});

wss.on("connection", (socket: WebSocket) => {
  console.log("WebSocket client connected");

  let currentRoom: Room | null = null;
  let currentClient: Client | null = null;

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());

      // JOIN ROOM
      if (message.type === "join") {
        const roomId = String(message.room || "demo");
        const name = String(message.name || "Anonymous");

        const room = getRoom(roomId);

        const id =
          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const client: Client = {
          socket,
          id,
          name,
        };

        room.clients.set(id, client);

        currentRoom = room;
        currentClient = client;

        send(socket, {
          type: "joined",
          room: roomId,
          clientId: id,
          code: room.code,
        });

        broadcast(
          room,
          {
            type: "users",
            users: Array.from(room.clients.values()).map((user) => ({
              id: user.id,
              name: user.name,
            })),
          }
        );

        console.log(`${name} joined room ${roomId}`);
        return;
      }

      if (!currentRoom || !currentClient) {
        return;
      }

      // CODE CHANGE
      if (message.type === "code-change") {
        currentRoom.code = String(message.code || "");

        broadcast(
          currentRoom,
          {
            type: "code-change",
            code: currentRoom.code,
            userId: currentClient.id,
          },
          currentClient.id
        );

        return;
      }

      // CURSOR / PRESENCE
      if (message.type === "cursor") {
        broadcast(
          currentRoom,
          {
            type: "cursor",
            userId: currentClient.id,
            name: currentClient.name,
            line: message.line,
            column: message.column,
          },
          currentClient.id
        );
      }
    } catch (error) {
      console.error("Invalid WebSocket message:", error);
    }
  });

  socket.on("close", () => {
    if (currentRoom && currentClient) {
      currentRoom.clients.delete(currentClient.id);

      broadcast(currentRoom, {
        type: "users",
        users: Array.from(currentRoom.clients.values()).map((user) => ({
          id: user.id,
          name: user.name,
        })),
      });

      console.log(`${currentClient.name} disconnected`);

      if (currentRoom.clients.size === 0) {
        // Keep room/code alive for now.
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`CodeSync API running on http://localhost:${PORT}`);
  console.log(
    `WebSocket running on ws://localhost:${PORT}/collaboration`
  );
});
