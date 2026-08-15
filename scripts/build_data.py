from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source-data"
OUTPUT_DIR = ROOT / "src" / "data"

PRICE_FILE = SOURCE_DIR / "bratislava_ceny_bytov_2020_2026.xlsx"
APARTMENT_FILE = SOURCE_DIR / "developerske-projekty.xlsx"


def serialise(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def find_header_row(sheet, required: set[str], scan_limit: int = 30) -> int:
    for row_number, row in enumerate(
        sheet.iter_rows(min_row=1, max_row=scan_limit, values_only=True),
        start=1,
    ):
        values = {str(value).strip() for value in row if value is not None}
        if required.issubset(values):
            return row_number
    raise ValueError(
        f"V liste {sheet.title!r} sa nenašla hlavička s poľami: {', '.join(sorted(required))}"
    )


def extract_table(sheet, required: set[str]) -> tuple[list[str], list[dict[str, Any]]]:
    header_row = find_header_row(sheet, required)
    raw_headers = next(
        sheet.iter_rows(min_row=header_row, max_row=header_row, values_only=True)
    )
    headers = [str(value).strip() if value is not None else f"Stĺpec {index}" for index, value in enumerate(raw_headers, start=1)]

    rows: list[dict[str, Any]] = []
    for values in sheet.iter_rows(min_row=header_row + 1, values_only=True):
        if not any(value is not None and value != "" for value in values):
            continue
        rows.append(
            {
                header: serialise(value)
                for header, value in zip(headers, values)
            }
        )
    return headers, rows


def write_json(filename: str, payload: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with (OUTPUT_DIR / filename).open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, allow_nan=False)


def main() -> None:
    for path in (PRICE_FILE, APARTMENT_FILE):
        if not path.exists():
            raise FileNotFoundError(f"Chýba zdrojový súbor: {path}")

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    price_workbook = openpyxl.load_workbook(PRICE_FILE, data_only=True, read_only=True)
    if "Data" not in price_workbook.sheetnames:
        raise ValueError("Cenový Excel musí obsahovať list 'Data'.")
    price_headers, price_rows = extract_table(
        price_workbook["Data"], {"Dátum", "Mesiac", "Novostavby €/m²"}
    )
    write_json(
        "prices.json",
        {
            "meta": {
                "sourceFile": PRICE_FILE.name,
                "sheet": "Data",
                "generatedAt": generated_at,
                "rowCount": len(price_rows),
                "columnCount": len(price_headers),
            },
            "columns": price_headers,
            "rows": price_rows,
        },
    )

    source_rows: list[dict[str, Any]] = []
    if "Zdroje" in price_workbook.sheetnames:
        _, source_rows = extract_table(
            price_workbook["Zdroje"], {"Segment", "Obdobie", "URL"}
        )
    write_json(
        "sources.json",
        {
            "meta": {
                "sourceFile": PRICE_FILE.name,
                "sheet": "Zdroje",
                "generatedAt": generated_at,
                "rowCount": len(source_rows),
            },
            "rows": source_rows,
        },
    )
    price_workbook.close()

    apartment_workbook = openpyxl.load_workbook(
        APARTMENT_FILE, data_only=True, read_only=True
    )
    if "Byty" not in apartment_workbook.sheetnames:
        raise ValueError("Developerský Excel musí obsahovať list 'Byty'.")
    apartment_headers, apartment_rows = extract_table(
        apartment_workbook["Byty"], {"Projekt", "Označenie bytu", "Stav"}
    )
    write_json(
        "apartments.json",
        {
            "meta": {
                "sourceFile": APARTMENT_FILE.name,
                "sheet": "Byty",
                "generatedAt": generated_at,
                "rowCount": len(apartment_rows),
                "columnCount": len(apartment_headers),
            },
            "columns": apartment_headers,
            "rows": apartment_rows,
        },
    )
    apartment_workbook.close()

    print(
        f"Pripravené: {len(price_rows)} cenových záznamov, "
        f"{len(apartment_rows)} bytov a {len(source_rows)} zdrojov."
    )


if __name__ == "__main__":
    main()

