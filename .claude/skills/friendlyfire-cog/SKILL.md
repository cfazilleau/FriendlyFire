---
name: friendlyfire-cog
description: Author or modify a FriendlyFire Discord bot cog (feature module) — slash commands, message/context commands, listeners, per-guild config, MongoDB collections, and i18n locale strings. Use for any request to add a command, add a feature, create a cog, or edit an existing cog in this py-cord bot.
---

# Authoring a FriendlyFire cog

FriendlyFire is a py-cord (2.6) Discord bot. Every feature is a **cog** auto-loaded from
`cogs/<name>/<name>.py`. Follow the house conventions below exactly — they are load-bearing
(auto-loading, per-guild config, and localisation all depend on them).

## Non-negotiable rules

- **All user-facing text goes through i18n.** Never hardcode a reply string. Call
  `self.bot.t('<cog>.<key>', ctx.guild_id, var=value)` and add the key to **both**
  `locales/en.json` and `locales/fr.json`. Placeholders use `%{name}` syntax.
- **All logging goes through `self.log(msg, guild)`** (from `BaseCog`). Never use bare `print`.
  Pass `ctx.guild` (or a guild id / `payload.guild_id`) so the log line is tagged with the guild.
  Log at the start of every command and on notable outcomes/failures — match existing density.
- **Config is per-guild.** Read with `self.config.get('key', ctx.guild_id)`, write with
  `self.config.set('key', value, guild_id=ctx.guild_id)`. Global (no guild) is the fallback default.
- **Every cog subclasses `BaseCog`**, defines `setup(bot)`, lives in its own directory.
- **Target the `unstable` branch** for PRs. Branches: `feature/<name>`, `fix/<name>`, or
  `issue/<n>-<name>` — no agent prefixes.
- **Verify syntax** after every edit: `python -m py_compile <file>`. There is no test suite.

## Directory layout for a new cog `foo`

```
cogs/foo/foo.py              # defines class Foo(BaseCog) + setup(bot); REQUIRED name match
cogs/foo/views.py            # optional: discord.ui.View subclasses (buttons/dropdowns)
cogs/foo/modal.py            # optional: discord.ui.Modal subclasses
config/foo.template.json     # committed reference config (see format below)
config/foo.json              # local, gitignored — auto-created from defaults on first run
```
The loader (`main.py`) imports `cogs.<dir>.<dir>` for every non-`_` dir with a matching file,
so the directory name and the `.py` filename **must** be identical.

## Cog skeleton

```python
import discord
from discord import option
from discord.ext import commands
from src import FriendlyFire, BaseCog


class Foo(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'foo', {          # 'foo' -> config/foo.json; dict = default global config
            'someSetting': None,
        })

    # A grouped, admin-only command: /foo bar
    fooGroup = discord.SlashCommandGroup(
        name="foo",
        description="Manage foo",
        default_member_permissions=discord.Permissions(administrator=True),
        contexts=[discord.InteractionContextType.guild],   # guild-only
    )

    @fooGroup.command(name="bar", description="Do the bar thing")
    @option(name="value", description="A value", required=True)
    async def bar(self, ctx: discord.ApplicationContext, value: str):
        await ctx.defer(ephemeral=True)
        self.log(f"Foo bar issued by {ctx.author.name}. value={value}", ctx.guild)
        self.config.set('someSetting', value, guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('foo.bar_success', ctx.guild_id, value=value))


def setup(bot):
    bot.add_cog(Foo(bot))
```

### Command flavours (pick what fits)
- **Standalone slash command:** `@discord.slash_command(name=..., description=..., default_member_permissions=discord.Permissions(administrator=True), contexts=[discord.InteractionContextType.guild])`.
- **Grouped subcommands:** a `discord.SlashCommandGroup` class attribute + `@group.command(...)`.
- **Message/context-menu command:** `@commands.message_command(name="Move to Thread")` with a
  `message: discord.Message` param; gate with `@default_permissions(manage_messages=True)` from
  `discord.commands`.
- **Options:** `@option(name=..., description=..., required=..., input_type=..., autocomplete=fn, choices=[discord.OptionChoice(...)])`.
  Use `parameter_name=` when the option name differs from the Python arg. Autocomplete callbacks
  are `async def fn(self, ctx: discord.AutocompleteContext) -> list[str]`.
- **Listeners:** `@commands.Cog.listener()` on `async def on_*`. `BaseCog` already handles
  `on_ready` (logs "Module ready"); override it (calling nothing from super is fine) when you need
  startup work like registering a persistent view: `self.bot.add_view(MyView(self))`.

### Response conventions
- `await ctx.defer(ephemeral=True)` first for anything doing I/O, then `await ctx.respond(...)`.
- Wrap Discord mutations that can fail in `try/except discord.Forbidden / discord.HTTPException`
  and respond with a localised error (see the `sos` cog for the canonical pattern).

## Config file format

`config/foo.template.json` (committed) and the runtime `config/foo.json` (gitignored) use:
```json
{
    "global": { "someSetting": null },
    "guilds": {}
}
```
`global` holds defaults/bot-wide values; `guilds` maps `"<guild_id>"` -> overrides. The `Config`
class merges the constructor defaults over `global` and auto-creates the file. Always add a
`*.template.json` alongside any new config key so other deployments have a reference.

## MongoDB access

One database **per guild**, named `str(guild_id)`; feature collections inside it. Get a collection:
```python
from pymongo.asynchronous.collection import AsyncCollection

collection: AsyncCollection[MyEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "myitems")
await collection.insert_one(MyEntry(...))
doc = await collection.find_one({"someId": str(x)})
```
Define a `TypedDict` for the document shape (see `cogs/topic/topic.py`). Store Discord snowflakes as
**strings**. All pymongo calls are async — always `await`.

## i18n workflow (do this for every user-facing string)

1. Add the key under the cog's namespace in `locales/en.json`:
   `"foo": { "bar_success": "Set to %{value}." }`
2. Add the French translation in `locales/fr.json` under the same path.
3. Reference it: `self.bot.t('foo.bar_success', ctx.guild_id, value=value)`.

Keys nest arbitrarily (e.g. `sos.config.time_success`). The active language is per-guild
(`/locale set`), falling back to `en`. Missing translations fall back silently to `en`.

## Finishing checklist

- [ ] `cogs/<name>/<name>.py` defines `class`, `setup(bot)`, dir/file names match.
- [ ] Every reply string added to **both** `locales/en.json` and `locales/fr.json`.
- [ ] `config/<name>.template.json` added/updated with any new keys.
- [ ] Every command/listener logs via `self.log(..., ctx.guild)`.
- [ ] Guild-only commands set `contexts=[discord.InteractionContextType.guild]`.
- [ ] `python -m py_compile cogs/<name>/<name>.py` passes.
- [ ] New reference material captured in `DEVELOPMENT.md` if a new cog was added.
```
