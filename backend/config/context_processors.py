from django.conf import settings


def admin_globals(request):
    return {
        'FRONTEND_BASE_URL': getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3000'),
        'SITE_ENV': getattr(settings, 'SITE_ENV', 'DEV'),
    }