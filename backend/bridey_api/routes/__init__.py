from bridey_api.routes.admin_ops import bp as admin_ops_bp
from bridey_api.routes.auth import bp as auth_bp
from bridey_api.routes.bookings import bp as bookings_bp
from bridey_api.routes.fees import bp as fees_bp
from bridey_api.routes.health import bp as health_bp
from bridey_api.routes.me import bp as me_bp
from bridey_api.routes.media_alerts import bp as media_alerts_bp
from bridey_api.routes.onboarding import bp as onboarding_bp
from bridey_api.routes.pass_lookup import bp as pass_lookup_bp
from bridey_api.routes.public import bp as public_bp
from bridey_api.routes.qr import bp as qr_bp
from bridey_api.routes.session import bp as session_bp
from bridey_api.routes.studio import bp as studio_bp

__all__ = [
    "admin_ops_bp",
    "auth_bp",
    "bookings_bp",
    "fees_bp",
    "health_bp",
    "me_bp",
    "media_alerts_bp",
    "onboarding_bp",
    "pass_lookup_bp",
    "public_bp",
    "qr_bp",
    "session_bp",
    "studio_bp",
]
