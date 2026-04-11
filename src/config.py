import json
import io

class Config:
    def __init__(self, cog_name: str, default_config: dict):
        self.config_file = f'config/{cog_name}.json'
        self.config = default_config | self.load()
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
            print(f'[Config] Config file not found: {self.config_file}, using defaults.')
            return {}
