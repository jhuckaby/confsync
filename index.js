// ConfSync Library
// See: https://github.com/jhuckaby/confsync
// Copyright (c) 2023 Joseph Huckaby, MIT License

const assert = require('assert');
const Path = require('path');
const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');
const JSON5 = require('json5');
const Class = require('class-plus');
const Logger = require('pixl-logger');
const Request = require('pixl-request');
const Tools = require('pixl-tools');
const StandaloneStorage = require('pixl-server-storage/standalone');

var pkg = require('./package.json');

// load config file
var config_file = Path.join( __dirname, 'config.json' );
if (!fs.existsSync(config_file)) {
	// copy sample config over
	fs.writeFileSync( config_file, fs.readFileSync( Path.join( __dirname, 'config-sample.json' ) ) );
}
var config = JSON5.parse( fs.readFileSync(config_file, 'utf8') );

// load env vars from a .env file, if present
var env_file = Path.join( __dirname, '.env' );
if (fs.existsSync(env_file)) try {
	var env = dotenv.parse( fs.readFileSync(env_file) );
	Tools.mergeHashInto( process.env, env );
}
catch (err) {;}

// allow environment vars to override config
for (var key in process.env) {
	if (key.match(/^CONFSYNC_(.+)$/)) {
		var path = RegExp.$1.trim().replace(/^_+/, '').replace(/_+$/, '').replace(/__/g, '/');
		var value = process.env[key].toString();
		
		// massage value into various types
		if (value === 'true') value = true;
		else if (value === 'false') value = false;
		else if (value.match(/^\-?\d+$/)) value = parseInt(value);
		else if (value.match(/^\-?\d+\.\d+$/)) value = parseFloat(value);
		
		if (value === '_DELETE_') Tools.deletePath(config, path);
		else Tools.setPath(config, path, value);
	}
}

