"""Private Supabase persistence for paper grid plans and demo balances."""
from __future__ import annotations

import os
import httpx


class SupabaseGridStore:
    def __init__(self, url: str | None = None, service_role_key: str | None = None):
        self.url = (url if url is not None else os.getenv("SUPABASE_URL", "")).rstrip("/")
        self.key = service_role_key if service_role_key is not None else os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.timeout = float(os.getenv("SUPABASE_HTTP_TIMEOUT", "15"))

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)

    def _headers(self):
        if not self.configured:
            raise RuntimeError("Supabase grid storage is not configured")
        return {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Accept-Profile": "spot_grid",
            "Content-Profile": "spot_grid",
        }

    async def create_preview(self, exchange: str, symbol: str, timeframe: str,
                             budget_usdt: float, grid_count: int, preview: dict) -> dict:
        if not self.configured:
            raise RuntimeError("Supabase grid storage is not configured")
        if not preview.get("eligible") or preview.get("order_creation_enabled") is not False:
            raise ValueError("Only eligible, non-executable grid previews can be saved")
        bounds = preview.get("range") or {}
        row = {
            "exchange": exchange,
            "symbol": symbol,
            "timeframe": timeframe,
            "status": "PREVIEW",
            "budget_usdt": budget_usdt,
            "grid_count": grid_count,
            "lower_price": bounds.get("lower"),
            "upper_price": bounds.get("upper"),
            "reference_price": bounds.get("reference_price"),
            "plan": preview,
        }
        headers = self._headers()
        headers["Prefer"] = "return=representation"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.url}/rest/v1/grid_sessions", headers=headers, json=row
            )
        if response.is_error:
            raise RuntimeError(
                f"Supabase grid session write failed ({response.status_code}); "
                "check spot_grid Data API exposure and server_role grants"
            )
        data = response.json()
        if not isinstance(data, list) or not data:
            raise RuntimeError("Supabase did not return the saved grid session")
        return data[0]

    async def latest_sessions(self, exchange: str | None = None, limit: int = 20) -> list[dict]:
        if not self.configured:
            raise RuntimeError("Supabase grid storage is not configured")
        params = {
            "select": "id,exchange,symbol,timeframe,status,budget_usdt,grid_count,lower_price,upper_price,reference_price,created_at,updated_at",
            "order": "created_at.desc",
            "limit": max(1, min(int(limit), 100)),
        }
        if exchange:
            params["exchange"] = f"eq.{exchange}"
        headers = self._headers()
        headers.pop("Content-Profile", None)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.url}/rest/v1/grid_sessions", params=params, headers=headers
            )
        if response.is_error:
            raise RuntimeError(f"Supabase grid session read failed ({response.status_code})")
        data = response.json()
        return data if isinstance(data, list) else []

    async def balances(self, exchange: str) -> list[dict]:
        if not self.configured:
            raise RuntimeError("Supabase grid storage is not configured")
        headers = self._headers()
        headers.pop("Content-Profile", None)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.url}/rest/v1/paper_balances",
                params={"select": "asset,free_amount,updated_at", "exchange": f"eq.{exchange}", "order": "asset.asc"},
                headers=headers,
            )
        if response.is_error:
            raise RuntimeError(f"Supabase paper balance read failed ({response.status_code})")
        data = response.json()
        return data if isinstance(data, list) else []
