"""Vercel Python HTTP function; requests retain their original route."""
from backend.server import Handler, initialize

initialize()
handler = Handler
