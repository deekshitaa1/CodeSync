import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Code2,
  Users,
  Share2,
  Settings,
  Folder,
  FileCode2,
  Play,
  Copy,
  Check,
  Terminal,
  X,
  ShieldCheck,
  Lock,
} from "lucide-react";
import "./App.css";

type Language = "python" | "javascript";

type FileItem = {
  name: string;
  language: Language;
  content: string;
};

type User = {
  id: string;
  name: string;
};

type ServerMessage = {
  type?: string;
  message?: string;
  room?: string;
  clientId?: string;
  code?: string;
  language?: string;
  users?: User[];
  result?: unknown;
};

const API_BASE = "http://localhost:4000";
const WS_URL = "ws://localhost:4000/collaboration";

const INITIAL_FILES: FileItem[] = [
  {
    name: "main.py",
    language: "python",
    content: `def hello():
    print("Hello from CodeSync!")

hello()
`,
  },
];

function App() {
  /* ========================================================
     FILE STATE
  ======================================================== */

  const [files, setFiles] =
    useState<FileItem[]>(INITIAL_FILES);

  const [activeFile, setActiveFile] =
    useState("main.py");

  /* ========================================================
     ROOM STATE
  ======================================================== */

  const [room, setRoom] =
    useState("");

  const [secret, setSecret] =
    useState("");

  const [name, setName] =
    useState("");

  const [roomInput, setRoomInput] =
    useState("");

  const [secretInput, setSecretInput] =
    useState("");

  const [nameInput, setNameInput] =
    useState("");

  const [joined, setJoined] =
    useState(false);

  const [creating, setCreating] =
    useState(false);

  const [joinError, setJoinError] =
    useState("");

  const [createdSecret, setCreatedSecret] =
    useState("");

  /* ========================================================
     UI STATE
  ======================================================== */

  const [copied, setCopied] =
    useState(false);

  const [connected, setConnected] =
    useState(false);

  const [users, setUsers] =
    useState<User[]>([]);

  const [showSettings, setShowSettings] =
    useState(false);

  const [terminalOpen, setTerminalOpen] =
    useState(true);

  const [running, setRunning] =
    useState(false);

  const [output, setOutput] =
    useState(
      "CodeSync terminal ready.\nRun your code to see output."
    );

  const socketRef =
    useRef<WebSocket | null>(null);

  /* ========================================================
     CURRENT FILE
  ======================================================== */

  const currentFile =
    files.find(
      (file) =>
        file.name === activeFile
    );

  /* ========================================================
     WEBSOCKET
  ======================================================== */

  useEffect(() => {
    if (
      !joined ||
      !room ||
      !name
    ) {
      return;
    }

    const socket =
      new WebSocket(WS_URL);

    socketRef.current = socket;

    socket.onopen = () => {
      console.log(
        "Connected to CodeSync WebSocket"
      );

      setConnected(true);

      socket.send(
        JSON.stringify({
          type: "join",
          room,
          secret,
          name,
        })
      );
    };

    socket.onmessage = (event) => {
      try {
        const message =
          JSON.parse(
            event.data
          ) as ServerMessage;

        console.log(
          "WebSocket message:",
          message
        );

        /* ----------------------------------------------
           JOINED
        ---------------------------------------------- */

        if (
          message.type === "joined"
        ) {
          setConnected(true);

          if (
            typeof message.code ===
            "string"
          ) {
            setFiles(
              (currentFiles) =>
                currentFiles.map(
                  (file) =>
                    file.name ===
                    activeFile
                      ? {
                          ...file,
                          content:
                            message.code!,
                        }
                      : file
                )
            );
          }

          return;
        }

        /* ----------------------------------------------
           ROOM CREATED
        ---------------------------------------------- */

        if (
          message.type ===
          "room-created"
        ) {
          setConnected(true);

          if (
            typeof message.code ===
            "string"
          ) {
            setFiles(
              (currentFiles) =>
                currentFiles.map(
                  (file) =>
                    file.name ===
                    activeFile
                      ? {
                          ...file,
                          content:
                            message.code!,
                        }
                      : file
                )
            );
          }

          return;
        }

        /* ----------------------------------------------
           ERROR
        ---------------------------------------------- */

        if (
          message.type === "error" ||
          message.type ===
            "join-error"
        ) {
          setJoinError(
            message.message ||
              "Unable to connect to room."
          );

          return;
        }

        /* ----------------------------------------------
           CODE CHANGE
        ---------------------------------------------- */

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

          setFiles(
            (currentFiles) =>
              currentFiles.map(
                (file) =>
                  file.name ===
                  activeFile
                    ? {
                        ...file,
                        content:
                          message.code!,
                      }
                    : file
              )
          );

          return;
        }

        /* ----------------------------------------------
           USERS
        ---------------------------------------------- */

        if (
          message.type === "users"
        ) {
          setUsers(
            message.users ?? []
          );

          return;
        }

        /* ----------------------------------------------
           LANGUAGE CHANGE
        ---------------------------------------------- */

        if (
          message.type ===
          "language-change"
        ) {
          if (
            typeof message.language !==
              "string" ||
            typeof message.code !==
              "string"
          ) {
            return;
          }

          const newLanguage =
            message.language ===
            "javascript"
              ? "javascript"
              : "python";

          setFiles(
            (currentFiles) =>
              currentFiles.map(
                (file) =>
                  file.name ===
                  activeFile
                    ? {
                        ...file,
                        language:
                          newLanguage,
                        content:
                          message.code!,
                      }
                    : file
              )
          );

          return;
        }
      } catch (error) {
        console.error(
          "Invalid WebSocket message:",
          error
        );
      }
    };

    socket.onclose = () => {
      console.log(
        "CodeSync WebSocket disconnected"
      );

      setConnected(false);
    };

    socket.onerror = (error) => {
      console.error(
        "WebSocket error:",
        error
      );

      setConnected(false);
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [
    joined,
    room,
    secret,
    name,
    activeFile,
  ]);

  /* ========================================================
     UPDATE CODE
  ======================================================== */

  const updateCode = (
    value: string | undefined
  ) => {
    const newCode =
      value ?? "";

    setFiles(
      (currentFiles) =>
        currentFiles.map(
          (file) =>
            file.name === activeFile
              ? {
                  ...file,
                  content: newCode,
                }
              : file
        )
    );

    const socket =
      socketRef.current;

    if (
      socket &&
      socket.readyState ===
        WebSocket.OPEN
    ) {
      socket.send(
        JSON.stringify({
          type: "code-change",
          code: newCode,
        })
      );
    }
  };

  /* ========================================================
     CREATE ROOM
  ======================================================== */

  const handleCreateRoom =
    async () => {
      setCreating(true);
      setJoinError("");

      try {
        /*
         * Backend endpoint:
         * POST /api/rooms
         */

        const response =
          await fetch(
            `${API_BASE}/api/rooms`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                room:
                  `room-${Math.random()
                    .toString(36)
                    .substring(2, 8)}`,
                language:
                  "python",
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Room creation failed."
          );
        }

        /*
         * Your current backend returns:
         * data.room
         *
         * not data.roomId.
         */

        const createdRoom =
          data.room;

        if (
          typeof createdRoom !==
          "string"
        ) {
          throw new Error(
            "Server did not return a room ID."
          );
        }

        setRoomInput(
          createdRoom
        );

        /*
         * Current backend does not
         * return a secret.
         *
         * Keep this empty for now.
         */
        setCreatedSecret("");

        setJoinError(
          "Room created. Enter your name and join using the Room ID."
        );
      } catch (error) {
        console.error(
          "Create room error:",
          error
        );

        setJoinError(
          error instanceof Error
            ? error.message
            : "Cannot create room. Make sure the CodeSync server is running."
        );
      } finally {
        setCreating(false);
      }
    };

  /* ========================================================
     JOIN ROOM
  ======================================================== */

  const handleJoin =
    () => {
      const cleanName =
        nameInput.trim();

      const cleanRoom =
        roomInput.trim();

      const cleanSecret =
        secretInput.trim();

      setJoinError("");

      if (
        !cleanName ||
        !cleanRoom
      ) {
        setJoinError(
          "Name and Room ID are required."
        );

        return;
      }

      /*
       * Secret is currently optional
       * because the backend version being
       * used does not authenticate it.
       */

      setName(cleanName);
      setRoom(cleanRoom);
      setSecret(cleanSecret);

      setJoined(true);
    };

  /* ========================================================
     SHARE ROOM
  ======================================================== */

  const handleShare =
    async () => {
      if (!room) {
        return;
      }

      const url =
        `${window.location.origin}/?room=${encodeURIComponent(
          room
        )}`;

      try {
        await navigator.clipboard.writeText(
          url
        );

        setCopied(true);

        window.setTimeout(
          () =>
            setCopied(false),
          2000
        );
      } catch {
        window.prompt(
          "Copy this private room link:",
          url
        );
      }
    };

  /* ========================================================
     COPY SECRET
  ======================================================== */

  const handleCopySecret =
    async () => {
      if (!createdSecret) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          createdSecret
        );

        setCopied(true);

        window.setTimeout(
          () =>
            setCopied(false),
          2000
        );
      } catch {
        console.error(
          "Unable to copy secret."
        );
      }
    };

  /* ========================================================
     RUN CODE
  ======================================================== */

  const handleRun =
    async () => {
      if (!currentFile) {
        return;
      }

      setTerminalOpen(true);
      setRunning(true);

      setOutput(
        `$ Running ${activeFile}...\n\n`
      );

      try {
        const response =
          await fetch(
            `${API_BASE}/api/execute`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                language:
                  currentFile.language,
                code:
                  currentFile.content,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          setOutput(
            `Execution failed.\n\n${
              data.stderr ||
              data.error ||
              "Unknown server error."
            }`
          );

          return;
        }

        let terminalText =
          `$ ${currentFile.language} ${activeFile}\n\n`;

        if (
          data.stdout
        ) {
          terminalText +=
            data.stdout;
        }

        if (
          data.stderr
        ) {
          terminalText +=
            `\n\n[stderr]\n${data.stderr}`;
        }

        if (
          !data.stdout &&
          !data.stderr
        ) {
          terminalText +=
            "(no output)";
        }

        terminalText +=
          `\n\nExit code: ${
            data.exitCode ?? 0
          }`;

        setOutput(
          terminalText
        );

        /*
         * Share execution result
         * with collaborators.
         */

        const socket =
          socketRef.current;

        if (
          socket &&
          socket.readyState ===
            WebSocket.OPEN
        ) {
          socket.send(
            JSON.stringify({
              type:
                "run-result",
              result: {
                language:
                  currentFile.language,
                file:
                  currentFile.name,
                stdout:
                  data.stdout ??
                  "",
                stderr:
                  data.stderr ??
                  "",
                exitCode:
                  data.exitCode ??
                  0,
                success:
                  data.success ??
                  false,
              },
            })
          );
        }
      } catch (error) {
        console.error(
          "Execution error:",
          error
        );

        setOutput(
          `Unable to connect to CodeSync execution server.

Make sure the backend is running at:

${API_BASE}

Error:
${
  error instanceof Error
    ? error.message
    : "Unknown error"
}`
        );
      } finally {
        setRunning(false);
      }
    };

  /* ========================================================
     JOIN SCREEN
  ======================================================== */

  if (!joined) {
    return (
      <div className="join-screen">
        <div className="join-card">

          <div className="join-logo">
            <Code2 size={30} />
          </div>

          <h1>
            CodeSync
          </h1>

          <p className="join-subtitle">
            Secure real-time collaborative
            development workspace
          </p>

          <div className="security-badge">
            <ShieldCheck size={15} />
            Private collaborative rooms
          </div>

          <div className="join-form">

            <label>
              Your name
            </label>

            <input
              value={nameInput}
              onChange={(event) =>
                setNameInput(
                  event.target.value
                )
              }
              placeholder="e.g. Deekshita"
            />

            <label>
              Room ID
            </label>

            <input
              value={roomInput}
              onChange={(event) =>
                setRoomInput(
                  event.target.value
                )
              }
              placeholder="Enter room ID"
            />

            <label>
              Secret key
            </label>

            <input
              type="password"
              value={secretInput}
              onChange={(event) =>
                setSecretInput(
                  event.target.value
                )
              }
              placeholder="Optional for current server"
            />

            {joinError && (
              <div className="join-error">
                {joinError}
              </div>
            )}

            <button
              className="join-button"
              onClick={
                handleJoin
              }
              disabled={
                !nameInput.trim() ||
                !roomInput.trim()
              }
            >
              <Lock size={16} />
              Join Room
            </button>

            <div className="divider">
              <span>
                OR
              </span>
            </div>

            <button
              className="create-room-button"
              onClick={
                handleCreateRoom
              }
              disabled={
                creating
              }
            >
              {creating
                ? "Creating room..."
                : "Create Room"}
            </button>

            {createdSecret && (
              <div className="created-room">

                <strong>
                  Room created
                </strong>

                <span>
                  Copy the room secret.
                </span>

                <div className="secret-box">

                  <code>
                    {
                      createdSecret
                    }
                  </code>

                  <button
                    onClick={
                      handleCopySecret
                    }
                  >
                    {copied ? (
                      <Check
                        size={15}
                      />
                    ) : (
                      <Copy
                        size={15}
                      />
                    )}
                  </button>

                </div>

              </div>
            )}

          </div>

          <div className="join-note">
            CodeSync currently supports
            real execution for Python and
            JavaScript/Node.js on this machine.
          </div>

        </div>
      </div>
    );
  }

  /* ========================================================
     MAIN APPLICATION
  ======================================================== */

  return (
    <div className="app">

      {/* ==================================================
          TOP BAR
      ================================================== */}

      <header className="topbar">

        <div className="brand">

          <div className="logo">
            <Code2 size={21} />
          </div>

          <div>
            <div className="title">
              CodeSync
            </div>

            <div className="subtitle">
              SECURE COLLABORATIVE IDE
            </div>
          </div>

        </div>

        <div className="top-actions">

          <div className="connection">

            <span
              className="status-dot"
              style={{
                background:
                  connected
                    ? "#34d399"
                    : "#ef4444",
              }}
            />

            {connected
              ? "Connected"
              : "Disconnected"}

          </div>

          <div className="room">
            Room:
            <strong>
              {room}
            </strong>
          </div>

          <button
            className="share-button"
            onClick={
              handleShare
            }
          >
            {copied ? (
              <Check size={15} />
            ) : (
              <Share2 size={15} />
            )}

            {copied
              ? "Copied"
              : "Share"}
          </button>

          <button
            className="icon-button"
            onClick={() =>
              setShowSettings(
                true
              )
            }
          >
            <Settings size={17} />
          </button>

        </div>

      </header>

      {/* ==================================================
          WORKSPACE
      ================================================== */}

      <div className="workspace">

        {/* =================================================
            LEFT SIDEBAR
        ================================================= */}

        <aside className="sidebar">

          <div className="sidebar-title">
            EXPLORER
          </div>

          <div className="folder">
            <Folder size={15} />
            <span>
              src
            </span>
          </div>

          <div className="files">

            {files.map(
              (file) => (
                <button
                  key={
                    file.name
                  }
                  className={`file ${
                    activeFile ===
                    file.name
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setActiveFile(
                      file.name
                    )
                  }
                >
                  <FileCode2
                    size={14}
                  />

                  {file.name}
                </button>
              )
            )}

          </div>

        </aside>

        {/* =================================================
            EDITOR
        ================================================= */}

        <main className="editor">

          <div className="editor-header">

            <div className="tab">

              <FileCode2
                size={14}
              />

              {activeFile}

            </div>

            <button
              className="run-button"
              onClick={
                handleRun
              }
              disabled={
                running
              }
            >

              <Play
                size={14}
              />

              {running
                ? "Running..."
                : "Run"}

            </button>

          </div>

          <div className="monaco-container">

            <Editor
              height="100%"
              language={
                currentFile?.language ??
                "plaintext"
              }
              theme="vs-dark"
              value={
                currentFile?.content ??
                ""
              }
              onChange={
                updateCode
              }
              options={{
                minimap: {
                  enabled:
                    false,
                },
                fontSize: 14,
                lineNumbers:
                  "on",
                automaticLayout:
                  true,
                padding: {
                  top: 15,
                },
                scrollBeyondLastLine:
                  false,
                tabSize: 4,
                wordWrap:
                  "on",
                smoothScrolling:
                  true,
                cursorBlinking:
                  "smooth",
              }}
            />

          </div>

          {/* =================================================
              TERMINAL
          ================================================= */}

          {terminalOpen && (
            <div className="terminal">

              <div className="terminal-header">

                <div>
                  <Terminal
                    size={14}
                  />

                  TERMINAL
                </div>

                <button
                  className="terminal-close"
                  onClick={() =>
                    setTerminalOpen(
                      false
                    )
                  }
                >
                  <X
                    size={14}
                  />
                </button>

              </div>

              <pre className="terminal-output">
                {output}
              </pre>

            </div>
          )}

        </main>

        {/* =================================================
            RIGHT PANEL
        ================================================= */}

        <aside className="right-panel">

          <div className="right-header">

            <Users
              size={16}
            />

            <span>
              Collaborators
            </span>

            <span className="user-count">
              {users.length}
            </span>

          </div>

          {users.length ===
            0 && (
            <div
              style={{
                padding:
                  "20px",
                color:
                  "#888",
                fontSize:
                  "13px",
              }}
            >
              No collaborators
              connected.
            </div>
          )}

          {users.map(
            (user) => (
              <div
                className="collaborator"
                key={
                  user.id
                }
              >

                <div className="avatar">
                  {user.name
                    .charAt(
                      0
                    )
                    .toUpperCase()}
                </div>

                <div className="user-info">

                  <strong>
                    {user.name}
                  </strong>

                  <span>
                    {user.name ===
                    name
                      ? "You"
                      : "Collaborator"}
                  </span>

                </div>

                <span className="online" />

              </div>
            )
          )}

        </aside>

      </div>

      {/* ==================================================
          FOOTER
      ================================================== */}

      <footer>

        <div className="footer-left">

          <span className="footer-connected">

            ●{" "}

            {connected
              ? "Connected"
              : "Offline"}

          </span>

          <span>
            Private Room
          </span>

        </div>

        <div className="footer-right">

          <span>
            {currentFile?.language ??
              "Plain Text"}
          </span>

          <span>
            UTF-8
          </span>

        </div>

      </footer>

      {/* ==================================================
          SETTINGS MODAL
      ================================================== */}

      {showSettings && (
        <div
          className="modal-overlay"
          onClick={() =>
            setShowSettings(
              false
            )
          }
        >

          <div
            className="settings-modal"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >

            <div className="settings-header">

              <h2>
                CodeSync Settings
              </h2>

              <button
                onClick={() =>
                  setShowSettings(
                    false
                  )
                }
              >
                <X
                  size={17}
                />
              </button>

            </div>

            <div className="setting-row">

              <div>
                <strong>
                  User
                </strong>

                <span>
                  {name}
                </span>
              </div>

            </div>

            <div className="setting-row">

              <div>
                <strong>
                  Room
                </strong>

                <span>
                  {room}
                </span>
              </div>

            </div>

            <div className="setting-row">

              <div>
                <strong>
                  Connection
                </strong>

                <span>
                  {connected
                    ? "WebSocket connected"
                    : "Disconnected"}
                </span>
              </div>

            </div>

            <div className="setting-row">

              <div>
                <strong>
                  Execution
                </strong>

                <span>
                  Python + Node.js
                </span>
              </div>

            </div>

            <div className="setting-row">

              <button
                className="copy-room"
                onClick={
                  handleShare
                }
              >
                <Share2
                  size={14}
                />

                Copy room link
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

export default App;
