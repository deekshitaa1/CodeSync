export type Options = {
	/**
	The directory to resolve relative paths against.

	Relative `path` entries and commands that contain a directory separator are resolved against this. On Windows, this directory is also searched before `PATH`.

	@default process.cwd()
	*/
	readonly cwd?: string;

	/**
	The `PATH` to search.

	Empty entries are ignored. Unlike a POSIX shell, an empty entry is not treated as the current directory, since implicitly searching the current directory is a security risk.

	@default process.env.PATH
	*/
	readonly path?: string;

	/**
	The executable file extensions to look for, as a `;`-separated string.

	Only used on Windows. Corresponds to the `PATHEXT` environment variable.

	@default process.env.PATHEXT
	*/
	readonly pathExt?: string;
};

/**
Find the absolute path to a command's executable, like the Unix `which` command.

@param command - The command name to look for, or a path to check directly. If it contains a directory separator (like `./foo` or `/usr/bin/foo`), it's resolved directly instead of being searched for in `PATH`.
@returns The absolute path to the first matching executable, or `undefined` if not found.

@example
```
import {whichCommand} from 'which-command';

await whichCommand('node');
//=> '/usr/local/bin/node'

await whichCommand('does-not-exist');
//=> undefined
```
*/
export function whichCommand(command: string, options?: Options): Promise<string | undefined>;

/**
Find the absolute path to a command's executable, like the Unix `which` command.

Same as {@link whichCommand}, but synchronous.

@param command - The command name to look for, or a path to check directly. If it contains a directory separator (like `./foo` or `/usr/bin/foo`), it's resolved directly instead of being searched for in `PATH`.
@returns The absolute path to the first matching executable, or `undefined` if not found.

@example
```
import {whichCommandSync} from 'which-command';

whichCommandSync('node');
//=> '/usr/local/bin/node'
```
*/
export function whichCommandSync(command: string, options?: Options): string | undefined;

/**
Find the absolute paths to all of a command's executables in `PATH` order, like `which -a`.

@param command - The command name to look for, or a path to check directly. If it contains a directory separator (like `./foo` or `/usr/bin/foo`), it's resolved directly instead of being searched for in `PATH`.
@returns An array of the absolute paths to all matching executables in `PATH` order, or an empty array if none are found.

@example
```
import {whichCommandAll} from 'which-command';

await whichCommandAll('node');
//=> ['/usr/local/bin/node', '/opt/homebrew/bin/node']
```
*/
export function whichCommandAll(command: string, options?: Options): Promise<string[]>;

/**
Find the absolute paths to all of a command's executables in `PATH` order, like `which -a`.

Same as {@link whichCommandAll}, but synchronous.

@param command - The command name to look for, or a path to check directly. If it contains a directory separator (like `./foo` or `/usr/bin/foo`), it's resolved directly instead of being searched for in `PATH`.
@returns An array of the absolute paths to all matching executables in `PATH` order, or an empty array if none are found.

@example
```
import {whichCommandAllSync} from 'which-command';

whichCommandAllSync('node');
//=> ['/usr/local/bin/node', '/opt/homebrew/bin/node']
```
*/
export function whichCommandAllSync(command: string, options?: Options): string[];
