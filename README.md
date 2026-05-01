# FriendlyFire

A Discord bot for the Phoenix Legacy community, built with [py-cord](https://github.com/Pycord-Development/pycord) and MongoDB.

## Features

### Presence
- `/status` — set the bot's online status (online, idle, dnd, invisible)
- `/activity set` — set the bot's activity (playing, watching, listening, streaming, competing)
- `/activity clear` — clear the bot's activity
- `/avatar` — update the bot's avatar
- Reacts with 👀 when mentioned

### Invites
- `/invite` — generate a temporary invite link (auto-expires, tracked in DB)
- `/greetings create` — add a welcome message shown to new members
- `/greetings paginate` — browse and delete welcome messages
- Auto-assigns a role to new members
- Posts a join announcement embed when someone joins

### Topics
- `/topic create` — create a topic channel with a role and a subscribe message
- `/topic edit` — edit an existing topic's name, type, or image
- `/topic delete` — remove a topic and its role
- Users subscribe/unsubscribe by reacting with ✅
- Topic types (name, color, emoji) are configured in `config/topic.json`

### Quotes
- Automatically captures messages matching `"quote" - author` in a configured channel
- `/quote [id]` — post a random (or specific) safe quote as a generated image
- `/quotes set-capture-channel` — set the channel to listen for new quotes
- `/quotes set-reply-channel` — set the channel where `/quote` posts its output
- `/check-quotes [id]` — moderation UI to mark quotes as safe/unsafe
- `/crawl-missing-quotes` — backfill the database from channel history
- Quote images use a random background from [Picsum](https://picsum.photos) with the quote text and author rendered on top

---

## Requirements

- Python 3.13+
- MongoDB instance (e.g. [MongoDB Atlas](https://www.mongodb.com/atlas))
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- A font file for quote image generation (path configured via `fontPath` in `config/quotes.json`, defaults to `assets/fonts/PlayfairDisplay-Italic.ttf`)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TOKEN` | Discord bot token |
| `MONGO_URI` | MongoDB connection string |

---

## Installation

### With Docker (recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/cfazilleau/FriendlyFire.git
   cd FriendlyFire
   ```

2. Create a `.env` file:
   ```
   TOKEN=your_discord_token
   MONGO_URI=your_mongo_uri
   ```

3. Copy and fill in your config files from the provided templates:
   ```bash
   cp config/topic.template.json config/topic.json
   # edit config/topic.json to define your topic types
   ```

4. Build and start:
   ```bash
   docker compose up -d
   ```

### Manual

1. Clone the repository and create a virtual environment:
   ```bash
   git clone https://github.com/cfazilleau/FriendlyFire.git
   cd FriendlyFire
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set environment variables:
   ```bash
   export TOKEN=your_discord_token
   export MONGO_URI=your_mongo_uri
   ```

4. Copy and fill in your config files from the provided templates:
   ```bash
   cp config/topic.template.json config/topic.json
   # edit config/topic.json to define your topic types
   ```

5. Run the bot:
   ```bash
   python -u main.py
   ```

---

## Configuration

Config files live in `config/` and are gitignored. Template files (`*.template.json`) document the expected structure.

| File | Description |
|------|-------------|
| `config/topic.json` | Topic types (name, color hex, emoji) — must be hand-edited |
| `config/invites.json` | Invite settings (max age, role ID, announcement channel) |
| `config/presence.json` | Cached bot status and activity |
| `config/quotes.json` | Capture channel, reply channel, and font path for quote images |

All configs support per-guild overrides under a `guilds` key:
```json
{
    "global": { "inviteMaxAge": 1200 },
    "guilds": {
        "123456789": { "inviteRole": 987654321 }
    }
}
```
