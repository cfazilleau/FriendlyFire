
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

### Added

### Changed

### Fixed

## [2.6.0]

### Added

- Log() function now accept tags as arguments
- Added tags to existing Log() functions to log guild names

### Fixed

- polls quickchart timeout error
- Fixed the Id displayed for newly added quotes

## [2.5.0]

### Added

- Timeout of 10 seconds for all image API calls.

### Changed

- Minecraft Rcon connection now works using a URI (password@ip:port)

### Fixed

- Minor issues

## [2.4.0]

### Added

- /addgreeting command to create a new greeting message

### Changed

- Moved the greetings messages to a mongodb-based setup

### Fixed

- Fixed an issue where disabled plugins were still active

## [2.3.0]

### Added

- Enabling / disabling plugins for specific servers is now possible via the .ffconfig file

### Changed

- Callback message and link when sending /quote from the wrong channel

### Fixed

- Minor bugs

## [2.2.0]

### Added

- Id parameter for command /check-quotes
- /crawl-missing-quotes command to crawl the entire channel and find missing quotes

### Changed

- Better random for quote selection

### Fixed

- Removed check-quotes select menu as the maximum size is 25

## [2.1.1]

### Added

- Added a development script to allow file watching and auto-reloading on save.
- Added a check-quote command

### Changed

- Updated package.json
- Made database connection async.
- Removed all Heroku-related stuff

### Fixed

- Fixed some issues with quotes
- Fixed inconsistent log messages.

## [2.1.0] - 2022-07-31

### Added

- Tag quotes as safe or unsafe.
- Added a routine to auto fix timestamps of old generated quotes.

### Changed

- Reworked the random for quote selection to allow for more variety.
- Removed 'time' field on quote schemas.

### Fixed

- Fixed an error with the quotes Regex.
- Fixed an issue where the inviter was not mentioned on the welcome message.
- Fixed the indices sorting of quotes to follow a timestamp order.

## [2.0.2] - 2022-07-25

### Added

- Added a setting to allow the posting of quote images in a specific channel.

### Fixed

- 404 Error when requesting quotes with empty body or author.

## [2.0.1] - 2022-07-20

Small Fixed and Addings.

### Added

- 'topic edit' command: Edit already existing topics.
- Added topic Music
- This Changelog file 😀

### Changed

- Roles created by the topic plugin now include the mentionable permission.
- Quotes saved embed message now shows quote id.
- Changed topic Thread to Subject
- Updated package "@typescript-eslint/eslint-plugin" to 5.30.7 (latest)

### Fixed

- 404 Error when requesting quotes that contained some special characters.
- Small typo in greetings.

## [2.0.0] - 2022-07-19 - Ignition Release 🔥

Full rewrite of FriendlyFire in typescript.
The project is now a lightweight core program interacting with various plugins.

### Added

- Plugin 'Core'
  - 'say' command: Makes the bot say something.
  - 'delete' command: Delete the last # messages of this channel. Can\'t delete messages older than 15 days.
  - 'delete' context menu: Delete messages following the selected one.
- Plugin 'Alive'
  - 'status' command: Set current bot status.
  - 'activity' command: Manage current bot activity.
  - 'avatar' command: Set bot avatar.
- Plugin 'Invites'
  - 'invites' command: Generates a temporary invite.
  - 'testjoin' command: Triggers user joined event for the "Invite" plugin.
  - Handles player join event: auto assign role, send private message and public greetings.
- Plugin 'Minecraft'
  - 'mc-whitelist' command: Manage whitelist of the minecraft server.
  - 'mc-command' command: Send a command to the minecraft server.
- Plugin 'Polls'
  - 'yn' command: Send a poll with the answers 'Yes' and 'No'.
  - 'ynu' command: Send a poll with the answers 'Yes', 'No', and 'Maybe'.
  - 'poll' command: Send a poll with up to 5 custom answers.
  - 'lock or unlock poll' context menu: Lock or Unlock a poll.
  - Handles votes and generates a corresponding graph.
- Plugin 'Quotes'
  - 'quote' command: Send a quote from the database.
  - Handles quotes detection in a specified channel.
- Plugin 'Topics'
  - 'topic' command: Manage topics.
  - Handles Reactions to topic messages to auto create and assign roles.
