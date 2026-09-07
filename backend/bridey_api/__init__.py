from __future__ import annotations

from flask import Flask

from bridey_api.config import load_env
from bridey_api.db import init_engine
from bridey_api.routes import (
    admin_ops_bp,
    auth_bp,
    bookings_bp,
    fees_bp,
    health_bp,
    me_bp,
    media_alerts_bp,
    onboarding_bp,
    pass_lookup_bp,
    public_bp,
    qr_bp,
    session_bp,
    studio_bp,
)


def create_app(database_url: str | None = None) -> Flask:
    load_env()
    app = Flask(__name__)
    app.config["JSON_SORT_KEYS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
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
    app.register_blueprint(studio_bp)
    app.register_blueprint(media_alerts_bp)
    app.register_blueprint(fees_bp)
    app.register_blueprint(pass_lookup_bp)
    app.register_blueprint(qr_bp)
    app.register_blueprint(admin_ops_bp)
    return app
