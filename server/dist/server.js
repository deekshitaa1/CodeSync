import express from "express";
import cors from "cors";
import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket, } from "ws";
import { executeCode } from "./execution/execute.js";
/* ======================================================
   PORT
   ====================================================== */
const PORT = Number(process.env.PORT) || 4000;
/* ======================================================
   EXPRESS
   ====================================================== */
const app = express();
app.use(cors({
    origin: true,
}));
app.use(express.json());
/* ======================================================
   HTTP ROUTES
   ====================================================== */
app.get("/", (_req, res) => {
    res.json({
        name: "CodeSync",
        status: "running",
        websocket: "/collaboration",
        rooms: "enabled",
        execution: "real-python",
        collaboration: "real-time",
        cursors: "enabled",
        selections: "enabled",
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
   INITIAL CODE
   ====================================================== */
const INITIAL_CODE = `def hello():
    print("Hello from CodeSync!")

hello()
`;
/* ======================================================
   ROOMS
   ====================================================== */
const rooms = new Map();
/* ======================================================
   GET OR CREATE ROOM
   ====================================================== */
function getOrCreateRoom(roomId) {
    let room = rooms.get(roomId);
    if (!room) {
        room = {
            id: roomId,
            code: INITIAL_CODE,
            clients: new Map(),
        };
        rooms.set(roomId, room);
        console.log(`Created CodeSync room: ${roomId}`);
    }
    return room;
}
/* ======================================================
   GET ROOM
   ====================================================== */
function getRoom(roomId) {
    return rooms.get(roomId);
}
/* ======================================================
   SEND MESSAGE
   ====================================================== */
function send(socket, data) {
    if (socket.readyState ===
        WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}
/* ======================================================
   GET USERS IN ROOM
   ====================================================== */
function getUsers(room) {
    return Array.from(room.clients.values()).map((client) => ({
        id: client.id,
        name: client.name,
    }));
}
/* ======================================================
   BROADCAST TO ROOM
   ====================================================== */
function broadcastToRoom(room, data, exceptId) {
    for (const client of room.clients.values()) {
        if (client.id === exceptId) {
            continue;
        }
        send(client.socket, data);
    }
}
/* ======================================================
   BROADCAST TO EVERYONE IN ROOM
   ====================================================== */
function broadcastToEveryoneInRoom(room, data) {
    for (const client of room.clients.values()) {
        send(client.socket, data);
    }
}
/* ======================================================
   SEND EXISTING CURSORS TO NEW USER
   ====================================================== */
function sendExistingCursors(room, socket, exceptId) {
    for (const client of room.clients.values()) {
        if (client.id === exceptId) {
            continue;
        }
        /*
         * User has not positioned their
         * cursor yet.
         */
        if (!client.cursor) {
            continue;
        }
        send(socket, {
            type: "cursor-change",
            senderId: client.id,
            name: client.name,
            position: client.cursor,
            selection: client.selection ??
                null,
        });
    }
}
/* ======================================================
   REMOVE EMPTY ROOM
   ====================================================== */
function cleanupRoom(room) {
    if (room.clients.size === 0) {
        rooms.delete(room.id);
        console.log(`Deleted empty CodeSync room: ${room.id}`);
    }
}
/* ======================================================
   VALIDATE ROOM ID
   ====================================================== */
function normalizeRoomId(value) {
    return String(value ?? "").trim();
}
/* ======================================================
   VALIDATE NAME
   ====================================================== */
function normalizeName(value) {
    return String(value ?? "").trim();
}
/* ======================================================
   VALIDATE CURSOR
   ====================================================== */
function parseCursorPosition(value) {
    if (!value ||
        typeof value !==
            "object") {
        return null;
    }
    const position = value;
    const lineNumber = Number(position.lineNumber);
    const column = Number(position.column);
    if (!Number.isInteger(lineNumber) ||
        !Number.isInteger(column)) {
        return null;
    }
    if (lineNumber < 1 ||
        column < 1) {
        return null;
    }
    return {
        lineNumber,
        column,
    };
}
/* ======================================================
   VALIDATE SELECTION
   ====================================================== */
function parseSelection(value) {
    if (!value ||
        typeof value !==
            "object") {
        return null;
    }
    const selection = value;
    const startLineNumber = Number(selection.startLineNumber);
    const startColumn = Number(selection.startColumn);
    const endLineNumber = Number(selection.endLineNumber);
    const endColumn = Number(selection.endColumn);
    if (!Number.isInteger(startLineNumber) ||
        !Number.isInteger(startColumn) ||
        !Number.isInteger(endLineNumber) ||
        !Number.isInteger(endColumn)) {
        return null;
    }
    if (startLineNumber < 1 ||
        startColumn < 1 ||
        endLineNumber < 1 ||
        endColumn < 1) {
        return null;
    }
    return {
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn,
    };
}
/* ======================================================
   WEBSOCKET CONNECTION
   ====================================================== */
wss.on("connection", (socket) => {
    const clientId = crypto.randomUUID();
    console.log(`WebSocket connected: ${clientId}`);
    /*
     * Send unique client ID immediately.
     */
    send(socket, {
        type: "connected",
        clientId,
    });
    /* ==================================================
       MESSAGE HANDLER
       ================================================== */
    socket.on("message", async (raw) => {
        try {
            const message = JSON.parse(raw.toString());
            /* ==============================================
               JOIN
               ============================================== */
            if (message.type ===
                "join") {
                const name = normalizeName(message.name);
                const roomId = normalizeRoomId(message.roomId);
                /*
                 * Validate name.
                 */
                if (!name) {
                    send(socket, {
                        type: "error",
                        message: "Name is required.",
                    });
                    return;
                }
                /*
                 * Validate room.
                 */
                if (!roomId) {
                    send(socket, {
                        type: "error",
                        message: "Room ID is required.",
                    });
                    return;
                }
                /*
                 * Prevent duplicate registration.
                 */
                if (roomsHasClient(clientId)) {
                    return;
                }
                /*
                 * Get/create requested room.
                 */
                const room = getOrCreateRoom(roomId);
                /*
                 * Create client.
                 */
                const client = {
                    id: clientId,
                    name,
                    socket,
                    roomId,
                    cursor: undefined,
                    selection: undefined,
                };
                /*
                 * Add client to room.
                 */
                room.clients.set(clientId, client);
                console.log(`${name} joined room ${roomId}`);
                /* ==========================================
                   SEND CURRENT ROOM STATE
                   ========================================== */
                send(socket, {
                    type: "state",
                    code: room.code,
                    users: getUsers(room),
                });
                /* ==========================================
                   SEND EXISTING CURSORS
                   ========================================== */
                sendExistingCursors(room, socket, clientId);
                /* ==========================================
                   UPDATE USER LIST
                   ========================================== */
                broadcastToEveryoneInRoom(room, {
                    type: "users",
                    users: getUsers(room),
                });
                return;
            }
            /* ==============================================
               FIND CLIENT
               ============================================== */
            const client = findClient(clientId);
            if (!client) {
                send(socket, {
                    type: "error",
                    message: "You must join CodeSync first.",
                });
                return;
            }
            const room = getRoom(client.roomId);
            if (!room) {
                send(socket, {
                    type: "error",
                    message: "CodeSync room no longer exists.",
                });
                return;
            }
            /* ==============================================
               CODE CHANGE
               ============================================== */
            if (message.type ===
                "code-change") {
                if (typeof message.code !==
                    "string") {
                    return;
                }
                /*
                 * Update room's source
                 * of truth.
                 */
                room.code =
                    message.code;
                console.log(`${client.name} edited room ${room.id}`);
                /*
                 * Send latest complete code
                 * to every other collaborator
                 * in the SAME room.
                 */
                broadcastToRoom(room, {
                    type: "code-change",
                    code: room.code,
                    senderId: clientId,
                }, clientId);
                return;
            }
            /* ==============================================
               CURSOR CHANGE
               ============================================== */
            if (message.type ===
                "cursor-change") {
                const position = parseCursorPosition(message.position);
                /*
                 * Invalid cursor.
                 */
                if (!position) {
                    return;
                }
                /*
                 * Save cursor.
                 */
                client.cursor =
                    position;
                /*
                 * Parse selection.
                 *
                 * A null/invalid selection means
                 * there is no active selection.
                 */
                const selection = parseSelection(message.selection);
                client.selection =
                    selection ??
                        undefined;
                /*
                 * Broadcast cursor + selection
                 * to everyone else in this room.
                 */
                broadcastToRoom(room, {
                    type: "cursor-change",
                    senderId: clientId,
                    name: client.name,
                    position: client.cursor,
                    selection: client.selection ??
                        null,
                }, clientId);
                return;
            }
            /* ==============================================
               CURSOR CLEAR
               ============================================== */
            if (message.type ===
                "cursor-clear") {
                /*
                 * Remove local cursor state.
                 */
                client.cursor =
                    undefined;
                client.selection =
                    undefined;
                /*
                 * Tell everyone else in
                 * this room to remove it.
                 */
                broadcastToRoom(room, {
                    type: "cursor-clear",
                    senderId: clientId,
                }, clientId);
                return;
            }
            /* ==============================================
               RUN CODE
               ============================================== */
            if (message.type ===
                "run") {
                console.log(`${client.name} requested execution in room ${room.id}`);
                /*
                 * Snapshot the code BEFORE
                 * execution.
                 *
                 * This prevents the result from
                 * accidentally using a different
                 * version if another edit arrives.
                 */
                const codeToRun = room.code;
                try {
                    const result = await executeCode("python", codeToRun);
                    console.log(`Execution finished for room ${room.id} with exit code ${result.exitCode}`);
                    /*
                     * Send result ONLY to the
                     * collaborators in this room.
                     */
                    broadcastToEveryoneInRoom(room, {
                        type: "run-result",
                        result,
                    });
                }
                catch (error) {
                    console.error("Code execution error:", error);
                    broadcastToEveryoneInRoom(room, {
                        type: "error",
                        message: "Code execution failed.",
                    });
                }
                return;
            }
            /* ==============================================
               UNKNOWN MESSAGE
               ============================================== */
            send(socket, {
                type: "error",
                message: `Unknown message type: ${String(message.type)}`,
            });
        }
        catch (error) {
            console.error("WebSocket message error:", error);
            send(socket, {
                type: "error",
                message: "Invalid WebSocket message.",
            });
        }
    });
    /* ==================================================
       DISCONNECT
       ================================================== */
    socket.on("close", () => {
        const client = findClient(clientId);
        /*
         * Client may never have joined.
         */
        if (!client) {
            return;
        }
        const room = getRoom(client.roomId);
        if (!room) {
            return;
        }
        console.log(`${client.name} disconnected from room ${room.id}`);
        /*
         * Tell remaining users to
         * remove this user's cursor.
         */
        broadcastToRoom(room, {
            type: "cursor-clear",
            senderId: clientId,
        }, clientId);
        /*
         * Remove client.
         */
        room.clients.delete(clientId);
        /*
         * Update remaining users.
         */
        broadcastToEveryoneInRoom(room, {
            type: "users",
            users: getUsers(room),
        });
        /*
         * Delete empty room.
         */
        cleanupRoom(room);
    });
    /* ==================================================
       SOCKET ERROR
       ================================================== */
    socket.on("error", (error) => {
        console.error(`WebSocket error for ${clientId}:`, error);
    });
});
/* ======================================================
   FIND CLIENT
   ====================================================== */
function findClient(clientId) {
    for (const room of rooms.values()) {
        const client = room.clients.get(clientId);
        if (client) {
            return client;
        }
    }
    return undefined;
}
/* ======================================================
   CHECK WHETHER CLIENT EXISTS
   ====================================================== */
function roomsHasClient(clientId) {
    return (findClient(clientId) !==
        undefined);
}
/* ======================================================
   START SERVER
   ====================================================== */
server.listen(PORT, "0.0.0.0", () => {
    console.log("======================================");
    console.log("          CodeSync Server");
    console.log("======================================");
    console.log(`HTTP:      http://0.0.0.0:${PORT}`);
    console.log(`WebSocket: ws://0.0.0.0:${PORT}/collaboration`);
    console.log("Rooms:     ENABLED");
    console.log("Code:      REAL-TIME");
    console.log("Cursors:   REAL-TIME");
    console.log("Selection: REAL-TIME");
    console.log("Execution: REAL PYTHON");
    console.log("======================================");
});
