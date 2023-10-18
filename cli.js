#!/usr/bin/env node

// ConfSync CLI
// See: https://github.com/jhuckaby/confsync
// Copyright (c) 2023 Joseph Huckaby, MIT License

const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const Path = require('path');
const cli = require('pixl-cli');
const Tools = require('pixl-tools');
const highlight = require('cli-highlight').highlight;
const Diff = require('diff');
const JSON5 = require('json5');
const ConfSync = require('.');

cli.global();

// coerce true/false into booleans
for (var key in cli.args) {
	if (cli.args[key] === 'true') cli.args[key] = true;
	else if (cli.args[key] === 'false') cli.args[key] = false;
}

// allow args to be dot.path.syntax
var args = {};
for (var key in cli.args) {
	Tools.setPath( args, key, cli.args[key] );
}

if (!args.other || !args.other.length || args.help || args.h) args.other = ['help'];
var cmd = args.other.shift().toLowerCase();

var USERNAME = process.env.CONFSYNC_username || process.env.SUDO_USER || process.env.USER || process.env.USERNAME || '';
var DATE_FMT = '[yyyy]/[mm]/[dd] [hour12]:[mi] [AMPM]';

var CMD_HELP_TEXT = {
	docs: "confsync docs",
	list: "confsync list",
	addGroup: "confsync group add GROUP_ID --title 'YOUR GROUP TITLE' --env.HOSTNAME 'REGEXP'",
	updateGroup: "confsync group update GROUP_ID --title 'NEW GROUP TITLE' --env.HOSTNAME 'REGEXP'",
	deleteGroup: "confsync group delete GROUP_ID",
	getGroup: "confsync group get GROUP_ID",
	add: "confsync add FILE_ID --title 'YOUR CONFIG TITLE' --dest /path/to/your/config.json",
	update: "confsync update FILE_ID --title 'NEW CONFIG TITLE' --mode 644 --uid root",
	delete: "confsync delete FILE_ID",
	file: "confsync info FILE_ID",
	push: "confsync push FILE_ID LOCAL_FILE --message 'YOUR MESSAGE'",
	clone: "confsync clone FILE_ID --base.YOUR.KEY NEW_VALUE --message 'YOUR MESSAGE'",
	deploy: "confsync deploy FILE_ID --rev REVISION",
	history: "confsync history FILE_ID",
	histPaginate: "confsync history FILE_ID --page 2",
	get: "confsync get FILE_ID REVISION",
	diff: "confsync diff FILE_ID REVISION1 REVISION2"
};
var CMD_HELP_LABELS = {
	docs: "Show documentation",
	list: "List all groups and files",
	addGroup: "Add new group",
	updateGroup: "Update group",
	deleteGroup: "Delete group",
	getGroup: "Show group info",
	add: "Add new config file",
	update: "Update config file",
	delete: "Delete config file",
	file: "Show config file info",
	push: "Push new file revision",
	clone: "Clone file revision",
	deploy: "Deploy file revision live",
	history: "Show file revision history",
	histPaginate: "Paginate through results",
	get: "Show single file revision",
	diff: "Diff two file revisions"
};

if (!USERNAME) {
	var user_info = Tools.getpwnam( process.uid );
	if (user_info && user_info.username) USERNAME = user_info.username;
}

