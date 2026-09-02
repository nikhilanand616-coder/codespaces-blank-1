from __future__ import annotations

import json
import os
import re
import secrets
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from py_src.bank_rates import get_bank_rates
from py_src.calculators import calc_rd, calc_fd, calc_emi, calc_nw
from py_src.subscriptions import SUBSCRIPTION_TIERS, can_use_calculator, get_tier_info
from py_src.user_store import (
    create_user,
    find_by_api_key,
    find_by_email,
    seed_default_user,
    track_usage,
    upgrade_tier,
    verify_user,
)

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="FinCommand Python Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AuthRequest(BaseModel):
    email: str
    password: str


class RDRequest(BaseModel):
    monthly: Optional[float] = Field(0.0)
    annualRate: Optional[float] = Field(0.0)
    months: Optional[int] = Field(0)


class FDRequest(BaseModel):
    principal: Optional[float] = Field(0.0)
    annualRate: Optional[float] = Field(0.0)
    years: Optional[float] = Field(0.0)


class EMIRequest(BaseModel):
    principal: Optional[float] = Field(0.0)
    annualRate: Optional[float] = Field(0.0)
    years: Optional[float] = Field(0.0)


class NWRequest(BaseModel):
    assets: Optional[float] = Field(0.0)
    liabilities: Optional[float] = Field(0.0)


class PaymentRequest(BaseModel):
    tier: str
    amount: int
    lastFourDigits: str


class UpiPaymentRequest(BaseModel):
    tier: str
    amount: int
    upiProvider: str
    upiId: Optional[str] = None


class VerifyPaymentRequest(BaseModel):
    transactionId: str


class LimitRequest(BaseModel):
    calculator: str


def get_api_key(
    x_api_key: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
) -> str:
    if x_api_key:
        return x_api_key
    if authorization and authorization.lower().startswith("apikey "):
        return authorization.split(" ", 1)[1].strip()
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key is required")


def get_current_user(api_key: str = Depends(get_api_key)) -> dict[str, Any]:
    user = find_by_api_key(api_key)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return user


@app.on_event("startup")
async def startup_event() -> None:
    seed_default_user()


@app.get("/")
def root() -> FileResponse:
    return FileResponse(BASE_DIR / "login.html")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": os.getenv("NODE_ENV", "development")}


@app.get("/api/v1/bank-rates")
def bank_rates() -> dict[str, Any]:
    try:
        return get_bank_rates()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@app.post("/api/v1/login")
