## Overview

**ConfSync** is a simple configuration file management system.  It can manage and deploy all your configuration files for you, including revisions.  The files are stored in a S3 bucket you specify, and are automatically installed onto your servers via our satellite agent.  You control when and how they are deployed, using the CLI or API.  After upload to S3, files will auto-install on all your servers in one minute or less (or your pizza is free).

The expectation is that your application will "hot reload" its configuration files when ConfSync updates them.  If your app doesn't support this kind of thing, then you can have ConfSync "notify" your app to reload, via a custom signal sent to your process, a localhost web request, or a shell command.

ConfSync can be used as a basic [feature flag](https://en.wikipedia.org/wiki/Feature_toggle) system, as you can toggle JSON properties on/off as part of config updates.  However, this is really rudimentary.  If you need professional feature flagging, please check out [LaunchDarkly](https://launchdarkly.com/), [DevCycle](https://devcycle.com/), [GrowthBook](https://www.growthbook.io/), or [FlagSmith](https://www.flagsmith.com/), as they are a thousand times better than ConfSync.

### Features

- No hosted service or upsell.
- No persistent or background daemon process.
- No database whatsoever (uses S3 and only S3).
- Completely private and on prem, or in your private cloud.
- Software never calls home (also, there is no home).
- Unlimited server groups, identified by any environment variables you select.
- Unlimited config files, with unlimited revisions.
- Config files may target any or all of your servers, also by env var match.
- Config files can be in any format.
- Special features for JSON and JSON5 config files.
- Optional config overrides per server group.
- Push and deploy a revision all on the CLI with one command.
- Zero dependency satellite agent (static binary), runs via cron.
- Config files can each have custom modes, UIDs and GIDs.
- Config file updates are written atomically.
- New file revisions can be partially deployed to specific groups.
- Deploy can be separate from push (upload).
- Gradual deploys with custom durations.
- Custom app notification options for installed files.
- Simple and easy rollbacks.
- Show diffs between file revisions.
- Web hooks for all actions.
- GitHub Integration.

### Table of Contents

The documentation is split up across these files:

- &rarr; **[Main Docs](https://github.com/jhuckaby/confsync/blob/master/README.md)** *(You are here)*
- &rarr; **[Walkthrough / Tutorial](https://github.com/jhuckaby/confsync/blob/master/docs/Tutorial.md)**
- &rarr; **[Advanced Topics](https://github.com/jhuckaby/confsync/blob/master/docs/Advanced.md)**
- &rarr; **[CLI Reference](https://github.com/jhuckaby/confsync/blob/master/docs/CLI.md)**
- &rarr; **[API Reference](https://github.com/jhuckaby/confsync/blob/master/docs/API.md)**
- &rarr; **[Confsync Satellite](https://github.com/jhuckaby/confsync-satellite)**
- &rarr; **[Internals](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md)**

Here is the table of contents for this document:

<!-- toc -->
* [Architecture](#architecture)
	* [Glossary](#glossary)
- [Setup](#setup)
- [Configuration](#configuration)
	* [Environment Variables](#environment-variables)
- [Usage](#usage)
- [Satellite](#satellite)
- [Install Notifications](#install-notifications)
	* [PID File / Signal](#pid-file--signal)
	* [Web Request](#web-request)
	* [Shell Exec](#shell-exec)
- [Web Hooks](#web-hooks)
- [Logging](#logging)
- [Upgrading](#upgrading)
- [Estimated S3 Costs](#estimated-s3-costs)
- [See Also](#see-also)
- [License](#license)

### Architecture

ConfSync has two main components:

1. The **ConfSync CLI / API**, which only needs to be installed once.  It can run anywhere you like, such as an administrative server, or on your local machine.  This is the main user interface to the system, and controls pushing files and triggering deployments.  It ships as a Node.js package, so you will need to have [Node.js preinstalled](https://nodejs.org/en/download).
2. **ConfSync Satellite**, which is a remote satellite agent that lives on **all** your servers.  This "listens" (polls) for configuration changes in S3, and installs the correct files and revisions on each server.  This ships as a single static binary executable with flavors for all popular architectures, and has zero dependencies.  It runs via cron.

### Glossary

Here are some common terms used in ConfSync:

| Term | Description |
|------|-------------|
| **Target Group** | Also referred to simply as a "group", this is a set of servers you classify by a custom ID and environment variable matching.  You can then target server groups for deployments.  For example, you can create groups for all of your server environments (Dev, Stage, Prod, etc.), and/or server class (application, database, etc.). |
| **Config File** | Also referred to simply as a "file", this is a single configuration file under management by ConfSync.  Specifically, this is a config file definition, not the file content (that comes later).  You specify a custom file ID, the destination path on the server where it should (eventually) be installed, which servers it should be installed to (or simply all of them), and optional details like the file mode (permissions), UID, GID, and how to notify your app when the file changes. |
| **Revision** | A revision is a single version of a config file.  You "push" revisions onto a list in S3, and you can deploy any revision live to any of your target groups.  ConfSync keeps all revisions in S3 forever, so you can always rollback to older ones. |
| **Push** | Pushing involves uploading a local file (or changes to a file) up to S3.  A push becomes a new revision in the S3 list for each file.  You can also deploy the revision (i.e. make it live) at the same time as pushing. |
| **Deploy** | Deploying is setting a specific revision to be "live" in one or more of your server groups.  This triggers the satellite agent to actually install the specified file revision onto the appropriate servers.  Pushing and deploying can be done separately, or together with one command.  Deploying can be instant, or gradual. |

## Setup

Use [npm](https://www.npmjs.com/) to install the ConfSync CLI:

```
$ npm i -g confsync
```

You may need to be root or use `sudo` in order to install global commands.

This will add a single `confsync` command into your PATH.

You only need to install the CLI on one single server (your config management server), or a local machine that has access to your S3 bucket.  See [ConfSync Satellite](https://github.com/jhuckaby/confsync-satellite) for the agent that runs on all your target servers.

## Configuration

The ConfSync CLI / API is configured via a single JSON file, which lives wherever the package is installed.  You can determine the location of the file by typing:

```
$ confsync config
```

The file contains things like the debug log settings, web hooks, and AWS / S3 setup.  You can edit the config file manually using your text editor of choice, or you can use command-line syntax like this to quickly set the essentials:

```
$ confsync config --Storage.AWS.region us-west-1 --Storage.AWS.credentials.accessKeyId YOUR_ACCESS_KEY --Storage.AWS.credentials.secretAccessKey YOUR_SECRET_KEY --Storage.S3.params.Bucket YOUR_S3_BUCKET --Storage.S3.keyPrefix YOUR_S3_PREFIX
```

<details><summary>Configuration Details</summary>

Here are descriptions of all the config file properties:

| Property Path | Type | Description |
|---------------|------|-------------|
| `log_dir` | String | The directory in which to place the ConfSync log file.  This can be a relative or absolute path.  Relative paths are calculated from the package root directory. |
| `log_filename` | String | The log filename. |
| `log_columns` | Array | Which columns to log.  See [pixl-logger](https://github.com/jhuckaby/pixl-logger) for details. |
| `debug_level` | Number | This controls how verbose the debug log messages are, from level 1 to 9.  Errors and transactions are *always* logged, regardless of level. |
| `color` | Boolean | This controls whether ANSI colors are displayed in the CLI output on the terminal.  Set this to `false` to disable all color. |
| `cmd_suggest` | Boolean | If set to true, the CLI will emit helpful command suggestions for you. |
| `web_hooks` | Object | Optionally fire off web hooks for any or all actions.  See [Web Hooks](#web-hooks) below. |
| `web_hook_text_templates` | Object | This section controls the text message content sent with web hooks (for things like Slack, Discord, etc.). |
| `Storage.transactions` | Boolean | Enable or disable storage transactions.  **Please leave this enabled**, as it helps ensure data integrity in S3.  See [Storage Transactions](https://github.com/jhuckaby/pixl-server-storage/blob/master/docs/Transactions.md) for details. |
| `Storage.trans_auto_recover` | Boolean | Automatically recover after crashes or storage errors. **Please leave this enabled**, as it helps ensure data integrity in S3.  See [Storage Transactions](https://github.com/jhuckaby/pixl-server-storage/blob/master/docs/Transactions.md) for details. |
| `Storage.concurrency` | Number | The maximum number of concurrent threads to use when reading/writing to S3. |
| `Storage.list_page_size` | Number | The number of items (revisions) per list page.  **Please do not change this.**  See [Storage Lists](https://github.com/jhuckaby/pixl-server-storage/blob/master/docs/Lists.md) if you are curious how this works. |
| `Storage.engine` | String | The storage engine to use.  This should be set to `S3`.  Support for other engines may be added in the future. |
| `Storage.AWS.region` | String | The AWS region where your S3 bucket lives, e.g. `us-west-1`. |
| `Storage.AWS.credentials.accessKeyId` | String | Your AWS access account key ID.  You can omit this if you have AWS authentication handled elsewhere (IAM, EC2, etc.). |
| `Storage.AWS.credentials.secretAccessKey` | String | Your AWS account secret key.  You can omit this if you have AWS authentication handled elsewhere (IAM, EC2, etc.). |
| `Storage.AWS.connectTimeout` | Number | The timeout for connecting to S3, in milliseconds. |
| `Storage.AWS.socketTimeout` | Number | The idle socket timeout for communicating with S3, in milliseconds. |
| `Storage.AWS.maxAttempts` | Number | The number of retry attempts to make for failed S3 operations (includes exponential backoff). |
| `Storage.S3.keyPrefix` | String | Optionally prefix all the S3 keys with a directory, such as `confsync/`.  Useful when pointing to a shared S3 bucket. |
| `Storage.S3.fileExtensions` | Boolean | Add a `.json` extension onto all S3 keys.  It is highly recommended that you leave this enabled, as it allows your S3 bucket to be backed up / replicated more easily.  See [S3 File Extensions](https://github.com/jhuckaby/pixl-server-storage#s3-file-extensions) for details. |
| `Storage.S3.pretty` | Boolean | Pretty-print all JSON records in S3.  This increases S3 file sizes a bit, but it makes for easier debugging. |
| `Storage.S3.params.Bucket` | String | Your AWS S3 bucket name.  Make sure the region matches! |

</details>

### Environment Variables

ConfSync can also be configured via environment variables.  These can be declared in your shell environment where you use the CLI, or you can include a [dotenv](https://www.npmjs.com/package/dotenv) (`.env`) file in the package root directory.  Either way, the variable name syntax is `CONFSYNC_key` where `key` is a JSON configuration property path.

For overriding configuration properties via environment variable, you can specify any top-level JSON key from `config.json`, or a *path* to a nested property using double-underscore (`__`) as a path separator.  For boolean properties, you can specify `1` for true and `0` for false.  Here is an example of some env vars:

```
CONFSYNC_debug_level=9
CONFSYNC_Storage__AWS__region="us-west-1"
CONFSYNC_Storage__AWS__credentials__accessKeyId="YOUR_AWS_ACCESS_KEY_HERE"
CONFSYNC_Storage__AWS__credentials__secretAccessKey="YOUR_AWS_SECRET_KEY_HERE"
CONFSYNC_Storage__S3__keyPrefix="YOUR_S3_KEY_PREFIX_HERE"
CONFSYNC_Storage__S3__params__Bucket="YOUR_S3_BUCKET_HERE"
```

Almost every configuration property can be overridden using this environment variable syntax.  The only exceptions are things like arrays, e.g. `log_columns`.

## Usage

Type `confsync` to get help, or `confsync list` to see a list of all your groups and files:

![ConfSync CLI](http://pixlcore.com/software/confsync/screenshots/confsync-cli.png)

See the [Walkthrough / Tutorial](https://github.com/jhuckaby/confsync/blob/master/docs/Tutorial.md) or [CLI Reference](https://github.com/jhuckaby/confsync/blob/master/docs/CLI.md) for more details on CLI usage.

## Satellite

**ConfSync Satellite** is our remote agent that handles *installing* configuration files on all your servers.  Basically, it "listens" (polls) for configuration changes in S3, and installs the correct files and revisions on each server.  It ships as a single static binary executable with flavors for all popular architectures, and has zero dependencies.

Satellite does not run persistently in the background, meaning it is not a daemon process nor system service.  Rather, it just registers itself with [cron](https://en.wikipedia.org/wiki/Cron) on install, and simply run every minute (or any frequently you prefer), checks for changes, installs or updates config files as needed, then exits.

See [ConfSync Satellite](https://github.com/jhuckaby/confsync-satellite) for full details.

## Install Notifications

Not only can ConfSync install your config files, but it can also notify your application when the file changes.  Some applications may already have code that polls or otherwise listens for filesystem changes, but if not, ConfSync can help make this easier.  It can send a signal to your process, send a request to your web service, or even execute a custom shell command.  See below for details.

### PID File / Signal

If your application writes out a "PID File" on startup, then ConfSync can read that file to determine your app's PID (Process ID), and send a signal to it.  Typically this will be a `SIGUSR1` or `SIGUSR2`, but it can be any signal you want.  The idea here is, you can easily add a signal listener to your app, to trigger a config file reload.  This eliminates the need to poll or watch the filesystem.  To set this up, [update](https://github.com/jhuckaby/confsync/blob/master/docs/CLI.md#update) your config file with a `--pid` and `--signal` like this:

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

Now, whenever new revisions of the file are deployed, ConfSync Satellite will attempt to send a signal to your app, by first reading its PID from the `/var/run/myapp.pid` file, and then sending a `SIGUSR2` signal to that process.

<details><summary>How to listen for a signal in a Node.js app</summary>

```js
process.on('SIGUSR2', function() {
	console.log("Received SIGUSR2 signal!  Reloading config!");
	// reload your config file here
});
```

</details>

<details><summary>How to listen for a signal in a Python app</summary>

```python
import signal
import os

# Define a custom signal handler for SIGUSR2
def sigusr2_handler(signum, frame):
    print("Received SIGUSR2 signal!  Reloading config!")
	# reload your config file here

# Register the custom handler for SIGUSR2
signal.signal(signal.SIGUSR2, sigusr2_handler)
```

</details>

<details><summary>How to listen for a signal in a PHP app</summary>

```php
declare(ticks = 1);

// Define a custom signal handler for SIGUSR2
function sigusr2_handler($signo) {
    echo "Received SIGUSR2 signal!  Reloading config!" . PHP_EOL;
	// reload your config file here
}

// Register the custom handler for SIGUSR2
pcntl_signal(SIGUSR2, "sigusr2_handler");
```

</details>

<details><summary>How to listen for a signal in a Java app</summary>

```java
import sun.misc.Signal;
import sun.misc.SignalHandler;

Signal.handle(new Signal("USR2"), new SignalHandler() {
	public void handle(Signal sig) {
		System.out.println("Received SIGUSR2 signal!  Reloading config!");
		// reload your config file here
	}
});
```

</details>

<details><summary>How to listen for a signal in a Perl app</summary>

```perl
use POSIX;

# Define a custom signal handler for SIGUSR2
sub sigusr2_handler {
    my $signal = shift;
    print "Received SIGUSR2 signal!  Reloading config!\n";
	# reload your config file here
}

# Register the custom handler for SIGUSR2
$SIG{USR2} = \&sigusr2_handler;
```

</details>

To *remove* the PID / Signal feature from a config file, perform another update and set both arguments to `false`:

```
$ confsync update myapp --pid false --signal false
```

### Web Request

If your application has a web server, then ConfSync can send a web request to notify you that a config file has changed.  For example, if your web app listens on port 3000, then ConfSync Satellite can send a local web request to `http://localhost:3000/api/config/reload`, or any URI path of your choice.

Note that ConfSync Satellite runs on each of your servers, so the request can (and should) be on the localhost loopback adapter.  Meaning, you can fully lock down your API route, so it only accepts requests from a local IP address (`127.0.0.1` or `::1`), for security purposes.

To set this up, [update](https://github.com/jhuckaby/confsync/blob/master/docs/CLI.md#update) your config file with a `--webhook` URL like this:

```
$ confsync update myapp --webhook "http://localhost:3000/api/config/reload"

✅ Success: Configuration file updated: `myapp` (My Great App)

 ┌─────────────────────────────────────────────────────┐
 │ Config ID:  myapp                                   │
 │ Title:      My Great App                            │
 │ Path:       /opt/myapp/conf/config.json             │
 │ Mode:       600                                     │
 │ UID:        root                                    │
 │ Web Hook:   http://localhost:3000/api/config/reload │
 │ Author:     jhuckaby                                │
 │ Created:    2023/10/04 10:44 AM                     │
 │ Modified:   2023/10/11 11:43 AM                     │
 │ Revisions:  5                                       │
 │ Latest Rev: r5                                      │
 └─────────────────────────────────────────────────────┘
```

ConfSync Satellite will now notify your app via web request, each time the `/opt/myapp/conf/config.json` file is updated.  The request itself will be a `HTTP POST`, and the payload will be a JSON document that describes the file that was just installed or updated.  Example request body (pretty-printed):

```json
{
	"title": "My Great App",
	"id": "myapp",
	"username": "jhuckaby",
	"path": "/opt/myapp/conf/config.json",
	"web_hook": "http://localhost:3000/api/config/reload",
	"modified": 1697049843.871,
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
	"rev": "r5"
}
```

The `User-Agent` header for these requests will be set to `ConfSync Satellite v#.#.#` (where `#.#.#` will be `1.0.0` or higher).

To *remove* the Web Request feature from a config file, set the `--webhook` switch to `false`:

```
$ confsync update myapp --webhook false
```

### Shell Exec

ConfSync can optionally run a custom shell command whenever a file is installed on one of your servers.  This can come in handy if you want your application to be completely restarted when its config file is updated.  Note that this feature is inherently dangerous (i.e. storing shell commands in S3 that can be executed on all your servers), so it is *disabled by default* in ConfSync Satellite, and must be [explicitly enabled](https://github.com/jhuckaby/confsync-satellite#allow_shell_exec) when you install it on each of your servers.

Once you have enabled the feature, you can add a shell command to your config files by calling [update](https://github.com/jhuckaby/confsync/blob/master/docs/CLI.md#update) with a special `--exec` switch.  Example:

```
$ confsync update myapp --exec "systemctl restart myapp"

✅ Success: Configuration file updated: `myapp` (My Great App)

 ┌─────────────────────────────────────────┐
 │ Config ID:  myapp                       │
 │ Title:      My Great App                │
 │ Path:       /opt/myapp/conf/config.json │
 │ Mode:       600                         │
 │ UID:        root                        │
 │ Shell Exec: systemctl restart myapp     │
 │ Author:     jhuckaby                    │
 │ Created:    2023/10/04 10:44 AM         │
 │ Modified:   2023/10/11 3:30 PM          │
 │ Revisions:  5                           │
 │ Latest Rev: r5                          │
 └─────────────────────────────────────────┘
```

This will instruct ConfSync Satellite to execute the shell command `systemctl restart myapp` each time the `/opt/myapp/conf/config.json` file is updated.

To *remove* the Shell Exec feature from a config file, set the `--exec` switch to `false`:

```
$ confsync update myapp --exec false
```

## Web Hooks

ConfSync supports the concept of "web hooks", meaning it can fire off a web request to a custom URL in response to certain actions.  These can be configured both in the CLI / API, and in [ConfSync Satellite](https://github.com/jhuckaby/confsync-satellite).  For the CLI / API, each action triggers a single web request.  For Satellite, web requests are sent from **all** of your servers where the install occurred.

To setup web hooks in the CLI / API, edit your `config.json` file and populate the `web_hooks` object thusly:

```js
"web_hooks": {
	"deploy": "https://hooks.slack.com/services/TO8ZZFDBQ/BC6ZZNG14/pJKFjZZI"
}
```

You can alternatively add hooks using the [config](#config) command:

```
$ confsync config --web_hooks.deploy "https://hooks.slack.com/services/TO8ZZFDBQ/BC6ZZNG14/pJKFjZZI"
```

This example adds a web hook for the [deploy](#deploy) action specifically, and targets a custom [Slack Bot](https://api.slack.com/messaging/webhooks).  The web request itself will be a `HTTP POST`, and the payload will be a JSON document that describes the action that took place.  Example request body (pretty-printed):

```json
{
	"id": "myapp",
	"username": "jhuckaby",
	"groups": [ "dev", "prod" ],
	"rev": "r1",
	"text": "Configuration file `myapp` revision `r1` deployed by `jhuckaby` to groups: **dev,prod**",
	"code": "deploy",
	"msg": "myapp",
	"content": "Configuration file `myapp` revision `r1` deployed by `jhuckaby` to groups: **dev,prod**"
}
```

Each action will include an appropriate Markdown-formatted summary, stored in both `text` and `content` properties, made to be compatible with most chat apps (Slack, Discord, etc.).  To customize these text templates, see the `web_hook_text_templates` property in your `config.json` file.

There are actually several actions you can hook, including a special "universal" hook which fires for all of them:

| Web Hook ID | Description |
|-------------|-------------|
| `addGroup` | Fires when a new group is added. |
| `updateGroup` | Fires when an existing group is updated. |
| `deleteGroup` | Fires when a group is deleted. |
| `addConfigFile` | Fires when a new config file is added. |
| `updateConfigFile` | Fires when an existing config file is updated. |
| `deleteConfigFile` | Fires when a config file is deleted. |
| `push` | Fires when a new file revision is pushed to S3. |
| `deploy` | Fires when a file revision is deployed live. |
| `universal` | Fires when any action occurs. | -- |

For samples of each web hook JSON payload, see the [Web Hook Samples](https://github.com/jhuckaby/confsync/tree/master/docs/webhook-samples) directory.

The `User-Agent` header for these requests will be set to `ConfSync v#.#.#` (where `#.#.#` will be `1.0.0` or higher).

## Logging

ConfSync keeps its own log file, which contains all errors, transactions and debug messages.  By default, this log file is created in a `logs` subdirectory under the package root, and is named `confsync.log`.  Here is an example log snippet:

```
[1697078909.542][2023-10-11 19:48:29][joemax.local][30908][ConfSync][debug][3][ConfSync v1.0.0 starting up][["/usr/local/bin/node","/Users/jhuckaby/git/confsync/cli.js","group","delete","prod"]]
[1697078910.136][2023-10-11 19:48:30][joemax.local][30908][ConfSync][transaction][deleteGroup][prod][{"id":"prod","username":"jhuckaby","text":"Configuration target group deleted: `prod`"}]
```

The top-level `debug_level` property in your `config.json` controls how verbose the debug log entries are.  A `debug_level` level of `1` is the most quiet, and only contains transactions and errors.  A level of `5` is a fair bit louder, and level `9` is the loudest.  Use these higher levels for troubleshooting issues.

You can customize the location and filename of the log file by including top-level `log_dir` and `log_filename` properties in your `config.json` file.

You can also optionally customize the log "columns" that are written out.  By default, the following columns are written for each row:

| Log Column | Description |
|------------|-------------|
| `hires_epoch` | This is a high-resolution [Epoch timestamp](https://en.wikipedia.org/wiki/Unix_time) (floating point decimal). |
| `date` | This is a human-readable date/time stamp in the format: `YYYY-MM-DD HH:MI:SS` (in the local server timezone). |
| `hostname` | This is the hostname of the server or PC/Mac running the ConfSync CLI / API. |
| `pid` | This is the Process ID (PID) of the ConfSync process running on the server. |
| `component` | This is the name of the current component, or simply `ConfSync` for generic messages. |
| `code` | This is the error code, transaction code, or debug log level of the message, from `1` to `9`. |
| `msg` | This is the log message text itself. |
| `data` | Any additional data that accompanies the message will be in this column, in JSON format. |

To customize the log columns, include a top-level `log_columns` property in your `config.json` file, and set it to an array of strings, where each string specifies the column.  Example:

```json
"log_columns": ["hires_epoch", "date", "hostname", "pid", "component", "code", "msg", "data"]
```

## Upgrading

To upgrade ConfSync, simply repeat the original NPM install command:

```
npm i -g confsync
```

This will install the latest version, and it will preserve your `config.json` file.  Note that the command may need to be executed as root or with `sudo`.

## Estimated S3 Costs

ConfSync Satellite does query S3 once per minute per server (by default), to poll for config file changes.  Luckily, this poll operation only involves a single S3 GET, and AWS charges $0.00044 USD per 1,000 GET requests (in us-west-1, as of this writing).  So here is how that will affect your monthly AWS bill:

| # of Servers | Total Cost Per Month |
|--------------|----------------------|
| 1 | $0.01 USD |
| 10 | $0.19 USD |
| 100 | $1.90 USD |
| 1,000 | $19.00 USD |
| 10,000 | $190.00 USD |

You can further reduce these costs by configuring Satellite to only poll every other minute (half cost), or every 5 minutes (20% cost).  See [ConfSync Satellite](https://github.com/jhuckaby/confsync-satellite) for details.

You may be tempted to configure Satellite's crontab to skip polling on weekends, or after work hours.  Trust me: **don't do this**.  Those are the times when you will need ConfSync the most, e.g. to perform an emergency midnight rollback of a botched config file, or fix some weekend panic crisis.

## See Also

- &rarr; **[Walkthrough / Tutorial](https://github.com/jhuckaby/confsync/blob/master/docs/Tutorial.md)**
- &rarr; **[Advanced Topics](https://github.com/jhuckaby/confsync/blob/master/docs/Advanced.md)**
- &rarr; **[CLI Reference](https://github.com/jhuckaby/confsync/blob/master/docs/CLI.md)**
- &rarr; **[API Reference](https://github.com/jhuckaby/confsync/blob/master/docs/API.md)**
- &rarr; **[Confsync Satellite](https://github.com/jhuckaby/confsync-satellite)**
- &rarr; **[Internals](https://github.com/jhuckaby/confsync/blob/master/docs/Internals.md)**

## License

**The MIT License (MIT)**

*Copyright (c) 2023 Joseph Huckaby*

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
