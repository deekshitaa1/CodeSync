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
  Check,
  Terminal,
  X,
  Wifi,
  WifiOff,
  Sparkles,
  Copy,
  Sun,
  Moon,
} from "lucide-react";

import "./App.css";

/* ======================================================
   TYPES
   ====================================================== */

type User = {
  id: string;
  name: string;
};

type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  success: boolean;
};

type ServerMessage = {
  type:
    | "connected"
    | "state"
    | "code-change"
    | "users"
    | "run-result"
    | "error";

  clientId?: string;
  code?: string;
  users?: User[];
  senderId?: string;
  result?: RunResult;
  message?: string;
};

/* ======================================================
   CONFIGURATION
   ====================================================== */

const WS_URL =
  "wss://codesync-server-ec9a.onrender.com/collaboration";

const INITIAL_CODE = `def hello():
    print("Hello from CodeSync!")

hello()
`;

/* ======================================================
   ROOM ID
   ====================================================== */

function generateRoomId(): string {
  const first = crypto.randomUUID().split("-")[0];
  const second = crypto.randomUUID().split("-")[0];

  return `${first}-${second}`;
}

/* ======================================================
   APP
   ====================================================== */

function App() {
  /* ====================================================
     LOGIN
     ==================================================== */

  const [roomId, setRoomId] = useState("");
  const [nameInput, setNameInput] = useState("");

  const [name, setName] = useState("");
  const [joinedRoom, setJoinedRoom] = useState("");

  const [joining, setJoining] = useState(false);

  /* ====================================================
     SHARED CODE
     ==================================================== */

  const [code, setCode] = useState(INITIAL_CODE);

  /* ====================================================
     USERS
     ==================================================== */

  const [users, setUsers] = useState<User[]>([]);

  /* ====================================================
     CONNECTION
     ==================================================== */

  const [connected, setConnected] = useState(false);

  /* ====================================================
     TERMINAL
     ==================================================== */

  const [terminalOpen, setTerminalOpen] = useState(true);

  const [running, setRunning] = useState(false);

  const [output, setOutput] = useState(
    "CodeSync terminal ready.\n\nClick Run to execute main.py."
  );

  /* ====================================================
     UI
     ==================================================== */

  const [copied, setCopied] = useState(false);

  const [showSettings, setShowSettings] = useState(false);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("codesync-theme");

    return savedTheme === "light" ? "light" : "dark";
  });

  /* ====================================================
     WEBSOCKET REFS
     ==================================================== */

  const socketRef = useRef<WebSocket | null>(null);

  const clientIdRef = useRef("");

  const remoteUpdateRef = useRef(false);

  /* ====================================================
     INITIAL URL ROOM
     ==================================================== */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const urlRoom = params.get("room");

    if (urlRoom) {
      setRoomId(urlRoom);
    }
  }, []);

  /* ====================================================
     THEME
     ==================================================== */

  const changeTheme = (newTheme: "dark" | "light") => {
    setTheme(newTheme);

    localStorage.setItem("codesync-theme", newTheme);
  };

  /* ====================================================
     GENERATE ROOM
     ==================================================== */

  const handleGenerateRoom = () => {
    const newRoom = generateRoomId();

    setRoomId(newRoom);
  };

  /* ====================================================
     JOIN
     ==================================================== */

  const handleJoin = () => {
    const cleanName = nameInput.trim();
    const cleanRoom = roomId.trim();

    /*
     * If no room is entered, create one.
     */

    if (!cleanRoom) {
      const newRoom = generateRoomId();

      setRoomId(newRoom);

      return;
    }

    /*
     * Name is required.
     */

    if (!cleanName) {
      return;
    }

    setJoining(true);

    setJoinedRoom(cleanRoom);

    setName(cleanName);

    /*
     * Keep room in URL.
     */

    const url = `${window.location.pathname}?room=${encodeURIComponent(
      cleanRoom
    )}`;

    window.history.replaceState({}, "", url);
  };

  /* ====================================================
     WEBSOCKET CONNECTION
     ==================================================== */

  useEffect(() => {
    if (!name || !joinedRoom) {
      return;
    }

    const socket = new WebSocket(WS_URL);

    socketRef.current = socket;

    /* ==================================================
       OPEN
       ================================================== */

    socket.onopen = () => {
      console.log("CodeSync WebSocket connected");

      setConnected(true);

      setJoining(false);

      socket.send(
        JSON.stringify({
          type: "join",
          name,
          roomId: joinedRoom,
        })
      );
    };

    /* ==================================================
       MESSAGE
       ================================================== */

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(
          event.data
        ) as ServerMessage;

        console.log("CodeSync message:", message);

        /* ==============================================
           CONNECTED
           ============================================== */

        if (message.type === "connected") {
          if (message.clientId) {
            clientIdRef.current = message.clientId;
          }

          return;
        }

        /* ==============================================
           INITIAL STATE
           ============================================== */

        if (message.type === "state") {
          if (typeof message.code === "string") {
            remoteUpdateRef.current = true;

            setCode(message.code);

            setOutput(
              "CodeSync terminal ready.\n\nShared code loaded."
            );

            window.setTimeout(() => {
              remoteUpdateRef.current = false;
            }, 0);
          }

          if (message.users) {
            setUsers(message.users);
          }

          return;
        }

        /* ==============================================
           REMOTE CODE CHANGE
           ============================================== */

        if (message.type === "code-change") {
          if (
            message.senderId === clientIdRef.current
          ) {
            return;
          }

          if (typeof message.code !== "string") {
            return;
          }

          remoteUpdateRef.current = true;

          setCode(message.code);

          setOutput(
            "Code changed by a collaborator.\n\nTerminal cleared.\nClick Run to execute the latest code."
          );

          setRunning(false);

          window.setTimeout(() => {
            remoteUpdateRef.current = false;
          }, 0);

          return;
        }

        /* ==============================================
           USERS
           ============================================== */

        if (message.type === "users") {
          setUsers(message.users ?? []);

          return;
        }

        /* ==============================================
           RUN RESULT
           ============================================== */

        if (message.type === "run-result") {
          if (!message.result) {
            return;
          }

          const result = message.result;

          let terminalOutput =
            "$ python main.py\n\n";

          if (result.stdout) {
            terminalOutput += result.stdout;
          }

          if (result.stderr) {
            terminalOutput +=
              `\n\n[stderr]\n${result.stderr}`;
          }

          if (
            !result.stdout &&
            !result.stderr
          ) {
            terminalOutput += "(no output)";
          }

          terminalOutput +=
            `\n\nExit code: ${
              result.exitCode ?? 0
            }`;

          setOutput(terminalOutput);

          setRunning(false);

          return;
        }

        /* ==============================================
           ERROR
           ============================================== */

        if (message.type === "error") {
          console.error(message.message);

          setOutput(
            `Server error:\n\n${
              message.message ??
              "Unknown server error."
            }`
          );

          setRunning(false);

          return;
        }
      } catch (error) {
        console.error(
          "Invalid WebSocket message:",
          error
        );
      }
    };

    /* ==================================================
       CLOSE
       ================================================== */

    socket.onclose = () => {
      console.log(
        "CodeSync WebSocket disconnected"
      );

      setConnected(false);

      setJoining(false);
    };

    /* ==================================================
       ERROR
       ================================================== */

    socket.onerror = (error) => {
      console.error(
        "CodeSync WebSocket error:",
        error
      );

      setConnected(false);

      setJoining(false);
    };

    /* ==================================================
       CLEANUP
       ================================================== */

    return () => {
      socket.close();

      socketRef.current = null;
    };
  }, [name, joinedRoom]);

  /* ======================================================
     CODE CHANGE
     ====================================================== */

  const handleCodeChange = (
    value: string | undefined
  ) => {
    const newCode = value ?? "";

    setCode(newCode);

    /*
     * Don't send changes caused by
     * remote synchronization.
     */

    if (remoteUpdateRef.current) {
      return;
    }

    setOutput(
      "Code modified.\n\nTerminal cleared.\nClick Run to execute the latest code."
    );

    const socket = socketRef.current;

    if (
      socket &&
      socket.readyState === WebSocket.OPEN
    ) {
      socket.send(
        JSON.stringify({
          type: "code-change",
          code: newCode,
        })
      );
    }
  };

  /* ======================================================
     RUN
     ====================================================== */

  const handleRun = () => {
    const socket = socketRef.current;

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      setOutput(
        "Not connected to CodeSync server."
      );

      return;
    }

    setTerminalOpen(true);

    setRunning(true);

    setOutput(
      "$ python main.py\n\nRunning..."
    );

    socket.send(
      JSON.stringify({
        type: "run",
      })
    );
  };

  /* ======================================================
     SHARE
     ====================================================== */

  const handleShare = async () => {
    try {
      const url =
        `${window.location.origin}/?room=${encodeURIComponent(
          joinedRoom
        )}`;

      await navigator.clipboard.writeText(url);

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      window.prompt(
        "Copy this CodeSync link:",
        window.location.href
      );
    }
  };

  /* ======================================================
     LOGIN SCREEN
     ====================================================== */

  if (!name) {
    return (
      <div className="join-screen">

        {/* STATUS */}

        <div className="joining-status">
          <span className="status-spinner" />

          {joining
            ? "Joining room..."
            : "Ready to collaborate"}
        </div>

        {/* GREEN CORNER */}

        <div className="green-corner" />

        {/* MAIN LOGIN LAYOUT */}

        <div className="join-layout">

          {/* ============================================
              LEFT VISUAL
              ============================================ */}

          <section className="join-visual">

            <div className="illustration-glow" />

            <img
              src="/codesync-collaboration.png"
              alt="Developers collaborating"
              className="collaboration-image"
            />

          </section>

          {/* ============================================
              RIGHT LOGIN
              ============================================ */}

          <section className="join-content">

            {/* BRAND */}

            <div className="brand-large">

              <div className="brand-icon">
                <Code2 size={34} />
              </div>

              <div className="brand-text">

                <div className="brand-name">
                  <span>Code</span>

                  <span className="brand-green">
                    Sync
                  </span>
                </div>

                <div className="brand-tagline">
                  Code, Chat and Collaborate.
                  It's All in Sync.
                </div>

              </div>

            </div>

            {/* FORM */}

            <div className="join-form">

              {/* ROOM */}

              <div className="input-wrapper">

                <input
                  className="room-input"
                  value={roomId}
                  onChange={(event) =>
                    setRoomId(
                      event.target.value
                    )
                  }
                  placeholder="Room ID"
                  autoComplete="off"
                />

              </div>

              {/* NAME */}

              <div className="input-wrapper">

                <input
                  className="name-input"
                  value={nameInput}
                  onChange={(event) =>
                    setNameInput(
                      event.target.value
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter"
                    ) {
                      handleJoin();
                    }
                  }}
                  placeholder="Your name"
                  autoComplete="name"
                />

              </div>

              {/* JOIN */}

              <button
                className="join-button"
                onClick={handleJoin}
                disabled={
                  !nameInput.trim() ||
                  joining
                }
              >
                <span>
                  {joining
                    ? "Joining..."
                    : "Join"}
                </span>
              </button>

              {/* GENERATE ROOM */}

              <button
                className="generate-room"
                onClick={
                  handleGenerateRoom
                }
                type="button"
              >

                <Sparkles size={17} />

                <span>
                  Generate Unique Room
                  <br />
                  Id
                </span>

              </button>

            </div>

            {/* DESCRIPTION */}

            <div className="join-description">
              Collaborate on code in
              real-time with your team.
            </div>

          </section>

        </div>
      </div>
    );
  }

  /* ======================================================
     MAIN IDE
     ====================================================== */

  return (
    <div
      className={`app ${
        theme === "light"
          ? "theme-light"
          : "theme-dark"
      }`}
    >

      {/* ==================================================
          TOP BAR
          ================================================== */}

      <header className="topbar">

        {/* BRAND */}

        <div className="brand">

          <div className="logo">
            <Code2 size={21} />
          </div>

          <div>

            <div className="title">
              CodeSync
            </div>

            <div className="subtitle">
              REAL-TIME COLLABORATIVE IDE
            </div>

          </div>

        </div>

        {/* ACTIONS */}

        <div className="top-actions">

          {/* CONNECTION */}

          <div className="connection">

            {connected ? (
              <>
                <Wifi size={15} />
                Connected
              </>
            ) : (
              <>
                <WifiOff size={15} />
                Disconnected
              </>
            )}

          </div>

          {/* ROOM */}

          <div className="room">

            Room:

            <strong>
              {joinedRoom}
            </strong>

          </div>

          {/* SHARE */}

          <button
            className="share-button"
            onClick={handleShare}
            type="button"
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

          {/* SETTINGS */}

          <button
            className="icon-button"
            onClick={() =>
              setShowSettings(true)
            }
            type="button"
            aria-label="Settings"
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

            <button
              className="file active"
              type="button"
            >

              <FileCode2 size={14} />

              main.py

            </button>

          </div>

        </aside>

        {/* =================================================
            EDITOR
            ================================================= */}

        <main className="editor">

          {/* EDITOR HEADER */}

          <div className="editor-header">

            <div className="tab">

              <FileCode2 size={14} />

              main.py

            </div>

            <button
              className="run-button"
              onClick={handleRun}
              disabled={running}
              type="button"
            >

              <Play size={14} />

              {running
                ? "Running..."
                : "Run"}

            </button>

          </div>

          {/* MONACO */}

          <div className="monaco-container">

            <Editor
              height="100%"
              language="python"
              theme={
                theme === "light"
                  ? "vs"
                  : "vs-dark"
              }
              value={code}
              onChange={
                handleCodeChange
              }
              options={{
                minimap: {
                  enabled: false,
                },

                fontSize: 14,

                lineNumbers: "on",

                automaticLayout: true,

                padding: {
                  top: 15,
                },

                scrollBeyondLastLine: false,

                tabSize: 4,

                wordWrap: "on",

                smoothScrolling: true,

                cursorBlinking: "smooth",

                renderWhitespace: "selection",

                bracketPairColorization: {
                  enabled: true,
                },

                suggestOnTriggerCharacters: true,
              }}
            />

          </div>

          {/* =================================================
              TERMINAL
              ================================================= */}

          {terminalOpen && (
            <div
              className={`terminal ${
                theme === "light"
                  ? "terminal-light"
                  : "terminal-dark"
              }`}
            >

              {/* TERMINAL HEADER */}

              <div className="terminal-header">

                <div className="terminal-title">

                  <Terminal size={14} />

                  <span>
                    TERMINAL
                  </span>

                </div>

                <button
                  className="terminal-close"
                  onClick={() =>
                    setTerminalOpen(false)
                  }
                  type="button"
                  aria-label="Close terminal"
                >
                  <X size={14} />
                </button>

              </div>

              {/* TERMINAL CONTENT */}

              <pre className="terminal-output">
                {output}
              </pre>

            </div>
          )}

        </main>

        {/* =================================================
            RIGHT COLLABORATORS PANEL
            ================================================= */}

        <aside className="right-panel">

          <div className="right-header">

            <Users size={16} />

            <span>
              Collaborators
            </span>

            <span className="user-count">
              {users.length}
            </span>

          </div>

          {/* USERS */}

          {users.length === 0 ? (
            <div className="empty-collaborators">
              No collaborators yet.
            </div>
          ) : (
            users.map((user) => (
              <div
                className="collaborator"
                key={user.id}
              >

                {/* AVATAR */}

                <div className="avatar">

                  {user.name
                    .charAt(0)
                    .toUpperCase()}

                </div>

                {/* USER INFO */}

                <div className="user-info">

                  <strong>
                    {user.name}
                  </strong>

                  <span>
                    {user.name === name
                      ? "You"
                      : "Collaborator"}
                  </span>

                </div>

                {/* ONLINE */}

                <span className="online" />

              </div>
            ))
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
            Room: {joinedRoom}
          </span>

        </div>

        <div className="footer-right">

          <span>
            Python
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
            setShowSettings(false)
          }
        >

          <div
            className="settings-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* HEADER */}

            <div className="settings-header">

              <div>
                <h2>
                  CodeSync Settings
                </h2>

                <span>
                  Workspace preferences
                </span>
              </div>

              <button
                onClick={() =>
                  setShowSettings(false)
                }
                type="button"
                aria-label="Close settings"
              >
                <X size={17} />
              </button>

            </div>

            {/* USER */}

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

            {/* ROOM */}

            <div className="setting-row">

              <div>

                <strong>
                  Room
                </strong>

                <span>
                  {joinedRoom}
                </span>

              </div>

            </div>

            {/* COLLABORATORS */}

            <div className="setting-row">

              <div>

                <strong>
                  Collaborators
                </strong>

                <span>
                  {users.length}
                </span>

              </div>

            </div>

            {/* THEME */}

            <div className="setting-row theme-setting">

              <div>

                <strong>
                  Appearance
                </strong>

                <span>
                  Choose your editor theme
                </span>

              </div>

              <div className="theme-buttons">

                <button
                  type="button"
                  className={
                    theme === "dark"
                      ? "theme-option active"
                      : "theme-option"
                  }
                  onClick={() =>
                    changeTheme("dark")
                  }
                >

                  <Moon size={15} />

                  Dark

                </button>

                <button
                  type="button"
                  className={
                    theme === "light"
                      ? "theme-option active"
                      : "theme-option"
                  }
                  onClick={() =>
                    changeTheme("light")
                  }
                >

                  <Sun size={15} />

                  Light

                </button>

              </div>

            </div>

            {/* TERMINAL */}

            <div className="setting-row">

              <div>

                <strong>
                  Terminal
                </strong>

                <span>
                  {terminalOpen
                    ? "Visible"
                    : "Hidden"}
                </span>

              </div>

              <button
                className="copy-room"
                onClick={() =>
                  setTerminalOpen(
                    !terminalOpen
                  )
                }
                type="button"
              >

                <Terminal size={14} />

                {terminalOpen
                  ? "Hide Terminal"
                  : "Show Terminal"}

              </button>

            </div>

            {/* COPY LINK */}

            <div className="setting-row">

              <button
                className="copy-room"
                onClick={handleShare}
                type="button"
              >

                {copied ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )}

                {copied
                  ? "Copied"
                  : "Copy CodeSync link"}

              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

export default App;
