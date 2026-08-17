# Bratislavské bývanie

Responzívny osobný dashboard pre ceny bytov a ponuku developerských projektov. Je pripravený na publikovanie cez GitHub Pages.

## Aktualizácia dát

V priečinku `source-data` nahraďte súbory novšími verziami, ale zachovajte ich názvy:

- `bratislava_ceny_bytov_2020_2026.xlsx`
- `developerske-projekty.xlsx`

Cenový Excel musí naďalej obsahovať list `Data` a developerský Excel list `Byty`. Riadkov môže pribudnúť ľubovoľne. Hlavičky sa vyhľadávajú podľa názvov, takže nemusia zostať na presne rovnakom riadku.

Po odoslaní zmeny do vetvy `main` GitHub automaticky spracuje Excel súbory a zverejní novú verziu stránky.

## Aktualizácia mapy projektov

Projekty na bezplatnej OpenStreetMap mape sú uložené v `src/data/projects.json`. Každý záznam obsahuje názov, adresu, súradnice `lat` a `lng` a odkaz `developerUrl`. Po úprave tohto súboru a odoslaní do vetvy `main` sa mapa automaticky zverejní spolu so stránkou.

## Prvé publikovanie

1. Vytvorte nový repozitár na GitHube.
2. Nahrajte doň celý obsah tohto priečinka.
3. V nastavení repozitára otvorte **Settings → Pages**.
4. Pri **Source** zvoľte **GitHub Actions**.
5. Otvorte kartu **Actions** a počkajte na dokončenie procesu „Publikovať dashboard“.

Adresa bude v tvare `https://POUZIVATEL.github.io/NAZOV-REPOZITARA/`.

## Lokálna kontrola

Najprv spustite `scripts/build_data.py`, potom `scripts/build.mjs` a priečinok `dist` zobrazte cez ľubovoľný lokálny HTTP server. Pri otvorení `index.html` priamo zo súborového systému prehliadač z bezpečnostných dôvodov nemusí povoliť načítanie JSON dát.
