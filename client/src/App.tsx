import { useState } from "react";
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
} from "lucide-react";
import "./App.css";

type FileItem = {
  name: string;
  language: string;
  content: string;
};

function App() {
  const [activeFile, setActiveFile] = useState("main.js");
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);

  const [output, setOutput] = useState(
    "CodeSync terminal ready.\nRun your JavaScript file to see output."
  );

  const [files, setFiles] = useState<FileItem[]>([
    {
      name: "main.js",
      language: "javascript",
      content: `function hello() {
  console.log("Hello from CodeSync!");
}

hello();`,
    },
    {
      name: "index.js",
      language: "javascript",
      content: `import { hello } from "./utils.js";

hello();`,
    },
    {
      name: "utils.js",
      language: "javascript",
      content: `export function hello() {
  console.log("Hello from CodeSync!");
}`,
    },
  ]);

  const currentFile = files.find(
    (file) => file.name === activeFile
  );

  /* -----------------------------
     EDITOR
  ----------------------------- */

  const updateCode = (value: string | undefined) => {
    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.name === activeFile
          ? {
              ...file,
              content: value ?? "",
            }
          : file
      )
    );
  };

  /* -----------------------------
     SHARE ROOM
  ----------------------------- */

  const handleShare = async () => {
    const url = window.location.href;

    try {
      await navigator.clipboard.writeText(url);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      window.prompt(
        "Copy this CodeSync room URL:",
        url
      );
    }
  };

  /* -----------------------------
     RUN CODE
  ----------------------------- */

  const handleRun = () => {
    setTerminalOpen(true);

    if (activeFile === "main.js") {
      setOutput(
        `$ node ${activeFile}

Hello from CodeSync!

✓ Process exited with code 0`
      );

      return;
    }

    setOutput(
      `$ node ${activeFile}

▶ Running ${activeFile}...

✓ Code loaded successfully`
    );
  };

  return (
    <div className="app">

      {/* =================================
          TOP BAR
      ================================= */}

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
            <span className="status-dot" />
            Connected
          </div>

          <div className="room">
            Room:
            <strong>demo</strong>
          </div>

          <button
            className="share-button"
            onClick={handleShare}
          >
            {copied ? (
              <Check size={15} />
            ) : (
              <Share2 size={15} />
            )}

            {copied ? "Copied" : "Share"}
          </button>

          <button
            className="icon-button"
            onClick={() =>
              setShowSettings(true)
            }
            title="Settings"
          >
            <Settings size={17} />
          </button>

        </div>

      </header>


      {/* =================================
          WORKSPACE
      ================================= */}

      <div className="workspace">


        {/* =================================
            LEFT EXPLORER
        ================================= */}

        <aside className="sidebar">

          <div className="sidebar-title">
            EXPLORER
          </div>

          <div className="folder">
            <Folder size={15} />
            <span>src</span>
          </div>

          <div className="files">

            {files.map((file) => (

              <button
                key={file.name}
                className={`file ${
                  activeFile === file.name
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setActiveFile(file.name)
                }
              >

                <FileCode2 size={14} />

                {file.name}

              </button>

            ))}

          </div>

        </aside>


        {/* =================================
            MAIN EDITOR
        ================================= */}

        <main className="editor">


          {/* EDITOR HEADER */}

          <div className="editor-header">

            <div className="tab">

              <FileCode2 size={14} />

              {activeFile}

            </div>


            <button
              className="run-button"
              onClick={handleRun}
            >

              <Play size={14} />

              Run

            </button>

          </div>


          {/* MONACO EDITOR */}

          <div className="monaco-container">

            <Editor
              height="100%"
              language={
                currentFile?.language ??
                "javascript"
              }
              theme="vs-dark"
              value={
                currentFile?.content ?? ""
              }
              onChange={updateCode}
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

                tabSize: 2,

                wordWrap: "on",

                smoothScrolling: true,

                cursorBlinking: "smooth",

                renderWhitespace: "selection",
              }}
            />

          </div>


          {/* =================================
              TERMINAL
          ================================= */}

          {terminalOpen && (

            <div className="terminal">

              <div className="terminal-header">

                <div>

                  <Terminal size={14} />

                  TERMINAL

                </div>

                <button
                  className="terminal-close"
                  onClick={() =>
                    setTerminalOpen(false)
                  }
                  title="Close terminal"
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


        {/* =================================
            RIGHT COLLABORATORS
        ================================= */}

        <aside className="right-panel">

          <div className="right-header">

            <Users size={16} />

            <span>
              Collaborators
            </span>

            <span className="user-count">
              1
            </span>

          </div>


          <div className="collaborator">

            <div className="avatar">
              D
            </div>

            <div className="user-info">

              <strong>
                Deekshita
              </strong>

              <span>
                You
              </span>

            </div>

            <span className="online" />

          </div>

        </aside>

      </div>


      {/* =================================
          FOOTER
      ================================= */}

      <footer>

        <div className="footer-left">

          <span className="footer-connected">
            ● Connected
          </span>

          <span>
            main
          </span>

        </div>


        <div className="footer-right">

          <span>
            JavaScript
          </span>

          <span>
            UTF-8
          </span>

          <span>
            Ln 1, Col 1
          </span>

        </div>

      </footer>


      {/* =================================
          SETTINGS MODAL
      ================================= */}

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

            <div className="settings-header">

              <h2>
                CodeSync Settings
              </h2>

              <button
                onClick={() =>
                  setShowSettings(false)
                }
                title="Close settings"
              >

                <X size={17} />

              </button>

            </div>


            <div className="setting-row">

              <div>

                <strong>
                  Editor Theme
                </strong>

                <span>
                  VS Dark
                </span>

              </div>

            </div>


            <div className="setting-row">

              <div>

                <strong>
                  Language
                </strong>

                <span>
                  JavaScript
                </span>

              </div>

            </div>


            <div className="setting-row">

              <div>

                <strong>
                  Room
                </strong>

                <span>
                  demo
                </span>

              </div>


              <button
                className="copy-room"
                onClick={handleShare}
              >

                {copied ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )}

                {copied
                  ? "Copied"
                  : "Copy"}

              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default App;
