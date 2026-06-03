import os
import i18n


def setup_i18n(locales_dir: str = 'locales', default_locale: str = 'en') -> list[str]:
    i18n.set('file_format', 'json')
    i18n.set('filename_format', '{locale}.{format}')
    i18n.set('load_path', [locales_dir])
    i18n.set('fallback', default_locale)
    i18n.set('error_on_missing_translation', False)

    available = sorted(f[:-5] for f in os.listdir(locales_dir) if f.endswith('.json'))
    print(f'[Locale] Loaded locales: {", ".join(available)}')
    return available
