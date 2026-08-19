# CodeSync

**Real-time collaborative coding in the browser.**

CodeSync is a browser-based collaborative IDE for teams, students, interviewers, mentors, and developers who need to work on the same code in real time without repeatedly sharing files or switching between editors.

It provides a shared coding room where participants can edit the same Python file, see collaborator presence and cursor activity, share a room, and execute the current program from an integrated terminal.

## What I Built

CodeSync is a full-stack real-time collaboration system, not a static code-editor UI.

- **Collaborative editing** — multiple users work on the same `main.py` in a shared room.
- **Real-time synchronization** — code changes are propagated through WebSockets.
- **Live presence** — connected collaborators are shown in the workspace.
- **Remote cursor and selection tracking** — users can see where collaborators are working.
- **Room-based collaboration** — each session is isolated by a room ID.
- **Code execution** — the current Python program is sent to the backend and stdout, stderr, and exit code are returned to the terminal.
- **Shareable rooms** — generate a room and share the collaboration URL.
- **Developer-focused IDE** — Monaco Editor, file explorer, terminal, connection status, theme switching, and collaborator panel.
- **Separated frontend/backend architecture** — React + TypeScript client with a Node.js + TypeScript WebSocket server.

## Why CodeSync?

Traditional collaboration often looks like:

`Write code → save file → send file → explain changes → merge edits`

CodeSync turns that into:

`Join room → edit together → see changes live → run the shared code`

### Where It Can Be Used

| Use case | Value |
| --- | --- |
| **Pair programming** | Developers work in the same editor and follow changes live. |
| **Technical interviews** | Interviewers and candidates collaborate on coding problems without exchanging files. |
| **Mentoring & teaching** | Mentors can follow a learner's code and cursor while explaining a solution. |
| **Team debugging** | Developers can inspect and modify the same code during troubleshooting. |
| **Collaborative coding practice** | Students can solve programming problems together in one workspace. |
| **Remote development sessions** | Teams get a shared browser coding environment instead of separate local files. |

## Architecture

```text
                         CodeSync
                            │
              ┌─────────────┴─────────────┐
              │                           │
        React + Vite                 Node.js Server
              │                           │
       Monaco Editor                 Express API
              │                           │
              └──── WebSocket ────────────┘
                            │
                 ┌──────────┴──────────┐
                 │                     │
          Collaboration State     Code Execution
                 │                     │
              Rooms              Python Runner
                 │
             Users / Cursors
```

## Tech Stack

### Frontend

- React 19
- TypeScript
- Vite
- Monaco Editor
- WebSocket
- Yjs / Y-WebSocket dependencies
- React Router
- Lucide React

### Backend

- Node.js
- TypeScript
- Express
- WebSocket (`ws`)
- `execa` for process execution
- CORS
- dotenv

## Core Flow

```text
1. User opens CodeSync
        ↓
2. Creates or enters a room ID
        ↓
3. Joins with a display name
        ↓
4. WebSocket connection is established
        ↓
5. Server places the user in the room
        ↓
6. Code / presence / cursor events are synchronized
        ↓
7. User clicks Run
        ↓
8. Backend executes the shared Python code
        ↓
9. stdout / stderr / exit code return to the terminal
```

## Real-Time Collaboration

The collaboration layer uses event-driven WebSocket communication for:

- `join`
- `state`
- `code-change`
- `users`
- `cursor-change`
- `cursor-clear`
- `run`
- `run-result`
- `error`

This avoids page refreshes and polling for the core collaboration workflow.

## Code Execution

CodeSync's Run workflow sends an execution request to the backend and displays the result in the integrated terminal.

Example:

```text
$ python main.py

Hello from CodeSync!

Exit code: 0
```

Errors are surfaced through stderr so the same workspace can support an edit → run → debug workflow.

> **Security note:** Public production deployments should isolate untrusted code execution in a sandbox/container with strict CPU, memory, filesystem, network, and execution-time limits. An unrestricted host Python process should not be exposed to arbitrary users.

## Product Highlights

### Shared Editor

Monaco Editor provides a familiar developer experience with syntax highlighting, line numbers, keyboard navigation, themes, and editor controls.

### Live Collaboration

Code changes, presence, cursor positions, and selections can be synchronized through the WebSocket connection.

### Integrated Terminal

Execution results appear directly below the editor, keeping editing and debugging in one workspace.

### Room-Based Sessions

A room ID creates a focused collaboration boundary that can be shared with other participants.

## Project Structure

```text
CodeSync/
├── client/
│   ├── src/
│   │   ├── App.tsx
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

## Run Locally

### 1. Clone

```bash
git clone https://github.com/deekshitaa1/CodeSync.git
cd CodeSync
```

### 2. Start the backend

```bash
cd server
npm install
npm run dev
```

### 3. Start the frontend

Open another terminal:

```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

### 4. Test collaboration

1. Open CodeSync in two browser windows.
2. Use the same room ID in both windows.
3. Enter different names.
4. Edit `main.py` in either window.
5. Verify code, collaborator presence, and cursor activity.
6. Click **Run** to execute the current Python code.

## Engineering Focus

This project demonstrates practical engineering beyond UI development:

- Real-time client-server communication
- WebSocket event design
- Shared state synchronization
- Multi-user presence
- Remote cursor rendering with Monaco decorations
- Asynchronous process execution
- Full-stack TypeScript development
- React state and lifecycle management
- Connection lifecycle handling
- Error and execution-result handling
- Production-oriented security considerations for code execution

## Roadmap

- [ ] Sandboxed code execution
- [ ] Multi-language execution
- [ ] Persistent project/file storage
- [ ] Multiple files per room
- [ ] Authentication and authorization
- [ ] Room access controls
- [ ] Chat and activity feed
- [ ] Stronger CRDT-based collaborative editing
- [ ] Execution history
- [ ] Resource limits and execution quotas
- [ ] Automated tests and CI/CD

## Demo

**Live application:** Add your deployed frontend URL here.

**Backend:** https://codesync-server-ec9a.onrender.com

**Repository:** https://github.com/deekshitaa1/CodeSync

## Demo Video

Add the demo video or GIF here. The strongest demo sequence is:

1. Create a room.
2. Open the same room in a second browser window.
3. Show both users connected.
4. Edit code from one window and show the change appearing in the other.
5. Move the cursor or select code to demonstrate collaboration awareness.
6. Run the program.
7. Show terminal output and an error-handling example.

## Author

**Deekshita Rajesh Naik**

Computer Science & Engineering (Data Science) | AI/ML | Full-Stack Development

GitHub: https://github.com/deekshitaa1

---

If you find CodeSync useful, consider starring the repository or opening an issue with feedback.
