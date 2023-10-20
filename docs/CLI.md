# CLI Reference

This document contains a complete CLI reference for ConfSync.

## Table of Contents

> &larr; [Return to the main document](https://github.com/jhuckaby/confsync/blob/main/README.md)

<!-- toc -->
- [Commands](#commands)
	* [config](#config)
	* [list](#list)
	* [group add](#group-add)
	* [group update](#group-update)
	* [group delete](#group-delete)
	* [group get](#group-get)
	* [add](#add)
	* [update](#update)
	* [delete](#delete)
	* [info](#info)
	* [push](#push)
	* [clone](#clone)
	* [deploy](#deploy)
	* [history](#history)
	* [get](#get)
	* [diff](#diff)

## Commands

ConfSync has a full-featured CLI which you can use to manage all your configuration files.  When you install the module globally, it installs a single command called `confsync` which is the CLI entry point.  The general syntax of the CLI is:

```
$ confsync COMMAND [ARG1 ARG2...] [--KEY VALUE --KEY VALUE...]
```

Example command:

```
$ confsync group add "dev" --title "Development" --env.HOSTNAME '\.dev\.'
```

Each command typically takes zero or more plain arguments, but most also support a number of "switches" (key/value arguments specified using a double-dash, e.g. `--key value`).

Here is the full CLI reference:

### config

The `config` command allows you to manipulate the ConfSync `config.json` file.  Called without any other arguments, the CLI just spits out the fully-qualified filesystem location of the `config.json` file, so you can edit it manually:

```
$ confsync config

Config File: /usr/local/lib/node_modules/confsync/config.json
```

You can also use the `config` command to make changes inside the file, using key/value arguments and [dot path notation](https://www.npmjs.com/package/dot-prop).  Here is an example of this:

```
$ confsync config --Storage.AWS.region us-west-1 --Storage.AWS.credentials.accessKeyId YOUR_ACCESS_KEY --Storage.AWS.credentials.secretAccessKey YOUR_SECRET_KEY --Storage.S3.params.Bucket YOUR_S3_BUCKET --Storage.S3.keyPrefix YOUR_S3_PREFIX
```

### list

The `list` command displays information about your target groups and config files.  It has no other arguments.  Example:

```
$ confsync list

 Target Groups: (2)
 ┌──────────┬─────────────┬──────────┬─────────────────────┐
 │ Group ID │ Title       │ Author   │ Modified            │
 ├──────────┼─────────────┼──────────┼─────────────────────┤
 │ dev      │ Development │ jhuckaby │ 2023/10/02 4:07 PM  │
 │ prod     │ Production  │ jhuckaby │ 2023/10/09 11:39 AM │
 └──────────┴─────────────┴──────────┴─────────────────────┘

 Config Files: (1)
 ┌───────────┬──────────────┬─────────────────────────────┬──────────┬────────────────────┐
 │ Config ID │ Title        │ Path                        │ Author   │ Modified           │
 ├───────────┼──────────────┼─────────────────────────────┼──────────┼────────────────────┤
 │ myapp     │ My Great App │ /opt/myapp/conf/config.json │ jhuckaby │ 2023/10/11 3:31 PM │
 └───────────┴──────────────┴─────────────────────────────┴──────────┴────────────────────┘
```

### group add

```
confsync group add GROUP_ID --title 'YOUR GROUP TITLE' --env.HOSTNAME 'REGEXP'
```

The `group add` command adds a new target group.  This is how you can group multiple servers together, and is typically used to denote "environments" in your architecture.  The Group ID should be alphanumeric with underscores and dashes.  It accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The Group ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `title` | String | The Group Title, which is a display label, and can be any length and use any characters you want.  If omitted, this defaults to the ID. |
| `username` | String | The username who is creating the group.  This defaults to the current shell user. |
| `priority` | Number | Specify an optional priority, which is used to sort groups when applying overrides. |
| `env.*` | String | **(Required)** Specify one or more environment variables to match servers for the group. |

Here is an example:

```
$ confsync group add "dev" --title "Development" --env.HOSTNAME '\.dev\.'

✅ Success: Configuration target group added: `dev` (Development)

 ┌──────────────────────────────┐
 │ Group ID: dev                │
 │ Title:    Development        │
 │ Author:   jhuckaby           │
 │ Created:  2023/10/02 4:07 PM │
 │ Modified: 2023/10/02 4:07 PM │
 └──────────────────────────────┘

 Member Criteria:
 ┌──────────────┬───────────────┐
 │ Env Variable │ Match Pattern │
 ├──────────────┼───────────────┤
 │ HOSTNAME     │ /\.dev\./     │
 └──────────────┴───────────────┘
```

The `env.*` arguments set environment variables to match servers for automatic inclusion in the group.  The values are interpreted as [regular expressions](https://en.wikipedia.org/wiki/Regular_expression), so beware of characters that have special meanings.  It is recommended that you use 'single quotes' for these, so you don't have to escape backslashes, etc.

### group update

```
confsync group update GROUP_ID --title 'NEW GROUP TITLE' --env.HOSTNAME 'REGEXP'
```

The `group update` command updates an existing target group.  You can change the title, username, priority, and/or environment variables.  It accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The Group ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `title` | String | The Group Title, which is a display label, and can be any length and use any characters you want. |
| `username` | String | The username who owns the group.  This defaults to the current shell user. |
| `priority` | Number | Specify an optional priority, which is used to sort groups when applying overrides. |
| `env.*` | String | Add or replace one or more environment variables to match servers for the group. |

Here is an example group update:

```
$ confsync group update "dev" --title "Dev / Test" --priority 2

 ┌──────────────────────────────┐
 │ Group ID: dev                │
 │ Title:    Dev / Test         │
 │ Priority: 2                  │
 │ Author:   jhuckaby           │
 │ Created:  2023/10/02 4:07 PM │
 │ Modified: 2023/10/12 2:28 PM │
 └──────────────────────────────┘
```

**Note:** To remove environment variables from a group, set them to `_DELETE_`.  This is a special string constant that is recognized by the CLI.  Example:

```
$ confsync group update "dev" --env.HOSTNAME _DELETE_
```

However, note that your group must always have at least one environment variable.

### group delete

```
confsync group delete GROUP_ID
```

The `group delete` command deletes a target group.  All you need to specify is the Group ID.  The command accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The Group ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `username` | String | The username who is deleting the group (for logging purposes).  This defaults to the current shell user. |

Example delete:

```
$ confsync group delete "test"

✅ Success: Configuration target group deleted: `test`
```

### group get

```
confsync group get GROUP_ID
```

The `group get` command fetches information about a group.  All you need to specify is the Group ID.  No other arguments are required.  Example:

```
$ confsync group get "dev"

 ┌──────────────────────────────┐
 │ Group ID: dev                │
 │ Title:    Development        │
 │ Author:   jhuckaby           │
 │ Created:  2023/10/02 4:07 PM │
 │ Modified: 2023/10/12 2:28 PM │
 └──────────────────────────────┘

 Member Criteria:
 ┌──────────────┬───────────────┐
 │ Env Variable │ Match Pattern │
 ├──────────────┼───────────────┤
 │ HOSTNAME     │ /\.dev\./     │
 └──────────────┴───────────────┘
```

### add

```
confsync add FILE_ID --title 'YOUR CONFIG TITLE' --dest /path/to/your/config.json
```

The `add` command adds a new config file definition.  That is, it defines a new configuration file to be managed by ConfSync.  You do not need to specify the *contents* of the file at this stage -- only metadata, including a title, the destination path on the server where the file should eventually reside, and other optional details.  It accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `title` | String | The File Title, which is a display label, and can be any length and use any characters you want. |
| `username` | String | The username who owns the file.  This defaults to the current shell user. |
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

```
$ confsync add "myapp" --title "My Great App" --dest /opt/myapp/conf/config.json --mode 600 --uid root

✅ Success: Configuration file added: `myapp` (My Great App)

 ┌─────────────────────────────────────────┐
 │ Config ID:  myapp                       │
 │ Title:      My Great App                │
 │ Path:       /opt/myapp/conf/config.json │
 │ Mode:       600                         │
 │ UID:        root                        │
 │ Author:     jhuckaby                    │
 │ Created:    2023/10/04 10:44 AM         │
 │ Modified:   2023/10/04 10:44 AM         │
 │ Revisions:  0                           │
 │ Latest Rev: n/a                         │
 └─────────────────────────────────────────┘
```

### update

```
confsync update FILE_ID --title 'NEW CONFIG TITLE' --mode 644 --uid root
```

The `update` command updates an existing config file definition.  You can change the title, destination path, or set optional features like file mode, user/group, or add app notification options.  Note that the file ID cannot be changed.  The command accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `title` | String | The File Title, which is a display label, and can be any length and use any characters you want. |
| `username` | String | The username who owns the file.  This defaults to the current shell user. |
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

```
$ confsync update myapp --pid /var/run/myapp.pid --signal SIGUSR2

✅ Success: Configuration file updated: `myapp` (My Great App)

 ┌─────────────────────────────────────────┐
 │ Config ID:  myapp                       │
 │ Title:      My Great App                │
 │ Path:       /opt/myapp/conf/config.json │
 │ Mode:       600                         │
 │ UID:        root                        │
 │ PID File:   /var/run/myapp.pid          │
 │ Signal:     SIGUSR2                     │
 │ Author:     jhuckaby                    │
 │ Created:    2023/10/04 10:44 AM         │
 │ Modified:   2023/10/11 11:07 AM         │
 │ Revisions:  5                           │
 │ Latest Rev: r5                          │
 └─────────────────────────────────────────┘
```

### delete

```
confsync delete FILE_ID
```

The `delete` command deletes a configuration file.  By default, this will not delete the file revision history, and just removes the file definition.  If you want a full delete including the revision history, add a `--full` switch.  Note that deleting a config file does **not** delete any files from your servers.  It only removes the file from ConfSync management.  The command accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `username` | String | The username who is deleting the file (for logging purposes).  This defaults to the current shell user. |
| `full` | Boolean | Set this to `true` to delete the file revision history as well as the definition. |

Here is an example delete:

```
$ confsync delete "myapp"

✅ Success: Configuration file deleted: `myapp`
```

### info

```
confsync info FILE_ID
```

The `info` command fetches detailed information about a config file, including which revisions are currently deployed to which target groups.  All you need to specify is the File ID.  No other arguments are required.  Example:

```
$ confsync info myapp

 ┌─────────────────────────────────────────┐
 │ Config ID:  myapp                       │
 │ Title:      My Great App                │
 │ Path:       /opt/myapp/conf/config.json │
 │ Mode:       600                         │
 │ UID:        root                        │
 │ Author:     jhuckaby                    │
 │ Created:    2023/10/04 10:44 AM         │
 │ Modified:   2023/10/11 3:31 PM          │
 │ Revisions:  5                           │
 │ Latest Rev: r5                          │
 └─────────────────────────────────────────┘

 Deployment Info:
 ┌──────────┬─────────────┬──────────┬─────────────────────────────┐
 │ Group ID │ Title       │ Live Rev │ Deployed                    │
 ├──────────┼─────────────┼──────────┼─────────────────────────────┤
 │ dev      │ Development │ ✅ r5    │ 2023/10/10 8:11 PM (10 min) │
 │ prod     │ Production  │ ✅ r5    │ 2023/10/10 8:11 PM (10 min) │
 └──────────┴─────────────┴──────────┴─────────────────────────────┘
```

If the config file targets specific servers via environments variables, those match rules are displayed here as well.

### push

```
confsync push FILE_ID LOCAL_FILE --message 'YOUR MESSAGE'
```

The `push` command pushes a new revision for a specific file.  ConfSync keeps the full revision history for each file in a list, and this pushes a new entry onto the head of the list.  This is where you provide the actual contents of the file, and an optional message describing (briefly) what changed.  The command accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `base` | String | **(Required)** The local file path to load and use as the base file content.  You can specify this as an "inline" argument without the `--base` prefix, as shown above. |
| `username` | String | The username who is pushing the file.  This defaults to the current shell user. |
| `overrides` | String | Optionally specify an overrides file, if applicable for your config.  See [Overrides](https://github.com/jhuckaby/confsync/blob/main/docs/Tutorial.md#overrides) for details. |
| `message` | String | An optional short message to accompany the revision, briefly describing what changed. |
| `git` | Boolean | Set this to `true` to automatically populate the `username` and `message` properties from the latest Git commit (assuming you're pushing from a Git repo). |
| `deploy` | Mixed | Optionally [deploy](#deploy) the revision when pushing.  This can also be set to a comma-separated list of groups for a [partial deployment](https://github.com/jhuckaby/confsync/blob/main/docs/Tutorial.md#partial-deployments). |
| `confirm` | Boolean | Include this argument to confirm the push operation.  When omitted, no action is taken and a preview diff is displayed. |

Here is an example push:

```
$ confsync push myapp ~/local/path/to/config.json --message "Initial revision."

✅ Success: Configuration file `myapp` revision `r1` pushed by `jhuckaby`: Initial revision.
```

If you are pushing a file that already has revisions in the list, then the command defaults to taking no action, and instead shows you a diff of the changes:

```
$ confsync push myapp ~/temp/myapp-config.json --message "Added halloween theme feature."

Preview Diff:
 {
 ...
 	"features": {
+		"halloween_theme": false,
 		"new_layout": false,
 ...
 }

Repeat your command with `--confirm` to push to S3.
```

To actually commit the changes, you must include the `--confirm` switch.

### clone

```
confsync clone FILE_ID --base.YOUR.KEY NEW_VALUE --message 'YOUR MESSAGE'
```

**Note:** *This feature only works with JSON or JSON5 configuration files.*

The `clone` command makes a copy of an existing revision, applies changes you specify, and pushes a new revision with the changes in place.  This is for making quick changes on the command-line, without having to edit the raw source file.  The command accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `username` | String | The username who is pushing the file.  This defaults to the current shell user. |
| `base.*` | Mixed | **(Required)** Specify one or more changes to apply to the file, using JSON dot path notation.  See below. |
| `overrides.*` | Mixed | Optionally specify changes for the file's overrides as well.  See below. |
| `message` | String | An optional short message to accompany the revision, briefly describing what changed. |
| `deploy` | Mixed | Optionally [deploy](#deploy) the revision when pushing.  This can also be set to a comma-separated list of groups for a [partial deployment](https://github.com/jhuckaby/confsync/blob/main/docs/Tutorial.md#partial-deployments). |
| `confirm` | Boolean | Include this argument to confirm the push operation.  When omitted, no action is taken and a preview diff is displayed. |

Here is an example clone:

```
$ confsync clone myapp --base.features.halloween_theme true --message "Enabled halloween theme."

Preview Diff:
 {
 ...
 	"features": {
-		"halloween_theme": false,
+		"halloween_theme": true,
 		"new_layout": false,
 ...
 }

Repeat your command with `--confirm` to push to S3.
```

If the change looks good, confirm the operation:

```
$ confsync clone myapp --base.features.halloween_theme true --message "Enabled halloween theme." --confirm

✅ Success: Configuration file `myapp` revision `r3` pushed by `jhuckaby`: Enabled halloween theme.
```

You can also use `clone` to set or update [overrides](https://github.com/jhuckaby/confsync/blob/main/docs/Tutorial.md#overrides).  For those, use this syntax:

```
--overrides.GROUP.PATH "VALUE"
```

Replace `GROUP` with the Group ID you want to set an override for, and `PATH` with the JSON path to the property you want to set, in dot path notation.  Here is an example:

```
$ confsync clone myapp --overrides.prod.logging.debug_level 9 --message "Debugging an issue on prod."
```

### deploy

```
confsync deploy FILE_ID --rev REVISION --groups GROUPS
```

The `deploy` command deploys a specific file revision live, meaning it actually triggers an install on all your servers running [ConfSync Satellite](https://github.com/jhuckaby/confsync-satellite).  You can specify which revision to deploy (it defaults to the latest), and you can specify which of your groups the file should install to (it defaults to all of them).  The command accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `username` | String | The username who is pushing the file.  This defaults to the current shell user. |
| `rev` | String | The revision to deploy, e.g. `r1`.  This defaults to the latest revision of the specified file. |
| `groups` | String | Optionally limit the deployment to specific target groups (as a comma-separated list).  See [Partial Deployment](https://github.com/jhuckaby/confsync/blob/main/docs/Tutorial.md#partial-deployments) for details. |
| `duration` | Mixed | Optionally perform a [Gradual Deployment](https://github.com/jhuckaby/confsync/blob/main/docs/Tutorial.md#gradual-deployments), by specifying the desired time duration here. |

Here is an example deploy:

```
$ confsync deploy myapp

✅ Success: Configuration file `myapp` revision `r1` deployed by `jhuckaby` to groups: dev,prod
```

### history

```
confsync history FILE_ID
```

The `history` command fetches the revision history for a specific config file.  This will show you each revision number, message, username, the date/time when it was pushed, and which revisions are live on which of your target groups.  Here is an example:

```
$ confsync history myapp

 ┌────────────────────────────────────────┐
 │ Config ID: myapp                       │
 │ Title:     My Great App                │
 │ Path:      /opt/myapp/conf/config.json │
 │ Author:    jhuckaby                    │
 │ Created:   2023/10/04 10:44 AM         │
 │ Modified:  2023/10/11 3:31 PM          │
 │ Revisions: 5                           │
 └────────────────────────────────────────┘

 Revision History: (1 - 5 of 5)
 ┌──────────┬────────────────────────────────┬──────────┬─────────────────────┬──────────┐
 │ Revision │ Message                        │ Author   │ Date/Time           │ Live     │
 ├──────────┼────────────────────────────────┼──────────┼─────────────────────┼──────────┤
 │ r5       │ Switched new layout on.        │ jhuckaby │ 2023/10/10 8:02 PM  │ ✅ (All) │
 │ r4       │ Added new overrides.           │ jhuckaby │ 2023/10/07 8:53 PM  │          │
 │ r3       │ Enabled halloween theme.       │ jhuckaby │ 2023/10/07 2:36 PM  │          │
 │ r2       │ Added halloween theme feature. │ jhuckaby │ 2023/10/07 12:15 PM │          │
 │ r1       │ Initial revision.              │ jhuckaby │ 2023/10/05 9:00 PM  │          │
 └──────────┴────────────────────────────────┴──────────┴─────────────────────┴──────────┘
```

If your revision history is longer than 25 entries, ConfSync will paginate the results.  To fetch additional (older) pages, use the `--page` argument like this:

```
$ confsync history myapp --page 2
```

### get

```
confsync get FILE_ID REVISION
```

The `get` command fetches a single revision of your file, and displays information as well as the full file contents.  You can also optionally perform a "preview transform" of the file if it has overrides, and download the file to local disk if you want.  The command accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `id` | String | **(Required)** The File ID, which should be alphanumeric plus dash.  You can specify this as an "inline" argument without the `--id` prefix, as shown above. |
| `rev` | String | **(Required)** The File Revision, which should be in the form `r1`.  You can specify this as an "inline" argument without the `--rev` prefix, as shown above. |
| `groups` | String | Optionally specify group IDs (comma-separated) to preview an override transform.  See [Overrides](https://github.com/jhuckaby/confsync/blob/main/docs/Tutorial.md#overrides) for details. |
| `save` | String | Optionally specify a filename to save the file locally. |

Here is an example:

```
$ confsync get myapp r2

 ┌───────────────────────────────────────────┐
 │ Config ID: myapp                          │
 │ Title:     My Great App                   │
 │ Path:      /opt/myapp/conf/config.json    │
 │ Revision:  r2                             │
 │ Author:    jhuckaby                       │
 │ Message:   Added halloween theme feature. │
 │ Date/Time: 2023/10/07 12:15 PM            │
 │ Live:      (No)                           │
 └───────────────────────────────────────────┘

Base JSON:
{
	"logging": {
		"debug_level": 9
	},
	"cache": {
		"enabled": true,
		"memory": "10 MB"
	},
	"features": {
		"halloween_theme": false,
		"new_layout": false,
		"christmas_theme": false
	}
}
```

### diff

```
confsync diff FILE_ID REVISION1 REVISION2
```

The `diff` command computes the difference between two revisions, and shows you visually which lines changed (added or removed).  You can specify any two arbitrary revisions as shown in the command syntax above, or if you omit those it will default to the latest vs. the previous revision.  Here is an example diff:

```
$ confsync diff myapp r2 r1

 ┌────────────────────────────────────────┐
 │ Config ID: myapp                       │
 │ Title:     My Great App                │
 │ Path:      /opt/myapp/conf/config.json │
 │ Revisions: r1 --> r2                   │
 └────────────────────────────────────────┘

Revision Diff:
 {
 ...
 	"features": {
+		"halloween_theme": false,
 		"new_layout": false,
 ...
 }
```
