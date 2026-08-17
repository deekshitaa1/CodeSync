import { useEffect, useRef, useState } from "react";

import Editor from "@monaco-editor/react";
import type { OnChange, OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";

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
  Moon,
  Sun,
} from "lucide-react";

import "./App.css";

/* ======================================================
   TYPES
   ====================================================== */

type User = {
  id: string;
  name: string;
};

type CursorPosition = {
  lineNumber: number;
  column: number;
};

type SelectionPosition = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
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
    | "cursor-change"
    | "cursor-clear"
    | "run-result"
    | "error";

  clientId?: string;
  code?: string;
  users?: User[];
  senderId?: string;
  name?: string;
  position?: CursorPosition;
  selection?: SelectionPosition | null;
  result?: RunResult;
  message?: string;
};

type RemoteCursor = {
  name: string;
  position: CursorPosition;
  selection: SelectionPosition | null;
};

/* ======================================================
   CONFIG
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
     CODE
     ==================================================== */

  const [code, setCode] =
    useState<string>(INITIAL_CODE);

  /* ====================================================
     USERS
     ==================================================== */

  const [users, setUsers] =
    useState<User[]>([]);

  /* ====================================================
     CONNECTION
     ==================================================== */

  const [connected, setConnected] =
    useState(false);

  /* ====================================================
     TERMINAL
     ==================================================== */

  const [terminalOpen, setTerminalOpen] =
    useState(true);

  const [running, setRunning] =
    useState(false);

  const [output, setOutput] =
    useState(
      "CodeSync terminal ready.\n\nClick Run to execute main.py."
    );

  /* ====================================================
     UI
     ==================================================== */

  const [copied, setCopied] =
    useState(false);

  const [showSettings, setShowSettings] =
    useState(false);

  const [theme, setTheme] =
    useState<"dark" | "light">(() => {
      const saved =
        localStorage.getItem(
          "codesync-theme"
        );

      return saved === "light"
        ? "light"
        : "dark";
    });

  /* ====================================================
     MONACO
     ==================================================== */

  const editorRef =
    useRef<
      Monaco.editor.IStandaloneCodeEditor | null
    >(null);

  const monacoRef =
    useRef<typeof Monaco | null>(null);

  /* ====================================================
     WEBSOCKET
     ==================================================== */

  const socketRef =
    useRef<WebSocket | null>(null);

  const clientIdRef =
    useRef("");

  /* ====================================================
     REMOTE UPDATE
     ==================================================== */

  const remoteUpdateRef =
    useRef(false);

  /* ====================================================
     REMOTE CURSORS
     ==================================================== */

  const remoteCursorsRef =
    useRef<Map<string, RemoteCursor>>(
      new Map()
    );

  /* ====================================================
     MONACO DECORATIONS
     ==================================================== */

  const cursorDecorationsRef =
    useRef<string[]>([]);

  /* ====================================================
     THEME
     ==================================================== */

  const changeTheme = (
    newTheme: "dark" | "light"
  ) => {
    setTheme(newTheme);

    localStorage.setItem(
      "codesync-theme",
      newTheme
    );
  };

  /* ====================================================
     ROOM
     ==================================================== */

  const handleGenerateRoom = () => {
    setRoomId(generateRoomId());
  };

  /* ====================================================
     JOIN
     ==================================================== */

  const handleJoin = () => {
    const cleanName =
      nameInput.trim();

    let cleanRoom =
      roomId.trim();

    if (!cleanRoom) {
      cleanRoom =
        generateRoomId();

      setRoomId(cleanRoom);
    }

    if (!cleanName) {
      return;
    }

    setJoining(true);

    setJoinedRoom(cleanRoom);
    setName(cleanName);
  };

  /* ====================================================
     CLAMP MONACO POSITION
     ==================================================== */

  const clampPosition = (
    position: CursorPosition,
    model: Monaco.editor.ITextModel
  ): CursorPosition => {
    const maxLine =
      model.getLineCount();

    const lineNumber =
      Math.min(
        Math.max(
          1,
          position.lineNumber
        ),
        maxLine
      );

    const maxColumn =
      model.getLineMaxColumn(
        lineNumber
      );

    const column =
      Math.min(
        Math.max(
          1,
          position.column
        ),
        maxColumn
      );

    return {
      lineNumber,
      column,
    };
  };

  /* ====================================================
     CLAMP SELECTION
     ==================================================== */

  const clampSelection = (
    selection: SelectionPosition,
    model: Monaco.editor.ITextModel
  ): SelectionPosition => {
    const start =
      clampPosition(
        {
          lineNumber:
            selection.startLineNumber,
          column:
            selection.startColumn,
        },
        model
      );

    const end =
      clampPosition(
        {
          lineNumber:
            selection.endLineNumber,
          column:
            selection.endColumn,
        },
        model
      );

    return {
      startLineNumber:
        start.lineNumber,

      startColumn:
        start.column,

      endLineNumber:
        end.lineNumber,

      endColumn:
        end.column,
    };
  };

  /* ====================================================
     UPDATE REMOTE CURSOR DECORATIONS
     ==================================================== */

  const updateRemoteCursorDecorations =
    () => {
      const editor =
        editorRef.current;

      const monaco =
        monacoRef.current;

      if (!editor || !monaco) {
        return;
      }

      const model =
        editor.getModel();

      if (!model) {
        return;
      }

      const decorations: Monaco.editor.IModelDeltaDecoration[] =
        [];

      for (
        const [
          remoteClientId,
          cursor,
        ] of remoteCursorsRef.current
      ) {
        /* ==============================================
           NEVER DISPLAY OUR OWN CURSOR
           ============================================== */

        if (
          remoteClientId ===
          clientIdRef.current
        ) {
          continue;
        }

        /* ==============================================
           SAFE CURSOR POSITION
           ============================================== */

        const safePosition =
          clampPosition(
            cursor.position,
            model
          );

        /* ==============================================
           REMOTE CURSOR
           ============================================== */

        decorations.push({
          range:
            new monaco.Range(
              safePosition.lineNumber,
              safePosition.column,
              safePosition.lineNumber,
              safePosition.column
            ),

          options: {
            /*
             * IMPORTANT:
             * beforeContentClassName renders
             * a real zero-width visual cursor.
             */
            beforeContentClassName:
              "codesync-remote-cursor",

            hoverMessage: {
              value:
                `**${cursor.name}** is here`,
            },

            stickiness:
              monaco.editor
                .TrackedRangeStickiness
                .NeverGrowsWhenTypingAtEdges,

            zIndex: 100,
          },
        });

        /* ==============================================
           REMOTE SELECTION
           ============================================== */

        if (
          cursor.selection
        ) {
          const selection =
            clampSelection(
              cursor.selection,
              model
            );

          const hasSelection =
            selection.startLineNumber !==
              selection.endLineNumber ||
            selection.startColumn !==
              selection.endColumn;

          if (hasSelection) {
            decorations.push({
              range:
                new monaco.Range(
                  selection.startLineNumber,
                  selection.startColumn,
                  selection.endLineNumber,
                  selection.endColumn
                ),

              options: {
                className:
                  "codesync-remote-selection",

                stickiness:
                  monaco.editor
                    .TrackedRangeStickiness
                    .NeverGrowsWhenTypingAtEdges,

                zIndex: 50,
              },
            });
          }
        }
      }

      cursorDecorationsRef.current =
        editor.deltaDecorations(
          cursorDecorationsRef.current,
          decorations
        );
    };

  /* ====================================================
     SEND CURSOR
     ==================================================== */

  const sendCursorPosition = () => {
    const socket =
      socketRef.current;

    const editor =
      editorRef.current;

    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN ||
      !editor
    ) {
      return;
    }

    const position =
      editor.getPosition();

    if (!position) {
      return;
    }

    const selection =
      editor.getSelection();

    socket.send(
      JSON.stringify({
        type:
          "cursor-change",

        position: {
          lineNumber:
            position.lineNumber,

          column:
            position.column,
        },

        selection:
          selection
            ? {
                startLineNumber:
                  selection.startLineNumber,

                startColumn:
                  selection.startColumn,

                endLineNumber:
                  selection.endLineNumber,

                endColumn:
                  selection.endColumn,
              }
            : null,
      })
    );
  };

  /* ====================================================
     CLEAR OWN CURSOR
     ==================================================== */

  const clearOwnCursor = () => {
    const socket =
      socketRef.current;

    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    socket.send(
      JSON.stringify({
        type:
          "cursor-clear",
      })
    );
  };

  /* ====================================================
     EDITOR MOUNT
     ==================================================== */

  const handleEditorMount: OnMount =
    (editor, monaco) => {
      editorRef.current =
        editor;

      monacoRef.current =
        monaco;

      /*
       * Draw remote cursors that may
       * have arrived before Monaco mounted.
       */
      updateRemoteCursorDecorations();

      /* ================================================
         CURSOR POSITION
         ================================================ */

      editor.onDidChangeCursorPosition(
        () => {
          sendCursorPosition();
        }
      );

      /* ================================================
         SELECTION
         ================================================ */

      editor.onDidChangeCursorSelection(
        () => {
          sendCursorPosition();
        }
      );

      /* ================================================
         FOCUS
         ================================================ */

      editor.onDidFocusEditorText(
        () => {
          sendCursorPosition();
        }
      );

      /* ================================================
         BLUR
         ================================================ */

      editor.onDidBlurEditorText(
        () => {
          clearOwnCursor();
        }
      );

      /* ================================================
         CONTENT CHANGE
         ================================================ */

      editor.onDidChangeModelContent(
        () => {
          /*
           * Re-render remote cursors after
           * the document changes.
           */
          window.requestAnimationFrame(
            () => {
              updateRemoteCursorDecorations();
            }
          );
        }
      );
    };

  /* ====================================================
     WEBSOCKET CONNECTION
     ==================================================== */

  useEffect(() => {
    if (
      !name ||
      !joinedRoom
    ) {
      return;
    }

    /*
     * Clear previous cursor state
     * before opening a new connection.
     */
    remoteCursorsRef.current.clear();

    const socket =
      new WebSocket(
        WS_URL
      );

    socketRef.current =
      socket;

    socket.onopen = () => {
      console.log(
        "CodeSync WebSocket connected"
      );

      setConnected(true);
      setJoining(false);

      /*
       * IMPORTANT:
       * roomId is sent to the server.
       */
      socket.send(
        JSON.stringify({
          type:
            "join",

          name,

          roomId:
            joinedRoom,
        })
      );
    };

    socket.onmessage = (
      event
    ) => {
      try {
        const message =
          JSON.parse(
            event.data
          ) as ServerMessage;

        /* ==============================================
           CONNECTED
           ============================================== */

        if (
          message.type ===
          "connected"
        ) {
          if (
            message.clientId
          ) {
            clientIdRef.current =
              message.clientId;

            /*
             * Now that our own ID is known,
             * make sure our cursor cannot
             * accidentally be rendered remotely.
             */
            updateRemoteCursorDecorations();
          }

          return;
        }

        /* ==============================================
           INITIAL STATE
           ============================================== */

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

                updateRemoteCursorDecorations();
              },
              0
            );
          }

          setUsers(
            message.users ??
              []
          );

          return;
        }

        /* ==============================================
           CODE CHANGE
           ============================================== */

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

          setOutput(
            "Code changed by a collaborator.\n\nTerminal cleared.\nClick Run to execute the latest code."
          );

          setRunning(
            false
          );

          window.setTimeout(
            () => {
              remoteUpdateRef.current =
                false;

              updateRemoteCursorDecorations();
            },
            0
          );

          return;
        }

        /* ==============================================
           USERS
           ============================================== */

        if (
          message.type ===
          "users"
        ) {
          setUsers(
            message.users ??
              []
          );

          return;
        }

        /* ==============================================
           REMOTE CURSOR
           ============================================== */

        if (
          message.type ===
          "cursor-change"
        ) {
          if (
            !message.senderId ||
            !message.position
          ) {
            return;
          }

          /*
           * Never store our own cursor
           * as a remote cursor.
           */
          if (
            message.senderId ===
            clientIdRef.current
          ) {
            return;
          }

          remoteCursorsRef.current.set(
            message.senderId,
            {
              name:
                message.name ??
                "Collaborator",

              position:
                message.position,

              selection:
                message.selection ??
                null,
            }
          );

          updateRemoteCursorDecorations();

          return;
        }

        /* ==============================================
           REMOTE CURSOR CLEAR
           ============================================== */

        if (
          message.type ===
          "cursor-clear"
        ) {
          if (
            message.senderId
          ) {
            remoteCursorsRef.current.delete(
              message.senderId
            );
          }

          updateRemoteCursorDecorations();

          return;
        }

        /* ==============================================
           RUN RESULT
           ============================================== */

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
            "$ python main.py\n\n";

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
              result.exitCode ??
              0
            }`;

          setOutput(
            terminalOutput
          );

          setRunning(
            false
          );

          return;
        }

        /* ==============================================
           SERVER ERROR
           ============================================== */

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

          setRunning(
            false
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
      setJoining(false);

      remoteCursorsRef.current.clear();

      updateRemoteCursorDecorations();
    };

    socket.onerror = (
      error
    ) => {
      console.error(
        "WebSocket error:",
        error
      );

      setConnected(false);
      setJoining(false);
    };

    return () => {
      /*
       * Only clear the cursor if this
       * socket is still the active socket.
       */
      if (
        socketRef.current ===
        socket
      ) {
        if (
          socket.readyState ===
          WebSocket.OPEN
        ) {
          socket.send(
            JSON.stringify({
              type:
                "cursor-clear",
            })
          );
        }

        socket.close();

        socketRef.current =
          null;
      }

      remoteCursorsRef.current.clear();

      if (
        editorRef.current
      ) {
        editorRef.current.deltaDecorations(
          cursorDecorationsRef.current,
          []
        );

        cursorDecorationsRef.current =
          [];
      }
    };
  }, [
    name,
    joinedRoom,
  ]);

  /* ====================================================
     CODE CHANGE
     ==================================================== */

  const handleCodeChange: OnChange =
    (value) => {
      const newCode =
        value ?? "";

      setCode(
        newCode
      );

      /*
       * Do not rebroadcast code that
       * came from another collaborator.
       */
      if (
        remoteUpdateRef.current
      ) {
        return;
      }

      setOutput(
        "Code modified.\n\nTerminal cleared.\nClick Run to execute the latest code."
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
            type:
              "code-change",

            code:
              newCode,
          })
        );
      }
    };

  /* ====================================================
     RUN
     ==================================================== */

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

    setTerminalOpen(
      true
    );

    setRunning(
      true
    );

    setOutput(
      "$ python main.py\n\nRunning..."
    );

    socket.send(
      JSON.stringify({
        type:
          "run",
      })
    );
  };

  /* ====================================================
     SHARE
     ==================================================== */

  const handleShare =
    async () => {
      try {
        const url =
          `${window.location.origin}/?room=${encodeURIComponent(
            joinedRoom
          )}`;

        await navigator.clipboard.writeText(
          url
        );

        setCopied(
          true
        );

        window.setTimeout(
          () => {
            setCopied(
              false
            );
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

  /* ====================================================
     LOGIN SCREEN
     ==================================================== */

  if (!name) {
    return (
      <div className="join-screen">
        <div className="joining-status">
          <span className="status-spinner" />

          {joining
            ? "Joining room..."
            : "Ready to collaborate"}
        </div>

        <div className="green-corner" />

        <div className="join-layout">
          <section className="join-visual">
            <div className="illustration-glow" />

            <img
              src="/codesync-collaboration.png"
              alt="Developers collaborating"
              className="collaboration-image"
            />
          </section>

          <section className="join-content">
            <div className="brand-large">
              <div className="brand-icon">
                <Code2 size={34} />
              </div>

              <div className="brand-text">
                <div className="brand-name">
                  <span>
                    Code
                  </span>

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

            <div className="join-form">
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
                      event.key ===
                      "Enter"
                    ) {
                      handleJoin();
                    }
                  }}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>

              <button
                className="join-button"
                onClick={
                  handleJoin
                }
                disabled={
                  !nameInput.trim()
                }
              >
                <span>
                  Join
                </span>
              </button>

              <button
                className="generate-room"
                onClick={
                  handleGenerateRoom
                }
              >
                <Sparkles
                  size={17}
                />

                <span>
                  Generate Unique Room
                  <br />
                  Id
                </span>
              </button>
            </div>

            <div className="join-description">
              Collaborate on code in
              real-time with your team.
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* ====================================================
     MAIN IDE
     ==================================================== */

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
              {joinedRoom}
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
        {/* ==================================================
            SIDEBAR
            ================================================== */}

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
            <button className="file active">
              <FileCode2 size={14} />

              main.py
            </button>
          </div>
        </aside>

        {/* ==================================================
            EDITOR
            ================================================== */}

        <main className="editor">
          <div className="editor-header">
            <div className="tab">
              <FileCode2 size={14} />

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
              theme={
                theme === "light"
                  ? "vs"
                  : "vs-dark"
              }
              value={code}
              onChange={
                handleCodeChange
              }
              onMount={
                handleEditorMount
              }
              options={{
                minimap: {
                  enabled:
                    false,
                },

                fontSize:
                  14,

                lineNumbers:
                  "on",

                automaticLayout:
                  true,

                padding: {
                  top: 15,
                },

                scrollBeyondLastLine:
                  false,

                tabSize:
                  4,

                wordWrap:
                  "on",

                smoothScrolling:
                  true,

                cursorBlinking:
                  "smooth",

                renderWhitespace:
                  "selection",

                cursorSmoothCaretAnimation:
                  "on",
              }}
            />
          </div>

          {/* ==================================================
              TERMINAL
              ================================================== */}

          {terminalOpen && (
            <div
              className={`terminal ${
                theme === "light"
                  ? "terminal-light"
                  : "terminal-dark"
              }`}
            >
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

        {/* ==================================================
            RIGHT COLLABORATORS PANEL
            ================================================== */}

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
                key={user.id}
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
            Room:{" "}
            {joinedRoom}
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
                  {joinedRoom}
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
              <div>
                <strong>
                  Editor Theme
                </strong>

                <span>
                  {theme ===
                  "dark"
                    ? "Dark"
                    : "Light"}
                </span>
              </div>

              <div className="theme-buttons">
                <button
                  className={
                    theme ===
                    "dark"
                      ? "theme-active"
                      : ""
                  }
                  onClick={() =>
                    changeTheme(
                      "dark"
                    )
                  }
                >
                  <Moon
                    size={14}
                  />

                  Dark
                </button>

                <button
                  className={
                    theme ===
                    "light"
                      ? "theme-active"
                      : ""
                  }
                  onClick={() =>
                    changeTheme(
                      "light"
                    )
                  }
                >
                  <Sun
                    size={14}
                  />

                  Light
                </button>
              </div>
            </div>

            <div className="setting-row">
              <button
                className="copy-room"
                onClick={
                  handleShare
                }
              >
                {copied ? (
                  <Check
                    size={14}
                  />
                ) : (
                  <Copy
                    size={14}
                  />
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
