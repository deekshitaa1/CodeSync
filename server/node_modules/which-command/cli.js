#!/usr/bin/env node
import process from 'node:process';
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {whichCommand, whichCommandAll} from './index.js';

const help = `
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
`;

let flags;
let commands;
try {
	({values: flags, positionals: commands} = parseArgs({
		allowPositionals: true,
		options: {
			all: {type: 'boolean', short: 'a', default: false},
			silent: {type: 'boolean', short: 's', default: false},
			help: {type: 'boolean', short: 'h', default: false},
			version: {type: 'boolean', default: false},
		},
	}));
} catch (error) {
	console.error(error.message);
	process.exit(1);
}

if (flags.version) {
	const {version} = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));
	console.log(version);
	process.exit(0);
}

if (flags.help) {
	console.log(help);
	process.exit(0);
}

if (commands.length === 0) {
	console.error(help);
	process.exit(1);
}

let allFound = true;
for (const command of commands) {
	// eslint-disable-next-line no-await-in-loop
	const paths = flags.all ? await whichCommandAll(command) : [await whichCommand(command)].filter(Boolean);

	if (paths.length === 0) {
		allFound = false;
		continue;
	}

	if (!flags.silent) {
		console.log(paths.join('\n'));
	}
}

process.exit(allFound ? 0 : 1);
