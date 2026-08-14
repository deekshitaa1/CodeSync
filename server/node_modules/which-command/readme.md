# which-command

> Find the absolute path to a command's executable, like the Unix [`which`](https://en.wikipedia.org/wiki/Which_(command)) command

Useful for locating an executable in `PATH` before spawning it, checking whether a tool is installed, or building your own CLI tooling.

Works cross-platform, including Windows `PATHEXT` handling and App Execution Aliases.

## Install

```sh
npm install which-command
```

## Usage

```js
import {whichCommand, whichCommandSync, whichCommandAll} from 'which-command';

await whichCommand('node');
//=> '/usr/local/bin/node'

await whichCommand('does-not-exist');
//=> undefined

whichCommandSync('node');
//=> '/usr/local/bin/node'

await whichCommandAll('node');
//=> ['/usr/local/bin/node', '/opt/homebrew/bin/node']
```

## API

### whichCommand(command, options?)

Returns a `Promise` for the absolute path to the first matching executable, or `undefined` if not found.

### whichCommandSync(command, options?)

Same as `whichCommand()`, but synchronous.

### whichCommandAll(command, options?)

Returns a `Promise` for an array of the absolute paths to all matching executables in `PATH` order, or an empty array if none are found. Like `which -a`.

### whichCommandAllSync(command, options?)

Same as `whichCommandAll()`, but synchronous.

#### command

Type: `string`

The command name to look for, or a path to check directly.

If it contains a directory separator (like `./foo` or `/usr/bin/foo`), it's resolved directly instead of being searched for in `PATH`.

#### options

Type: `object`

##### cwd

Type: `string`\
Default: [`process.cwd()`](https://nodejs.org/api/process.html#processcwd)

The directory to resolve relative paths against.

Relative `path` entries and commands that contain a directory separator are resolved against this. On Windows, this directory is also searched before `PATH`.

##### path

Type: `string`\
Default: [`process.env.PATH`](https://en.wikipedia.org/wiki/PATH_(variable))

The `PATH` to search.

Empty entries are ignored. Unlike a POSIX shell, an empty entry is not treated as the current directory, since implicitly searching the current directory is a security risk.

##### pathExt

Type: `string`\
Default: `process.env.PATHEXT`

The executable file extensions to look for, as a `;`-separated string.

Only used on Windows. Corresponds to the [`PATHEXT`](https://learn.microsoft.com/en-us/previous-versions/office/developer/sharepoint-2010/ee537574(v=office.14)) environment variable.

## CLI

```sh
$ npx which-command --help

  Usage
    $ which-command <command> …

  Options
    --all, -a     List all matching paths, not just the first
    --silent, -s  Suppress output; the exit code still reflects whether all commands were found

  Examples
    $ which-command node
    /usr/local/bin/node

    $ which-command --all node
    /usr/local/bin/node
    /opt/homebrew/bin/node

  Exits with code 1 if any of the commands could not be found.
```

## FAQ

### How is it better than the [`which`](https://github.com/npm/node-which) package?

- Returns `undefined` when a command is not found, instead of throwing.
- `whichCommandAll()` deduplicates results, so duplicate `PATH` entries don't produce duplicate matches.
- Safer by default: empty `PATH` entries are ignored instead of implicitly searching the current directory.
- Finds Windows App Execution Aliases (like the `python` and `winget` stubs in `WindowsApps`), which `which` skips.
- Modern: pure ESM with bundled TypeScript types.