module.exports = Class({
	
	__events: true,
	__asyncify: {
		startup: [],
		getData: ['data'],
		addGroup: [],
		updateGroup: [],
		deleteGroup: [],
		addConfigFile: [],
		updateConfigFile: [],
		deleteConfigFile: [],
		history: ['file', 'items', 'list', 'master'],
		get: ['file', 'item', 'master'],
		find: ['file', 'item', 'master'],
		push: ['rev'],
		deploy: [],
		shutdown: []
	},
	
	version: pkg.version,
	config: config,
	storage: null,
	logger: null
	
}, class ConfSync {
	
	constructor(args) {
		// class constructor
		if (args) Tools.mergeHashInto(this, args);
		
		if (!this.logger) {
			var log_file = config.log_dir.match(/^\//) ? 
				Path.join( config.log_dir, config.log_filename ) : 
				Path.join( __dirname, config.log_dir, config.log_filename );
			
			Tools.mkdirp.sync( Path.dirname(log_file) );
			
			this.logger = new Logger( log_file, config.log_columns );
			this.logger.set( 'debugLevel', config.debug_level );
			this.logger.set( 'sync', true );
		}
		
		this.logDebug(3, "ConfSync v" + pkg.version + " starting up", process.argv);
		
		// create a http request instance for web hooks
		this.request = new Request( "ConfSync v" + pkg.version );
		this.request.setTimeout( 30 * 1000 );
		this.request.setFollow( 5 );
		this.request.setAutoError( true );
		this.request.setKeepAlive( true );
	}
	
	startup(callback) {
		// setup s3 storage
		config.Storage.logger = this.logger;
		config.Storage.trans_dir = Path.join( os.tmpdir(), 'confsync' );
		
		this.storage = new StandaloneStorage(config.Storage, callback);
	}
	
	normalizeGroupID(id) {
		// strip non-alpha and non-dash, convert to lowercase
		return id.toString().replace(/[^\w\-]+/g, '').toLowerCase();
	}
	
	normalizeFileID(id) {
		// strip non-alpha and non-dash, convert to lowercase
		return id.toString().replace(/[^\w\-]+/g, '').toLowerCase();
	}
	
	getData(callback) {
		// load master data, create if necessary
		var self = this;
		
		this.storage.get( 'master', function(err, data) {
			if (err && (err.code == 'NoSuchKey')) {
				data = { groups: [], files: [] };
				err = null;
			}
			callback(err, data);
		} );
	}
	
	getMasterData(trans, callback) {
		// load master data inside transaction, soft-create if missing
		assert( arguments.length == 2, "Wrong number of arguments to getMasterData" );
		var self = this;
		
		trans.get( 'master', function(err, data) {
			if (err && (err.code == 'NoSuchKey')) {
				data = { groups: [], files: [] };
				err = null;
			}
			callback(err, data);
		} );
	}
	
	putMasterData(data, trans, callback) {
		// save master data inside transaction, and bump serial
		assert( arguments.length == 3, "Wrong number of arguments to putMasterData" );
		var self = this;
		
		trans.put( 'master', data, function(err) {
			if (err) return callback(err);
			
			// bump serial number, so clients refresh
			trans.put( 'serial', { value: Tools.generateUniqueID() }, function(err) {
				if (err) return callback(err);
				
				callback();
			} ); // serial
		} ); // master
	}
	
	doTransError(code, msg, trans, callback) {
		// log error, abort transaction, and fire callback
		assert( arguments.length == 4, "Wrong number of arguments to doTransError" );
		
		this.logError(code, '' + msg);
		if (typeof(msg) == 'string') msg = new Error(msg);
		
		trans.abort( function() { callback(msg); } );
	}
	
	addGroup(group, callback) {
		// add new target group
		// { id, title, env, username? }
		var self = this;
		
		if (!group || !Tools.isaHash(group)) {
			return this.doError('group', "Group must be an object.", callback);
		}
		if (!group.id || (typeof(group.id) != 'string')) {
			return this.doError('group', "Group `id` must be a string.", callback);
		}
		if (!group.env || (typeof(group.env) != 'object')) {
			return this.doError('group', "Group must have a `env` object.", callback);
		}
		if (!Tools.numKeys(group.env)) {
			return this.doError('group', "Group must have at least one `env` property.", callback);
		}
		
		group.id = this.normalizeGroupID(group.id);
		group.title = group.title || group.id;
		group.created = group.modified = Tools.timeNow();
		
		this.logDebug(6, "Adding group", group);
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				if (Tools.findObject(master.groups, { id: group.id })) {
					return self.doTransError('group', "Group already exists with that ID: " + group.id, trans, callback);
				}
				
				master.groups.push(group);
				
				self.putMasterData(master, trans, function(err) {
					if (err) return self.doTransError('master', err, trans, callback);
					
					trans.commit( function(err) {
						if (err) return self.doTransError('storage', err, trans, callback);
						
						self.logTransaction('addGroup', group.id, group);
						callback();
					}); // commit
				}); // putMasterData
			} ); // getMasterData
		}); // begin
	}
	
	updateGroup(updates, callback) {
		// update existing group
		// { id, username?, ... }
		var self = this;
		
		if (!updates || !Tools.isaHash(updates)) {
			return this.doError('group', "Updates must be an object.", callback);
		}
		if (!updates.id || (typeof(updates.id) != 'string')) {
			return this.doError('group', "Group `id` must be a string.", callback);
		}
		
		updates.id = this.normalizeGroupID(updates.id);
		
		this.logDebug(6, "Updating group", updates);
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				var group = Tools.findObject(master.groups, { id: updates.id });
				if (!group) {
					return self.doTransError('group', "Group not found: " + updates.id, trans, callback);
				}
				
				for (var key in updates) {
					if (updates[key] === '_DELETE_') Tools.deletePath( group, key );
					else Tools.setPath( group, key, updates[key] );
				}
				
				// make sure user didn't remove all env var matches
				if (!group.env || !Tools.numKeys(group.env)) {
					return self.doTransError('group', "Group must have at least one env property.", trans, callback);
				}
				
				group.modified = Tools.timeNow();
				
				self.putMasterData(master, trans, function(err) {
					if (err) return self.doTransError('master', err, trans, callback);
					
					trans.commit( function(err) {
						if (err) return self.doTransError('storage', err, trans, callback);
						
						self.logTransaction('updateGroup', group.id, group);
						callback();
					}); // commit
				}); // putMasterData
			} ); // getMasterData
		} ); // begin
	}
	
	deleteGroup(group, callback) {
		// delete group
		// { id, username? }
		var self = this;
		
		if (!group || !Tools.isaHash(group)) {
			return this.doError('group', "Group must be an object.", callback);
		}
		if (!group.id || (typeof(group.id) != 'string')) {
			return this.doError('group', "Group `id` must be a string.", callback);
		}
		
		group.id = this.normalizeGroupID(group.id);
		
		this.logDebug(6, "Deleting group", group);
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				if (!Tools.deleteObject(master.groups, { id: group.id })) {
					return self.doTransError('group', "Group not found: " + group.id, trans, callback);
				}
				
				self.putMasterData(master, trans, function(err) {
					if (err) return self.doTransError('master', err, trans, callback);
					
					trans.commit( function(err) {
						if (err) return self.doTransError('storage', err, trans, callback);
						
						self.logTransaction('deleteGroup', group.id, group);
						callback();
					}); // commit
				}); // putMasterData
			} ); // getMasterData
		} ); // begin
	}
	
	addConfigFile(file, callback) {
		// add new managed config file
		// { id, path, title?, username?, env?, mode?, uid?, gid? }
		var self = this;
		
		if (!file || !Tools.isaHash(file)) {
			return this.doError('file', "File must be an object.", callback);
		}
		if (!file.id || (typeof(file.id) != 'string')) {
			return this.doError('file', "File ID must be a string.", callback);
		}
		if (!file.path || (typeof(file.path) != 'string')) {
			return this.doError('file', "File must have a `path` string.", callback);
		}
		
		file.id = this.normalizeFileID(file.id);
		file.title = file.title || file.id;
		file.created = file.modified = Tools.timeNow();
		file.live = {};
		
		// make sure file mode is a string (e.g. "644") for sanity
		if (file.mode && (typeof(file.mode) != 'string')) {
			return this.doError('file', "File `mode` must be a string.", callback);
		}
		
		this.logDebug(6, "Adding config file", file);
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				if (Tools.findObject(master.files, { id: file.id })) {
					return self.doTransError('file', "File already exists with that ID: " + file.id, trans, callback);
				}
				
				master.files.push(file);
				
				self.putMasterData(master, trans, function(err) {
					if (err) return self.doTransError('master', err, trans, callback);
					
					trans.commit( function(err) {
						if (err) return self.doTransError('storage', err, trans, callback);
						
						self.logTransaction('addConfigFile', file.id, file);
						callback();
					}); // commit
				}); // putMasterData
			} ); // getMasterData
		} ); // begin
	}
	
	updateConfigFile(updates, callback) {
		// update existing config file
		// { id, ... }
		var self = this;
		
		if (!updates || !Tools.isaHash(updates)) {
			return this.doError('file', "Updates must be an object.", callback);
		}
		if (!updates.id || (typeof(updates.id) != 'string')) {
			return this.doError('file', "File `id` must be a string.", callback);
		}
		
		updates.id = this.normalizeFileID(updates.id);
		
		this.logDebug(6, "Updating config file", updates);
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				var file = Tools.findObject(master.files, { id: updates.id });
				if (!file) {
					return self.doTransError('file', "File definition not found: " + updates.id, trans, callback);
				}
				
				for (var key in updates) {
					if (updates[key] === '_DELETE_') Tools.deletePath( file, key );
					else Tools.setPath( file, key, updates[key] );
				}
				
				file.modified = Tools.timeNow();
				
				self.putMasterData(master, trans, function(err) {
					if (err) return self.doTransError('master', err, trans, callback);
					
					trans.commit( function(err) {
						if (err) return self.doTransError('storage', err, trans, callback);
						
						self.logTransaction('updateConfigFile', file.id, file);
						callback();
					}); // commit
				}); // putMasterData
			} ); // getMasterData
		} ); // begin
	}
	
	deleteConfigFile(file, callback) {
		// delete config file
		// { id, full } 
		var self = this;
		
		if (!file || !Tools.isaHash(file)) {
			return this.doError('file', "File must be an object.", callback);
		}
		if (!file.id || (typeof(file.id) != 'string')) {
			return this.doError('file', "File ID must be a string.", callback);
		}
		
		file.id = this.normalizeFileID(file.id);
		
		this.logDebug(6, "Deleting config file", file);
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				if (!Tools.deleteObject(master.files, { id: file.id })) {
					return self.doTransError('file', "File definition not found: " + file.id, trans, callback);
				}
				
				var finish = function() {
					self.putMasterData(master, trans, function(err) {
						if (err) return self.doTransError('master', err, trans, callback);
						
						trans.commit( function(err) {
							if (err) return self.doTransError('storage', err, trans, callback);
							
							self.logTransaction('deleteConfigFile', file.id, file);
							callback();
						}); // commit
					}); // putMasterData
				}; // finish
				
				if (file.full) {
					// if requested, also delete file revision history
					trans.listDelete( 'files/' + file.id, true, function(err) {
						if (err) return self.doTransError('file', err, trans, callback);
						finish();
					} );
				}
				else finish();
			} ); // getMasterData
		} ); // begin
	}
	
	push(data, callback) {
		// push new config revision
		// { id, base, overrides?, username?, message?, deploy? }
		var self = this;
		var now = Tools.timeNow();
		var deployed = false;
		
		if (!data || !Tools.isaHash(data)) {
			return this.doError('push', "Data must be an object.", callback);
		}
		if (!data.id || (typeof(data.id) != 'string')) {
			return this.doError('push', "File ID must be a string.", callback);
		}
		if (!('base' in data)) {
			return this.doError('push', "Data must have a `base` property.", callback);
		}
		if (!Tools.isaHash(data.base) && (typeof(data.base) != 'string')) {
			return this.doError('push', "`base` property must be an object or a string.", callback);
		}
		
		data.id = this.normalizeFileID(data.id);
		data.modified = Tools.timeNow();
		
		// allow the push message to be an env var
		if (!data.message && process.env.CONFSYNC_message) data.message = process.env.CONFSYNC_message;
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				var file = Tools.findObject(master.files, { id: data.id });
				if (!file) {
					return self.doTransError('push', "File definition not found: " + data.id, trans, callback);
				}
				
				file.modified = now;
				file.counter = (file.counter || 0) + 1;
				
				// unique rev number
				data.rev = 'r' + file.counter;
				
				// allow convenience deploy with push
				if (data.deploy) {
					// if deploy is set to non-array, assume ALL groups
					if (!Tools.isaArray(data.deploy)) {
						data.deploy = master.groups.map( function(group) { return group.id; } );
					}
					
					// validate group ids
					for (var idx = 0, len = data.deploy.length; idx < len; idx++) {
						if (!Tools.findObject(master.groups, { id: data.deploy[idx] })) {
							return self.doTransError('push', "Group definition not found: " + data.deploy[idx], trans, callback);
						}
					}
					
					// set live flags
					data.deploy.forEach( function(group_id) {
						if (!file.live) file.live = {};
						file.live[ group_id ] = { rev: data.rev, start: now, duration: data.duration || 0 };
					} );
					
					deployed = data.deploy; // for logging
					delete data.deploy;
					delete data.duration;
				} // deploy
				
				self.logDebug(6, "Pushing new file revision", file);
				
				trans.listUnshift( 'files/' + data.id, data, function(err) {
					if (err) return self.doTransError('push', err, trans, callback);
					
					self.putMasterData(master, trans, function(err) {
						if (err) return self.doTransError('master', err, trans, callback);
						
						trans.commit( function(err) {
							if (err) return self.doTransError('storage', err, trans, callback);
							
							// massage some values for web hook messages
							if (!data.username) data.username = '(Unknown)';
							if (!data.message) data.message = '(No message)';
							
							self.logTransaction('push', data.id, data);
							if (deployed) self.logTransaction('deploy', data.id, { id: data.id, rev: data.rev, groups: deployed, username: data.username });
							
							callback(null, data.rev);
						}); // commit
					}); // putMasterData
				} ); // listUnshift
			}); // getMasterData
		}); // begin
	}
	
	deploy(data, callback) {
		// deploy a specific config revision to groups, making it live
		// { id, rev, groups }
		var self = this;
		var now = Tools.timeNow();
		
		if (!data || !Tools.isaHash(data)) {
			return this.doError('deploy', "Data must be an object.", callback);
		}
		if (!data.id || (typeof(data.id) != 'string')) {
			return this.doError('deploy', "File `id` must be a string.", callback);
		}
		if (data.groups && !Tools.isaArray(data.groups)) {
			return this.doError('deploy', "Groups must be an array.", callback);
		}
		
		data.id = this.normalizeFileID(data.id);
		if (data.rev && (typeof(data.rev) == 'number')) data.rev = 'r' + data.rev;
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				var file = Tools.findObject(master.files, { id: data.id });
				if (!file) {
					return self.doTransError('deploy', "File definition not found: " + data.id, trans, callback);
				}
				
				// default to all groups
				if (!data.groups) {
					data.groups = master.groups.map( function(group) { return group.id; } );
				}
				
				// validate group ids
				for (var idx = 0, len = data.groups.length; idx < len; idx++) {
					if (!Tools.findObject(master.groups, { id: data.groups[idx] })) {
						return self.doTransError('deploy', "Group definition not found: " + data.groups[idx], trans, callback);
					}
				}
				
				self.logDebug(6, "Deploying file revision", data);
				
				var finish = function() {
					// deploy now
					data.groups.forEach( function(group_id) {
						if (!file.live) file.live = {};
						file.live[ group_id ] = { rev: data.rev, start: now, duration: data.duration || 0 };
					} );
					
					// bump mod date on file
					file.modified = Tools.timeNow();
					
					// save master and we're done
					self.putMasterData(master, trans, function(err) {
						if (err) return self.doTransError('master', err, trans, callback);
						
						trans.commit( function(err) {
							if (err) return self.doTransError('storage', err, trans, callback);
							
							// massage some values for web hook messages
							if (!data.username) data.username = '(Unknown)';
							
							self.logTransaction('deploy', data.id, data);
							callback();
						}); // commit
					}); // putMasterData
				}; // finish
				
				if (data.rev) {
					// make sure rev is valid
					trans.listFind( 'files/' + data.id, { rev: data.rev }, function(err, item, idx) {
						if (err) return self.doTransError('deploy', "File revision not found: " + data.rev, trans, callback);
						finish();
					} );
				}
				else {
					// grab latest rev
					trans.listGet( 'files/' + data.id, 0, 1, function(err, items) {
						if (err) return self.doTransError('deploy', "Failed to load latest revision: " + err, trans, callback);
						if (!items || !items[0] || !items[0].rev) return self.doTransError('deploy', "Failed to load latest revision: Unknown error", trans, callback);
						
						data.rev = items[0].rev;
						finish();
					});
				}
			}); // getMasterData
		}); // begin
	}
	
	history(data, callback) {
		// get revision history for specific file
		// Request: { id, offset?, limit? }
		// Response: { file, items, list }
		var self = this;
		
		if (!data || !Tools.isaHash(data)) {
			return this.doError('get', "Data must be an object.", callback);
		}
		if (!data.id || (typeof(data.id) != 'string')) {
			return this.doError('get', "File `id` must be a string.", callback);
		}
		
		data.id = this.normalizeFileID(data.id);
		data.offset = data.offset || 0;
		data.limit = data.limit || 0;
		
		this.logDebug(6, "Fetching file history", data);
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				var file = Tools.findObject(master.files, { id: data.id });
				if (!file) {
					return self.doTransError('get', "File definition not found: " + data.id, trans, callback);
				}
				
				trans.listGet( 'files/' + data.id, data.offset, data.limit, function(err, items, list) {
					if (err) {
						if (err.code == 'NoSuchKey') {
							items = [];
							list = { length: 0 };
							err = null;
						}
						else return self.doTransError('get', "Failed to load revision history: " + err, trans, callback);
					}
					
					trans.commit( function(err) {
						if (err) return self.doTransError('storage', err, trans, callback);
						
						callback(null, file, items, list, master);
					}); // commit
				} ); // listGet
			}); // getMasterData
		}); // begin
	}
	
	get(data, callback) {
		// get single revision for specific file
		// Request: { id, rev }
		// Response: { file, item, master }
		var self = this;
		
		if (!data || !Tools.isaHash(data)) {
			return this.doError('get', "Data must be an object.", callback);
		}
		if (!data.id || (typeof(data.id) != 'string')) {
			return this.doError('get', "File `id` must be a string.", callback);
		}
		
		if (data.rev && (typeof(data.rev) == 'number')) data.rev = 'r' + data.rev;
		
		this.logDebug(6, "Fetching file revision", data);
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				var file = Tools.findObject(master.files, { id: data.id });
				if (!file) {
					return self.doTransError('get', "File definition not found: " + data.id, trans, callback);
				}
				
				if (data.rev) {
					// get specific rev
					trans.listFind( 'files/' + data.id, { rev: data.rev }, function(err, item, idx) {
						if (err) return self.doTransError('get', "Failed to load revision history: " + err, trans, callback);
						
						trans.commit( function(err) {
							if (err) return self.doTransError('storage', err, trans, callback);
							callback(null, file, item, master);
						}); // commit
					} ); // listFind
				}
				else {
					// get latest rev
					trans.listGet( 'files/' + data.id, 0, 1, function(err, items, list) {
						if (err) return self.doTransError('get', "Failed to load revision history: " + err, trans, callback);
						
						trans.commit( function(err) {
							if (err) return self.doTransError('storage', err, trans, callback);
							callback(null, file, items[0], master);
						}); // commit
					} ); // listGet
				}
			}); // getMasterData
		}); // begin
	}
	
	find(data, callback) {
		// find single revision for specific file
		// Request: { id, criteria }
		// Response: { file, item, master }
		var self = this;
		
		if (!data || !Tools.isaHash(data)) {
			return this.doError('find', "Data must be an object.", callback);
		}
		if (!data.id || (typeof(data.id) != 'string')) {
			return this.doError('find', "File `id` must be a string.", callback);
		}
		if (!data.criteria || !Tools.isaHash(data.criteria)) {
			return this.doError('find', "File `criteria` must be an object.", callback);
		}
		
		var criteria = data.criteria;
		
		this.logDebug(6, "Searching file history", data);
		
		this.storage.begin('master', function(err, trans) {
			if (err) return self.doError('storage', err, callback);
			
			self.getMasterData( trans, function(err, master) {
				if (err) return self.doTransError('master', err, trans, callback);
				
				var file = Tools.findObject(master.files, { id: data.id });
				if (!file) {
					return self.doTransError('find', "File definition not found: " + data.id, trans, callback);
				}
				
				trans.listFind( 'files/' + data.id, criteria, function(err, item, idx) {
					if (err) return self.doTransError('find', "File revision not found: " + err, trans, callback);
					
					trans.commit( function(err) {
						if (err) return self.doTransError('storage', err, trans, callback);
						callback(null, file, item, master);
					}); // commit
				} ); // listFind
			}); // getMasterData
		}); // begin
	}
	
	doError(code, msg, callback) {
		// log error and fire callback
		this.logError(code, '' + msg);
		
		if (typeof(msg) == 'string') msg = new Error(msg);
		callback(msg);
	}
	
	debugLevel(level) {
		// check if we're logging at or above the requested level
		return (this.logger.get('debugLevel') >= level);
	}
	
	logDebug(level, msg, data) {
		// proxy request to system logger with correct component
		if (this.debugLevel(level)) {
			this.logger.set( 'component', 'ConfSync' );
			this.logger.print({ 
				category: 'debug', 
				code: level, 
				msg: msg, 
				data: data 
			});
		}
	}
	
	logError(code, msg, data) {
		// proxy request to system logger with correct component
		this.logger.set( 'component', 'ConfSync' );
		this.logger.error( code, msg, data );
	}
	
	logTransaction(code, msg, data) {
		// log transaction, emit event, and fire applicable web hooks
		var self = this;
		if (!data) data = {};
		data.text = Tools.sub( config.web_hook_text_templates[code] || "", data );
		
		this.emit('transaction', code, msg, data);
		this.emit(code, msg, data);
		
		this.logger.set( 'component', 'ConfSync' );
		this.logger.transaction( code, msg, data );
		
		// fire web hook for action
		if (config.web_hooks) {
			data.text = "ConfSync: " + data.text;
			var payload = Tools.mergeHashes( data, { code, msg, content: data.text } );
			
			if (config.web_hooks[code]) {
				var url = config.web_hooks[code];
				this.request.json( url, payload, function(err) {
					if (err) self.logError('webhook', '' + err);
					else self.logDebug(9, "Web hook fired successfully: " + url, payload);
				} );
			}
			
			if (config.web_hooks.universal) {
				var url = config.web_hooks.universal;
				this.request.json( url, payload, function(err) {
					if (err) self.logError('webhook', '' + err);
					else self.logDebug(9, "Web hook fired successfully: " + url, payload);
				} );
			}
		} // web_hooks
	}
	
	shutdown(callback) {
		// shutdown storage
		if (!this.storage) return callback();
		this.storage.shutdown(callback);
	}
	
});
