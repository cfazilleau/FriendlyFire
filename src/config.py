import json
import io
import os

class Config:
    def __init__(self, cog_name: str, default_config: dict):
        self.config_file = f'config/{cog_name}.json'
        self.template_file = f'config/{cog_name}.template.json'
        loaded = self.load()
        self.config = default_config | loaded
        if loaded:
            self.save()

    def save(self):
        data = json.dumps(self.config, indent=4)
        with io.open(self.config_file, 'w', encoding='utf-8-sig') as file:
            file.write(data)

    def load(self):
        try:
            with io.open(self.config_file, 'r', encoding='utf-8-sig') as file:
                data = file.read()
            return json.loads(data)
        except FileNotFoundError:
            template_hint = f' See {self.template_file} for reference.' if os.path.exists(self.template_file) else ''
            print(f'[Config] {self.config_file} not found, using defaults.{template_hint}')
            return {}
