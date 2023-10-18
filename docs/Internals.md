# Internals

This document describes the internal data structures used in ConfSync, specifically its JSON records stored in S3.

## Table of Contents

> &larr; [Return to the main document](https://github.com/jhuckaby/confsync/blob/master/README.md)

<!-- toc -->

## Master Data

The master data record is a JSON file in S3 which contains all the basic information about your ConfSync configuration.  This includes your target groups, files, and all the metadata for those items.  The master data is always stored in the base of your S3 bucket (possibly under a prefix if you have that configured) and named `master.json`.  The `.json` suffix is only present if the `fileExtensions` property is set in the `Storage.S3` configuration section in your `config.json` file.

Here is an example master data record:

```json
{
	"groups": [
		{
			"title": "Development",
			"env": {
				"HOSTNAME": "\\.dev\\."
			},
			"id": "dev",
			"username": "jhuckaby",
			"modified": 1697146125.538,
			"created": 1696288064.379
		},
		{
			"title": "Production",
			"env": {
				"HOSTNAME": "\\b(prod|centos)\\b"
			},
			"id": "prod",
			"username": "jhuckaby",
			"modified": 1696876767.349,
			"created": 1696440917.819
		}
	],
	"files": [
		{
			"title": "My Great App",
			"id": "myapp",
			"username": "jhuckaby",
			"path": "/opt/myapp/conf/config.json",
			"modified": 1697063504.636,
			"created": 1696441493.515,
			"live": {
				"dev": {
					"rev": "r5",
					"start": 1696993875.524,
					"duration": 600
				},
				"prod": {
					"rev": "r5",
					"start": 1696993875.524,
					"duration": 600
				}
			},
			"mode": "600",
			"uid": "root",
			"counter": 5
		}
	]
}
```

The file is split up into two main arrays, `groups` and `files`.  See below for details on each.

### Groups

The `groups` array in the master data record contains information about your target groups.  Each element of the array is an object with the following properties:

| Property Name | Type | Description |
|---------------|------|-------------|
| `id` | String | This is the ID of the group.  It must be only alphanumeric, plus dash and underscore, and is always lower-case. |
| `title` | String | This is the title (display label) for the group.  It can be any length, and contain any characters. |
| `username` | String | This is the username who created (or last updated) the group. |
| `created` | Number | This is the group's creation date/time, in Epoch seconds. |
| `modified` | Number | This is the group's last modified date/time, in Epoch seconds. |
| `env.*` | String | These are the environment variable regular expression matches, to automatically add servers into the group. |

Here is an example group:

```json
{
	"title": "Production",
	"env": {
		"HOSTNAME": "\\b(prod|centos)\\b"
	},
	"id": "prod",
	"username": "jhuckaby",
	"modified": 1696876767.349,
	"created": 1696440917.819
}
```

### Files

The `files` array in the master data record contains information about your config files.  Each element of the array is an object with the following properties:

| Property Name | Type | Description |
|---------------|------|-------------|
| `id` | String | This is the ID of the group.  It must be only alphanumeric, plus dash and underscore, and is always lower-case. |
| `title` | String | This is the title (display label) for the group.  It can be any length, and contain any characters. |
| `path` | String | The filesystem path where the file should be installed on the target servers. |
| `mode` | String | An optional mode (permissions) for the file, specified in octal (e.g. `600`). |
| `uid` | Mixed | An optional user owner for the file, which can be numerical or a string (e.g. `root`). |
| `gid` | Mixed | An optional group for the file, which can be numerical or a string (e.g. `staff`). |
| `pid` | String | Optional location of your app's PID file, for use with `signal`.  See [PID File / Signal](https://github.com/jhuckaby/confsync#pid-file--signal). |
| `signal` | String | Optional signal to send your app on install, use with `pid`.  See [PID File / Signal](https://github.com/jhuckaby/confsync#pid-file--signal). |
| `exec` | String | Optional shell command to execute on install.  See [Shell Exec](https://github.com/jhuckaby/confsync#shell-exec). |
| `webhook` | String | Optional web URL to request on install.  See [Web Request](https://github.com/jhuckaby/confsync#web-request). |
| `env.*` | String | Add or replace one or more environment variables to match servers for the file. |
| `username` | String | This is the username who created (or last updated) the file. |
| `created` | Number | This is the file's creation date/time, in Epoch seconds. |
| `modified` | Number | This is the file's last modified date/time, in Epoch seconds. |
| `live` | Object | This object contains information about which file revisions are live in each of your groups.  See below for more details. |
| `counter` | Number | This is an internal counter used to pick the next revision number for pushes. |

Here is an example file:

```json
{
	"title": "My Great App",
	"id": "myapp",
	"username": "jhuckaby",
	"path": "/opt/myapp/conf/config.json",
	"modified": 1697063504.636,
	"created": 1696441493.515,
	"live": {
		"dev": {
			"rev": "r5",
			"start": 1696993875.524,
			"duration": 600
		},
		"prod": {
			"rev": "r5",
			"start": 1696993875.524,
			"duration": 600
		}
	},
	"mode": "600",
	"uid": "root",
	"counter": 5
}
```

The `live` object contains a property for each of your target groups, and each of those sub-objects will contain the following properties:

| Property Name | Type | Description |
|---------------|------|-------------|
| `rev` | String | The file revision number that is currently live in the group. |
| `start` | Number | When the last deploy started, in Epoch Seconds. |
| `duration` | Number | If the last deploy was a [gradual deployment](https://github.com/jhuckaby/confsync/blob/master/docs/Tutorial.md#gradual-deployments), this will contain the duration in seconds. |

## File Revisions

ConfSync keeps a complete revision history for each of your config files.  These are paginated lists in JSON format, with a header record and one or more page records.  Each list page includes up to 100 revisions of your file.

For details on how lists work internally, see [Lists in pixl-server-storage](https://github.com/jhuckaby/pixl-server-storage/blob/master/docs/Lists.md).

The list header is a JSON object that looks like this:

```json
{
	"page_size": 100,
	"first_page": 0,
	"last_page": 0,
	"length": 5,
	"type": "list"
}
```

This defines the list and its pages.  Here are descriptions of the header properties:

| Property | Type | Description |
|----------|------|-------------|
| `type` | String | A static identifier, which will always be set to `list`. |
| `length` | Number | How many items are currently in the list. |
| `page_size` | Number | How many items are stored per page. |
| `first_page` | Number | The page number of the beginning of the list, zero-based. |
| `last_page` | Number | The page number of the end of the list, zero-based. |

The list pages are stored as records "under" the main key, by adding a slash, followed by the page number.

Here is an example of a list page:

```json
{
	"type": "list_page",
	"items": [
		{
			"overrides": {
				"dev": {
					"logging.debug_level": 9,
					"cache.enabled": false
				},
				"prod": {
					"logging.debug_level": 5,
					"cache.enabled": true
				}
			},
			"id": "myapp",
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
			"modified": 1696993359.974,
			"rev": "r5",
			"message": "Switched new layout on.",
			"username": "jhuckaby"
		},
		...
	]
}
```

Each page record will have a `type` property set to `list_page` (for identification purposes), and an `items` array.  This array will contain up to 100 items, before it is split into additional pages.

Each item in the `items` array is one revision of the file.  It will contain the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `id` | String | The File ID which owns the revision table. |
| `rev` | String | The file revision which will be in the format `r1`. |
| `username` | String | The user who pushed the revision, if applicable. |
| `message` | String | The push message, if the user supplied one. |
| `modified` | Number | The date/time of the revision, in Epoch seconds. |
| `base` | Mixed | The actual configuration file contents, in object form if JSON, or a plain string if non-JSON. |
| `overrides` | Object | The overrides for the file, if applicable. |
