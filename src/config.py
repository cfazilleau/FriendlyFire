import json
import io
import os

class Config:
    def __init__(self, cog_name: str, default_config: dict):
        self.config_file = f'config/{cog_name}.json'
        self.template_file = f'config/{cog_name}.template.json'
        loaded = self.load()
        self._global: dict = default_config | loaded.get('global', {})
        self._guilds: dict[str, dict] = loaded.get('guilds', {})
        self.save()

    @property
    def config(self) -> dict:
        """Global config dict — direct access for backward compatibility."""
        return self._global

    def get(self, key: str, guild_id=None):
        """Get a config value, checking guild-specific overrides first."""
        if guild_id is not None:
            guild_data = self._guilds.get(str(guild_id), {})
            if key in guild_data:
                return guild_data[key]
        return self._global.get(key)

    def set(self, key: str, value, guild_id=None):
        """Set a config value globally or for a specific guild, then save."""
        if guild_id is not None:
            gid = str(guild_id)
            if gid not in self._guilds:
                self._guilds[gid] = {}
            self._guilds[gid][key] = value
        else:
            self._global[key] = value
        self.save()

    def save(self):
        data = json.dumps({'global': self._global, 'guilds': self._guilds}, indent=4)
        with io.open(self.config_file, 'w', encoding='utf-8-sig') as file:
            file.write(data)

    def load(self) -> dict:
        try:
            with io.open(self.config_file, 'r', encoding='utf-8-sig') as file:
                data = json.loads(file.read())
            # migrate old flat format (no 'global'/'guilds' keys)
            if 'global' not in data and 'guilds' not in data:
                return {'global': data, 'guilds': {}}
            return data
        except (FileNotFoundError, json.JSONDecodeError):
            template_hint = f' See {self.template_file} for reference.' if os.path.exists(self.template_file) else ''
            print(f'[Config] {self.config_file} not found or malformed, using defaults.{template_hint}')
            return {}
