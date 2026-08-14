import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { WebSocketServer, WebSocket, } from "ws";
import { execa } from "execa";
import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
dotenv.config();
/* =========================================================
   APP
========================================================= */
const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 4000;
app.use(cors({
    origin: true,
}));
app.use(express.json({
    limit: "100kb",
}));
/* =========================================================
   LANGUAGE CONFIGURATION
========================================================= */
const allowedLanguages = [
    "javascript",
    "typescript",
    "python",
    "c",
    "cpp",
    "java",
    "go",
    "rust",
];
const DEFAULT_CODE = {
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
/* =========================================================
   ROOMS
========================================================= */
const rooms = new Map();
function isSupportedLanguage(language) {
    return allowedLanguages.includes(language);
}
function getDefaultCode(language) {
    return DEFAULT_CODE[language];
}
function getRoom(roomId) {
    return rooms.get(roomId) ?? null;
}
function createRoom(roomId, language = "javascript") {
    const room = {
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
function send(socket, data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}
function broadcast(room, data, exceptId) {
    for (const client of room.clients.values()) {
        if (client.id !== exceptId) {
            send(client.socket, data);
        }
    }
}
function getUsers(room) {
    return Array.from(room.clients.values()).map((user) => ({
        id: user.id,
        name: user.name,
    }));
}
/* =========================================================
   HEALTH
========================================================= */
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "codesync-api",
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
    });
});
/* =========================================================
   ROOM CREATION
========================================================= */
/*
   IMPORTANT:

   Rooms are NOT automatically created when somebody
   enters a random room code.

   The creator must explicitly create the room.

   POST /api/rooms
*/
app.post("/api/rooms", (req, res) => {
    const requestedRoom = typeof req.body?.room === "string"
        ? req.body.room.trim()
        : "";
    const requestedLanguage = typeof req.body?.language === "string"
        ? req.body.language.trim()
        : "javascript";
    if (!requestedRoom) {
        return res.status(400).json({
            success: false,
            error: "Room code is required.",
        });
    }
    if (!isSupportedLanguage(requestedLanguage)) {
        return res.status(400).json({
            success: false,
            error: "Unsupported programming language.",
        });
    }
    if (rooms.has(requestedRoom)) {
        return res.status(409).json({
            success: false,
            error: "Room already exists.",
        });
    }
    const room = createRoom(requestedRoom, requestedLanguage);
    return res.status(201).json({
        success: true,
        room: requestedRoom,
        language: room.language,
        message: "Room created successfully.",
    });
});
/* =========================================================
   ROOM CHECK
========================================================= */
app.get("/api/rooms/:room", (req, res) => {
    const roomId = String(req.params.room || "").trim();
    if (!roomId) {
        return res.status(400).json({
            exists: false,
            error: "Room code is required.",
        });
    }
    const room = getRoom(roomId);
    if (!room) {
        return res.status(404).json({
            exists: false,
            error: "Room does not exist.",
        });
    }
    return res.json({
        exists: true,
        room: roomId,
        language: room.language,
        users: room.clients.size,
    });
});
/* =========================================================
   CODE EXECUTION
========================================================= */
app.post("/api/execute", async (req, res) => {
    const language = typeof req.body?.language === "string"
        ? req.body.language.trim()
        : "";
    const code = typeof req.body?.code === "string"
        ? req.body.code
        : null;
    if (!language) {
        return res.status(400).json({
            success: false,
            error: "Programming language is required.",
        });
    }
    if (!isSupportedLanguage(language)) {
        return res.status(400).json({
            success: false,
            error: "Unsupported programming language.",
            supportedLanguages: allowedLanguages,
        });
    }
    if (code === null) {
        return res.status(400).json({
            success: false,
            error: "Code must be a string.",
        });
    }
    if (code.length > 50000) {
        return res.status(400).json({
            success: false,
            error: "Code exceeds the 50KB limit.",
        });
    }
    if (!code.trim()) {
        return res.status(400).json({
            success: false,
            error: "Code cannot be empty.",
        });
    }
    const executionId = crypto.randomUUID();
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `codesync-${executionId}-`));
    try {
        let command = "";
        let args = [];
        /* -----------------------------------------
           JAVASCRIPT
        ----------------------------------------- */
        if (language === "javascript") {
            const file = path.join(workDir, "main.js");
            await fs.writeFile(file, code, "utf8");
            command = "node";
            args = [file];
        }
        /* -----------------------------------------
           TYPESCRIPT
        ----------------------------------------- */
        else if (language === "typescript") {
            const file = path.join(workDir, "main.ts");
            await fs.writeFile(file, code, "utf8");
            command = "npx";
            args = [
                "--yes",
                "tsx",
                file,
            ];
        }
        /* -----------------------------------------
           PYTHON
        ----------------------------------------- */
        else if (language === "python") {
            const file = path.join(workDir, "main.py");
            await fs.writeFile(file, code, "utf8");
            command = "python";
            args = [file];
        }
        /* -----------------------------------------
           C
        ----------------------------------------- */
        else if (language === "c") {
            const source = path.join(workDir, "main.c");
            const executable = path.join(workDir, "main.exe");
            await fs.writeFile(source, code, "utf8");
            const compile = await execa("gcc", [
                source,
                "-o",
                executable,
            ], {
                cwd: workDir,
                timeout: 10000,
                reject: false,
            });
            if (compile.exitCode !== 0) {
                return res.json({
                    success: false,
                    stdout: compile.stdout ?? "",
                    stderr: compile.stderr ||
                        "C compilation failed.",
                    exitCode: compile.exitCode,
                });
            }
            const result = await execa(executable, [], {
                cwd: workDir,
                timeout: 5000,
                reject: false,
            });
            return res.json({
                success: result.exitCode === 0,
                stdout: result.stdout ?? "",
                stderr: result.stderr ?? "",
                exitCode: result.exitCode,
            });
        }
        /* -----------------------------------------
           C++
        ----------------------------------------- */
        else if (language === "cpp") {
            const source = path.join(workDir, "main.cpp");
            const executable = path.join(workDir, "main.exe");
            await fs.writeFile(source, code, "utf8");
            const compile = await execa("g++", [
                source,
                "-o",
                executable,
            ], {
                cwd: workDir,
                timeout: 10000,
                reject: false,
            });
            if (compile.exitCode !== 0) {
                return res.json({
                    success: false,
                    stdout: compile.stdout ?? "",
                    stderr: compile.stderr ||
                        "C++ compilation failed.",
                    exitCode: compile.exitCode,
                });
            }
            const result = await execa(executable, [], {
                cwd: workDir,
                timeout: 5000,
                reject: false,
            });
            return res.json({
                success: result.exitCode === 0,
                stdout: result.stdout ?? "",
                stderr: result.stderr ?? "",
                exitCode: result.exitCode,
            });
        }
        /* -----------------------------------------
           JAVA
        ----------------------------------------- */
        else if (language === "java") {
            const source = path.join(workDir, "Main.java");
            await fs.writeFile(source, code, "utf8");
            const compile = await execa("javac", [source], {
                cwd: workDir,
                timeout: 10000,
                reject: false,
            });
            if (compile.exitCode !== 0) {
                return res.json({
                    success: false,
                    stdout: compile.stdout ?? "",
                    stderr: compile.stderr ||
                        "Java compilation failed.",
                    exitCode: compile.exitCode,
                });
            }
            const result = await execa("java", [
                "-cp",
                workDir,
                "Main",
            ], {
                cwd: workDir,
                timeout: 5000,
                reject: false,
            });
            return res.json({
                success: result.exitCode === 0,
                stdout: result.stdout ?? "",
                stderr: result.stderr ?? "",
                exitCode: result.exitCode,
            });
        }
        /* -----------------------------------------
           GO
        ----------------------------------------- */
        else if (language === "go") {
            const file = path.join(workDir, "main.go");
            await fs.writeFile(file, code, "utf8");
            command = "go";
            args = [
                "run",
                file,
            ];
        }
        /* -----------------------------------------
           RUST
        ----------------------------------------- */
        else if (language === "rust") {
            const source = path.join(workDir, "main.rs");
            const executable = path.join(workDir, "main.exe");
            await fs.writeFile(source, code, "utf8");
            const compile = await execa("rustc", [
                source,
                "-o",
                executable,
            ], {
                cwd: workDir,
                timeout: 10000,
                reject: false,
            });
            if (compile.exitCode !== 0) {
                return res.json({
                    success: false,
                    stdout: compile.stdout ?? "",
                    stderr: compile.stderr ||
                        "Rust compilation failed.",
                    exitCode: compile.exitCode,
                });
            }
            const result = await execa(executable, [], {
                cwd: workDir,
                timeout: 5000,
                reject: false,
            });
            return res.json({
                success: result.exitCode === 0,
                stdout: result.stdout ?? "",
                stderr: result.stderr ?? "",
                exitCode: result.exitCode,
            });
        }
        /* -----------------------------------------
           INTERPRETED EXECUTION
        ----------------------------------------- */
        const result = await execa(command, args, {
            cwd: workDir,
            timeout: 5000,
            reject: false,
        });
        return res.json({
            success: result.exitCode === 0,
            stdout: result.stdout ?? "",
            stderr: result.stderr ?? "",
            exitCode: result.exitCode,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "Execution failed.";
        return res.status(500).json({
            success: false,
            stdout: "",
            stderr: message,
            exitCode: -1,
        });
    }
    finally {
        await fs.rm(workDir, {
            recursive: true,
            force: true,
        });
    }
});
/* =========================================================
   WEBSOCKET COLLABORATION
========================================================= */
const wss = new WebSocketServer({
    server,
    path: "/collaboration",
});
wss.on("connection", (socket) => {
    console.log("WebSocket client connected");
    let currentRoom = null;
    let currentClient = null;
    socket.on("message", (raw) => {
        try {
            const message = JSON.parse(raw.toString());
            /* =====================================
               JOIN ROOM
            ===================================== */
            if (message.type === "join") {
                const roomId = String(message.room || "").trim();
                const name = String(message.name || "").trim();
                if (!roomId ||
                    !name) {
                    send(socket, {
                        type: "error",
                        message: "Room code and name are required.",
                    });
                    return;
                }
                /*
                 * IMPORTANT:
                 * NEVER create a room here.
                 *
                 * If the room does not exist,
                 * the user is rejected.
                 */
                const room = getRoom(roomId);
                if (!room) {
                    send(socket, {
                        type: "error",
                        message: "Room does not exist. Check the room code.",
                    });
                    return;
                }
                const id = `${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`;
                const client = {
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
                    language: room.language,
                });
                broadcast(room, {
                    type: "users",
                    users: getUsers(room),
                });
                console.log(`${name} joined room ${roomId}`);
                return;
            }
            /* =====================================
               REQUIRE JOIN
            ===================================== */
            if (!currentRoom ||
                !currentClient) {
                send(socket, {
                    type: "error",
                    message: "You must join a valid room first.",
                });
                return;
            }
            /* =====================================
               CODE CHANGE
            ===================================== */
            if (message.type ===
                "code-change") {
                if (typeof message.code !==
                    "string") {
                    return;
                }
                currentRoom.code =
                    message.code;
                broadcast(currentRoom, {
                    type: "code-change",
                    code: currentRoom.code,
                    userId: currentClient.id,
                }, currentClient.id);
                return;
            }
            /* =====================================
               LANGUAGE CHANGE
            ===================================== */
            if (message.type ===
                "language-change") {
                const language = String(message.language ||
                    "").trim();
                if (!isSupportedLanguage(language)) {
                    send(socket, {
                        type: "error",
                        message: "Unsupported programming language.",
                    });
                    return;
                }
                currentRoom.language =
                    language;
                currentRoom.code =
                    getDefaultCode(language);
                broadcast(currentRoom, {
                    type: "language-change",
                    language,
                    code: currentRoom.code,
                    userId: currentClient.id,
                }, currentClient.id);
                return;
            }
            /* =====================================
               CURSOR / PRESENCE
            ===================================== */
            if (message.type ===
                "cursor") {
                broadcast(currentRoom, {
                    type: "cursor",
                    userId: currentClient.id,
                    name: currentClient.name,
                    line: message.line,
                    column: message.column,
                }, currentClient.id);
                return;
            }
            /* =====================================
               RUN RESULT
            ===================================== */
            if (message.type ===
                "run-result") {
                broadcast(currentRoom, {
                    type: "run-result",
                    result: message.result,
                    userId: currentClient.id,
                }, currentClient.id);
                return;
            }
        }
        catch (error) {
            console.error("Invalid WebSocket message:", error);
            send(socket, {
                type: "error",
                message: "Invalid WebSocket message.",
            });
        }
    });
    /* =========================================
       DISCONNECT
    ========================================= */
    socket.on("close", () => {
        if (currentRoom &&
            currentClient) {
            currentRoom.clients.delete(currentClient.id);
            broadcast(currentRoom, {
                type: "users",
                users: getUsers(currentRoom),
            });
            console.log(`${currentClient.name} disconnected`);
            currentRoom = null;
            currentClient = null;
        }
    });
});
/* =========================================================
   SERVER ERROR HANDLING
========================================================= */
server.on("error", (error) => {
    console.error("Server error:", error);
});
/* =========================================================
   START SERVER
========================================================= */
server.listen(PORT, () => {
    console.log(`CodeSync API running on http://localhost:${PORT}`);
    console.log(`WebSocket running on ws://localhost:${PORT}/collaboration`);
});
