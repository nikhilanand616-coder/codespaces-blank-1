from __future__ import annotations

import hashlib
import json
import secrets
from datetime import date
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
USERS_FILE = BASE_DIR / "data" / "users.json"
DEFAULT_USER = {
    "email": "existing@fincommand.local",
    "password": "FinCommand123!",
    "tier": "PRO_PLUS"
}


def ensure_data_store() -> None:
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not USERS_FILE.exists():
        USERS_FILE.write_text("[]", encoding="utf-8")


def read_users() -> list[dict[str, Any]]:
    ensure_data_store()
    try:
        content = USERS_FILE.read_text(encoding="utf-8")
        data = json.loads(content or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        USERS_FILE.write_text("[]", encoding="utf-8")
        return []


def write_users(users: list[dict[str, Any]]) -> None:
    USERS_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")


def create_salt() -> str:
    return secrets.token_hex(16)


def hash_password(password: str, salt: str) -> str:
    key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=16384,
        r=8,
        p=1,
        maxmem=0,
        dklen=64
    )
    return key.hex()


def generate_api_key() -> str:
    return secrets.token_hex(32)


def todays_date() -> str:
    return date.today().isoformat()


def seed_default_user() -> None:
    users = read_users()
    if len(users) != 0:
        return

    salt = create_salt()
    user = {
        "email": DEFAULT_USER["email"],
        "passwordHash": hash_password(DEFAULT_USER["password"], salt),
        "salt": salt,
        "apiKey": generate_api_key(),
        "tier": DEFAULT_USER["tier"],
        "subscriptionStartDate": todays_date(),
        "dailyUsage": {
            "date": todays_date(),
            "rd": 0,
            "fd": 0,
            "emi": 0,
            "nw": 0
        },
        "createdAt": todays_date()
    }
    users.append(user)
    write_users(users)


def find_by_email(email: str) -> dict[str, Any] | None:
    normalized = email.strip().lower()
    return next((user for user in read_users() if user.get("email", "").strip().lower() == normalized), None)


def find_by_api_key(api_key: str) -> dict[str, Any] | None:
    return next((user for user in read_users() if user.get("apiKey") == api_key), None)


def create_user(email: str, password: str) -> dict[str, Any]:
    email_value = email.strip().lower()
    if find_by_email(email_value) is not None:
        raise ValueError("A user with that email already exists")

    salt = create_salt()
    user = {
        "email": email_value,
        "passwordHash": hash_password(password, salt),
        "salt": salt,
        "apiKey": generate_api_key(),
        "tier": "FREE",
        "subscriptionStartDate": todays_date(),
        "dailyUsage": {
            "date": todays_date(),
            "rd": 0,
            "fd": 0,
            "emi": 0,
            "nw": 0
        },
        "createdAt": todays_date()
    }
    users = read_users()
    users.append(user)
    write_users(users)
    return {"email": user["email"], "apiKey": user["apiKey"], "tier": user["tier"]}


def verify_user(email: str, password: str) -> dict[str, Any] | None:
    user = find_by_email(email)
    if not user:
        return None
    return user if hash_password(password, user["salt"]) == user["passwordHash"] else None


def track_usage(api_key: str, calculator: str) -> dict[str, Any] | None:
    users = read_users()
    user = next((u for u in users if u.get("apiKey") == api_key), None)
    if not user:
        return None

    today = todays_date()
    if not user.get("dailyUsage") or user["dailyUsage"].get("date") != today:
        user["dailyUsage"] = {"date": today, "rd": 0, "fd": 0, "emi": 0, "nw": 0}

    user["dailyUsage"][calculator] = user["dailyUsage"].get(calculator, 0) + 1
    write_users(users)
    return user


def upgrade_tier(api_key: str, new_tier: str, payment_token: str) -> dict[str, Any] | None:
    if not payment_token or len(payment_token) < 8:
        error = ValueError("Invalid payment token - upgrade rejected")
        error.code = "INVALID_PAYMENT"
        raise error

    users = read_users()
    user = next((u for u in users if u.get("apiKey") == api_key), None)
    if not user:
        return None

    if user.get("lastPaymentToken") == payment_token:
        error = ValueError("Payment token already used - possible duplicate upgrade attempt")
        error.code = "DUPLICATE_PAYMENT"
        raise error

    user["tier"] = str(new_tier or "").strip().upper()
    user["subscriptionStartDate"] = todays_date()
    user["lastPaymentToken"] = payment_token
    user["lastPaymentDate"] = todays_date()
    user["paymentStatus"] = "completed"
    write_users(users)
    return user
