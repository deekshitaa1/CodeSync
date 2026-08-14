import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const isWindows = process.platform === 'win32';

// A command containing a directory separator is treated as a path and looked up directly, instead of being searched for in `PATH`. Backslash only counts as a separator on Windows, since it's a valid filename character on other platforms.
const separatorPattern = isWindows ? /[\/\\]/v : /\//v;

// The standard Windows executable extensions, used when `PATHEXT` is not set.
const defaultPathExt = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC';

function resolveOptions(command, options) {
	if (typeof command !== 'string' || command.length === 0) {
		throw new TypeError('Expected a non-empty string.');
	}

	const {
		cwd = process.cwd(),
		// On Windows, `process.env.PATH` can be undefined in some contexts (for example, worker threads), where it's only exposed as `Path`.
		path: searchPath = process.env.PATH ?? (isWindows ? process.env.Path : undefined) ?? '',
		// `||` (not `??`) so an empty `PATHEXT` falls back to the default instead of disabling all lookup on Windows.
		pathExt = process.env.PATHEXT || defaultPathExt,
	} = options;

	return {cwd, searchPath, pathExt};
}

function windowsExtensions(command, pathExt) {
	const extensions = pathExt.split(path.delimiter).filter(Boolean);
	const commandExtension = path.extname(command).toLowerCase();

	// If the command already ends with a known executable extension, also try it verbatim.
	if (commandExtension !== '' && extensions.some(extension => extension.toLowerCase() === commandExtension)) {
		return ['', ...extensions];
	}

	return extensions;
}

function * candidatePaths(command, {cwd, searchPath, pathExt}) {
	const extensions = isWindows ? windowsExtensions(command, pathExt) : [''];

	if (separatorPattern.test(command)) {
		const base = path.resolve(cwd, command);
		for (const extension of extensions) {
			yield base + extension;
		}

		return;
	}

	const directories = [
		// Windows searches the current directory before `PATH`.
		...(isWindows ? [cwd] : []),
		...searchPath.split(path.delimiter),
	];

	for (const directory of directories) {
		// `PATH` entries can be wrapped in double quotes on Windows.
		const unquoted = isWindows && directory.length > 1 && directory.startsWith('"') && directory.endsWith('"') ? directory.slice(1, -1) : directory;

		// Skip empty entries. Unlike a POSIX shell, an empty entry is not treated as the current directory, since implicitly searching the current directory is a security risk. Checked after unquoting so a quoted-empty entry (`""`) is skipped too.
		if (unquoted === '') {
			continue;
		}

		const base = path.resolve(cwd, unquoted, command);
		for (const extension of extensions) {
			yield base + extension;
		}
	}
}

async function isExecutable(filePath) {
	let stats;
	try {
		stats = await fsPromises.stat(filePath);
	} catch (error) {
		// Windows App Execution Aliases (in `WindowsApps`) throw `EACCES` on `stat`, but are valid, launchable executables.
		return isWindows && error.code === 'EACCES';
	}

	// A directory can have the executable bit set, but it's not a command.
	if (!stats.isFile()) {
		return false;
	}

	// On Windows, executability is determined by the file extension, which is already validated against `PATHEXT`.
	if (isWindows) {
		return true;
	}

	try {
		await fsPromises.access(filePath, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function isExecutableSync(filePath) {
	let stats;
	try {
		stats = fs.statSync(filePath);
	} catch (error) {
		return isWindows && error.code === 'EACCES';
	}

	if (!stats.isFile()) {
		return false;
	}

	if (isWindows) {
		return true;
	}

	try {
		fs.accessSync(filePath, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export async function whichCommand(command, options = {}) {
	const resolved = resolveOptions(command, options);

	for (const candidate of candidatePaths(command, resolved)) {
		// Checked sequentially so the first match in `PATH` order wins and the search can short-circuit.
		if (await isExecutable(candidate)) { // eslint-disable-line no-await-in-loop
			return candidate;
		}
	}

	return undefined;
}

export function whichCommandSync(command, options = {}) {
	const resolved = resolveOptions(command, options);

	for (const candidate of candidatePaths(command, resolved)) {
		if (isExecutableSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

export async function whichCommandAll(command, options = {}) {
	const resolved = resolveOptions(command, options);
	const candidates = [...candidatePaths(command, resolved)];
	const matches = await Promise.all(candidates.map(async candidate => (await isExecutable(candidate)) ? candidate : undefined));
	return [...new Set(matches.filter(Boolean))];
}

export function whichCommandAllSync(command, options = {}) {
	const resolved = resolveOptions(command, options);
	const found = [];

	for (const candidate of candidatePaths(command, resolved)) {
		if (isExecutableSync(candidate)) {
			found.push(candidate);
		}
	}

	return [...new Set(found)];
}
