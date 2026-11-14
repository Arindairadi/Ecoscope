"""Shared entry point for managed development and production services."""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("backend.app:app", host="0.0.0.0", port=int(os.environ["PORT"]))
