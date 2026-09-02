from __future__ import annotations

from typing import Any

SUBSCRIPTION_TIERS: dict[str, dict[str, Any]] = {
    "FREE": {
        "id": "free",
        "name": "Free",
        "cost": 0,
        "features": {
            "rd": {"limit": -1},
            "fd": {"limit": -1},
            "emi": {"limit": -1},
            "nw": {"limit": -1},
            "export": False,
            "advancedCharts": False,
            "prioritySupport": False,
            "historicalRates": False
        }
    },
    "PRO": {
        "id": "pro",
        "name": "Pro",
        "cost": 99,
        "costPeriod": "monthly",
        "features": {
            "rd": {"limit": -1},
            "fd": {"limit": -1},
            "emi": {"limit": -1},
            "nw": {"limit": -1},
            "export": True,
            "advancedCharts": True,
            "prioritySupport": False,
            "historicalRates": True
        }
    },
    "PRO_PLUS": {
        "id": "pro_plus",
        "name": "Pro Plus",
        "cost": 299,
        "costPeriod": "monthly",
        "features": {
            "rd": {"limit": -1},
            "fd": {"limit": -1},
            "emi": {"limit": -1},
            "nw": {"limit": -1},
            "export": True,
            "advancedCharts": True,
            "prioritySupport": True,
            "historicalRates": True
        }
    }
}


def normalize_tier(tier: Any) -> str:
    return str(tier or "").strip().upper()


def get_tier_info(tier: Any) -> dict[str, Any]:
    normalized = normalize_tier(tier)
    return SUBSCRIPTION_TIERS.get(normalized, SUBSCRIPTION_TIERS["FREE"])


def has_feature_access(tier: Any, feature: str) -> bool:
    tier_info = get_tier_info(tier)
    return tier_info["features"].get(feature, False) is not False


def can_use_calculator(tier: Any, calculator: str, daily_usage: int = 0) -> bool:
    normalized = normalize_tier(tier)
    tier_info = get_tier_info(normalized)
    feature = tier_info["features"].get(calculator)
    if not feature:
        return False
    if normalized == "FREE":
        return True
    if feature.get("limit") == -1:
        return True
    if feature.get("perDay"):
        return daily_usage < feature.get("limit", 0)
    return True


def get_next_tier(current_tier: Any) -> str | None:
    tiers = list(SUBSCRIPTION_TIERS.keys())
    current_index = tiers.index(normalize_tier(current_tier)) if normalize_tier(current_tier) in tiers else -1
    return tiers[current_index + 1] if 0 <= current_index < len(tiers) - 1 else None
