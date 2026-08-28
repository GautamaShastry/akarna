"""Akarna API — Intent proxy and contract boundary."""

from fastapi import FastAPI
from .routes.intent import router as intent_router

app = FastAPI(
    title="Akarna API",
    version="0.1.0",
    description="Intent-provider contract boundary and cloud-redacted proxy.",
)

app.include_router(intent_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
