"""Run the CLI with `python -m app.cli`."""

import asyncio

from .commands import main

if __name__ == "__main__":
    asyncio.run(main())
