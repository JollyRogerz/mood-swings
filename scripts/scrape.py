"""Archive the official Mood Swings reference and extract a verified catalog.

Run: .venv/bin/python scripts/scrape.py [--refresh]
Only follows the explicitly listed official pages and their image assets.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'card-notes': 'https://magic.wizards.com/en/news/feature/mood-swings-card-notes',
    'extended-rules': 'https://magic.wizards.com/en/news/feature/mood-swings-extended-rules',
    'gallery': 'https://magic.wizards.com/en/news/card-image-gallery/mood-swings',
    'other-ways': 'https://magic.wizards.com/en/news/feature/other-ways-to-play-mood-swings',
    'introduction': 'https://magic.wizards.com/en/news/announcements/introducing-mood-swings',
    'product': 'https://secretlair.wizards.com/eu/en/mood-swings',
    'design-part-1': 'https://magic.wizards.com/en/news/making-magic/the-design-of-mood-swings-part-1',
    'design-part-2': 'https://magic.wizards.com/en/news/making-magic/the-design-of-mood-swings-part-2',
    'visual-identity': 'https://magic.wizards.com/en/news/feature/crafting-the-visual-identity-of-mood-swings',
    'history': 'https://magic.wizards.com/en/news/making-magic/the-history-of-mood-swings',
}

def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def fetch(url, path, refresh=False):
    if not path.exists() or refresh:
        for attempt in range(3):
            try:
                r = requests.get(url, timeout=60)
                r.raise_for_status()
                if not r.content:
                    raise ValueError(f'Empty response: {url}')
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(r.content)
                break
            except requests.RequestException:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
    data = path.read_bytes()
    return {'url': url, 'path': str(path.relative_to(ROOT)), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(),
            'file_timestamp_utc': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()}

def main():
    args = argparse.ArgumentParser()
    args.add_argument('--refresh', action='store_true')
    refresh = args.parse_args().refresh
    raw, processed = ROOT / 'data/raw', ROOT / 'data/processed'
    processed.mkdir(parents=True, exist_ok=True)
    manifest, soups, failures = [], {}, []
    for key, url in SOURCES.items():
        path = raw / f'{key}.html'
        try:
            manifest.append(fetch(url, path, refresh))
            soup = BeautifulSoup(path.read_bytes().decode('utf-8'), 'html.parser')
            soups[key] = soup
            body = soup.select_one('article') or soup
            for el in body.select('script, style, nav, footer, header'):
                el.decompose()
            (processed / f'{key}.txt').write_text(body.get_text('\n', strip=True) + '\n')
            print(f'Page: {key}', flush=True)
        except Exception as e:
            failures.append({'url': url, 'error': str(e)})
    for required in ['card-notes', 'gallery', 'extended-rules', 'other-ways']:
        if required not in soups:
            raise RuntimeError(f'Missing required source: {required}')

    cards = []
    pattern = re.compile(r'^(.+?) [\(\[](.+?)[\)\]]$')
    for p in soups['card-notes'].select('article p'):
        title = p.find('strong', recursive=False)
        match = pattern.fullmatch(title.get_text(' ', strip=True)) if title else None
        if not match:
            continue
        name, metadata = match.groups()
        color = next((c for c in ['White', 'Blue', 'Black', 'Red', 'Green'] if c in metadata.split()), None)
        rarity = metadata.replace(color, '').strip() if color else ''
        if not color or rarity not in ['Common', 'Uncommon', 'Rare', 'Mythic Rare']:
            continue
        lines = p.get_text('\n', strip=True).splitlines()
        dice = lines[1].strip()
        normalized_dice = {'Wrath': '[0]', 'Curiosity': '[3]/[6]'}.get(name, dice)  # Verified against card images
        values = [sum(map(int, re.findall(r'\[(\d+)\]', part)))
                  if re.fullmatch(r'(?:\[\d+\])+', part) else None for part in normalized_dice.split('/')]
        rule_text = re.sub(r'\s+', ' ', ' '.join(lines[2:])).strip()
        notes = []
        for sibling in p.next_siblings:
            if getattr(sibling, 'name', None) == 'hr':
                break
            if getattr(sibling, 'name', None) == 'ul':
                notes.extend(li.get_text(' ', strip=True) for li in sibling.find_all('li', recursive=False))
            elif getattr(sibling, 'name', None) == 'p':
                notes.append(sibling.get_text(' ', strip=True))
        cards.append({'id': slug(name), 'name': name, 'color': color.lower(),
                      'rarity': rarity.lower(), 'printed_dice': dice,
                      'printed_values': values, 'normalized_dice': normalized_dice, 'rules_text': rule_text,
                      'ability_types': [label for label in ['To play this card', 'While in play', 'After playing this mood'] if label in rule_text],
                      'rulings': notes, 'images': [], 'source': SOURCES['card-notes']})

    catalog = {card['name']: card for card in cards}
    assets = []
    for index, image in enumerate(soups['gallery'].select('magic-card'), 1):
        caption = image.get('caption', '')
        variant = 'headliner' if caption.endswith('*') else 'standard'
        name = caption.rstrip('*')
        url = image.get('face')
        if not url:
            raise ValueError(f'Missing image for {caption}')
        path = ROOT / 'assets/cards' / f'{slug(name)}{("-headliner" if variant == "headliner" else "")}{Path(urlparse(url).path).suffix}'
        asset = {'name': name, 'variant': variant, 'gallery_position': index,
                 'url': url, 'path': str(path.relative_to(ROOT))}
        assets.append(asset)
        if name in catalog:
            catalog[name]['images'].append(asset)

    def download(asset):
        return fetch(asset['url'], ROOT / asset['path'], refresh)

    with ThreadPoolExecutor(max_workers=4) as pool:
        for asset, result in zip(assets, pool.map(download, assets)):
            manifest.append(result)
    supporting_images = []
    seen_urls = {a['url'] for a in assets}
    for key, soup in soups.items():
        body = soup.select_one('article') or soup
        for el in body.select('img[src], magic-card[face]'):
            url = urljoin(SOURCES[key], el.get('face') or el.get('src'))
            if url in seen_urls or not url.startswith('https://media.wizards.com/'):
                continue
            seen_urls.add(url)
            path = ROOT / 'assets/reference' / Path(urlparse(url).path).name
            try:
                manifest.append(fetch(url, path, refresh))
                supporting_images.append({'source': key, 'url': url, 'path': str(path.relative_to(ROOT))})
            except Exception as e:
                failures.append({'url': url, 'error': str(e)})
    # Inventory supporting imagery and linked resources without following unrelated site navigation.
    references = []
    for key, soup in soups.items():
        body = soup.select_one('article') or soup
        for a in body.select('a[href]'):
            href = urljoin(SOURCES[key], a['href'])
            if any(token in href.lower() for token in ['mood-swings', '.pdf', 'youtu', 'transistor.fm']):
                references.append({'source': key, 'label': a.get_text(' ', strip=True), 'url': href})
    image_names = {a['name'] for a in assets if a['variant'] == 'standard' and a['name'] != 'Hurt Feelings'}
    checks = {
        'unique_cards': len(catalog), 'card_records': len(cards),
        'gallery_images': len(assets), 'downloaded_card_images': sum((ROOT / a['path']).is_file() for a in assets),
        'colors': dict(Counter(c['color'] for c in cards)),
        'rarities': dict(Counter(c['rarity'] for c in cards)),
        'missing_gallery_cards': sorted(set(catalog) - image_names),
        'missing_card_notes': sorted(image_names - set(catalog)),
        'cards_without_rulings': [c['name'] for c in cards if not c['rulings']],
        'unparsed_dice': [c['name'] for c in cards if None in c['printed_values']],
        'rulings': sum(len(c['rulings']) for c in cards),
        'supporting_images': len(supporting_images),
        'source_failures': failures,
    }
    write_json(processed / 'cards.json', cards)
    write_json(processed / 'gallery.json', assets)
    write_json(processed / 'references.json', references)
    write_json(processed / 'supporting-images.json', supporting_images)
    write_json(processed / 'validation.json', checks)
    write_json(processed / 'manifest.json', {'generated_at': datetime.now(timezone.utc).isoformat(), 'files': manifest})
    assert len(cards) == len(catalog) == 133, checks
    assert len(assets) == 135, checks
    assert not checks['missing_gallery_cards'] and not checks['missing_card_notes'], checks
    assert checks['rarities'] == {'common': 48, 'uncommon': 40, 'rare': 30, 'mythic rare': 15}, checks
    print(json.dumps(checks, indent=2))

if __name__ == '__main__':
    main()
