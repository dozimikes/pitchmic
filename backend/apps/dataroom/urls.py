from django.urls import path

from .views import (
    DataRoomAccessListView,
    DataRoomDocumentDetailView,
    DataRoomDocumentListCreateView,
    DataRoomDocumentViewView,
    GrantAccessView,
    MyDataRoomAccessView,
    RevokeAccessView,
    SignNDAView,
    SlideTelemetryView,
)

app_name = "dataroom"

urlpatterns = [
    # Documents
    path("documents/", DataRoomDocumentListCreateView.as_view(), name="document-list"),
    path("documents/<int:pk>/", DataRoomDocumentDetailView.as_view(), name="document-detail"),
    path("documents/view/<int:pk>/", DataRoomDocumentViewView.as_view(), name="document-view"),
    # Slide Telemetry & Heatmap
    path("telemetry/", SlideTelemetryView.as_view(), name="slide-telemetry-record"),
    path("telemetry/<int:pk>/", SlideTelemetryView.as_view(), name="slide-telemetry-detail"),
    # Access management (startup-side)
    path("access/grant/", GrantAccessView.as_view(), name="grant-access"),
    path("access/", DataRoomAccessListView.as_view(), name="access-list"),
    path("access/<int:pk>/revoke/", RevokeAccessView.as_view(), name="revoke-access"),
    path("access/<int:pk>/sign-nda/", SignNDAView.as_view(), name="sign-nda"),
    # Investor-side
    path("my-access/", MyDataRoomAccessView.as_view(), name="my-access"),
]
