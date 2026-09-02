from __future__ import annotations

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
BANK_RATES_FILE = BASE_DIR / "data" / "bankRates.json"


def get_bank_rates() -> dict:
    with BANK_RATES_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)
