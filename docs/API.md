# API Reference

This document contains a complete API reference for ConfSync, specifically for using it inside a Node.js project.

## Table of Contents

> &larr; [Return to the main document](https://github.com/jhuckaby/confsync/blob/master/README.md)

<!-- toc -->

## Installation

Use [npm](https://www.npmjs.com/) to install ConfSync locally, for using the API in your Node.js project:

```
npm i confsync
```

In this case the master config file will be located in `./node_modules/confsync/config,json`, relative to your project root.  Make sure this file contains your AWS credentials and S3 bucket & prefix.

Here is how to load the package and instantiate a class instance:

```js
const ConfSync = require('confsync');
let confsync = new ConfSync();
```

Here are all the class methods you can call:

## Class Methods

### startup

```
PROMISE startup()
```

The `startup` method should always be called first, and only once, during your app's initialization routine.  This sets up the connection to S3.  There are no return values in the resolved promise.  Example use:

```js
await confsync.startup();
```

Don't forget to also call [shutdown](#shutdown) when your app is shutting down!

### getData

```
PROMISE getData() --> { data }
```

The `getData` method fetches the "master data" for your ConfSync configuration.  The master data includes all the group and file definitions, but it does not include file revision history.  Example call:

```js
try {
	let { data } = await confsync.getData();
	console.log( data );
}
catch (err) {
	// handle error here
}
```

The data format is described in [Master Data](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md#master-data).

### addGroup

```
PROMISE addGroup( PARAMS )
```

The `addGroup` method adds a new target group.  This is how you can group multiple servers together, and is typically used to denote "environments" in your architecture.  The Group ID should be alphanumeric with underscores and dashes.  It accepts the following parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | String | **(Required)** The Group ID, which should be alphanumeric plus dash. |
| `title` | String | The Group Title, which is a display label, and can be any length and use any characters you want.  If omitted, this defaults to the ID. |
| `username` | String | The username who is creating the group.  Omit this to not set a user (which is fine). |
| `priority` | Number | Optionally specify a priority, which is used to sort groups when applying overrides. |
| `env` | Object | **(Required)** Specify one or more environment variables to match servers for the group.  See example below. |

Here is an example call:

```js
let params = {
	"id": "prod",
	"title": "Production",
	"username": "jhuckaby",
	"env": {
		"HOSTNAME": "\\.prod\\."
	}
};

try {
	await confsync.addGroup( params );
}
catch (err) {
	// handle error here
}
```

### updateGroup

```
PROMISE updateGroup( PARAMS )
```

The `updateGroup` method updates an existing target group.  You can change the title, username, priority, and/or environment variables.  It accepts the following parameters:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The Group ID, which should be alphanumeric plus dash. |
| `title` | String | The Group Title, which is a display label, and can be any length and use any characters you want. |
| `username` | String | The username who is updating the group.  Omit this to preserve the previous user. |
| `priority` | Number | Specify an optional priority, which is used to sort groups when applying overrides. |
| `env.*` | String | Add or replace one or more environment variables to match servers for the group. |

Here is an example call:

```js
let params = {
	"id": "prod",
	"title": "Production",
	"username": "jhuckaby",
	"env": {
		"HOSTNAME": "\\.prod\\."
	}
};

try {
	await confsync.updateGroup( params );
}
catch (err) {
	// handle error here
}
```

Note that if you specify the outer `env` property as shown above, then you should include **all** the properties within (it replaces the entire `env` object in the group).  Alternatively, you can provide "sparse" updates by using dot path notation.  Example:

```js
let params = {
	"id": "prod",
	"env.HOSTNAME": "\\.prod\\."
};
```

This would preserve any other properties present in the `env` object, and only change the `HOSTNAME` property.

To delete properties using sparse dot path notation, set the value to `_DELETE_`, which is a special string value that is recognized by the API.

### deleteGroup

```
PROMISE deleteGroup( PARAMS )
```

The `deleteGroup` method deletes a target group.  All you need to specify is the Group ID.  The method accepts the following parameters:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The Group ID, which should be alphanumeric plus dash. |
| `username` | String | The username who is deleting the group (for logging purposes). |

Example delete:

```js
let params = {
	"id": "prod",
	"username": "jhuckaby"
};

try {
	await confsync.deleteGroup( params );
}
catch (err) {
	// handle error here
}
```

### addConfigFile

```
PROMISE addConfigFile( PARAMS )
```

The `addConfigFile` method adds a new config file definition.  That is, it defines a new configuration file to be managed by ConfSync.  You do not need to specify the *contents* of the file at this stage -- only metadata, including a title, the destination path on the server where the file should eventually reside, and other optional details.  It accepts the following parameters:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash. |
| `title` | String | The File Title, which is a display label, and can be any length and use any characters you want. |
| `username` | String | The username who owns the file.  Omit to leave blank. |
| `dest` | String | **(Required)** The filesystem path where the file should be installed on the target servers. |
| `mode` | String | An optional mode (permissions) for the file, specified in octal (e.g. `600`). |
| `uid` | Mixed | An optional user owner for the file, which can be numerical or a string (e.g. `root`). |
| `gid` | Mixed | An optional group for the file, which can be numerical or a string (e.g. `staff`). |
| `pid` | String | Optional location of your app's PID file, for use with `signal`.  See [PID File / Signal](https://github.com/jhuckaby/confsync#pid-file--signal). |
| `signal` | String | Optional signal to send your app on install, use with `pid`.  See [PID File / Signal](https://github.com/jhuckaby/confsync#pid-file--signal). |
| `exec` | String | Optional shell command to execute on install.  See [Shell Exec](https://github.com/jhuckaby/confsync#shell-exec). |
| `webhook` | String | Optional web URL to request on install.  See [Web Request](https://github.com/jhuckaby/confsync#web-request). |
| `env.*` | String | Add or replace one or more environment variables to match servers for the file. |

Here is an example:

```js
let params = {
	"id": "myapp",
	"title": "My Great App",
	"username": "jhuckaby",
	"path": "/opt/myapp/conf/config.json"
};

try {
	await confsync.addConfigFile( params );
}
catch (err) {
	// handle error here
}
```

### updateConfigFile

```
PROMISE updateConfigFile( PARAMS )
```

The `updateConfigFile` method updates an existing config file definition.  You can change the title, destination path, or set optional features like file mode, user/group, or add app notification options.  Note that the file ID cannot be changed.  The method accepts the following params:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash. |
| `title` | String | The File Title, which is a display label, and can be any length and use any characters you want. |
| `username` | String | The username who is updating the file.  Omit this to preserve the previous user. |
| `dest` | String | The filesystem path where the file should be installed on the target servers. |
| `mode` | String | An optional mode (permissions) for the file, specified in octal (e.g. `600`). |
| `uid` | Mixed | An optional user owner for the file, which can be numerical or a string (e.g. `root`). |
| `gid` | Mixed | An optional group for the file, which can be numerical or a string (e.g. `staff`). |
| `pid` | String | Optional location of your app's PID file, for use with `signal`.  See [PID File / Signal](https://github.com/jhuckaby/confsync#pid-file--signal). |
| `signal` | String | Optional signal to send your app on install, use with `pid`.  See [PID File / Signal](https://github.com/jhuckaby/confsync#pid-file--signal). |
| `exec` | String | Optional shell command to execute on install.  See [Shell Exec](https://github.com/jhuckaby/confsync#shell-exec). |
| `webhook` | String | Optional web URL to request on install.  See [Web Request](https://github.com/jhuckaby/confsync#web-request). |
| `env.*` | String | Add or replace one or more environment variables to match servers for the file. |

Here is an example update:

```js
let params = {
	"id": "myapp",
	"title": "My Great App",
	"username": "jhuckaby",
	"path": "/opt/myapp/conf/config.json",
	"mode": "600",
	"uid": "root"
};

try {
	await confsync.updateConfigFile( params );
}
catch (err) {
	// handle error here
}
```

### deleteConfigFile

```
PROMISE deleteConfigFile( PARAMS )
```

The `deleteConfigFile` method deletes a configuration file.  By default, this will not delete the file revision history, and just removes the file definition.  If you want a full delete including the revision history, add a `full` parameter and set it to `true`.  Note that deleting a config file does **not** delete any files from your servers.  It only removes the file from ConfSync management.  The method accepts the following params:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash. |
| `username` | String | The username who is deleting the file (for logging purposes). |
| `full` | Boolean | Set this to `true` to delete the file revision history as well as the definition. |

Here is an example delete:

```js
let params = {
	"id": "myapp",
	"username": "jhuckaby"
};

try {
	await confsync.deleteConfigFile( params );
}
catch (err) {
	// handle error here
}
```

### push

```
PROMISE push( PARAMS )
```

The `push` method pushes a new revision for a specific file.  ConfSync keeps the full revision history for each file in a list, and this pushes a new entry onto the head of the list.  This is where you provide the actual contents of the file, and an optional message describing (briefly) what changed.  The method accepts the following params:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus underscore and dash. |
| `base` | Mixed | **(Required)** The file content, either as an object (for JSON) or a plain string for non-JSON. |
| `overrides` | Mixed | Optionally specify overrides, if applicable for your config.  See below for details. |
| `username` | String | The username who is pushing the file. |
| `message` | String | An optional short message to accompany the revision, briefly describing what changed. |
| `deploy` | Mixed | Optionally [deploy](#deploy) the revision when pushing.  This can also be set to an array of groups for a [partial deployment](https://github.com/jhuckaby/confsync/blob/master/docs/Tutorial.md#partial-deployments). |

Here is an example push:

```js
let params = {
	"id": "myapp",
	"username": "jhuckaby",
	"base": JSON.parse( fs.readFileSync('/path/to/local/file.json', 'utf8') ),
	"message": "Initial release."
};

try {
	await confsync.push( params );
}
catch (err) {
	// handle error here
}
```

Here is an example of specifying overrides:

```js
let params = {
	"id": "myapp",
	"username": "jhuckaby",
	"base": JSON.parse( fs.readFileSync('/path/to/local/file.json', 'utf8') ),
	"overrides": JSON.parse( fs.readFileSync('/path/to/local/overrides.json', 'utf8') ),
	"message": "Initial release."
};

try {
	await confsync.push( params );
}
catch (err) {
	// handle error here
}
```

The overrides file should be formatted using the following syntax:

```json
{
	"dev": {
		"logging.debug_level": 9,
		"cache.enabled": false
	},
	"prod": {
		"logging.debug_level": 5,
		"cache.enabled": true
	}
}
```

Each top-level property should be a Group ID, and each sub-object property should be a "dot path" to a property and a replacement value.  To remove values as part of an override, set them to the special `_DELETE_` string.

### deploy

```
PROMISE deploy( PARAMS )
```

The `deploy` method deploys a specific file revision live, meaning it actually triggers an install on all your servers running [ConfSync Satellite](https://github.com/jhuckaby/confsync-satellite).  You can specify which revision to deploy (it defaults to the latest), and you can specify which of your groups the file should install to (it defaults to all of them).  The method accepts the following params:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus underscore and dash. |
| `username` | String | The username who is pushing the file. |
| `rev` | String | The revision to deploy, e.g. `r1`.  This defaults to the latest revision of the specified file. |
| `groups` | Array | Optionally limit the deployment to specific target groups (array of group IDs).  See [Partial Deployment](https://github.com/jhuckaby/confsync/blob/master/docs/Tutorial.md#partial-deployments) for details. |
| `duration` | Mixed | Optionally perform a [Gradual Deployment](https://github.com/jhuckaby/confsync/blob/master/docs/Tutorial.md#gradual-deployments), by specifying the desired time duration here. |

Here is an example deploy:

```js
let params = {
	"id": "myapp",
	"username": "jhuckaby".
	"rev": "r5", // defaults to latest
	"groups": ["dev", "prod"] // defaults to all
};

try {
	await confsync.deploy( params );
}
catch (err) {
	// handle error here
}
```

### history

```
PROMISE history( PARAMS ) --> { file, items, list, master }
```

The `history` method fetches the revision history for a specific config file, in reverse chronological order.  This will provide you with each revision number, message, username, and the date/time when it was pushed.  The method accepts the following params:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus underscore and dash. |
| `offset` | Number | Optionally fetch a subset of the revision table, for pagination.  Defaults to `0` (first page). |
| `limit` | Number | Optionally limit the results to the specified count.  Defaults to `25`. |

The promise resolves to an object with the following properties:

| Property Name | Type | Description |
|---------------|------|-------------|
| `file` | Object | This is the file metadata object from the [Master Data](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md#master-data). |
| `items` | Array | This is an array of file revisions, in the requested range.  See below. |
| `list` | Object | This is the revision table list header.  See [File Revisions](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md#file-revisions). |
| `master` | Object | This is the [Master Data](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md#master-data) object itself. |

Here is an example call:

```js
let params = {
	"id": "myapp",
	"offset": 0 // defaults to 0
	"limit": 25 // defaults to 25
};

try {
	let { file, items, list, master } = await confsync.history( params );
}
catch (err) {
	// handle error here
}
```

Each item in the `items` array will contain information about a specific revision.  Here is an example item:

```json
{
	"id": "myapp",
	"rev": "r5",
	"username": "jhuckaby",
	"message": "Switched new layout on.",
	"modified": 1696993359.974,
	"base": {
		"logging": {
			"debug_level": 9
		},
		"cache": {
			"enabled": true,
			"memory": "10 MB"
		},
		"features": {
			"halloween_theme": true,
			"new_layout": true,
			"christmas_theme": false
		}
	},
	"overrides": {
		"dev": {
			"logging.debug_level": 9,
			"cache.enabled": false
		},
		"prod": {
			"logging.debug_level": 5,
			"cache.enabled": true
		}
	}
}
```

The item will contain the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `id` | String | The File ID which owns the revision table. |
| `rev` | String | The file revision which will be in the format `r1`. |
| `username` | String | The user who pushed the revision, if applicable. |
| `message` | String | The push message, if the user supplied one. |
| `modified` | Number | The date/time of the revision, in Epoch seconds. |
| `base` | Mixed | The actual configuration file contents, in object form if JSON, or a plain string if non-JSON. |
| `overrides` | Object | The overrides for the file, if applicable. |

### get

```
PROMISE get( PARAMS ) --> { file, item, master }
```

The `get` method fetches a single file revision from the revision history table, given the File ID and revision number (e.g. `r1`).  If the revision number if omitted, the latest revision is fetched.  The method accepts the following params:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus underscore and dash. |
| `rev` | String | The file revision to fetch (e.g. `r1`).  If omitted, will fetch the latest revision. |

The promise resolves to an object with the following properties:

| Property Name | Type | Description |
|---------------|------|-------------|
| `file` | Object | This is the file metadata object from the [Master Data](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md#master-data). |
| `item` | Object | This is the requested revision from the revision history table.  See below. |
| `master` | Object | This is the [Master Data](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md#master-data) object itself. |

Here is an example call:

```js
let params = {
	"id": "myapp",
	"rev": "r5"
};

try {
	let { file, item, master } = await confsync.get( params );
}
catch (err) {
	// handle error here
}
```

Here is an example item:

```json
{
	"id": "myapp",
	"rev": "r5",
	"username": "jhuckaby",
	"message": "Switched new layout on.",
	"modified": 1696993359.974,
	"base": {
		"logging": {
			"debug_level": 9
		},
		"cache": {
			"enabled": true,
			"memory": "10 MB"
		},
		"features": {
			"halloween_theme": true,
			"new_layout": true,
			"christmas_theme": false
		}
	},
	"overrides": {
		"dev": {
			"logging.debug_level": 9,
			"cache.enabled": false
		},
		"prod": {
			"logging.debug_level": 5,
			"cache.enabled": true
		}
	}
}
```

The item will contain the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `id` | String | The File ID which owns the revision table. |
| `rev` | String | The file revision which will be in the format `r1`. |
| `username` | String | The user who pushed the revision, if applicable. |
| `message` | String | The push message, if the user supplied one. |
| `modified` | Number | The date/time of the revision, in Epoch seconds. |
| `base` | Mixed | The actual configuration file contents, in object form if JSON, or a plain string if non-JSON. |
| `overrides` | Object | The overrides for the file, if applicable. |

### find

```
PROMISE find( PARAMS ) --> { file, item, master }
```

The `find` method searches for a single file revision from the revision history table, given the File ID and search criteria.  The method accepts the following params:

| Parameter | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus underscore and dash. |
| `criteria` | Object | The search criteria to find the target item.  See below. |

The promise resolves to an object with the following properties:

| Property Name | Type | Description |
|---------------|------|-------------|
| `file` | Object | This is the file metadata object from the [Master Data](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md#master-data). |
| `item` | Object | This is the first matched revision from the revision history table.  See below. |
| `master` | Object | This is the [Master Data](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md#master-data) object itself. |

Here is an example call:

```js
let params = {
	"id": "myapp",
	"criteria": {
		"username": "jhuckaby" // find first rev that `jhuckaby` authored, in reverse chrono order
	}
};

try {
	let { file, item, master } = await confsync.find( params );
}
catch (err) {
	// handle error here
}
```

Note that the properties inside the `criteria` object must match exactly, and if multiple criteria properties are provided, **all** of them must match.  The API returns the first item that matches all the criteria, in reverse chronological order.

Here is an example item:

```json
{
	"id": "myapp",
	"rev": "r5",
	"username": "jhuckaby",
	"message": "Switched new layout on.",
	"modified": 1696993359.974,
	"base": {
		"logging": {
			"debug_level": 9
		},
		"cache": {
			"enabled": true,
			"memory": "10 MB"
		},
		"features": {
			"halloween_theme": true,
			"new_layout": true,
			"christmas_theme": false
		}
	},
	"overrides": {
		"dev": {
			"logging.debug_level": 9,
			"cache.enabled": false
		},
		"prod": {
			"logging.debug_level": 5,
			"cache.enabled": true
		}
	}
}
```

The item will contain the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `id` | String | The File ID which owns the revision table. |
| `rev` | String | The file revision which will be in the format `r1`. |
| `username` | String | The user who pushed the revision, if applicable. |
| `message` | String | The push message, if the user supplied one. |
| `modified` | Number | The date/time of the revision, in Epoch seconds. |
| `base` | Mixed | The actual configuration file contents, in object form if JSON, or a plain string if non-JSON. |
| `overrides` | Object | The overrides for the file, if applicable. |

### shutdown

```
PROMISE shutdown()
```

The `shutdown` method should always be called last, and only once, during your app's shutdown routine.  This tears down the connection to S3.  There are no return values in the resolved promise.  Example use:

```js
await confsync.shutdown();
```
