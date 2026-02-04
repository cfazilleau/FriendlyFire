import io
import json

class Config:
    def __init__(self, cog_name: str):
        self.config_file = f'config/{cog_name}.json'
        self.config = self.load()

    def save(self):
        data = json.dumps(self.config)
        with open(self.config_file, 'w', encoding='utf-8') as file:
            file.write(data)

    def load(self):
        with open(self.config_file, 'r', encoding='utf-8') as file:
            data = file.read()
        return json.loads(data)

