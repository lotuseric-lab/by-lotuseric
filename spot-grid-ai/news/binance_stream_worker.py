"""Run with: python -m news.binance_stream_worker"""
import asyncio
import logging

from news.binance_stream import run_binance_announcements_worker


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        asyncio.run(run_binance_announcements_worker())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
