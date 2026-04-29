"""Conversational search — Claude primary, GPT-4o fallback, PostgreSQL FTS
on retry exhaustion.

Sprint 13 scope: five-stage pipeline — intent classification, parameter
extraction (Pydantic-validated), session context (Redis, 30-min TTL),
reference resolution, ranking. No persistent chat history.

Prompt templates live in `prompts.py` as versioned Python strings — no
LangChain, no live prompt editing.
"""
