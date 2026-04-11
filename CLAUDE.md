# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Bot

```bash
# Activate the virtual environment
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Unix

# Install dependencies
pip install -r requirements.txt

# Run the bot (use -u for unbuffered output)
python -u main.py
```

Required environment variables (set via Docker or shell):
- `TOKEN` — Discord bot token
- `MONGO_URI` — MongoDB Atlas connection string

## Architecture

**FriendlyFire** is a Discord bot built with [py-cord](https://github.com/Pycord-Development/pycord) and MongoDB (via `pymongo` async).

### Entry Point & Core

- `main.py` — loads env vars, instantiates the bot, auto-loads all cogs from `cogs/`, then runs the bot
- `src/bot.py` — `FriendlyFire(commands.Bot)` subclass; holds the `Mongo` instance accessible to all cogs as `self.bot.mongo`
- `src/mongo.py` — `Mongo` wrapper: each guild gets its own MongoDB database (keyed by `guild_id`), with per-feature collections
- `src/config.py` — `Config(cog_name, default_config)`: loads/saves `config/<cog_name>.json`, merging defaults with persisted values on startup

### Cog Auto-loading Convention

`main.py` iterates `cogs/` directories and calls `bot.load_extension(f'cogs.{cog}.{cog}')`. This means each cog must follow this structure:
```
cogs/<name>/<name>.py   ← must define setup(bot)
```

### Cogs

| Cog | File | Description |
|-----|------|-------------|
| `presence` | `cogs/presence/presence.py` | Bot status/activity/avatar commands; reacts with 👀 when mentioned |
| `invites` | `cogs/invites/invites.py` | Temporary invite management, role auto-assignment on join, join announcements |
| `topic` | `cogs/topic/topic.py` | Topic channels with reaction-based role assignment; topic types configured via `config/topic.json` |
| `quotes` | `cogs/quotes/quotes.py` | Quote database (WIP); paired with `check_quotes_view.py` for moderation UI |

### Config Files

`config/<cog>.json` files persist cog settings. They are auto-created with defaults on first run and updated when commands change settings. The `topic.json` config is hand-edited to define topic types (name, color hex, emoji, display text).

### UI Views

Stateful Discord UI components live alongside their cog:
- `cogs/invites/greetings_view.py` — `PaginatorView` for browsing/deleting greetings
- `cogs/quotes/check_quotes_view.py` — moderation UI for reviewing quotes

### MongoDB Schema

Each guild has its own database (`str(guild_id)`). Collections used:
- `greetings` — `{ greeting: str }`
- `invites` — `{ author_id: int, code: str, expires: int }`
- `topics` — `{ messageId: str, channelId: str, roleId: str, roleName: str }`