# Development and Architecture Guidelines

This file provides guidance to developers and AI coding assistants/agents working with code in this repository.

---

## 1. Running the Bot

To set up and run the bot locally:

```bash
# Activate the virtual environment
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Unix

# Install dependencies
pip install -r requirements.txt

# Run the bot (use -u for unbuffered output)
python -u main.py
```

### Environment Variables
Set the following environment variables (via Docker or your shell/.env):
- `TOKEN` — Discord bot token
- `MONGO_URI` — MongoDB Atlas connection string

---

## 2. Git & Branching Strategy

To keep the repository clean and structured, follow these rules:
- **Branch Names**: Do **NOT** use agent-specific prefixes (like `antigravity/`). Use `feature/<name>`, `fix/<name>`, or `issue/<number>-<name>`.
- **Target Base Branch**: Pull Requests must target the **`unstable`** branch.
- **Release Cycle**: Merges into `main` are done by the repository owner only after verification on the `unstable` branch.

---

## 3. Architecture Overview

FriendlyFire is a Discord bot built using [py-cord](https://github.com/Pycord-Development/pycord) and MongoDB (via `pymongo` async).

### Core Components
- `main.py` — Application entry point. Loads configurations, instantiates the bot, auto-loads cogs, and connects to Discord.
- `src/bot.py` — The core `FriendlyFire` class (subclass of `commands.Bot`). Holds references to database interfaces and global utilities.
- `src/mongo.py` — MongoDB connector. Creates a separate database per guild (`str(guild_id)`) with feature-specific collections.
- `src/config.py` — Local settings management. Loads and persists configurations for each cog under `config/<cog_name>.json`.
- `src/locale.py` — Handles localization via `python-i18n`. Translation keys are loaded from `locales/`.

---

## 4. Cog Auto-loading Convention

The bot dynamically loads extensions from the `cogs/` directory. Each cog must follow this structure:
```
cogs/<cog_name>/<cog_name>.py   ← Must define the setup(bot) entry point
```

### Active Cogs

| Cog | File | Description |
| :--- | :--- | :--- |
| `presence` | `cogs/presence/presence.py` | Bot activity/status/avatar settings, `/say`, and reacts 👀 when mentioned. |
| `invites` | `cogs/invites/invites.py` | One-time invite tracking, join greeting cards, and auto-assigning roles. |
| `topic` | `cogs/topic/topic.py` | Reaction-based role subscription for specific topic channels. |
| `quotes` | `cogs/quotes/quotes.py` | Quote submission, voting, pagination, and visual quote-image card generation. |
| `starboard` | `cogs/starboard/starboard.py` | Monitors ⭐ reactions and posts starred messages in a designated channel. |
| `locale` | `cogs/locale/locale.py` | Admin commands to set and query the preferred guild language. |
| `sos` | `cogs/sos/sos.py` | Anonymous `/sos` distress reports; a second report inside the time window applies slowmode and alerts moderators. |
| `threads` | `cogs/threads/threads.py` | "Move to Thread" message command — relocates a conversation into a new thread. |

---

## 5. UI Views

Stateful Discord components (like dropdowns and buttons) are organized alongside their cogs:
- `cogs/invites/greetings_view.py` — Pagination view for browsing and deleting guild join greetings.
- `cogs/quotes/quotes_paginate_view.py` — Paginated embed for quote lists and quote deletion.
- `cogs/quotes/check_quotes_view.py` — Moderation interface for quote submissions.
- `cogs/threads/views.py` — Persistent confirmation view (registered in `on_ready` via `bot.add_view`).
- `cogs/threads/modal.py` — Modal collecting the new thread's name.

---

## 6. MongoDB Collection Schema

Each guild is isolated in its own database named `str(guild_id)`. Active collections include:
- `greetings` — `{ greeting: str }`
- `invites` — `{ author_id: int, code: str, expires: int }`
- `topics` — `{ messageId: str, channelId: str, roleId: str, roleName: str, topicChannelId?: str }` (`topicChannelId` is set only when the topic was created with a dedicated channel)
- `quotes` — `{ quote: str, author: str, submitted_by: str, upvoted_by: list[str], downvoted_by: list[str], ... }`
- `starboard` — `{ original_message_id: int, starboard_message_id: int, star_count: int }`

> `sos` keeps request windows **in memory only** (per-channel dict) and `threads` stores no
> persistent data — neither uses a MongoDB collection.

---

## 7. Configuration & Localisation

### Per-guild config (`src/config.py`)
Each cog owns `config/<cog>.json` (gitignored; a committed `config/<cog>.template.json` is the
reference). The file has two sections:
```json
{ "global": { "key": "default" }, "guilds": { "<guild_id>": { "key": "override" } } }
```
- Read: `self.config.get('key', ctx.guild_id)` — guild override first, then `global`.
- Write: `self.config.set('key', value, guild_id=ctx.guild_id)` — persists immediately.
- Defaults passed to `super().__init__(bot, '<cog>', {defaults})` are merged over `global`.

### Localisation (`src/locale.py`, `python-i18n`)
- All user-facing strings live in `locales/en.json` + `locales/fr.json`, nested under the cog name.
- Resolve with `self.bot.t('<cog>.<key>', ctx.guild_id, var=value)`; placeholders use `%{var}`.
- Active language is per-guild (`/locale set`), falling back to `en`. Add every new key to **both**
  locale files.

### Logging
Use `self.log(message, guild)` (from `BaseCog`) — never bare `print`. Passing `ctx.guild` /
guild id tags the coloured log line with the guild name.

> For a step-by-step recipe on adding a cog or command, see the `friendlyfire-cog` skill in
> `.claude/skills/`.

---

## 8. AI Tooling (MCP)

A committed `.mcp.json` provides a **MongoDB MCP server** for AI assistants, so they can inspect the
live per-guild data (quotes, invites, topics, starboard) while debugging.

- **Transport:** `npx mongodb-mcp-server@latest --readOnly` (requires **Node ≥ 20.19**).
- **Read-only:** the `--readOnly` flag makes the server refuse all writes/deletes, so it is safe to
  point at the bot's regular credential.
- **Credential:** injected via the `${MONGO_URI}` env reference — no secret is committed. `MONGO_URI`
  must be present in your shell environment before launching the assistant (it already lives in
  `.env`; export it, e.g. Windows PowerShell `$env:MONGO_URI = (Get-Content .env | Select-String '^MONGO_URI=').ToString().Split('=',2)[1]`).
- First use prompts for approval (project-scoped MCP servers require it). Verify with `claude mcp list`.
- On Windows, if `npx` fails to spawn, wrap the command as `"command": "cmd"`, `"args": ["/c", "npx", …]`.
