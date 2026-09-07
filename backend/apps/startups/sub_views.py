"""
apps.startups.sub_views
========================
Views for the startup sub-profile models (FounderProfile, ProductProfile,
MarketProfile, BusinessModelProfile, TractionMetric).
All follow the same _get_startup_for_request pattern as startups/views.py.
"""
from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.users.models import StartupProfile
from apps.startups.sub_models import (
    BusinessModelProfile,
    FounderProfile,
    MarketProfile,
    ProductProfile,
    TractionMetric,
)
from apps.startups.sub_serializers import (
    BusinessModelProfileSerializer,
    FounderProfileSerializer,
    MarketProfileSerializer,
    ProductProfileSerializer,
    TractionMetricSerializer,
)


def _get_startup(request) -> StartupProfile | None:
    if request.user.is_authenticated:
        return getattr(request.user, "startup_profile", None)
    return None


# ---------------------------------------------------------------------------
# Founders
# ---------------------------------------------------------------------------

class FounderProfileViewSet(ModelViewSet):
    serializer_class = FounderProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_startup(self.request)
        if startup:
            return FounderProfile.objects.filter(startup=startup)
        return FounderProfile.objects.none()

    def perform_create(self, serializer):
        startup = _get_startup(self.request)
        serializer.save(startup=startup)


# ---------------------------------------------------------------------------
# Product Profile (OneToOne — upsert via PUT/PATCH)
# ---------------------------------------------------------------------------

class ProductProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_or_none(self, startup):
        try:
            return startup.product_profile
        except ProductProfile.DoesNotExist:
            return None

    def get(self, request):
        startup = _get_startup(request)
        if not startup:
            return Response({"detail": "No startup profile."}, status=status.HTTP_404_NOT_FOUND)
        instance = self._get_or_none(startup)
        if not instance:
            return Response({}, status=status.HTTP_200_OK)
        return Response(ProductProfileSerializer(instance).data)

    def put(self, request):
        return self._upsert(request, partial=False)

    def patch(self, request):
        return self._upsert(request, partial=True)

    def _upsert(self, request, partial: bool):
        startup = _get_startup(request)
        if not startup:
            return Response({"detail": "No startup profile."}, status=status.HTTP_404_NOT_FOUND)
        instance = self._get_or_none(startup)
        if instance:
            serializer = ProductProfileSerializer(instance, data=request.data, partial=partial)
        else:
            serializer = ProductProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(startup=startup)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Market Profile (OneToOne)
# ---------------------------------------------------------------------------

class MarketProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_or_none(self, startup):
        try:
            return startup.market_profile
        except MarketProfile.DoesNotExist:
            return None

    def get(self, request):
        startup = _get_startup(request)
        if not startup:
            return Response({"detail": "No startup profile."}, status=status.HTTP_404_NOT_FOUND)
        instance = self._get_or_none(startup)
        if not instance:
            return Response({}, status=status.HTTP_200_OK)
        return Response(MarketProfileSerializer(instance).data)

    def put(self, request):
        return self._upsert(request, partial=False)

    def patch(self, request):
        return self._upsert(request, partial=True)

    def _upsert(self, request, partial: bool):
        startup = _get_startup(request)
        if not startup:
            return Response({"detail": "No startup profile."}, status=status.HTTP_404_NOT_FOUND)
        instance = self._get_or_none(startup)
        if instance:
            serializer = MarketProfileSerializer(instance, data=request.data, partial=partial)
        else:
            serializer = MarketProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(startup=startup)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Business Model Profile (OneToOne)
# ---------------------------------------------------------------------------

class BusinessModelProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_or_none(self, startup):
        try:
            return startup.business_model_profile
        except BusinessModelProfile.DoesNotExist:
            return None

    def get(self, request):
        startup = _get_startup(request)
        if not startup:
            return Response({"detail": "No startup profile."}, status=status.HTTP_404_NOT_FOUND)
        instance = self._get_or_none(startup)
        if not instance:
            return Response({}, status=status.HTTP_200_OK)
        return Response(BusinessModelProfileSerializer(instance).data)

    def put(self, request):
        return self._upsert(request, partial=False)

    def patch(self, request):
        return self._upsert(request, partial=True)

    def _upsert(self, request, partial: bool):
        startup = _get_startup(request)
        if not startup:
            return Response({"detail": "No startup profile."}, status=status.HTTP_404_NOT_FOUND)
        instance = self._get_or_none(startup)
        if instance:
            serializer = BusinessModelProfileSerializer(instance, data=request.data, partial=partial)
        else:
            serializer = BusinessModelProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(startup=startup)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Traction Metrics
# ---------------------------------------------------------------------------

class TractionMetricViewSet(ModelViewSet):
    serializer_class = TractionMetricSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_startup(self.request)
        if not startup:
            return TractionMetric.objects.none()
        qs = TractionMetric.objects.filter(startup=startup)
        metric_type = self.request.query_params.get("metric_type")
        if metric_type:
            qs = qs.filter(metric_type=metric_type)
        return qs.order_by("-period_end", "-created_at")

    def perform_create(self, serializer):
        startup = _get_startup(self.request)
        serializer.save(startup=startup)

    def partial_update(self, request, *args, **kwargs):
        """PATCH /startups/traction/{id}/ — update an existing metric."""
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
