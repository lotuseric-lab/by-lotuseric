"""SQLite-backed shared spot balances, reservations and atomic paper-fill ledger."""
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
import sqlite3
import threading
from uuid import uuid4


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
                create table if not exists reservations (
                    id text primary key,
                    asset text not null,
                    amount text not null,
                    reference_key text unique not null,
                    status text not null check (status in ('reserved','consumed','released')),
                    created_at text not null default current_timestamp
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
                    reservation_id text references reservations(id),
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
        asset = asset.upper()
        with self._lock, self._db() as db:
            db.execute("begin immediate")
            try:
                reserved = self._reserved_amount(db, asset)
                if amount < reserved:
                    raise ValueError("Balance update would undercut active reservations")
                self._write_balance(db, asset, amount)
                db.commit()
            except Exception:
                db.rollback()
                raise

    def get_balance(self, asset: str) -> Decimal:
        with self._lock, self._db() as db:
            row = db.execute("select free_amount from balances where asset=?", (asset.upper(),)).fetchone()
        return Decimal(row[0]) if row else Decimal("0")

    def available_balance(self, asset: str) -> Decimal:
        with self._lock, self._db() as db:
            row = db.execute("select free_amount from balances where asset=?", (asset.upper(),)).fetchone()
            free = Decimal(row[0]) if row else Decimal("0")
            return free - self._reserved_amount(db, asset.upper())

    @staticmethod
    def _reserved_amount(db, asset: str) -> Decimal:
        rows = db.execute(
            "select amount from reservations where asset=? and status='reserved'", (asset.upper(),)
        ).fetchall()
        return sum((Decimal(row[0]) for row in rows), Decimal("0"))

    def reserve(self, asset: str, amount: Decimal, reference_key: str) -> str:
        if amount <= 0 or not reference_key:
            raise ValueError("A positive amount and reference key are required")
        asset = asset.upper()
        reservation_id = str(uuid4())
        with self._lock, self._db() as db:
            db.execute("begin immediate")
            try:
                row = db.execute("select free_amount from balances where asset=?", (asset,)).fetchone()
                free = Decimal(row[0]) if row else Decimal("0")
                available = free - self._reserved_amount(db, asset)
                if available < amount:
                    raise ValueError(f"Insufficient unreserved {asset} balance")
                db.execute(
                    "insert into reservations(id,asset,amount,reference_key,status) values(?,?,?,?, 'reserved')",
                    (reservation_id, asset, str(amount), reference_key),
                )
                db.commit()
            except Exception:
                db.rollback()
                raise
        return reservation_id

    def release(self, reservation_id: str) -> bool:
        with self._lock, self._db() as db:
            cursor = db.execute(
                "update reservations set status='released' where id=? and status='reserved'",
                (reservation_id,),
            )
            return cursor.rowcount == 1

    def apply_fill(
        self, client_order_id: str, symbol: str, side: str, quantity: Decimal,
        price: Decimal, fee_quote: Decimal, reservation_id: str | None = None,
    ) -> None:
        if side not in ("BUY", "SELL") or min(quantity, price) <= 0 or fee_quote < 0:
            raise ValueError("Invalid fill")
        if symbol.count("/") != 1:
            raise ValueError("Expected unified BASE/QUOTE spot symbol")
        base, quote = symbol.split("/")
        quote_gross = quantity * price
        required_asset = quote if side == "BUY" else base
        required_amount = quote_gross + fee_quote if side == "BUY" else quantity

        with self._lock, self._db() as db:
            db.execute("begin immediate")
            try:
                if db.execute(
                    "select 1 from paper_fills where client_order_id=?", (client_order_id,)
                ).fetchone():
                    raise ValueError("Duplicate client order id")

                if reservation_id:
                    reservation = db.execute(
                        "select asset,amount,status from reservations where id=?", (reservation_id,)
                    ).fetchone()
                    if not reservation or reservation[2] != "reserved":
                        raise ValueError("Missing or inactive balance reservation")
                    if reservation[0] != required_asset.upper() or Decimal(reservation[1]) < required_amount:
                        raise ValueError("Reservation does not cover this fill")
                else:
                    row = db.execute(
                        "select free_amount from balances where asset=?", (required_asset.upper(),)
                    ).fetchone()
                    free = Decimal(row[0]) if row else Decimal("0")
                    if free - self._reserved_amount(db, required_asset) < required_amount:
                        raise ValueError(f"Insufficient unreserved {required_asset} balance")

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

                if reservation_id:
                    db.execute(
                        "update reservations set status='consumed' where id=?",
                        (reservation_id,),
                    )
                db.execute(
                    """insert into paper_fills(client_order_id,symbol,side,quantity,price,fee_quote,quote_delta,reservation_id)
                       values(?,?,?,?,?,?,?,?)""",
                    (client_order_id, symbol, side, str(quantity), str(price), str(fee_quote),
                     str(quote_delta), reservation_id),
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
