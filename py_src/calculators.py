from __future__ import annotations

from typing import Any


def parse_number(value: Any) -> float:
    try:
        number = float(value)
        return number if number == number and number != float('inf') else 0.0
    except (TypeError, ValueError):
        return 0.0


def calc_rd(monthly: Any, annual_rate: Any, months: Any) -> dict[str, float]:
    m = parse_number(monthly)
    r_a = parse_number(annual_rate)
    n = int(parse_number(months))
    r = r_a / 400.0
    maturity = 0.0

    if m > 0 and n > 0:
        for i in range(1, n + 1):
            maturity += m * ((1 + r) ** ((n - i + 1) / 3.0))

    invested = m * n
    interest = max(0.0, maturity - invested)
    return {
        "maturity": maturity,
        "invested": invested,
        "interest": interest
    }


def calc_fd(principal: Any, annual_rate: Any, years: Any) -> dict[str, float]:
    p = parse_number(principal)
    r_a = parse_number(annual_rate)
    y = parse_number(years)
    quarterly = 4.0
    r = r_a / 100.0

    maturity = p * ((1 + r / quarterly) ** (quarterly * y)) if p > 0 and y > 0 else 0.0
    interest = max(0.0, maturity - p)
    return {
        "maturity": maturity,
        "principal": p,
        "interest": interest
    }


def calc_emi(principal: Any, annual_rate: Any, years: Any) -> dict[str, float]:
    p = parse_number(principal)
    r_a = parse_number(annual_rate)
    y = parse_number(years)
    monthly_rate = r_a / 12.0 / 100.0
    n = y * 12.0
    emi = 0.0

    if p > 0 and n > 0:
        emi = (
            (p * monthly_rate * ((1 + monthly_rate) ** n)) /
            (((1 + monthly_rate) ** n) - 1)
        ) if monthly_rate > 0 else p / n

    total = emi * n
    interest = max(0.0, total - p)
    return {
        "monthly": emi,
        "principal": p,
        "interest": interest,
        "total": total
    }


def calc_nw(assets: Any, liabilities: Any) -> dict[str, float]:
    a = parse_number(assets)
    l = parse_number(liabilities)
    net_worth = a - l
    return {
        "netWorth": net_worth,
        "assets": a,
        "liabilities": l
    }
