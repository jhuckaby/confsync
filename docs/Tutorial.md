# Tutorial

This document contains a tutorial / walkthrough of the ConfSync CLI, and includes creating groups, files, and pushing / deploying them to your servers.

## Table of Contents

> &larr; [Return to the main document](https://github.com/jhuckaby/confsync/blob/main/README.md)

<!-- toc -->
- [Basic Usage](#basic-usage)
	* [Status](#status)
	* [Updates](#updates)
	* [Fetching](#fetching)
	* [Diffs](#diffs)
	* [Revision History](#revision-history)
	* [Clones](#clones)
	* [Overrides](#overrides)
	* [Partial Deployments](#partial-deployments)
	* [Gradual Deployments](#gradual-deployments)
- [The End](#the-end)

## Basic Usage

Here is a quick tutorial on using the ConfSync CLI.  This guide assumes you have ConfSync [installed](https://github.com/jhuckaby/confsync#setup) and [configured](https://github.com/jhuckaby/confsync#configuration), and have [ConfSync Satellite](https://github.com/jhuckaby/confsync-satellite) running on all your servers.

First let's do a [list](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#list) to make sure everything is working:

```
$ confsync list
```

Example output:

```
🔄 ConfSync CLI v1.0.0
S3: jhuckaby-test/tutorial (us-west-1)

 Target Groups: (0)
 (No groups found.)

 Config Files: (0)
 (No files found.)

Other Command Suggestions:
Add new group: confsync group add GROUP_ID --title 'YOUR GROUP TITLE' --env.HOSTNAME 'REGEXP'
Add new config file: confsync add CONFIG_ID --title 'YOUR CONFIG TITLE' --path /path/to/your/config.json
```

For the remainder of this tutorial, we'll show the command and response together, and with the headers and footers chopped off (for brevity).

So, we've got an empty slate -- no groups and no files yet.  Let's add our first target group using [group add](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#group-add):

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

This group targets servers that have a hostname containing `.dev.`.  You can match on any environment variables you want, including things like `NODE_ENV`.  If multiple environment variables are present in a group, they *all* have to match for a server to be included in the group.

Let's add another group:

```
$ confsync group add "prod" --title "Production" --env.HOSTNAME '\.prod\.'

✅ Success: Configuration target group added: `prod` (Production)

 ┌───────────────────────────────┐
 │ Group ID: prod                │
 │ Title:    Production          │
 │ Author:   jhuckaby            │
 │ Created:  2023/10/04 10:35 AM │
 │ Modified: 2023/10/04 10:35 AM │
 └───────────────────────────────┘

 Member Criteria:
 ┌──────────────┬───────────────┐
 │ Env Variable │ Match Pattern │
 ├──────────────┼───────────────┤
 │ HOSTNAME     │ /\.prod\./    │
 └──────────────┴───────────────┘
```

Now we have two groups that target different servers.  Here is what the [list](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#list) command shows now:

```
$ confsync list

 Target Groups: (2)
 ┌──────────┬─────────────┬──────────┬─────────────────────┐
 │ Group ID │ Title       │ Author   │ Modified            │
 ├──────────┼─────────────┼──────────┼─────────────────────┤
 │ dev      │ Development │ jhuckaby │ 2023/10/02 4:07 PM  │
 │ prod     │ Production  │ jhuckaby │ 2023/10/04 10:35 AM │
 └──────────┴─────────────┴──────────┴─────────────────────┘

 Config Files: (0)
 (No files found.)
```

Let's [add](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#add) our first configuration file.  Note that we're just *defining* the config file at this point -- we'll actually push a revision up and deploy it afterwards.

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

Now ConfSync knows about our config file, and where it should eventually live on our servers (`/opt/myapp/conf/config.json`).  It'll be written with mode `600` (octal) and user `root`.  But we haven't actually specified the config file contents yet.  That is done with a [push](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#push):

```
$ confsync push myapp ~/local/path/to/config.json --message "Initial revision."

✅ Success: Configuration file `myapp` revision `r1` pushed by `jhuckaby`: Initial revision.
```

We've now "pushed" a revision of our config file, which is now out on S3 and ready to install.  But ConfSync won't actually do anything until the revision is "deployed".  Deployment means that a specific revision is marked as the "live" one.  This is done by using the [deploy](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#deploy) command.  Here is how that goes:

```
$ confsync deploy myapp

✅ Success: Configuration file `myapp` revision `r1` deployed by `jhuckaby` to groups: dev,prod
```

And that's it!  Our revision is now "live" across both of our groups (`dev` and `prod`) and our revision (`r1`) will actually be installed by [ConfSync Satellite](https://github.com/jhuckaby/confsync-satellite) within a minute on all our servers.

Note that we didn't even have to specify a revision or which groups to deploy to.  By default, the latest revision is deployed, and if no groups are specified, all are selected.  Here are a couple variations of the [deploy](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#deploy) command:

**Deploy a specific revision of a file:**

```
$ confsync deploy myapp --rev r1
```

**Deploy to specific target groups only:**

```
$ confsync deploy myapp --group dev
```

Also note that when pushing a new revision, you can deploy it at the same time by adding `--deploy` or `--deploy GROUPS`.

See [push](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#push) and [deploy](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#deploy) below for more details on these two commands.

### Status

To see the status of your config file, use the [info](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#info) command:

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
 │ Modified:   2023/10/07 11:57 AM         │
 │ Revisions:  1                           │
 │ Latest Rev: r1                          │
 └─────────────────────────────────────────┘

 Deployment Info:
 ┌──────────┬─────────────┬──────────┬─────────────────────┐
 │ Group ID │ Title       │ Live Rev │ Deployed            │
 ├──────────┼─────────────┼──────────┼─────────────────────┤
 │ dev      │ Development │ ✅ r1    │ 2023/10/07 11:57 AM │
 │ prod     │ Production  │ ✅ r1    │ 2023/10/07 11:57 AM │
 └──────────┴─────────────┴──────────┴─────────────────────┘
```

This shows you which revisions are live, in which target groups, and when they were deployed.

### Updates

Let's push a new revision onto our config file.  Edit the file locally using your text editor of choice, and then [push](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#push) just like we did before:

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

Notice that it didn't actually push this time.  Instead, we were shown a graphical "diff" of our changes.  That's because for updates, we have to confirm the changes we made (for safety), and add a special `--confirm` flag to actually perform the operation:

```
$ confsync myapp ~/temp/myapp-config.json --message "Added halloween theme feature." --confirm

✅ Success: Configuration file `myapp` revision `r2` pushed by `jhuckaby`: Added halloween theme feature.
```

Okay, so now our new revision is pushed, but what about our previous revision?  Don't worry, ConfSync keeps all revisions in S3, and our previous revision (`r1`) is still live, as you can see by the [info](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#info) command:

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
 │ Modified:   2023/10/07 12:15 PM         │
 │ Revisions:  2                           │
 │ Latest Rev: r2                          │
 └─────────────────────────────────────────┘

 Deployment Info:
 ┌──────────┬─────────────┬──────────┬─────────────────────┐
 │ Group ID │ Title       │ Live Rev │ Deployed            │
 ├──────────┼─────────────┼──────────┼─────────────────────┤
 │ dev      │ Development │ ✅ r1    │ 2023/10/07 11:57 AM │
 │ prod     │ Production  │ ✅ r1    │ 2023/10/07 11:57 AM │
 └──────────┴─────────────┴──────────┴─────────────────────┘
```

As you can see, the latest revision is `r2` (the one we just pushed), but the live revision is still `r1`.

### Fetching

You can fetch any revision of your entire config file contents using the [get](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#get) command:

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

To download and save the file revision locally, add a `--save` argument followed by the desired local file path:

```
$ confsync get myapp r2 --save /tmp/myapp-r2.json
```

### Diffs

If you want to see a "[diff](https://en.wikipedia.org/wiki/Diff)" of the changes between two revisions, use the [diff](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#diff) command.  By default, this shows the diff between the latest and previous revisions, but you can specify any two revisions you want to see:

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

### Revision History

To see the complete revision history of your configuration file, use the [history](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#history) command:

```
$ confsync history myapp

 ┌────────────────────────────────────────┐
 │ Config ID: myapp                       │
 │ Title:     My Great App                │
 │ Path:      /opt/myapp/conf/config.json │
 │ Author:    jhuckaby                    │
 │ Created:   2023/10/04 10:44 AM         │
 │ Modified:  2023/10/07 2:36 PM          │
 │ Revisions: 2                           │
 └────────────────────────────────────────┘

 Revision History: (1 - 2 of 2)
 ┌──────────┬────────────────────────────────┬──────────┬─────────────────────┬──────────┐
 │ Revision │ Message                        │ Author   │ Date/Time           │ Live     │
 ├──────────┼────────────────────────────────┼──────────┼─────────────────────┼──────────┤
 │ r2       │ Added halloween theme feature. │ jhuckaby │ 2023/10/07 12:15 PM │          │
 │ r1       │ Initial revision.              │ jhuckaby │ 2023/10/05 9:00 PM  │ ✅ (All) │
 └──────────┴────────────────────────────────┴──────────┴─────────────────────┴──────────┘
```

### Clones

**Note:** *This feature only works with JSON or JSON5 configuration files.*

You can use the ConfSync CLI to make quick changes to your JSON configuration files without having to edit the file source, or even have the file locally on your machine.  This is done by making a [clone](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#clone) of a specified revision, and then specifying changes right on the CLI using JSON [dot paths](https://www.npmjs.com/package/dot-prop) like this:

```
--base.features.halloween_theme true
```

This would locate the `halloween_theme` property inside the `features` object, and set it to `true`.  The `--base` prefix implies that we're modifying the base configuration (and not an [override](#overrides)).  Let's go ahead and do the clone to see what this looks like:

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

That change looks good, so let's confirm the operation:

```
$ confsync clone myapp --base.features.halloween_theme true --message "Enabled halloween theme." --confirm

✅ Success: Configuration file `myapp` revision `r3` pushed by `jhuckaby`: Enabled halloween theme.
```

Remember, to actually make our new revision live, we need to [deploy](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#deploy) it, or we could have added the `--deploy` switch to the clone command.

### Overrides

**Note:** *This feature works best with JSON and JSON5 configuration files.*

ConfSync allows you to have group-specific overrides for your configuration files.  Meaning, you can have different variations of your files deployed to your various target groups.  To do this, you need to provide two separate files when pushing: your base config file, and a special "overrides" file.

Let's prepare an example.  Here is our base config file for our fictional great app:

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

And then we need an overrides file.  This is a JSON formatted document that has keys for each of our group IDs (`dev` and `prod` in our tutorial example), and the values are the overrides we want to apply for each group, specified in [dot path notation](https://www.npmjs.com/package/dot-prop).  Here is how that looks:

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

So for all your servers in the `dev` group, this would apply two overrides: the `debug_level` property inside the `logging` object would be set to `9`, and the `enabled` property inside the `cache` object would be set to `false`.  And for your servers in the `prod` group, the debug level is set to `5`, and the cache system enabled.

To quickly recap, at the start of the tutorial we created two groups like so:

```
$ confsync groups

 Target Groups: (2)
 ┌──────────┬─────────────┬──────────┬─────────────────────┐
 │ Group ID │ Title       │ Author   │ Modified            │
 ├──────────┼─────────────┼──────────┼─────────────────────┤
 │ dev      │ Development │ jhuckaby │ 2023/10/02 4:07 PM  │
 │ prod     │ Production  │ jhuckaby │ 2023/10/04 10:35 AM │
 └──────────┴─────────────┴──────────┴─────────────────────┘
```

Each group matches automatically servers based on the `HOSTNAME` environment variable.  Example for `dev`:

```
$ confsync group dev

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

So given all that, let's now go ahead and [push](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#push) our new config file, but this time with overrides in tow.  The overrides file is specified with the `--overrides` switch:

```
$ confsync push myapp ~/temp/myapp-config.json --overrides ~/temp/myapp-overrides.json --message "Added new overrides."

Preview Diff:
 {
 ...
 	},
-	"overrides": {}
+	"overrides": {
+		"dev": {
+			"logging.debug_level": 9,
+			"cache.enabled": false
+		},
+		"prod": {
+			"logging.debug_level": 5,
+			"cache.enabled": true
+		}
+	}
 }

Repeat your command with `--confirm` to push to S3.
```

So here you can see that ConfSync has successfully parsed and imported our overrides, and is showing us a diff vs. before they existed.  This all looks correct, so let's confirm the push and get it up onto S3:

```
$ confsync push myapp ~/temp/myapp-config.json --overrides ~/temp/myapp-overrides.json --message "Added new overrides." --confirm

✅ Success: Configuration file `myapp` revision `r4` pushed by `jhuckaby`: Added new overrides.
```

So now, we have a new revision of our config file (`r4`) which has overrides in tow.  You can confirm this by doing a [get](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#get):

```
$ confsync get myapp r4

 ┌────────────────────────────────────────┐
 │ Config ID: myapp                       │
 │ Title:     My Great App                │
 │ Path:      /opt/myapp/conf/config.json │
 │ Revision:  r4                          │
 │ Author:    jhuckaby                    │
 │ Message:   Added new overrides.        │
 │ Date/Time: 2023/10/07 8:53 PM          │
 │ Live:      (No)                        │
 └────────────────────────────────────────┘

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
		"halloween_theme": true,
		"new_layout": false,
		"christmas_theme": false
	}
}

Overrides JSON:
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

As you can see, in this case both the base JSON and the overrides are displayed when fetching.

When this revision is eventually [deployed](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#deploy) live, ConfSync will automatically transform it for each of your server groups.  You can get a preview of what that will look like by adding a `--group` switch to the [get](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#get) command:

```
$ confsync get myapp r4 --group prod

 ┌────────────────────────────────────────┐
 │ Config ID: myapp                       │
 │ Title:     My Great App                │
 │ Path:      /opt/myapp/conf/config.json │
 │ Revision:  r4                          │
 │ Author:    jhuckaby                    │
 │ Message:   Added new overrides.        │
 │ Date/Time: 2023/10/07 8:53 PM          │
 │ Live:      (No)                        │
 └────────────────────────────────────────┘

Production Transformed JSON:
{
	"logging": {
		"debug_level": 5
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

Here you can see a preview of the `prod` (Production) variant of the file, with our two overrides applied (`logging.debug_level` and `cache.enabled`).

### Partial Deployments

In certain cases you may want to deploy a file to *some* of your target groups, but not all of them.  To do this, you can add a `--groups` switch to the [deploy](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#deploy) command, and specify them by ID, comma-separated.  Here is an example:

```
$ confsync deploy myapp --groups dev

✅ Success: Configuration file `myapp` revision `r4` deployed by `jhuckaby` to groups: dev
```

So we've deployed the latest revision of our file (`r4`), but *only* to the `dev` group.  To see which revisions are live in which groups at any time, use the [info](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#info) command, and look at the "Deployment Info" table:

```
$ confsync info myapp

 Deployment Info:
 ┌──────────┬─────────────┬──────────┬─────────────────────┐
 │ Group ID │ Title       │ Live Rev │ Deployed            │
 ├──────────┼─────────────┼──────────┼─────────────────────┤
 │ dev      │ Development │ ✅ r4    │ 2023/10/09 8:36 PM  │
 │ prod     │ Production  │ ✅ r1    │ 2023/10/07 11:57 AM │
 └──────────┴─────────────┴──────────┴─────────────────────┘
```

You can also see this in the [history](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#history) command output:

```
$ confsync history myapp

 Revision History: (1 - 4 of 4)
 ┌──────────┬────────────────────────────────┬──────────┬─────────────────────┬─────────┐
 │ Revision │ Message                        │ Author   │ Date/Time           │ Live    │
 ├──────────┼────────────────────────────────┼──────────┼─────────────────────┼─────────┤
 │ r4       │ Added new overrides.           │ jhuckaby │ 2023/10/07 8:53 PM  │ ✅ dev  │
 │ r3       │ Enabled halloween theme.       │ jhuckaby │ 2023/10/07 2:36 PM  │         │
 │ r2       │ Added halloween theme feature. │ jhuckaby │ 2023/10/07 12:15 PM │         │
 │ r1       │ Initial revision.              │ jhuckaby │ 2023/10/05 9:00 PM  │ ✅ prod │
 └──────────┴────────────────────────────────┴──────────┴─────────────────────┴─────────┘
```

In this case we deployed our latest file revision to `dev`, but our other group (`prod`) still has the initial revision.  To roll the new revision out everywhere, we could repeat the same deploy command but add both groups (e.g. `--groups "dev,prod"`), or we could simply omit the `--groups` switch entirely, as deploy defaults to all groups:

```
$ confsync deploy myapp

✅ Success: Configuration file `myapp` revision `r4` deployed by `jhuckaby` to groups: dev,prod
```

Now the latest revision will be live across all of our servers.

### Gradual Deployments

ConfSync supports "gradual" deployments, meaning your files will progressively install across your servers, spanning a custom time duration that you specify.  Obviously this only works effectively if you have a fair amount of servers to deploy across.  To use this feature, add a `--duration` switch to the [deploy](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#deploy) command, and specify the total number of seconds that the deploy should take.

First, let's push a new revision, and make a change.  For this example we'll do a feature toggle, and enable the `features.new_layout` flag:

```
$ confsync clone myapp --base.features.new_layout true --message "Switched new layout on." --confirm

✅ Success: Configuration file `myapp` revision `r5` pushed by `jhuckaby`: Switched new layout on.
```

Now let's do a gradual deploy for the new revision:

```
$ confsync deploy myapp --duration 600

✅ Success: Configuration file `myapp` revision `r5` deployed by `jhuckaby` to groups: dev,prod
```

You can alternatively specify a human-readable relative time measurement, like `10m` for 10 minutes, or `2h` for 2 hours.

The idea here is, each server will individually determine when it should install the file, based on a seeded random number algorithm (where the seed is based on the server's hostname).  You can check the progress of the gradual deploy by using the [info](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md#info) command:

```
$ confsync info myapp

 Deployment Info:
 ┌──────────┬─────────────┬──────────┬────────────────┐
 │ Group ID │ Title       │ Live Rev │ Deployed       │
 ├──────────┼─────────────┼──────────┼────────────────┤
 │ dev      │ Development │ ✅ r5    │ Deploying (5%) │
 │ prod     │ Production  │ ✅ r5    │ Deploying (5%) │
 └──────────┴─────────────┴──────────┴────────────────┘
```

Here you can see that the deployment is "5%" complete.  That basically means that 5% of your servers will have installed the file at this point.  After the full specified duration (10 minutes in this example) all your servers will have performed the install:

```
$ confsync info myapp

 Deployment Info:
 ┌──────────┬─────────────┬──────────┬─────────────────────────────┐
 │ Group ID │ Title       │ Live Rev │ Deployed                    │
 ├──────────┼─────────────┼──────────┼─────────────────────────────┤
 │ dev      │ Development │ ✅ r5    │ 2023/10/07 8:26 PM (10 min) │
 │ prod     │ Production  │ ✅ r5    │ 2023/10/07 8:26 PM (10 min) │
 └──────────┴─────────────┴──────────┴─────────────────────────────┘
```

The info table also shows you the duration alongside the date/time, if the deployment was gradual.  Note that the date/time shown is when the deployment *started*.

## The End

Thank you for reading.  That's the end of our basic tutorial.  For more things you can do with ConfSync, please see the [CLI Reference](https://github.com/jhuckaby/confsync/blob/main/docs/CLI.md).
