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
} from "lucide-react";
import "./App.css";

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

const WS_URL = "ws://localhost:4000/collaboration";

const INITIAL_CODE = `def hello():
    print("Hello from CodeSync!")

hello()
`;

function App() {
  /*
   * ======================================================
   * USER
   * ======================================================
   */

  const [nameInput, setNameInput] = useState("");

  const [name, setName] = useState("");

  /*
   * ======================================================
   * SHARED CODE
   * ======================================================
   */

  const [code, setCode] =
    useState<string>(INITIAL_CODE);

  /*
   * ======================================================
   * COLLABORATORS
   * ======================================================
   */

  const [users, setUsers] =
    useState<User[]>([]);

  /*
   * ======================================================
   * CONNECTION
   * ======================================================
   */

  const [connected, setConnected] =
    useState(false);

  /*
   * ======================================================
   * TERMINAL
   * ======================================================
   */

  const [terminalOpen, setTerminalOpen] =
    useState(true);

  const [running, setRunning] =
    useState(false);

  const [output, setOutput] =
    useState(
      "CodeSync terminal ready.\n\nClick Run to execute main.py."
    );

  /*
   * ======================================================
   * UI
   * ======================================================
   */

  const [copied, setCopied] =
    useState(false);

  const [showSettings, setShowSettings] =
    useState(false);

  /*
   * ======================================================
   * WEBSOCKET
   * ======================================================
   */

  const socketRef =
    useRef<WebSocket | null>(null);

  const clientIdRef =
    useRef("");

  /*
   * Prevent a remote code update from
   * being sent back to the server.
   */

  const remoteUpdateRef =
    useRef(false);

  /*
   * ======================================================
   * LOGIN
   * ======================================================
   */

  const handleJoin = () => {
    const cleanName =
      nameInput.trim();

    if (!cleanName) {
      return;
    }

    setName(cleanName);
  };

  /*
   * ======================================================
   * WEBSOCKET CONNECTION
   * ======================================================
   */

  useEffect(() => {
    if (!name) {
      return;
    }

    const socket =
      new WebSocket(WS_URL);

    socketRef.current =
      socket;

    socket.onopen = () => {
      console.log(
        "CodeSync WebSocket connected"
      );

      setConnected(true);

      socket.send(
        JSON.stringify({
          type: "join",
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
          "CodeSync message:",
          message
        );

        /*
         * ==================================================
         * CLIENT ID
         * ==================================================
         */

        if (
          message.type ===
          "connected"
        ) {
          if (
            message.clientId
          ) {
            clientIdRef.current =
              message.clientId;
          }

          return;
        }

        /*
         * ==================================================
         * INITIAL ROOM STATE
         * ==================================================
         */

        if (
          message.type ===
          "state"
        ) {
          if (
            typeof message.code ===
            "string"
          ) {
            remoteUpdateRef.current =
              true;

            setCode(
              message.code
            );

            setOutput(
              "CodeSync terminal ready.\n\nShared code loaded."
            );

            window.setTimeout(
              () => {
                remoteUpdateRef.current =
                  false;
              },
              0
            );
          }

          if (
            message.users
          ) {
            setUsers(
              message.users
            );
          }

          return;
        }

        /*
         * ==================================================
         * CODE CHANGE FROM ANOTHER USER
         * ==================================================
         */

        if (
          message.type ===
          "code-change"
        ) {
          if (
            message.senderId ===
            clientIdRef.current
          ) {
            return;
          }

          if (
            typeof message.code !==
            "string"
          ) {
            return;
          }

          remoteUpdateRef.current =
            true;

          setCode(
            message.code
          );

          /*
           * IMPORTANT:
           * Whenever another user edits,
           * this user's terminal is cleared.
           */

          setOutput(
            "Code changed by a collaborator.\n\nTerminal cleared.\nClick Run to execute the latest code."
          );

          setRunning(false);

          window.setTimeout(
            () => {
              remoteUpdateRef.current =
                false;
            },
            0
          );

          return;
        }

        /*
         * ==================================================
         * USERS
         * ==================================================
         */

        if (
          message.type ===
          "users"
        ) {
          setUsers(
            message.users ?? []
          );

          return;
        }

        /*
         * ==================================================
         * RUN RESULT
         * ==================================================
         */

        if (
          message.type ===
          "run-result"
        ) {
          if (
            !message.result
          ) {
            return;
          }

          const result =
            message.result;

          let terminalOutput =
            `$ python main.py\n\n`;

          if (
            result.stdout
          ) {
            terminalOutput +=
              result.stdout;
          }

          if (
            result.stderr
          ) {
            terminalOutput +=
              `\n\n[stderr]\n${result.stderr}`;
          }

          if (
            !result.stdout &&
            !result.stderr
          ) {
            terminalOutput +=
              "(no output)";
          }

          terminalOutput +=
            `\n\nExit code: ${
              result.exitCode ?? 0
            }`;

          setOutput(
            terminalOutput
          );

          setRunning(false);

          return;
        }

        /*
         * ==================================================
         * ERROR
         * ==================================================
         */

        if (
          message.type ===
          "error"
        ) {
          console.error(
            message.message
          );

          setOutput(
            `Server error:\n\n${
              message.message ??
              "Unknown error"
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

    socket.onclose = () => {
      console.log(
        "CodeSync WebSocket disconnected"
      );

      setConnected(false);
    };

    socket.onerror = (
      error
    ) => {
      console.error(
        "WebSocket error:",
        error
      );

      setConnected(false);
    };

    return () => {
      socket.close();

      socketRef.current =
        null;
    };
  }, [name]);

  /*
   * ======================================================
   * CODE CHANGE
   * ======================================================
   */

  const handleCodeChange = (
    value:
      | string
      | undefined
  ) => {
    const newCode =
      value ?? "";

    setCode(
      newCode
    );

    /*
     * If this update came from
     * another collaborator, don't
     * broadcast it again.
     */

    if (
      remoteUpdateRef.current
    ) {
      return;
    }

    /*
     * Every local edit clears
     * the local terminal.
     */

    setOutput(
      "Code modified.\n\nTerminal cleared.\nClick Run to execute the latest code."
    );

    /*
     * Send the new code to server.
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
            "code-change",

          code:
            newCode,
        })
      );
    }
  };

  /*
   * ======================================================
   * RUN REAL PYTHON CODE
   * ======================================================
   */

  const handleRun = () => {
    const socket =
      socketRef.current;

    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN
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
        code,
      })
    );
  };

  /*
   * ======================================================
   * SHARE CURRENT URL
   * ======================================================
   */

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(
        window.location.href
      );

      setCopied(true);

      window.setTimeout(
        () => {
          setCopied(false);
        },
        2000
      );
    } catch {
      window.prompt(
        "Copy this CodeSync link:",
        window.location.href
      );
    }
  };

  /*
   * ======================================================
   * LOGIN SCREEN
   * ======================================================
   */

  if (!name) {
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
            Real-time collaborative
            coding workspace
          </p>

          <div className="security-badge">
            <Users size={15} />
            Shared collaborative room
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
              onKeyDown={(event) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  handleJoin();
                }
              }}
              placeholder="e.g. Deekshita"
              autoFocus
            />

            <button
              className="join-button"
              onClick={
                handleJoin
              }
              disabled={
                !nameInput.trim()
              }
            >
              <Code2 size={16} />

              Enter CodeSync
            </button>
          </div>

          <div className="join-note">
            Everyone who opens this
            shared link joins the same
            CodeSync workspace.
            <br />
            No secret key is required.
          </div>
        </div>
      </div>
    );
  }

  /*
   * ======================================================
   * MAIN APPLICATION
   * ======================================================
   */

  return (
    <div className="app">
      {/* TOP BAR */}

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
              REAL-TIME COLLABORATIVE IDE
            </div>
          </div>
        </div>

        <div className="top-actions">
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

          <div className="room">
            Room:
            <strong>
              CodeSync
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
            <Settings
              size={17}
            />
          </button>
        </div>
      </header>

      {/* WORKSPACE */}

      <div className="workspace">
        {/* LEFT */}

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
            >
              <FileCode2
                size={14}
              />

              main.py
            </button>
          </div>
        </aside>

        {/* EDITOR */}

        <main className="editor">
          <div className="editor-header">
            <div className="tab">
              <FileCode2
                size={14}
              />

              main.py
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
              <Play size={14} />

              {running
                ? "Running..."
                : "Run"}
            </button>
          </div>

          <div className="monaco-container">
            <Editor
              height="100%"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={
                handleCodeChange
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

          {/* TERMINAL */}

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
                  <X size={14} />
                </button>
              </div>

              <pre className="terminal-output">
                {output}
              </pre>
            </div>
          )}
        </main>

        {/* RIGHT */}

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

      {/* FOOTER */}

      <footer>
        <div className="footer-left">
          <span className="footer-connected">
            ●{" "}
            {connected
              ? "Connected"
              : "Offline"}
          </span>

          <span>
            Shared Room
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

      {/* SETTINGS */}

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
            onClick={(event) =>
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
                <X size={17} />
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
                  CodeSync
                </span>
              </div>
            </div>

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

                Copy CodeSync link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