def login(request: AuthRequest) -> dict[str, Any]:
    user = verify_user(request.email, request.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return {
        "email": user["email"],
        "apiKey": user["apiKey"],
        "tier": user.get("tier", "FREE"),
        "tierInfo": get_tier_info(user.get("tier", "FREE")),
    }


@app.post("/api/v1/register", status_code=status.HTTP_201_CREATED)
def register(request: AuthRequest) -> dict[str, Any]:
    try:
        result = create_user(request.email, request.password)
        return {**result, "tierInfo": get_tier_info(result["tier"])}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to register user")


@app.post("/api/v1/rd")
def rd(request: RDRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    track_usage(user["apiKey"], "rd")
    result = calc_rd(request.monthly, request.annualRate, request.months)
    return {**result, "monthly": request.monthly, "annualRate": request.annualRate, "months": request.months}


@app.post("/api/v1/fd")
def fd(request: FDRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    track_usage(user["apiKey"], "fd")
    result = calc_fd(request.principal, request.annualRate, request.years)
    return {**result, "principal": request.principal, "annualRate": request.annualRate, "years": request.years}


@app.post("/api/v1/emi")
def emi(request: EMIRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    track_usage(user["apiKey"], "emi")
    result = calc_emi(request.principal, request.annualRate, request.years)
    return {**result, "principal": request.principal, "annualRate": request.annualRate, "years": request.years}


@app.post("/api/v1/nw")
def nw(request: NWRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    track_usage(user["apiKey"], "nw")
    result = calc_nw(request.assets, request.liabilities)
    return {**result, "assets": request.assets, "liabilities": request.liabilities}


@app.get("/api/v1/profile")
def profile(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "email": user["email"],
        "tier": user.get("tier", "FREE"),
        "tierInfo": get_tier_info(user.get("tier", "FREE")),
        "subscriptionStartDate": user.get("subscriptionStartDate"),
        "dailyUsage": user.get("dailyUsage"),
        "createdAt": user.get("createdAt"),
    }


@app.get("/api/v1/subscriptions")
def subscriptions() -> dict[str, Any]:
    return SUBSCRIPTION_TIERS


@app.post("/api/v1/upgrade")
def upgrade(user: dict[str, Any] = Depends(get_current_user)) -> Any:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Direct upgrades are not allowed. Please use the payment endpoint.",
    )


def get_expected_amount(tier: str) -> int:
    normalized = str(tier or "").strip().upper()
    if normalized == "PRO":
        return 99
    return 299


@app.post("/api/v1/process-payment")
def process_payment(request: PaymentRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    tier = str(request.tier or "").strip().upper()
    if tier not in SUBSCRIPTION_TIERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tier")

    expected_amount = get_expected_amount(tier)
    if request.amount != expected_amount:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount mismatch - upgrade rejected")

    if not re.fullmatch(r"\d{4}", request.lastFourDigits):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid card details")

    payment_token = secrets.token_hex(16)
    payment_id = payment_token[:8].upper()
    updated_user = upgrade_tier(user["apiKey"], tier, payment_token)
    if not updated_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found")

    return {
        "message": f"Successfully upgraded to {tier}",
        "tier": updated_user["tier"],
        "tierInfo": get_tier_info(updated_user["tier"]),
        "paymentId": payment_id,
        "paymentAmount": request.amount,
        "lastFourDigits": request.lastFourDigits,
    }


@app.post("/api/v1/process-upi-payment")
def process_upi_payment(request: UpiPaymentRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    tier = str(request.tier or "").strip().upper()
    if tier not in SUBSCRIPTION_TIERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tier")

    expected_amount = get_expected_amount(tier)
    if request.amount != expected_amount:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount mismatch - upgrade rejected")

    valid_providers = {"googlepay", "googleplay", "phonepe", "bhim", "paytm", "navi"}
    if request.upiProvider not in valid_providers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UPI provider")

    if request.upiId and not re.fullmatch(r"[A-Za-z0-9._-]+@[A-Za-z0-9]+|\d{10}@[A-Za-z0-9]+", request.upiId):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UPI ID format")

    order_id = f"order_{secrets.token_hex(8)}"
    return {
        "message": "UPI payment order created",
        "orderId": order_id,
        "amount": request.amount * 100,
        "currency": "INR",
        "upiProvider": request.upiProvider,
        "upiId": request.upiId,
        "tier": tier,
        "razorpayKeyId": os.getenv("RAZORPAY_KEY_ID", "rzp_test_1DP5mmOlF5G5ag"),
        "simulate": True,
    }


@app.post("/api/v1/razorpay-webhook")
async def razorpay_webhook(request: Request) -> dict[str, str]:
    payload = await request.json()
    event = payload.get("event")
    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    notes = payment_entity.get("notes", {})

    if event == "payment.captured":
        user = find_by_email(notes.get("user_email", ""))
        if user:
            payment_token = secrets.token_hex(16)
            upgrade_tier(user["apiKey"], notes.get("tier", "FREE"), payment_token)
    return {"status": "ok"}


@app.post("/api/v1/verify-upi-payment")
def verify_upi_payment(request: VerifyPaymentRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "message": "Payment verified",
        "transactionId": request.transactionId,
        "tier": user.get("tier", "FREE"),
        "paymentStatus": user.get("paymentStatus", "completed"),
        "tierInfo": get_tier_info(user.get("tier", "FREE")),
    }


@app.post("/api/v1/check-limit")
def check_limit(request: LimitRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    user_tier = user.get("tier", "FREE")
    daily_usage = user.get("dailyUsage", {}).get(request.calculator, 0)
    can_use = can_use_calculator(user_tier, request.calculator, daily_usage)
    return {
        "canUse": can_use,
        "tier": user_tier,
        "dailyUsage": daily_usage,
        "calculator": request.calculator,
    }


app.mount("/", StaticFiles(directory=str(BASE_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=3000, reload=False)
