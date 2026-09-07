from __future__ import annotations

from flask import Flask

from bridey_api.config import load_env
from bridey_api.db import init_engine
from bridey_api.routes import auth_bp, bookings_bp, health_bp, me_bp, onboarding_bp, public_bp, session_bp


def create_app(database_url: str | None = None) -> Flask:
    load_env()
    app = Flask(__name__)
    app.config["JSON_SORT_KEYS"] = False
    if database_url is None:
        init_engine()
    else:
        init_engine(database_url)
    app.register_blueprint(health_bp)
    app.register_blueprint(session_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(me_bp)
    app.register_blueprint(onboarding_bp)
    app.register_blueprint(bookings_bp)
    app.register_blueprint(public_bp)
    return app
