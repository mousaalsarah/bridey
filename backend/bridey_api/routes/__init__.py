from bridey_api.routes.auth import bp as auth_bp
from bridey_api.routes.bookings import bp as bookings_bp
from bridey_api.routes.health import bp as health_bp
from bridey_api.routes.me import bp as me_bp
from bridey_api.routes.onboarding import bp as onboarding_bp
from bridey_api.routes.public import bp as public_bp
from bridey_api.routes.session import bp as session_bp

__all__ = ["auth_bp", "bookings_bp", "health_bp", "me_bp", "onboarding_bp", "public_bp", "session_bp"]
