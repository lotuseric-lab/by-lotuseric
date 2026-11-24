"""SQLite-backed shared spot balances and atomic portfolio ledger."""
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
import sqlite3
import threading


class PortfolioLedger:
    def __init__(self, database_path: str = "data/smart_grid_paper.sqlite3"):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        with self._db() as db:
            db.execute("""
                create table if not exists balances (
                    asset text primary key,
                    free_amount text not null,
                    updated_at text not null default current_timestamp
                )
            """)
            db.execute("""
                create table if not exists paper_fills (
                    id integer primary key autoincrement,
                    client_order_id text unique not null,
                    symbol text not null,
                    side text not null check (side in ('BUY','SELL')),
                    quantity text not null,
                    price text not null,
                    fee_quote text not null,
                    quote_delta text not null,
                    created_at text not null default current_timestamp
                )
            """)

    def _connect(self):
        db = sqlite3.connect(self.database_path, timeout=15, isolation_level=None)
        db.execute("pragma journal_mode=WAL")
        db.execute("pragma foreign_keys=ON")
        return db

    @contextmanager
    def _db(self):
        db = self._connect()
        try:
            yield db
        finally:
            db.close()

    def set_balance(self, asset: str, amount: Decimal) -> None:
        if amount < 0:
            raise ValueError("Balance cannot be negative")
        with self._lock, self._db() as db:
            db.execute(
                """insert into balances(asset, free_amount) values(?, ?)
                   on conflict(asset) do update set free_amount=excluded.free_amount,
                   updated_at=current_timestamp""",
                (asset.upper(), str(amount)),
            )

    def get_balance(self, asset: str) -> Decimal:
        with self._lock, self._db() as db:
            row = db.execute("select free_amount from balances where asset=?", (asset.upper(),)).fetchone()
        return Decimal(row[0]) if row else Decimal("0")

    def apply_fill(
        self, client_order_id: str, symbol: str, side: str, quantity: Decimal,
        price: Decimal, fee_quote: Decimal,
    ) -> None:
        if side not in ("BUY", "SELL") or min(quantity, price) <= 0 or fee_quote < 0:
            raise ValueError("Invalid fill")
        if symbol.count("/") != 1:
            raise ValueError("Expected unified BASE/QUOTE spot symbol")
        base, quote = symbol.split("/")
        quote_gross = quantity * price
        with self._lock, self._db() as db:
            db.execute("begin immediate")
            try:
                existing = db.execute(
                    "select 1 from paper_fills where client_order_id=?", (client_order_id,)
                ).fetchone()
                if existing:
                    raise ValueError("Duplicate client order id")
                required_asset = quote if side == "BUY" else base
                required_amount = quote_gross + fee_quote if side == "BUY" else quantity
                row = db.execute(
                    "select free_amount from balances where asset=?", (required_asset.upper(),)
                ).fetchone()
                available = Decimal(row[0]) if row else Decimal("0")
                if available < required_amount:
                    raise ValueError(f"Insufficient free {required_asset} balance")
                if side == "BUY":
                    self._write_balance(db, quote, available - required_amount)
                    self._change_balance(db, base, quantity)
                    quote_delta = -required_amount
                else:
                    self._write_balance(db, base, available - quantity)
                    self._change_balance(db, quote, quote_gross - fee_quote)
                    quote_delta = quote_gross - fee_quote
                db.execute(
                    """insert into paper_fills(client_order_id,symbol,side,quantity,price,fee_quote,quote_delta)
                       values(?,?,?,?,?,?,?)""",
                    (client_order_id, symbol, side, str(quantity), str(price), str(fee_quote), str(quote_delta)),
                )
                db.commit()
            except Exception:
                db.rollback()
                raise

    @staticmethod
    def _write_balance(db, asset: str, amount: Decimal):
        db.execute(
            """insert into balances(asset,free_amount) values(?,?)
               on conflict(asset) do update set free_amount=excluded.free_amount,
               updated_at=current_timestamp""",
            (asset.upper(), str(amount)),
        )

    @classmethod
    def _change_balance(cls, db, asset: str, delta: Decimal):
        row = db.execute("select free_amount from balances where asset=?", (asset.upper(),)).fetchone()
        current = Decimal(row[0]) if row else Decimal("0")
        cls._write_balance(db, asset, current + delta)
