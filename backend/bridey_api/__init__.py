from __future__ import annotations

from flask import Flask

from bridey_api.config import load_env
from bridey_api.db import init_engine
from bridey_api.routes import health_bp, session_bp


def create_app() -> Flask:
    load_env()
    app = Flask(__name__)
    app.config["JSON_SORT_KEYS"] = False
    init_engine()
    app.register_blueprint(health_bp)
    app.register_blueprint(session_bp)
    return app
