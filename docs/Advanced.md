# Advanced Topics

This document contains advanced features, tips and tricks for ConfSync.

## Table of Contents

> &larr; [Return to the main document](https://github.com/jhuckaby/confsync/blob/main/README.md)

<!-- toc -->
- [Features](#features)
	* [File Env Variables](#file-env-variables)
	* [Multi-Group Overrides](#multi-group-overrides)
	* [Aborting Gradual Deploys](#aborting-gradual-deploys)
	* [Non-AWS S3 Providers](#non-aws-s3-providers)
	* [Slack Notifications](#slack-notifications)
	* [Discord Notifications](#discord-notifications)
	* [GitHub Integration](#github-integration)

## Features

### File Env Variables

You may want some of your config files to only install on certain servers (meaning, beyond basic group targeting on deploys).  ConfSync allows this by way of allowing each file to define its own set of environment variables, which are regular expression matches.  If configured, the file will only be installed on servers that match all of your specified env vars.  Example (CLI):

```
$ confsync update myapp --env.HOSTNAME '\.app\.'
```

And via the API:

```js
let params = {
	"id": "myapp",
	"env.HOSTNAME": "\\.app\\."
};

try {
	await confsync.updateConfigFile( params );
}
catch (err) {
	// handle error here
}
```

This would ensure that the `myapp` config file would only be installed on servers whose `HOSTNAME` env var matched `.app.`, regardless of the options passed to the deploy command.

### Multi-Group Overrides

It is possible for your groups to "overlap", and your files to have overlapping and possibly conflicting overrides.  ConfSync is designed to handle this correctly, applying multiple sets of rules, in the order you specify.  Let's setup an example to illustrate this.  Imagine the following set of groups:

| Group ID | Title | HOSTNAME Env Var Match |
|----------|-------|------------------------|
| `dev` | Development Environment | `\.dev\.` |
| `prod` | Production Environment | `\.prod\.` |
| `app` | Application Servers | `\.app\.` |
| `db` | Database Servers | `\.db\.` |

Here we have two groups that are clearly meant to be environments: `dev` and `prod`.  But then we have two other groups that are more like server classes: `app` and `db`.  Given this, you can imagine a number of server hostnames that may match multiple groups at the same time:

```
s01.app.dev.mycompany.com
s02.app.dev.mycompany.com

s01.db.dev.mycompany.com
s02.db.dev.mycompany.com

s01.app.prod.mycompany.com
s02.app.prod.mycompany.com

s01.db.prod.mycompany.com
s02.db.prod.mycompany.com
```

Due to the fact that we're only matching partial hostnames, these example servers all match **two** groups each.  For e.g. `s01.app.dev.mycompany.com` is an application server (`.app.`), but it's also in the development environment (`.dev.`).  This is all fine, and ConfSync is designed to handle this.  Now let's take our sample app config file from the [tutorial](https://github.com/jhuckaby/confsync/blob/main/docs/Tutorial.md):

```json
{
	"logging": {
		"debug_level": 9
	},
	"cache": {
		"enabled": true,
		"memory": "10 MB"
	},
	"features": {
		"halloween_theme": true,
		"new_layout": false,
		"christmas_theme": false
	}
}
```

And let's imagine some multi-group overrides for it:

```json
{
	"dev": {
		"logging.debug_level": 9,
		"cache.enabled": false
	},
	"prod": {
		"logging.debug_level": 5,
		"cache.enabled": true
	},
	"app": {
		"cache.memory": "1 GB"
	},
	"db": {
		"cache.memory": "8 GB"
	}
}
```

So here we're overriding several configuration properties per group.  For `dev` we're setting the debug log level to 9 (verbose), and disabling a fictional "cache" (assuming Dev servers will have little memory).  Then for `prod` we're enabling our fictional cache, and dropping the debug level to 5 (medium).  But we have two other rulesets which may intersect.  We have rules for `app` servers that set the fictional cache memory to "1 GB", and rules for `db` servers that bump it way up to "8 GB".

The idea here is when the file is deployed, ConfSync will apply **all** the rules that match a given server, and you can control the order in which they are applied.  In this case, there are no "conflicts" (i.e. multiple rulesets that set the same property to a different value), but if there were, you can set a "priority" in each of your groups like this (CLI):

```
$ confsync group update app --priority 1
```

And via the API:

```js
let params = {
	"id": "app",
	"priority": 1
};

try {
	await confsync.updateGroup( params );
}
catch (err) {
	// handle error here
}
```

This would insure that the `app` group was applied *last*, so its values would prevail in the event of a conflict.  A priority of `1` means the most important.

When no priority is set on a group, it defaults to `5` for the purposes of sorting.  Lower numbers imply a "higher" priority (hence the saying "*priority one!*") so they get their overrides applied *after* the others, and the latter prevails.

### Aborting Gradual Deploys

If you started a [gradual deploy](https://github.com/jhuckaby/confsync/blob/main/docs/Tutorial.md#gradual-deployments) but then changed your mind, or you want to quickly convert it to a full roll without having to wait out the duration, here is how.

If you change your mind and want to roll *back* a gradual deploy in progress, all you have to do is deploy the previous revision.  Example:

```
$ confsync deploy myapp --rev r4
```

Or via the API:

```js
let params = {
	"id": "app",
	"rev": "r4"
};

try {
	await confsync.deploy( params );
}
catch (err) {
	// handle error here
}
```

If you want to "jump over" a gradual deploy in progress, and immediately roll the file to all servers, simply repeat your deploy command with the same revision number, but omit the duration this time.  Example:

```
$ confsync deploy myapp --rev r5
```

Or via the API:

```js
let params = {
	"id": "app",
	"rev": "r5"
};

try {
	await confsync.deploy( params );
}
catch (err) {
	// handle error here
}
```

### Non-AWS S3 Providers

For using a non-AWS S3 provider such as [MinIO](https://min.io/), you will need to add two new properties into the `Storage.AWS` section of your `config.json` file.  The two properties are `endpoint` and `forcePathStyle`.  Example:

```js
"AWS": {
	"endpoint": "https://YOUR_MINIO_HOST:YOUR_MINIO_PORT",
	"forcePathStyle": true,
	"region": "us-west-1",
	"credentials": {
		"accessKeyId": "YOUR_ACCESS_KEY_ID",
		"secretAccessKey": "YOUR_SECRET_KEY"
	},
	"connectTimeout": 5000,
	"socketTimeout": 5000,
	"maxAttempts": 5
},
```

Or you can use the [config](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#config) command to configure this all on the CLI:

```
$ confsync config --Storage.AWS.endpoint "https://YOUR_MINIO_HOST:YOUR_MINIO_PORT" --Storage.AWS.forcePathStyle true --Storage.AWS.region us-west-1 --Storage.AWS.credentials.accessKeyId YOUR_ACCESS_KEY --Storage.AWS.credentials.secretAccessKey YOUR_SECRET_KEY --Storage.S3.params.Bucket YOUR_S3_BUCKET --Storage.S3.keyPrefix YOUR_S3_PREFIX
```

### Slack Notifications

ConfSync can easily be integrated with **Slack Webhooks**, so you can be notified via Slack message when files are deployed (or for other actions).  The notifications contain a quick text summary of the action, and can be targeted at any Slack channel.  Here are the instructions for setting this up.

First, follow the instructions on the [Slack Incoming Webhooks](https://api.slack.com/incoming-webhooks) page for creating your own Slack "application" for your team.  You can name it "ConfSync" or anything you like.

Create a Slack Webhook and add it to your workspace.  Select the desired channel to receive notifications, and click the "Authorize" button.  This should give you a custom unique Webhook URL, which will look something like this:

```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

Now, back in ConfSync, you need to decide if you want to enable Slack Webhook notification per one specific action (e.g. deploy), or universally for all actions.  For deploy, set the `web_hooks.deploy` property like this:

```js
"web_hooks": {
	"deploy": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
}
```

Alternatively, if you want to enable Slack notifications globally for all actions, use the `web_hooks.universal` property.  Example:

```js
"web_hooks": {
	"universal": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
}
```

To customize the web hook message text, see the `web_hook_text_templates` property in your `config.json` file.

See [Web Hooks](https://github.com/jhuckaby/confsync#web-hooks) for more details.

### Discord Notifications

ConfSync can easily be integrated with **Discord Webhooks**, so you can be notified via Discord message when files are deployed (or for other actions).  The notifications contain a quick text summary of the action, and can be targeted at any Discord channel.  Here are the instructions for setting this up.

First, follow the instructions on the [Discord Intro to Webhooks](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) page for creating your own Discord webhook for your channel.  You can name it "ConfSync" or anything you like.

Create a Discord Webhook by going to **Server Settings**, then **Integrations**, then **Webhooks**.  Select the desired channel to receive notifications, and click the "Copy Webhook URL" button.  This should give you a custom unique Webhook URL, which will look something like this:

```
https://discord.com/api/webhooks/1234567890/abcdefghijk-lmnop-QRS-TUV-wxyz
```

Now, back in ConfSync, you need to decide if you want to enable Discord Webhook notification per one specific action (e.g. deploy), or universally for all actions.  For deploy, set the `web_hooks.deploy` property like this:

```js
"web_hooks": {
	"deploy": "https://discord.com/api/webhooks/1234567890/abcdefghijk-lmnop-QRS-TUV-wxyz"
}
```

Alternatively, if you want to enable Discord notifications globally for all actions, use the `web_hooks.universal` property.  Example:

```js
"web_hooks": {
	"universal": "https://discord.com/api/webhooks/1234567890/abcdefghijk-lmnop-QRS-TUV-wxyz"
}
```

To customize the web hook message text, see the `web_hook_text_templates` property in your `config.json` file.

See [Web Hooks](https://github.com/jhuckaby/confsync#web-hooks) for more details.

### GitHub Integration

ConfSync can be integrated into [GitHub Actions](https://github.com/features/actions), so you can have GitHub automatically push a new file revision into ConfSync for every git push (or other action of your choice).  Here is how to set that up:

First, you'll need to add your AWS credentials into GitHub.  This is done via "secrets".  In your GitHub repo where you want the action added, click on the **Settings** tab, then expand the **Secrets and Variables** section in the sidebar, then click on the **Actions** item.

Click the **New Repository Secret** button and add two secrets, named thusly, and populated with your own AWS credentials:

- `AWSAccessKeyId`
- `AWSSecretAccessKey`

You can now use these variables in your own GitHub Actions Workflows using this syntax: `${{ secrets.AWSAccessKeyId }}`.  For more information about secrets, see [Using Secrets in GitHub Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).

Now we need to create a GitHub Actions Workflow script, which is in YAML format.  Create the following folders in your repo, if they do not already exist:

```
mkdir -p .github/workflows
```

Inside the `workflows` folder, create a file named `confsync-push.yaml` (or any name you want), and paste in this text:

```yaml
name: ConfSync Push
on: [push]

env:
  CONFSYNC_Storage__AWS__credentials__accessKeyId: ${{ secrets.AWSAccessKeyId }}
  CONFSYNC_Storage__AWS__credentials__secretAccessKey: ${{ secrets.AWSSecretAccessKey }}
  CONFSYNC_Storage__AWS__region: "us-west-1"
  CONFSYNC_Storage__S3__keyPrefix: "YOUR_S3_KEY_PREFIX_HERE"
  CONFSYNC_Storage__S3__params__Bucket: "YOUR_S3_BUCKET_HERE"

jobs:
  confsync-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npx confsync push YOUR_FILE_ID YOUR_REPO_FILE_HERE.json --git --confirm
```

You'll need to make a few text replacements in your file:

- Replace `YOUR_S3_KEY_PREFIX_HERE` with your S3 key prefix (copy from your ConfSync config.json file).
- Replace `YOUR_S3_BUCKET_HERE` with your S3 bucket (copy from your ConfSync config.json file).
- Replace `YOUR_FILE_ID` with the ConfSync File ID of the file you are pushing (this should have been previously added via the ConfSync CLI).
- Replace `YOUR_REPO_FILE_HERE.json` with the path to your configuration file in your GitHub repo, relative to the repo root.
- If you want GitHub Actions to also deploy your files on every push, add `--deploy` to the npx command above.

And that's it!  On your next GitHub push (or other action of your choice), GitHub will automatically run the action, and push your file up to ConfSync.

To check on the status of an action, click on the **Actions** tab in your repo, then click on **ConfSync Push** in the sidebar, then click on the latest (top) entry in the Workflows table.  Finally, click on **confsync-push** to expand the details and see the job log:

![GA Workflow Log](http://pixlcore.com/software/confsync/screenshots/github-actions-workflow-log.png)
