from django.urls import path, include

app_name = "intelligence_engine"

urlpatterns = [
    path("ingestion/", include("apps.intelligence_engine.ingestion.urls")),
    path("entities/", include("apps.intelligence_engine.entity.urls")),
    path("opportunities/", include("apps.intelligence_engine.opportunity.urls")),
    path("intelligence/", include("apps.intelligence_engine.intelligence.urls")),
]