var app = {
	
	async run() {
		// main entry point
		var self = this;
		
		this.confsync = new ConfSync();
		this.version = this.confsync.version;
		this.config = this.confsync.config;
		this.logger = this.confsync.logger;
		
		if (args.debug) this.logger.set('debugLevel', 9);
		if (args.debug || args.echo) this.logger.set('echo', true);
		
		// optionally disable all ANSI color
		if (("color" in args) && !args.color) {
			cli.chalk.enabled = false;
		}
		if (("color" in this.config) && !this.config.color) {
			cli.chalk.enabled = false;
		}
		
		delete args.debug;
		delete args.echo;
		delete args.color;
		
		print("\n");
		print( "🔄 " + bold.magenta("ConfSync CLI ") + magenta("v" + this.version) + "\n" );
		
		if (this.config.Storage.engine == 'S3') {
			var aws = this.config.Storage.AWS;
			var s3 = this.config.Storage.S3;
			print( gray.bold("S3: ") + gray( s3.params.Bucket + '/' + s3.keyPrefix ) + gray(" (" + aws.region + ")") + "\n" );
		}
		else {
			print( gray.bold(this.config.Storage.engine + ": ") + gray( JSON.stringify( this.config.Storage[this.config.Storage.engine] ) ) + "\n" );
		}
		
		this.writePIDFile();
		
		if (!this['cmd_' + cmd]) {
			// allow user to swap first two args, if 2nd is known command
			if (this['cmd_' + args.other[0]]) {
				var new_cmd = args.other[0];
				args.other[0] = cmd;
				cmd = new_cmd;
			}
			else this.die("Unknown command: " + cmd, "Available Commands: help, list, group, add, update, delete, file, push, clone, deploy, history, get, diff\n\n");
		}
		
		// initialize
		await this.confsync.startup();
		
		// hook transactions to print success message
		this.confsync.on('transaction', function(code, msg, data) {
			if (!data) data = {};
			if (!data.text) data.text = code + ": " + msg;
			self.success( data.text );
		});
		
		// go go go
		await this['cmd_' + cmd]();
		
		this.deletePIDFile();
		
		// always end with empty line
		print("\n");
	},
	
	die(msg, extra = "") {
		// colorful die
		this.deletePIDFile();
		if ((typeof(msg) == 'object') && msg.message) msg = msg.message;
		die( "\n❌ " + red.bold("ERROR: ") + yellow.bold(msg) + "\n\n" + extra );
	},
	
	usage(text) {
		if (CMD_HELP_TEXT[text]) text = CMD_HELP_TEXT[text];
		return yellow.bold("Usage: ") + green(text.trim()) + "\n\n";
	},
	
	dieUsage(text) {
		this.deletePIDFile();
		die( "\n" + this.usage(text) );
	},
	
	success(msg) {
		// print colorful success message
		msg = this.markdown(msg);
		print( "\n✅ " + green.bold("Success: ") + green(msg) + "\n" );
	},
	
	markdown(text) {
		// poor man's markdown-to-ANSI-color
		text = text.toString();
		
		// HTML removal, spacing cleanup
		text = text.replace(/<details>[\s\S]*?<\/details>/g, '');
		text = text.replace(/<.+?>/g, '').replace(/^[^\#]+\#/, '#').trim();
		text = text.replace(/\n{3,}/g, "\n\n");
		
		// links
		text = text.replace( /\[(.+?)\]\((.+?)\)/g, function(m_all, m_g1, m_g2) {
			return '' + cyan.bold.underline(m_g2) + '';
		} );
		
		// headings
		text = text.replace( /(^|\n)(\#+)\s*([^\n]+)/g, function(m_all, m_g1, m_g2, m_g3) {
			return m_g1 + gray(m_g2) + ' ' + magenta.bold(m_g3);
		} );
		
		// code blocks
		text = text.replace( /(\n\`\`\`)(\w+)\n([\S\s]+?)(\n\`\`\`)/g, function(m_all, m_g1, m_g2, m_g3, m_g4) {
			return "\n" + gray( highlight(m_g3).trim() );
		});
		text = text.replace( /(\n\`\`\`\n)([\S\s]+?)(\n\`\`\`)/g, function(m_all, m_g1, m_g2, m_g3, m_g4) {
			return "\n" + gray( m_g2.trim() );
		});
		
		// lists
		text = text.replace( /\n(\t*\-) ([^\n]+)/g, function(m_all, m_g1, m_g2) {
			return "\n" + yellow.bold(m_g1) + ' ' + cyan(m_g2);
		});
		
		// tables
		text = text.replace( /\n(\|)([^\n]+)/g, function(m_all, m_g1, m_g2) {
			var cols = m_g2.replace(/\|\s*$/, '').split(/\s+\|\s+/).map( function(col) { return yellow(col.trim()); } );
			return "\n" + gray.bold('| ') + cols.join( gray.bold(' | ') ) + gray.bold(' |');
		});
		
		// inline formatting
		text = text.replace( /\`(.+?)\`/g, function(m_all, m_g1) {
			return '`' + cyan.bold(m_g1) + '`';
		} );
		text = text.replace( /\*\*(.+?)\*\*/g, function(m_all, m_g1) {
			return '' + yellow.bold(m_g1) + '';
		} );
		text = text.replace( /\*(.+?)\*/g, function(m_all, m_g1) {
			return '' + yellow(m_g1) + '';
		} );
		
		return text;
	},
	
	ellipsis(text, max_len) {
		// add ellipsis to text if over N length
		text = '' + text;
		if (cli.stringWidth(text) >= max_len) {
			return text.substring(0, max_len - 1) + '…';
		}
		else return text;
	},
	
	writePIDFile() {
		// only one copy of CLI should run at one time
		this.pidFile = Path.join( os.tmpdir(), 'confsync-cli.pid' );
		
		if (fs.existsSync(this.pidFile)) {
			var pid = parseInt( fs.readFileSync( this.pidFile, 'utf8' ) );
			var running = false;
			
			try { process.kill(pid, 0); running = true; } catch(e) {;}
			
			if (running) {
				this.die("Another copy of ConfSync CLI is running at PID " + pid + ".");
			}
		}
		
		fs.writeFileSync( this.pidFile, '' + process.pid );
	},
	
	deletePIDFile() {
		// we done
		if (this.pidFile) {
			try { fs.unlinkSync(this.pidFile); } catch (e) {;}
		}
	},
	
	printSuggestedCommands(cmds) {
		// show suggested commands
		if (!this.config.cmd_suggest) return;
		
		println( "\n" + bold.gray("Other Command Suggestions:") );
		
		cmds.forEach( function(cmd) {
			var label = CMD_HELP_LABELS[cmd];
			var text = CMD_HELP_TEXT[cmd];
			println( gray(label + ': ') + gray(text) );
		} );
	},
	
	checkSupportedParams(req, params, cmd) {
		// make sure specified params are all known
		for (var key in req) {
			if (!params.includes(key) && key.match(/^\w+$/)) this.die("Unknown command-line argument: " + key, this.usage(cmd));
		}
	},
	
	//
	// Commands:
	//
	
	async cmd_help() {
		// show quick help, also link to readme
		['docs', 'list', 'getGroup', 'addGroup', 'updateGroup', 'deleteGroup', 'file', 'get', 'history', 'diff', 'push', 'clone', 'deploy'].forEach( function(cmd) {
			var label = CMD_HELP_LABELS[cmd];
			var text = CMD_HELP_TEXT[cmd];
			println( "\n" + yellow.bold(label + ':') + "\n" + green(text) );
		} );
	},
	
	async cmd_docs() {
		// emit readme to stdout
		var docs = fs.readFileSync(Path.join( __dirname, 'README.md' ), 'utf8');
		docs = this.markdown(docs);
		println( "\n" + docs );
	},
	
	async cmd_config() {
		// print absolute location of our config file & optionally make edits
		var config_file = Path.resolve( __dirname + '/config.json' );
		var config = JSON.parse( fs.readFileSync(config_file, 'utf8') );
		println( "\n" + bold.yellow("Config File: ") + green(config_file) );
		
		var updates = Tools.copyHashRemoveKeys( cli.args, { other:1 } );
		if (!Tools.numKeys(updates)) return;
		print("\n");
		
		for (var key in updates) {
			if (updates[key] === '_DELETE_') {
				println( red.bold("Deleting config key: ") + green.bold(key) );
				Tools.deletePath( config, key, updates[key] );
			}
			else {
				println( cyan.bold("Setting config key: ") + green.bold(key) + ": " + green(JSON.stringify(updates[key])) );
				Tools.setPath( config, key, updates[key] );
			}
		}
		
		try {
			fs.writeFileSync( config_file, JSON.stringify(config, null, "\t") + "\n" );
		}
		catch (err) {
			this.die("Failed to save master config file: " + err);
		}
		
		this.success("Master config file saved.");
	},
	
	async cmd_list() {
		// list all groups and config files
		var self = this;
		var { data } = await this.confsync.getData();
		
		print( "\n " + green.bold("Target Groups: ") + gray('(' + data.groups.length + ')') + "\n" );
		
		if (data.groups.length) {
			var rows = [
				['Group ID', 'Title', 'Author', 'Modified']
			];
			Tools.sortBy(data.groups, 'id').forEach( function(group) {
				rows.push([ 
					bold( group.id ), 
					group.title, 
					group.username || gray('n/a'),
					Tools.formatDate(group.modified, DATE_FMT) 
				]);
			} );
			print( "" + cli.table(rows, { indent: 1, autoFit: true }) + "\n" );
		}
		else print( gray(" (No groups found.)") + "\n");
		
		print( "\n " + green.bold("Config Files: ") + gray('(' + data.files.length + ')') + "\n" );
		
		if (data.files.length) {
			var rows = [
				['Config ID', 'Title', 'Path', 'Author', 'Modified']
			];
			Tools.sortBy(data.files, 'id').forEach( function(file) {
				rows.push([ 
					bold( file.id ), 
					file.title, 
					file.path, 
					file.username || gray('n/a'),
					Tools.formatDate(file.modified, DATE_FMT) 
				]);
			} );
			print( "" + cli.table(rows, { indent: 1, autoFit: true }) + "\n" );
		}
		else print( gray(" (No files found.)") + "\n");
		
		// show suggested commands
		this.printSuggestedCommands([data.groups.length ? 'getGroup' : 'addGroup', data.files.length ? 'file' : 'add']);
	},
	
	async cmd_group() {
		// alias for groups
		await this.cmd_groups();
	},
	
	async cmd_groups() {
		// run group commands (list or other)
		// confsync groups list
		// confsync groups add prod --title 'Production' --env.HOSTNAME '\.prod\.'
		var self = this;
		var group_cmd = (args.other.shift() || 'list').toLowerCase();
		
		switch (group_cmd) {
			case 'add': await this.addGroup(); break;
			case 'update': await this.updateGroup(); break;
			case 'delete': await this.deleteGroup(); break;
			
			case 'list':
				await this.cmd_list();
			break;
			
			case 'get':
				await this.getGroup();
			break;
			
			default:
				// assume user is trying to get group info
				args.other.unshift(group_cmd);
				await this.getGroup();
			break;
		}
	},
	
	async getGroup() {
		// get group info
		var self = this;
		
		var group_id = args.id || args.other.shift() || this.dieUsage('getGroup');
		var { data } = await this.confsync.getData();
		
		var group = Tools.findObject( data.groups, { id: group_id } );
		if (!group) this.die("Group not found: " + group_id);
		
		print( "\n" + cli.box(
			yellow.bold("Group ID: ") + green.bold( this.ellipsis(group.id, 64) ) + "\n" + 
			yellow.bold("Title:    ") + green.bold( this.ellipsis(group.title, 64) ) + "\n" + 
			(('priority' in group) ? (yellow.bold("Priority: ") + green(''+group.priority) + "\n") : '') + 
			yellow.bold("Author:   ") + green( this.ellipsis(group.username || gray('n/a'), 64) ) + "\n" + 
			yellow.bold("Created:  ") + green(Tools.formatDate(group.created, DATE_FMT)) + "\n" + 
			yellow.bold("Modified: ") + green(Tools.formatDate(group.modified, DATE_FMT)),
			{ indent: 1 }
		) + "\n");
		
		// show env table
		var rows = [
			['Env Variable', 'Match Pattern']
		];
		Object.keys(group.env).sort().forEach( function(key) {
			rows.push([ key, gray.bold('/') + group.env[key] + gray.bold('/') ]);
		} );
		print( "\n " + green.bold("Member Criteria:") + "\n" );
		print( cli.table(rows, { indent: 1, autoFit: true }) + "\n" );
		
		// show suggested commands
		this.printSuggestedCommands(['updateGroup', 'deleteGroup']);
	},
	
	async addGroup() {
		// add new group
		// confsync group add prod --title 'Production' --env.HOSTNAME '\.prod\.'
		var req = Tools.copyHashRemoveKeys( args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('addGroup');
		if (!req.username) req.username = USERNAME;
		
		if (!req.env) this.die("Please specify environment variables to match the group.", this.usage('addGroup'));
		
		this.checkSupportedParams(req, ['id', 'username', 'title', 'env', 'priority'], 'addGroup');
		
		try {
			await this.confsync.addGroup(req);
		}
		catch(err) {
			this.die(err);
		}
		
		// show new group info
		args.id = req.id;
		await this.getGroup();
	},
	
	async updateGroup() {
		// update existing geroup
		// confsync group update prod --title 'Production' --env.HOSTNAME '\.prod\.'
		var req = Tools.copyHashRemoveKeys( cli.args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('updateGroup');
		if (!req.username) req.username = USERNAME;
		
		// make sure the user specified at least one change
		if (Tools.numKeys(req) < 3) this.die("Please specify at least one update for the group.", this.usage('updateGroup'));
		
		this.checkSupportedParams(req, ['id', 'username', 'title', 'priority'], 'updateGroup');
		
		try {
			await this.confsync.updateGroup(req);
		}
		catch(err) {
			this.die(err);
		}
		
		// show updated group info
		args.id = req.id;
		await this.getGroup();
	},
	
	async deleteGroup() {
		// delete group
		// confsync group delete prod
		var req = Tools.copyHashRemoveKeys( args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('deleteGroup');
		if (!req.username) req.username = USERNAME;
		
		this.checkSupportedParams(req, ['id', 'username'], 'deleteGroup');
		
		try {
			await this.confsync.deleteGroup(req);
		}
		catch(err) {
			this.die(err);
		}
	},
	
	async cmd_info() {
		// alias for file
		await this.cmd_file();
	},
	
	async cmd_file() {
		// get info about single config file
		// confsync file myapp
		var self = this;
		var now = Tools.timeNow();
		var config_id = args.id || args.other.shift() || this.dieUsage('file');
		
		try {
			var { file, items, list, master } = await this.confsync.history({ id: config_id, offset: 0, limit: 1 });
		}
		catch (err) {
			this.die(err);
		}
		
		print( "\n" + cli.box(
			yellow.bold("Config ID:  ") + green.bold( this.ellipsis(file.id, 64) ) + "\n" + 
			yellow.bold("Title:      ") + green.bold( this.ellipsis(file.title, 64) ) + "\n" + 
			yellow.bold("Path:       ") + green( this.ellipsis(file.path, 64) ) + "\n" + 
			(('mode' in file) ?     (yellow.bold("Mode:       ") + green(file.mode) + "\n") : '') + 
			(('uid' in file) ?      (yellow.bold("UID:        ") + green(''+file.uid) + "\n") : '') + 
			(('gid' in file) ?      (yellow.bold("GID:        ") + green(''+file.gid) + "\n") : '') + 
			(('pid' in file) ?      (yellow.bold("PID File:   ") + green(this.ellipsis(file.pid, 64)) + "\n") : '') + 
			(('signal' in file) ?   (yellow.bold("Signal:     ") + green(this.ellipsis(file.signal, 64)) + "\n") : '') + 
			(('web_hook' in file) ? (yellow.bold("Web Hook:   ") + green(this.ellipsis(file.web_hook, 64)) + "\n") : '') + 
			(('exec' in file) ?     (yellow.bold("Shell Exec: ") + green(this.ellipsis(file.exec, 64)) + "\n") : '') + 
			yellow.bold("Author:     ") + green( this.ellipsis(file.username || gray('n/a'), 64) ) + "\n" + 
			yellow.bold("Created:    ") + green(Tools.formatDate(file.created, DATE_FMT)) + "\n" + 
			yellow.bold("Modified:   ") + green(Tools.formatDate(file.modified, DATE_FMT)) + "\n" + 
			yellow.bold("Revisions:  ") + green(Tools.commify(list.length)) + "\n" + 
			yellow.bold("Latest Rev: ") + green( items[0] ? items[0].rev : gray('n/a') ),
			{ indent: 1 }
		) + "\n" );
		
		// show live rev table
		if (items.length) {
			var rows = [
				['Group ID', 'Title', 'Live Rev', 'Deployed']
			];
			Tools.sortBy(master.groups, 'id').forEach( function(group) {
				var nice_live = gray('n/a');
				var nice_date = gray('n/a');
				
				if (file.live[group.id]) {
					nice_live = '✅ ' + bold(file.live[group.id].rev);
					var info = file.live[group.id];
					if (info.duration && (now - info.start < info.duration)) {
						// currently being gradually deployed
						nice_date = bold.green('Deploying (' + Tools.pct(now - info.start, info.duration, true) + ')');
					}
					else {
						nice_date = Tools.formatDate(file.live[group.id].start, DATE_FMT);
						if (info.duration) nice_date += ' (' + Tools.getTextFromSeconds(info.duration, true, true) + ')';
					}
				}
				
				rows.push([ 
					group.id, 
					group.title, 
					nice_live,
					nice_date
				]);
			} );
			print( "\n " + green.bold("Deployment Info:") + "\n" );
			print( cli.table(rows, { indent: 1, autoFit: true }) + "\n" );
		}
		
		// show env info, if applicable
		if (file.env) {
			rows = [
				['Env Variable', 'Match Pattern']
			];
			Object.keys(file.env).sort().forEach( function(key) {
				rows.push([ key, gray.bold('/') + file.env[key] + gray.bold('/') ]);
			} );
			print( "\n " + green.bold("Deploy To:") + "\n" );
			print( cli.table(rows, { indent: 1, autoFit: true }) + "\n" );
		} // env
		
		// show suggested commands here
		this.printSuggestedCommands(['update', 'push', 'deploy']);
	},
	
	async cmd_add() {
		// add new config file
		// confsync add myapp --title "MyApp Config" --dest /opt/myapp/conf/config.json --mode 600 --uid root
		var req = Tools.copyHashRemoveKeys( args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('add');
		if (!req.username) req.username = USERNAME;
		if (req.webhook) { req.web_hook = req.webhook; delete req.webhook; }
		if (req.dest) { req.path = req.dest; delete req.dest; }
		
		if (!req.path) this.die("Please specify destination path to the file.", this.usage('add'));
		
		this.checkSupportedParams(req, ['id', 'username', 'title', 'env', 'path', 'mode', 'uid', 'gid', 'pid', 'signal', 'exec', 'web_hook'], 'add');
		
		// massage file mode (for octal)
		if ('mode' in req) req.mode = Tools.zeroPad(req.mode, 3);
		
		try {
			await this.confsync.addConfigFile(req);
		}
		catch(err) {
			this.die(err);
		}
		
		// show new file info
		args.id = req.id;
		await this.cmd_file();
	},
	
	async cmd_update() {
		// update existing config file
		// confsync update myapp --title "MyApp Config" --env.HOSTNAME '\.myapp\.' --mode 644 --uid root
		var req = Tools.copyHashRemoveKeys( cli.args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('update');
		if (!req.username) req.username = USERNAME;
		if ('webhook' in req) { req.web_hook = req.webhook; delete req.webhook; }
		if (req.dest) { req.path = req.dest; delete req.dest; }
		
		// make sure the user specified at least one change
		if (Tools.numKeys(req) < 3) this.die("Please specify at least one update for the file.", this.usage('update'));
		
		this.checkSupportedParams(req, ['id', 'username', 'title', 'path', 'mode', 'uid', 'gid', 'pid', 'signal', 'exec', 'web_hook'], 'update');
		
		// allow false to mean _DELETE_ for these keys:
		['mode', 'uid', 'gid', 'pid', 'signal', 'exec', 'web_hook'].forEach( function(key) {
			if (req[key] === false) req[key] = '_DELETE_';
		});
		
		// massage file mode (for octal)
		if (('mode' in req) && (req.mode !== '_DELETE_')) req.mode = Tools.zeroPad(req.mode, 3);
		
		try {
			await this.confsync.updateConfigFile(req);
		}
		catch(err) {
			this.die(err);
		}
		
		// show updated file info
		args.id = req.id;
		await this.cmd_file();
	},
	
	async cmd_delete() {
		// delete config file
		// confsync delete myapp --full
		var req = Tools.copyHashRemoveKeys( args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('delete');
		if (!req.username) req.username = USERNAME;
		
		this.checkSupportedParams(req, ['id', 'username', 'full'], 'delete');
		
		try {
			await this.confsync.deleteConfigFile(req);
		}
		catch(err) {
			this.die(err);
		}
	},
	
	async cmd_push() {
		// push new config revision
		// confsync push myapp LOCAL_FILE --overrides LOCAL_FILE --message "Initial revision." --deploy
		var self = this;
		var req = Tools.copyHashRemoveKeys( args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('push');
		
		// allow the username and message to come from the most recent git commit
		if (!req.username && req.git) {
			req.username = cp.execSync('git log -1 --pretty=format:"%an"').toString().trim();
		}
		if (!req.message && req.git) {
			req.message = cp.execSync('git log -1 --pretty=%B | head -1').toString().trim();
		}
		delete req.git;
		
		if (!req.username) req.username = USERNAME;
		if (req.confirm) { req.commit = req.confirm; delete req.confirm; }
		
		// load and parse local files
		req.base = req.base || args.other.shift() || this.die("Please specify a base config file to push.", this.usage('push'));
		
		// if file is not JSON, mark it as raw (no transforms)
		if (!req.base.match(/\.json5?$/i)) req.raw = true;
		
		try {
			req.base = !req.raw ? JSON5.parse( fs.readFileSync(req.base, 'utf8') ) : fs.readFileSync(req.base, 'utf8');
		}
		catch(err) {
			this.die( "Failed to load local base config file: " + req.base + ": " + err );
		}
		
		// overrrides must always be in JSON(5) format, but can be raw strings for each group
		if (req.overrides) try {
			req.overrides = JSON5.parse( fs.readFileSync(req.overrides, 'utf8') );
		}
		catch(err) {
			this.die( "Failed to load local overrides file: " + req.overrides + ": " + err );
		}
		
		// handle deploy syntax (CSV to array)
		if (req.deploy && (typeof(req.deploy) == 'string')) {
			req.deploy = req.deploy.split(',');
		}
		
		// allow the push message to be an env var
		if (!req.message && process.env.CONFSYNC_message) req.message = process.env.CONFSYNC_message;
		
		this.checkSupportedParams(req, ['id', 'username', 'base', 'overrides', 'message', 'deploy', 'commit'], 'push');
		
		if (req.commit) {
			delete req.commit;
			
			try { await this.confsync.push(req); }
			catch(err) { this.die(err); }
		}
		else {
			await this.previewDiff(req);
		}
	},
	
	async cmd_clone() {
		// push new config revision by cloning existing one -- JSON files only!
		// confsync clone myapp --base.mykey myvalue --message "fixed a thing" --deploy
		var self = this;
		var req = Tools.copyHashRemoveKeys( args, { other:1, debug:1, echo:1 } );
		
		req.id = req.id || args.other.shift() || this.dieUsage('clone');
		req.rev = req.rev || args.other.shift() || ''; // optional
		if (req.confirm) { req.commit = req.confirm; delete req.confirm; }
		
		if (!req.base && !req.overrides) this.die("No file changes specified for clone.", this.usage('clone'));
		
		this.checkSupportedParams(req, ['id', 'username', 'rev', 'base', 'overrides', 'message', 'deploy', 'commit'], 'clone');
		
		// specify rev, or omit to grab first item in list
		var criteria = req.rev ? { rev: req.rev } : { id: req.id };
		
		try {
			var { file, item, master } = await this.confsync.find({ id: req.id, criteria });
		}
		catch (err) {
			this.die(err);
		}
		
		// file must be in JSON format for clone
		if (file.raw) this.die( "File must be in JSON format for clone operation." );
		
		// prepare for cloning
		delete item.message;
		delete item.username;
		
		// merge in req to clone
		var changes = Tools.copyHashRemoveKeys( cli.args, { other:1, debug:1, echo:1 } );
		for (var key in changes) {
			if (changes[key] === '_DELETE_') Tools.deletePath( item, key, changes[key] );
			else Tools.setPath( item, key, changes[key] );
		}
		
		req = item;
		if (!req.username) req.username = USERNAME;
		if (req.confirm) { req.commit = req.confirm; delete req.confirm; }
		
		// handle deploy syntax (CSV to array)
		if (req.deploy && (typeof(req.deploy) == 'string')) {
			req.deploy = req.deploy.split(',');
		}
		
		if (req.commit) {
			delete req.commit;
			
			try { await this.confsync.push(req); }
			catch(err) { this.die(err); }
		}
		else {
			await this.previewDiff(req);
		}
	},
	
	async cmd_deploy() {
		// deploy config revision live
		// confsync deploy myapp --rev REVISION
		var self = this;
		var req = Tools.copyHashRemoveKeys( args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('deploy');
		if (!req.username) req.username = USERNAME;
		
		if (req.duration && (typeof(req.duration) == 'string')) {
			req.duration = Tools.getSecondsFromText(req.duration) || this.die("Could not parse seconds from text: " + args.duration);
		}
		
		this.checkSupportedParams(req, ['id', 'username', 'rev', 'groups', 'duration'], 'deploy');
		
		// handle groups syntax (CSV to array)
		if (req.groups && (typeof(req.groups) == 'string')) {
			req.groups = req.groups.split(',');
		}
		
		try {
			await this.confsync.deploy(req);
		}
		catch(err) {
			this.die(err);
		}
	},
	
	async cmd_history() {
		// print revision history on config file
		// confsync history myapp
		var self = this;
		var req = Tools.copyHashRemoveKeys( args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('history');
		if (!req.username) req.username = USERNAME;
		
		if (req.page) {
			req.offset = (req.page - 1) * (req.limit || 25);
			delete req.page;
		}
		
		req.offset = req.offset || 0;
		req.limit = req.limit || 25;
		
		this.checkSupportedParams(req, ['id', 'username', 'offset', 'limit'], 'history');
		
		try {
			var { file, items, list, master } = await this.confsync.history(req);
		}
		catch(err) {
			this.die(err);
		}
		
		print( "\n" + cli.box(
			yellow.bold("Config ID: ") + green.bold( this.ellipsis(file.id, 64) ) + "\n" + 
			yellow.bold("Title:     ") + green.bold( this.ellipsis(file.title, 64) ) + "\n" + 
			yellow.bold("Path:      ") + green( this.ellipsis(file.path, 64) ) + "\n" + 
			yellow.bold("Author:    ") + green( this.ellipsis(file.username || gray('n/a'), 64) ) + "\n" + 
			yellow.bold("Created:   ") + green( Tools.formatDate(file.created, DATE_FMT) ) + "\n" + 
			yellow.bold("Modified:  ") + green( Tools.formatDate(file.modified, DATE_FMT) ) + "\n" + 
			yellow.bold("Revisions: ") + green( Tools.commify(list.length) ),
			{ indent: 1 }
		) + "\n" );
		
		if (!items.length) return;
		
		var rows = [
			['Revision', 'Message', 'Author', 'Date/Time', 'Live']
		];
		items.forEach( function(item) {
			var nice_message = (item.message || '(No message)');
			var nice_rev = item.rev;
			var nice_username = item.username || gray('n/a');
			var nice_modified = Tools.formatDate(item.modified, DATE_FMT);
			var nice_live = '';
			var live_groups = [];
			for (var key in file.live) {
				if (file.live[key].rev == item.rev) live_groups.push(key);
			}
			if (live_groups.length == master.groups.length) {
				nice_live = '✅ ' + bold('(All)');
				nice_rev = bold(nice_rev);
				nice_message = bold(nice_message);
				nice_username = bold(nice_username);
				nice_modified = bold(nice_modified);
			}
			else if (live_groups.length) {
				nice_live = '✅ ' + bold(live_groups.join(', '));
				nice_rev = bold(nice_rev);
				nice_message = bold(nice_message);
				nice_username = bold(nice_username);
				nice_modified = bold(nice_modified);
			}
			
			rows.push([ 
				nice_rev, 
				nice_message, 
				nice_username, 
				nice_modified, 
				nice_live
			]);
		} );
		
		var nice_pagination = Math.floor(req.offset + 1) + ' - ' + Math.floor(req.offset + items.length) + ' of ' + list.length;
		
		print( "\n " + green.bold("Revision History: ") + gray('(' + nice_pagination + ')') + "\n" );
		print( cli.table(rows, { indent: 1, autoFit: true }) + "\n" );
		
		// show suggested commands here
		this.printSuggestedCommands(['histPaginate', 'get', 'diff']);
	},
	
	async cmd_get() {
		// get specific revision of config file, omit rev for latest
		// confsync get myapp REVISION
		var self = this;
		var req = Tools.copyHashRemoveKeys( args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('get');
		req.rev = req.rev || args.other.shift() || '';
		if (!req.username) req.username = USERNAME;
		if (req.group) { req.groups = req.group; delete req.group; }
		
		this.checkSupportedParams(req, ['id', 'username', 'rev', 'groups', 'save'], 'get');
		
		try {
			var { file, item, master } = await this.confsync.get(req);
		}
		catch(err) {
			this.die(err);
		}
		
		var nice_live = '';
		var live_groups = [];
		for (var key in file.live) {
			if (file.live[key].rev == item.rev) live_groups.push(key);
		}
		if (live_groups.length == master.groups.length) {
			nice_live = '✅ (All Groups)';
		}
		else if (live_groups.length) {
			nice_live = live_groups.join(', ');
		}
		else {
			nice_live = gray('(No)');
		}
		
		print( "\n" + cli.box(
			yellow.bold("Config ID: ") + green.bold( this.ellipsis(file.id, 64) ) + "\n" + 
			yellow.bold("Title:     ") + green.bold( this.ellipsis(file.title, 64) ) + "\n" + 
			yellow.bold("Path:      ") + green( this.ellipsis(file.path, 64) ) + "\n" + 
			yellow.bold("Revision:  ") + cyan.bold(item.rev) + "\n" + 
			yellow.bold("Author:    ") + green( this.ellipsis(item.username || gray('n/a'), 64) ) + "\n" + 
			yellow.bold("Message:   ") + green( this.ellipsis(item.message || '(No message)', 64) ) + "\n" + 
			yellow.bold("Date/Time: ") + green( Tools.formatDate(item.modified, DATE_FMT) ) + "\n" + 
			yellow.bold("Live:      ") + green( this.ellipsis(nice_live, 64) ),
			{ indent: 1 }
		) + "\n" );
		
		if (req.groups) {
			var nice_group_title = '';
			if (typeof(req.groups) == 'string') req.groups = req.groups.split(/\,/);
			
			// convert group ids to actual group objects
			var groups = req.groups.map( function(group_id) {
				var group = Tools.findObject(master.groups, { id: group_id });
				if (!group) self.die("Group not found: " + group_id);
				return group;
			} );
			
			// sort groups by priority descending (so priority 1 is latter prevails)
			groups = groups.sort( function(a, b) {
				return (b.priority || 5) - (a.priority || 5);
			} );
			
			groups.forEach( function(group) {
				nice_group_title = group.title;
				
				// perform group override
				if (!item.overrides) item.overrides = {};
				var overrides = item.overrides[group.id];
				if (!overrides) {
					self.die("No overrides found for group: " + group.id);
				}
				
				if (item.raw) item.base = overrides;
				else {
					for (var key in overrides) {
						Tools.setPath( item.base, key, overrides[key] );
					}
				}
			}); // foreach group
			
			if (groups.length > 1) nice_group_title = 'Multi-Group';
			
			if (item.raw) {
				// raw file
				print( "\n" + green.bold( nice_group_title + " File:") + "\n" + highlight(item.base.trim()) + "\n" );
			}
			else {
				// json file
				print( "\n" + green.bold( nice_group_title + " Transformed JSON:") + "\n" + highlight(JSON.stringify(item.base, null, "\t")) + "\n" );
			}
		}
		else if (item.raw) {
			print( "\n" + green.bold("Base File:") + "\n" + highlight(item.base.trim()) + "\n" );
		}
		else {
			print( "\n" + green.bold("Base JSON:") + "\n" + highlight(JSON.stringify(item.base, null, "\t")) + "\n" );
			
			// also show overrides, if defined
			if (item.overrides) {
				print( "\n" + green.bold("Overrides JSON:") + "\n" + highlight(JSON.stringify(item.overrides, null, "\t")) + "\n" );
			}
		}
		
		if (req.save && (typeof(req.save) == 'string')) {
			// optionally save file to disk
			try { fs.writeFileSync( req.save, (item.raw ? item.base.trim() : JSON.stringify(item.base, null, "\t")) + "\n" ); }
			catch (err) { self.die("Failed to save local file: " + req.save + ": " + err); }
			
			this.success("Saved local file: `" + req.save + "`");
		}
		
		// show suggested commands here
		this.printSuggestedCommands(['history', 'diff']);
	},
	
	async cmd_diff() {
		// diff two revs
		// confsync diff myapp REV1 REV2
		var self = this;
		var req = Tools.copyHashRemoveKeys( args, { other:1 } );
		req.id = req.id || args.other.shift() || this.dieUsage('diff');
		if (!req.username) req.username = USERNAME;
		if (req.group) { req.groups = req.group; delete req.group; }
		
		req.new = req.new || args.other.shift();
		req.old = req.old || args.other.shift();
		req.offset = 0;
		req.limit = 0;
		
		this.checkSupportedParams(req, ['id', 'username', 'new', 'old', 'offset', 'limit', 'groups'], 'diff');
		
		if (req.new && (typeof(req.new) == 'number')) req.new = 'r' + req.new;
		if (req.old && (typeof(req.old) == 'number')) req.old = 'r' + req.old;
		
		try {
			var { file, items, list, master } = await this.confsync.history(req);
		}
		catch(err) {
			this.die(err);
		}
		
		if (!items || (items.length < 2)) {
			this.die("Revision history must have at least 2 entries to perform a diff.");
		}
		
		if (!req.new) req.new = items[0].rev;
		var new_idx = Tools.findObjectIdx( items, { rev: req.new } );
		if (new_idx == -1) this.die("Revision not found: " + req.new);
		
		if (!req.old) {
			var old_idx = new_idx + 1;
			if (!items[old_idx]) this.die("Revision not found for diff.");
			req.old = items[old_idx].rev;
		}
		
		var new_item = Tools.findObject( items, { rev: req.new } );
		var old_item = Tools.findObject( items, { rev: req.old } );
		
		if (req.groups && (typeof(req.groups) == 'string')) req.groups = req.groups.split(/\,/);
		
		print( "\n" + cli.box(
			yellow.bold("Config ID: ") + green.bold( this.ellipsis(file.id, 64) ) + "\n" + 
			yellow.bold("Title:     ") + green.bold( this.ellipsis(file.title, 64) ) + "\n" + 
			yellow.bold("Path:      ") + green( this.ellipsis(file.path, 64) ) + "\n" + 
			(('groups' in req) ? (yellow.bold("Groups:    ") + green(this.ellipsis(req.groups.join(', '), 64)) + "\n") : '') + 
			yellow.bold("Revisions: ") + cyan.bold(req.old) + gray.bold(" --> ") + cyan.bold(req.new),
			{ indent: 1 }
		) + "\n" );
		
		var new_text = '';
		var old_text = '';
		var nice_title = 'Revision Diff:';
		
		if (req.groups) {
			// transform file for group(s)
			var nice_group_title = '';
			
			// convert group ids to actual group objects
			var groups = req.groups.map( function(group_id) {
				var group = Tools.findObject(master.groups, { id: group_id });
				if (!group) self.die("Group not found: " + group_id);
				return group;
			} );
			
			// sort groups by priority descending (so priority 1 is latter prevails)
			groups = groups.sort( function(a, b) {
				return (b.priority || 5) - (a.priority || 5);
			} );
			
			// perform env override and show that version
			if (!new_item.overrides) new_item.overrides = {};
			if (!old_item.overrides) old_item.overrides = {};
			
			groups.forEach( function(group) {
				nice_group_title = group.title;
				
				var new_overrides = new_item.overrides[group.id];
				if (new_overrides) {
					if (new_item.raw) new_item.base = new_overrides;
					else {
						for (var key in new_overrides) {
							Tools.setPath( new_item.base, key, new_overrides[key] );
						}
					}
				}
				
				var old_overrides = old_item.overrides[group.id];
				if (old_overrides) {
					if (old_item.raw) old_item.base = old_overrides;
					else {
						for (var key in old_overrides) {
							Tools.setPath( old_item.base, key, old_overrides[key] );
						}
					}
				}
			}); // foreach group
			
			if (groups.length > 1) nice_group_title = 'Multi-Group';
			
			// diff transformed json
			new_text = new_item.raw ? new_item.base : JSON.stringify(new_item.base, null, "\t");
			old_text = old_item.raw ? old_item.base : JSON.stringify(old_item.base, null, "\t");
			
			nice_title = nice_group_title + " Transformed Diff:";
		}
		else if (new_item.overrides || old_item.overrides) {
			// diff base + overrides
			if (new_item.raw) new_text = new_item.base;
			else new_text = JSON.stringify({ base: new_item.base, overrides: new_item.overrides || {} }, null, "\t");
			
			if (old_item.raw) old_text = old_item.base;
			else old_text = JSON.stringify({ base: old_item.base, overrides: old_item.overrides || {} }, null, "\t");
		}
		else {
			// diff base only
			new_text = new_item.raw ? new_item.base : JSON.stringify(new_item.base, null, "\t");
			old_text = old_item.raw ? old_item.base : JSON.stringify(old_item.base, null, "\t");
		}
		
		print( "\n" + green.bold(nice_title) + "\n" );
		
		var changes = Diff.diffLines( old_text, new_text );
		var num_added = Tools.findObjects( changes, { added: true } ).length;
		var num_removed = Tools.findObjects( changes, { removed: true } ).length;
		
		if (!num_added && !num_removed) {
			println( gray.bold('No changes found.  Files are identical.') );
			return;
		}
		
		this.printDiffChanges(changes);
		
		// show suggested commands here
		this.printSuggestedCommands(['get', 'history']);
	},
	
	async previewDiff(req) {
		// show local diff before committing to push
		var self = this;
		
		try {
			var { file, items, list, master } = await this.confsync.history({ id: req.id, offset: 0, limit: 1 });
		}
		catch(err) {
			this.die(err);
		}
		
		if (!items || !items.length) {
			// initial rev, just go
			try { await this.confsync.push(req); }
			catch(err) { this.die(err); }
			return;
		}
		
		var new_item = req;
		var old_item = items[0];
		var new_text = '';
		var old_text = '';
		var nice_title = 'Preview Diff:';
		
		if (new_item.overrides || old_item.overrides) {
			// diff base + overrides
			if (new_item.raw) new_text = new_item.base;
			else new_text = JSON.stringify({ base: new_item.base, overrides: new_item.overrides || {} }, null, "\t");
			
			if (old_item.raw) old_text = old_item.base;
			else old_text = JSON.stringify({ base: old_item.base, overrides: old_item.overrides || {} }, null, "\t");
		}
		else {
			// diff base only
			new_text = new_item.raw ? new_item.base : JSON.stringify(new_item.base, null, "\t");
			old_text = old_item.raw ? old_item.base : JSON.stringify(old_item.base, null, "\t");
		}
		
		print( "\n" + green.bold(nice_title) + "\n" );
		
		var changes = Diff.diffLines( old_text, new_text );
		var num_added = Tools.findObjects( changes, { added: true } ).length;
		var num_removed = Tools.findObjects( changes, { removed: true } ).length;
		
		if (num_added || num_removed) {
			this.printDiffChanges(changes);
		}
		else {
			println( gray.bold('No changes found.  Files are identical.') );
		}
		
		println( "\n" + green("Repeat your command with " + cyan.bold("`--confirm`") + " to push to S3.") );
	},
	
	printDiffChanges(changes) {
		// format and print changes from diff library
		changes.forEach( function(change) {
			if (change.removed) {
				println( red.bold('-' + change.value.trimRight().replace(/\n/g, "\n-")) );
			}
			else if (change.added) {
				println( green.bold('+' + change.value.trimRight().replace(/\n/g, "\n+")) );
			}
			else {
				var lines = change.value.replace(/\n$/, '').split(/\n/);
				if ((lines.length > 2) && !args.verbose) {
					var top = lines.shift();
					var bottom = lines.pop();
					lines = [ top, gray("..."), bottom ];
				}
				
				println( ' ' + gray(lines.join("\n").replace(/\n/g, "\n ")) );
			}
		});
	}
	
}; // app

app.run();
