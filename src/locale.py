import json
import os


class LocaleManager:
    def __init__(self, locales_dir: str = 'locales', default_locale: str = 'en'):
        self.default_locale = default_locale
        self._strings: dict[str, dict] = {}
        self._load_all(locales_dir)

    def _load_all(self, locales_dir: str):
        if not os.path.isdir(locales_dir):
            print(f'[Locale] Directory "{locales_dir}" not found, no locales loaded.')
            return
        for filename in os.listdir(locales_dir):
            if filename.endswith('.json'):
                locale = filename[:-5]
                path = os.path.join(locales_dir, filename)
                with open(path, 'r', encoding='utf-8') as f:
                    self._strings[locale] = json.load(f)
        print(f'[Locale] Loaded locales: {", ".join(self._strings.keys())}')

    def available_locales(self) -> list[str]:
        return list(self._strings.keys())

    def t(self, key: str, locale: str = None, **kwargs) -> str:
        locale = locale or self.default_locale
        strings = self._strings.get(locale, {})

        value = strings
        for part in key.split('.'):
            if isinstance(value, dict):
                value = value.get(part)
            else:
                value = None
                break

        if value is None and locale != self.default_locale:
            return self.t(key, self.default_locale, **kwargs)

        if value is None:
            return key

        if kwargs:
            value = value.format(**kwargs)
        return value
