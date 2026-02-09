import json
import io

class Config:
    def __init__(self, cog_name: str):
        self.config_file = f'config/{cog_name}.json'
        self.config = self.load()

    def save(self):
        data = json.dumps(self.config, indent=4)
        with io.open(self.config_file, 'w', encoding='utf-8-sig') as file:
            file.write(data)

    def load(self):
        with io.open(self.config_file, 'r', encoding='utf-8-sig') as file:
            data = file.read()
        return json.loads(data)
