# CodeSync

> Real-time collaborative browser-based code editor.

CodeSync is a collaborative IDE that allows multiple users to work together in the same coding room with real-time communication.

## Features

- Monaco-based code editor
- Real-time WebSocket communication
- Collaborative rooms
- User presence
- JavaScript file explorer
- Integrated terminal
- Code execution UI
- Shareable room URLs
- PostgreSQL and Redis infrastructure
- React + TypeScript frontend
- Node.js + Express backend

## Architecture

```text
Browser
   │
   ├── React + Vite
   │      └── Monaco Editor
   │
   └── WebSocket
            │
            ▼
      Node.js + Express
            │
       ┌────┴────┐
       ▼         ▼
  PostgreSQL    Redis
