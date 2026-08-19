<div align="center">

# CodeSync

### Real-time collaborative coding in the browser

**Edit. Collaborate. Run. — in one shared workspace.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Open%20CodeSync-2ea44f?style=for-the-badge)](https://codesync-1-goz9.onrender.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111827)](https://react.dev/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Real--Time-111827?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

[Live Demo](https://codesync-1-goz9.onrender.com/) · [GitHub Repository](https://github.com/deekshitaa1/CodeSync)

</div>

---

## What is CodeSync?

CodeSync is a **full-stack, browser-based collaborative IDE** that lets multiple people work on the same Python program in real time.

Instead of sending files, screenshots, or copied code back and forth, users join the same room and work inside one shared editor. Code changes, collaborator presence, cursor positions, and selections are synchronized through WebSockets, while the current program can be executed from the integrated terminal.

### The problem it solves

> **How can two or more people write, review, debug, and run the same code without being in the same editor?**

CodeSync provides a shared workspace for that workflow.

---

## Where is it useful?

| Use case | How CodeSync helps |
| --- | --- |
| **Pair Programming** | Two developers edit the same code and see changes instantly. |
| **Technical Interviews** | Interviewers and candidates can work in one shared coding environment. |
| **Mentoring & Teaching** | A mentor can follow a learner's code, cursor, and selections in real time. |
| **Team Debugging** | Developers can inspect, modify, and run the same code during a debugging session. |
| **Coding Practice** | Students can solve programming problems together without exchanging files. |
| **Remote Development Sessions** | Teams get a browser-based shared coding workspace for live sessions. |

---

## What I Built

CodeSync is more than a Monaco Editor interface. I built the **real-time client-server collaboration layer and execution workflow** behind the application.

- **Shared code editing** — multiple users can edit the same `main.py`.
- **Real-time synchronization** — code changes are delivered through WebSockets without page refreshes.
- **Room-based sessions** — users collaborate inside an isolated room identified by a room ID.
- **Live presence** — connected collaborators are displayed in the workspace.
- **Remote cursors & selections** — users can see where collaborators are currently working.
- **Integrated Python execution** — the current code is sent to the backend and execution results are returned to the terminal.
- **stdout / stderr / exit codes** — execution results and Python errors are displayed directly in the IDE.
- **Shareable rooms** — generate a room and share the collaboration URL.
- **IDE experience** — Monaco Editor, explorer, terminal, connection status, collaborator panel, and light/dark themes.

---

## Product Flow

```text
Open CodeSync
      │
      ▼
Create / Enter Room ID
      │
      ▼
Join with a Name
      │
      ▼
WebSocket Connection
      │
      ▼
Shared Editor + Presence
      │
      ├───────────────┐
      ▼               ▼
Edit Together     Track Cursors
      │               │
      └───────┬───────┘
              ▼
         Click Run
              │
              ▼
       Backend executes
          main.py
              │
              ▼
    stdout / stderr / exit code
              │
              ▼
       Integrated Terminal
```

---

## Key Features

### Real-Time Collaborative Editor

A shared Monaco-based editor allows multiple participants to work on the same Python file while code changes are synchronized through the backend.

### Live Collaboration Awareness

CodeSync tracks collaborator presence, cursor positions, and selections so participants can understand what others are working on without repeatedly communicating their location manually.

### Integrated Terminal

The editor and execution environment are connected. Click **Run**, execute the current `main.py`, and view the output directly below the editor.

Example:

```text
$ python main.py

Hello from CodeSync!

Exit code: 0
```

### Room-Based Collaboration

Each collaboration session is associated with a room ID. Share the room link with another participant and join the same workspace.

### Connection State

The UI exposes the WebSocket connection state so users can immediately see whether the collaboration session is connected or offline.

---

## Architecture

```text
                         CODE SYNC
                            │
             ┌──────────────┴──────────────┐
             │                             │
        FRONTEND                         BACKEND
             │                             │
      React + Vite                  Node.js + TypeScript
             │                             │
       Monaco Editor                    Express
             │                             │
             └──────── WebSocket ──────────┘
                            │
                 ┌──────────┴──────────┐
                 │                     │
          Collaboration State     Code Execution
                 │                     │
              Rooms                Python Runner
                 │                     │
        Users / Cursors          stdout / stderr
```

---

## Real-Time Event Model

The collaboration server communicates through WebSocket events such as:

```text
join
state
code-change
users
cursor-change
cursor-clear
run
run-result
error
```

This event-driven model keeps the editor, presence state, cursor state, and execution workflow synchronized without relying on page refreshes or polling for the core collaboration path.

---

## Tech Stack

### Frontend

- React 19
- TypeScript
- Vite
- Monaco Editor
- WebSocket API
- Yjs / Y-WebSocket
- React Router
- Lucide React
- Axios

### Backend

- Node.js
- TypeScript
- Express
- WebSocket (`ws`)
- Execa
- CORS
- dotenv

---

## Project Structure

```text
CodeSync/
├── client/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   └── ...
│   ├── package.json
│   └── ...
│
├── server/
│   ├── src/
│   │   ├── server.ts
│   │   └── ...
│   ├── package.json
│   └── ...
│
└── README.md
```

---

## Run Locally

### Clone the repository

```bash
git clone https://github.com/deekshitaa1/CodeSync.git
cd CodeSync
```

### Start the backend

```bash
cd server
npm install
npm run dev
```

### Start the frontend

Open another terminal:

```bash
cd client
npm install
npm run dev
```

Open the Vite URL displayed in the terminal.

### Test collaboration

1. Open CodeSync in two browser windows.
2. Enter the same room ID in both windows.
3. Use different names.
4. Edit `main.py` in either window.
5. Verify that code changes appear in the other window.
6. Move the cursor or select code to verify collaboration awareness.
7. Click **Run** and inspect the terminal output.

---

## Demo

**Live application:** [codesync-1-goz9.onrender.com](https://codesync-1-goz9.onrender.com/)

**Repository:** [github.com/deekshitaa1/CodeSync](https://github.com/deekshitaa1/CodeSync)

### Recommended Demo Sequence

The clearest way to demonstrate CodeSync is:

1. Create a room.
2. Open the same room in a second browser window.
3. Join with two different names.
4. Show both users connected.
5. Edit the Python code from one window.
6. Show the change appearing in the second window.
7. Move the cursor / select code to demonstrate live collaboration awareness.
8. Run the program.
9. Show the terminal output and an error case.

> Add the project demo video or GIF above this section when you have the final video URL.

---

## Engineering Highlights

This project demonstrates practical full-stack engineering across:

- Real-time WebSocket communication
- Multi-user room management
- Shared application state
- Cursor and selection synchronization
- Monaco Editor integration
- React state and lifecycle management
- Asynchronous server-side process execution
- stdout / stderr / exit-code handling
- Connection and disconnection lifecycle handling
- Full-stack TypeScript development

---

## Security Consideration

Code execution is intentionally highlighted as an architectural concern. A public production deployment should execute untrusted code inside an isolated sandbox or container with strict CPU, memory, filesystem, network, and execution-time limits.

---

## Roadmap

- [ ] Sandboxed code execution
- [ ] Multi-language execution
- [ ] Multiple files per room
- [ ] Persistent project storage
- [ ] Authentication and authorization
- [ ] Room access controls
- [ ] Chat and activity feed
- [ ] Stronger CRDT-based collaboration
- [ ] Execution history
- [ ] Resource limits and execution quotas
- [ ] Automated tests and CI/CD

---

## Author

**Deekshita Rajesh Naik**  
Computer Science & Engineering (Data Science) | AI/ML | Full-Stack Development

[GitHub](https://github.com/deekshitaa1)

---

<div align="center">

**CodeSync — one room, one editor, one shared coding session.**

[Open Live Demo](https://codesync-1-goz9.onrender.com/) · [View Source](https://github.com/deekshitaa1/CodeSync)

</div>
