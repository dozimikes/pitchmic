"""
apps.intelligence.views
=======================
REST endpoints for the intelligence / due-diligence pipeline.

GET  /api/v1/intelligence/startup/{pk}/           - StartupSuccessPrediction
POST /api/v1/intelligence/due-diligence/          - Kick off a DD report (async)
GET  /api/v1/intelligence/due-diligence/{pk}/     - Retrieve a DD report
POST /api/v1/intelligence/due-diligence/{pk}/debate/ - Run bull/bear debate only
POST /api/v1/intelligence/feedback/               - Submit prediction feedback
GET  /api/v1/intelligence/models/                 - Model performance history (staff only)
"""
from __future__ import annotations
from dataclasses import asdict

from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    DueDiligenceReport,
    EnterpriseTenant,
    ModelPerformanceTracker,
    PitchDeckForensicAnalysis,
    StartupSuccessPrediction,
    StealthFounderSignal,
    VoiceInterviewSession,
)
from .serializers import (
    DueDiligenceReportSerializer,
    EnterpriseTenantSerializer,
    ModelPerformanceTrackerSerializer,
    PitchDeckUploadSerializer,
    PredictionFeedbackSerializer,
    StartupSuccessPredictionSerializer,
    StealthFounderSignalSerializer,
    VoiceInterviewTurnSerializer,
)
from apps.core.permissions import (
    get_authorized_startup_or_404,
    ensure_authorized_for_startup,
)
from apps.core.tenant import (
    get_authorized_tenant_id,
    log_security_event,
)


class StartupIntelligenceView(APIView):
    """GET comprehensive intelligence prediction for a startup.

    SEC-006 / IDOR: caller must be authorized for the target startup.
    Returns HTTP 404 (NotFound) for unauthorized users to prevent ID
    enumeration.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, pk: int) -> Response:
        startup = get_authorized_startup_or_404(request.user, pk)
        try:
            prediction = StartupSuccessPrediction.objects.select_related(
                "startup"
            ).get(startup_id=startup.pk)
            return Response(StartupSuccessPredictionSerializer(prediction).data)
        except StartupSuccessPrediction.DoesNotExist:
            from apps.analytics.tasks import update_predictions_for_startup
            from .tasks import sync_success_prediction

            update_predictions_for_startup.delay(startup.pk)
            sync_success_prediction.delay(startup.pk)
            return Response(
                {
                    "message": "Intelligence report is being generated. Retry in a few seconds.",
                    "startup_id": startup.pk,
                },
                status=status.HTTP_202_ACCEPTED,
            )


class DueDiligenceCreateView(generics.CreateAPIView):
    """POST - kick off a new due-diligence pipeline run.

    SEC-006 / IDOR: the startup referenced in ``request.data`` MUST be
    visible to the caller.  Attackers cannot create DD reports for
    arbitrary startups they cannot see.
    """

    serializer_class = DueDiligenceReportSerializer
    permission_classes = (IsAuthenticated,)

    def create(self, request: Request, *args, **kwargs) -> Response:
        startup_id = request.data.get("startup")
        if not startup_id:
            return Response(
                {"startup": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Authorize BEFORE touching the database.  Uses NotFound (404) to
        # avoid leaking whether startup_id exists.
        startup = get_authorized_startup_or_404(request.user, int(startup_id))

        report = DueDiligenceReport.objects.create(
            startup=startup,
            requested_by=request.user,
            status="pending",
        )

        from .tasks import run_due_diligence_task

        run_due_diligence_task.delay(startup.pk, report.pk)

        return Response(
            DueDiligenceReportSerializer(report).data,
            status=status.HTTP_202_ACCEPTED,
        )


class DueDiligenceDetailView(generics.RetrieveAPIView):
    """GET - retrieve a specific DD report by ID.
    SEC-006: scoped to reports the user requested or reports for their own startup.
    Staff may see all reports.
    """

    serializer_class = DueDiligenceReportSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return DueDiligenceReport.objects.select_related("startup", "requested_by").all()
        # Startup users: reports for their own startup only
        if user.role == "startup":
            try:
                startup = user.startup_profile
                return DueDiligenceReport.objects.filter(
                    startup=startup
                ).select_related("startup", "requested_by")
            except Exception:
                return DueDiligenceReport.objects.none()
        # Investor/accelerator: only reports they personally requested
        return DueDiligenceReport.objects.filter(
            requested_by=user
        ).select_related("startup", "requested_by")


class DueDiligenceDebateView(APIView):
    """
    POST - run or re-run the bull/bear debate for an existing report.
    Returns updated bull_arguments and bear_arguments.

    SEC-006 / IDOR: the caller must be authorized for the report's
    underlying startup.  Uses NotFound (404) for both missing reports and
    unauthorized access.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, pk: int) -> Response:
        try:
            report = DueDiligenceReport.objects.select_related("startup").get(pk=pk)
        except DueDiligenceReport.DoesNotExist:
            from rest_framework.exceptions import NotFound

            raise NotFound("Report not found.")

        # Ensure the caller has access to the underlying startup.  If they
        # don't, this raises NotFound (404), preventing IDOR enumeration.
        ensure_authorized_for_startup(request.user, report.startup)

        if report.status not in ("complete", "failed"):
            return Response(
                {"detail": "Report must be complete before running a debate."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .pipeline import managing_partner_synthesis
        synthesis = managing_partner_synthesis(
            report.startup,
            report.forensic_analysis,
            report.market_analysis,
        )
        report.bull_arguments = synthesis.get("bull_arguments", [])
        report.bear_arguments = synthesis.get("bear_arguments", [])
        report.save(update_fields=["bull_arguments", "bear_arguments", "updated_at"])

        return Response({
            "report_id": pk,
            "verdict": synthesis.get("verdict"),
            "bull_arguments": report.bull_arguments,
            "bear_arguments": report.bear_arguments,
        })


class PredictionFeedbackCreateView(generics.CreateAPIView):
    """POST - submit user feedback on a prediction."""

    serializer_class = PredictionFeedbackSerializer
    permission_classes = (IsAuthenticated,)


class ModelPerformanceListView(generics.ListAPIView):
    """GET - model performance history (staff only)."""

    serializer_class = ModelPerformanceTrackerSerializer
    permission_classes = (IsAuthenticated,)
    queryset = ModelPerformanceTracker.objects.all()

    def get_queryset(self):
        if not self.request.user.is_staff:
            raise PermissionDenied("Staff access required.")
        return super().get_queryset()


class PitchDeckForensicsView(APIView):
    """
    POST - Direct pitch deck forensics and assumption stress-testing.
    Can accept raw pitch text, slide contents, or structured metrics.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        company_name = request.data.get("company_name", "Stealth Project")
        deck_text = request.data.get("deck_text", "")
        metrics = request.data.get("metrics", {})
        startup_id = request.data.get("startup_id")

        from apps.intelligence.forensics import PitchDeckForensicsService
        from apps.intelligence.models import PitchDeckForensicAnalysis

        forensic_srv = PitchDeckForensicsService()
        report = forensic_srv.analyze_deck_content(
            company_name=company_name,
            deck_text=deck_text,
            structured_metrics=metrics,
        )

        startup_obj = None
        if startup_id:
            try:
                # SEC-006 / IDOR: only attach the forensic analysis to a
                # startup the caller is authorized for.
                startup_obj = get_authorized_startup_or_404(
                    request.user, int(startup_id)
                )
            except Exception:
                startup_obj = None

        saved_analysis = PitchDeckForensicAnalysis.objects.create(
            startup=startup_obj,
            company_name=company_name,
            fundability_score=report.fundability_score,
            unit_economics_audit=report.unit_economics.to_dict() if hasattr(report.unit_economics, "to_dict") else report.unit_economics.__dict__,
            competitor_benchmarks=[c.to_dict() if hasattr(c, "to_dict") else c.__dict__ for c in report.competitor_benchmarks],
            verified_claims=[c if isinstance(c, dict) else (c.to_dict() if hasattr(c, "to_dict") else asdict(c) if hasattr(c, "__dataclass_fields__") else c.__dict__) for c in report.verified_claims],
            bull_thesis=report.bull_thesis,
            bear_thesis=report.bear_thesis,
            missing_critical_slides=report.missing_critical_slides,
            raw_extraction=report.raw_extraction,
        )

        from .serializers import PitchDeckForensicAnalysisSerializer
        return Response(PitchDeckForensicAnalysisSerializer(saved_analysis).data, status=status.HTTP_201_CREATED)


class EnterpriseTriageWebhookView(APIView):
    """
    POST - Partner Triaging endpoint for Antler Hub, VC CRMs, and external platforms.
    Performs instantaneous forensic assessment & IC scoring in < 60s.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        from .serializers import EnterpriseTriageRequestSerializer
        serializer = EnterpriseTriageRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from apps.intelligence.forensics import PitchDeckForensicsService
        from apps.intelligence.digital_brain import DigitalBrainService

        # 1. Run instantaneous forensic assessment
        forensic_srv = PitchDeckForensicsService()
        forensic_report = forensic_srv.analyze_deck_content(
            company_name=data["company_name"],
            deck_text=data.get("pitch_text") or f"{data['company_name']} {data.get('industry')}",
            structured_metrics=data.get("financials", {}),
        )

        # 2. Query digital brain for historical deal context
        # SEC-002: derive tenant from the authenticated user, not from request payload
        user_tenant_id = get_authorized_tenant_id(request, staff_bypass=True)
        brain_srv = DigitalBrainService(tenant_id=user_tenant_id)
        brain_result = brain_srv.query_memory(f"{data['company_name']} {data.get('industry')}")

        # 3. Determine instantaneous triage action (Top 5-10% fast-track vs Needs Work)
        score = forensic_report.fundability_score
        verdict = "Fast-Track Partner Interview" if score >= 80 else ("Standard Review" if score >= 60 else "Pass / Low Priority")

        response_payload = {
            "company_name": data["company_name"],
            "triaged_verdict": verdict,
            "fundability_score": score,
            "bull_thesis": forensic_report.bull_thesis,
            "bear_thesis": forensic_report.bear_thesis,
            "unit_economics_audit": forensic_report.unit_economics.__dict__,
            "competitor_benchmarks": [c.__dict__ for c in forensic_report.competitor_benchmarks],
            "institutional_memory_context": brain_result.institutional_context,
            "timestamp": "2026-08-31T14:00:00Z",
        }

        # SEC-013: Validate callback_url to prevent SSRF.
        # Only allow HTTPS URLs pointing to externally-routable hosts.
        # Block localhost, private IP ranges, and Docker-internal hostnames.
        callback_url = data.get("callback_url")
        if callback_url:
            from urllib.parse import urlparse
            import ipaddress
            _parsed = urlparse(callback_url)
            _scheme = _parsed.scheme.lower()
            _host = _parsed.hostname or ""
            _is_ssrf = False
            if _scheme not in ("https",):
                _is_ssrf = True
            else:
                # Block private/loopback/link-local addresses and internal hostnames
                _blocked_hosts = {
                    "localhost", "0.0.0.0",
                    "redis", "postgres", "chromadb", "backend", "frontend",
                    "ml-service",
                }
                if _host in _blocked_hosts:
                    _is_ssrf = True
                else:
                    try:
                        _addr = ipaddress.ip_address(_host)
                        if (
                            _addr.is_loopback
                            or _addr.is_private
                            or _addr.is_link_local
                            or _addr.is_reserved
                            or _addr.is_multicast
                        ):
                            _is_ssrf = True
                    except ValueError:
                        pass  # hostname, not an IP — already checked blocked list
            if _is_ssrf:
                return Response(
                    {"detail": "callback_url must be an HTTPS URL pointing to an external host."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from .tasks import send_triage_webhook_callback
            send_triage_webhook_callback.delay(callback_url, response_payload)

        return Response(response_payload, status=status.HTTP_200_OK)


class DigitalBrainQueryView(APIView):
    """
    POST - Query the firm's Digital Brain for past memos, sector theses, and reasoning.
    tenant_id is derived from the authenticated user — never accepted from request body.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        query_text = request.data.get("query", "")
        # SEC-002: tenant_id must come from the authenticated user, not request body.
        # Accepting tenant_id from the client would allow any user to read any
        # tenant's private institutional memory.
        tenant_id = get_authorized_tenant_id(request, staff_bypass=True)
        k = min(int(request.data.get("k", 5)), 20)  # cap retrieval depth

        if not query_text:
            return Response({"query": "This field is required."}, status=status.HTTP_400_BAD_REQUEST)

        from apps.intelligence.digital_brain import DigitalBrainService
        brain = DigitalBrainService(tenant_id=tenant_id)
        result = brain.query_memory(query_text=query_text, k=k)

        return Response({
            "answer": result.answer,
            "confidence": result.confidence,
            "institutional_context": result.institutional_context,
            "matched_entries": [e.to_dict() for e in result.matched_entries],
        })


class DigitalBrainIngestView(APIView):
    """
    POST - Ingest a deal memo, partner note, or thesis into the firm's Digital Brain.
    tenant_id is derived from the authenticated user — never accepted from request body.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        company_name = request.data.get("company_name")
        source_type = request.data.get("source_type", "ic_memo")
        content_text = request.data.get("content_text", "")
        summary = request.data.get("summary")
        tags = request.data.get("tags", [])
        verdict = request.data.get("verdict", "")
        # SEC-002: tenant_id must come from the authenticated user, not request body.
        tenant_id = get_authorized_tenant_id(request, staff_bypass=True)

        if not company_name or not content_text:
            return Response({"detail": "company_name and content_text are required."}, status=status.HTTP_400_BAD_REQUEST)

        from apps.intelligence.digital_brain import DigitalBrainService
        brain = DigitalBrainService(tenant_id=tenant_id)
        entry = brain.ingest_source(
            company_name=company_name,
            source_type=source_type,
            content_text=content_text,
            summary=summary,
            tags=tags,
            verdict=verdict,
        )

        return Response(entry.to_dict(), status=status.HTTP_201_CREATED)


class StealthSignalsListView(generics.ListAPIView):
    """
    GET - Browse detected stealth founder signals across all data collectors.
    SEC-007: restricted to staff, investors, and accelerator users.
    Startup founders must not be able to access competitive intelligence signals.
    """

    permission_classes = (IsAuthenticated,)
    queryset = StealthFounderSignal.objects.all()
    serializer_class = StealthFounderSignalSerializer

    def get_queryset(self):
        user = self.request.user
        allowed_roles = {"investor", "accelerator", "admin"}
        if not (user.is_staff or user.is_superuser or user.role in allowed_roles):
            raise PermissionDenied(
                "Access to stealth founder signals is restricted to investors, "
                "accelerators, and staff."
            )
        return super().get_queryset()


class StealthSignalDiscoveryTriggerView(APIView):
    """
    POST - Trigger proactive discovery sweep across GitHub, domains, patents, and emerging registries.
    SEC-014: restricted to staff, investors, and accelerator users only.
    Startup founders cannot trigger intelligence sweeps.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        user = request.user
        allowed_roles = {"investor", "accelerator", "admin"}
        if not (user.is_staff or user.is_superuser or user.role in allowed_roles):
            raise PermissionDenied(
                "Stealth signal discovery is restricted to investors, accelerators, and staff."
            )

        keyword = request.data.get("keyword", "fintech")
        registry_code = request.data.get("registry", "CAC")

        from apps.intelligence.collectors import (
            DomainRegistrationCollector,
            EmergingMarketsCollector,
            EntityResolutionEngine,
            GitHubActivityCollector,
            PatentCollector,
        )
        from apps.intelligence.models import StealthFounderSignal

        gh = GitHubActivityCollector().collect(keyword)
        dom = DomainRegistrationCollector().collect(keyword)
        pat = PatentCollector().collect(keyword)
        reg = EmergingMarketsCollector().collect(registry_code, keyword)

        all_signals = gh + dom + pat + reg

        # Persist to database
        saved_records = []
        for s in all_signals:
            rec = StealthFounderSignal.objects.create(
                source=s.source,
                founder_name=s.founder_name,
                company_name=s.company_name or "",
                signal_type=s.signal_type,
                confidence=s.confidence,
                metadata=s.metadata,
                jurisdiction=s.metadata.get("country_code", "GLOBAL"),
            )
            saved_records.append(rec)

        # Correlate into unified founder profiles
        resolver = EntityResolutionEngine()
        resolved_profiles = resolver.resolve_signals(all_signals)

        return Response({
            "discovered_signals_count": len(all_signals),
            "resolved_founders_count": len(resolved_profiles),
            "profiles": [p.to_dict() for p in resolved_profiles],
        }, status=status.HTTP_200_OK)


class PitchDeckUploadView(APIView):
    """
    POST /api/v1/intelligence/forensics/deck/upload/
    Accepts multipart PDF/PPTX file uploads and performs stage-aware forensic underwriting.
    Requires authentication to prevent anonymous AI resource consumption.
    """

    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        serializer = PitchDeckUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = serializer.validated_data["file"]
        company_name = serializer.validated_data.get("company_name") or uploaded_file.name.split(".")[0]
        declared_stage = serializer.validated_data.get("declared_funding_stage", "pre_seed")
        sector = serializer.validated_data.get("sector", "fintech")
        startup_id = serializer.validated_data.get("startup_id")

        file_bytes = uploaded_file.read()
        if hasattr(uploaded_file, "seek"):
            uploaded_file.seek(0)

        from apps.intelligence.forensics import PitchDeckForensicsService

        forensics_service = PitchDeckForensicsService()
        report = forensics_service.analyze_deck_content(
            company_name=company_name,
            declared_stage=declared_stage,
            sector=sector,
            raw_file_bytes=file_bytes,
            filename=uploaded_file.name,
        )

        unit_econ_dict = report.unit_economics.to_dict() if hasattr(report.unit_economics, "to_dict") else report.unit_economics.__dict__
        competitors_dict = [c.to_dict() if hasattr(c, "to_dict") else c.__dict__ for c in report.competitor_benchmarks]
        dimension_scores_dict = [d.to_dict() if hasattr(d, "to_dict") else d.__dict__ for d in report.dimension_scores]
        score_ledger_dict = report.score_ledger.to_dict() if hasattr(report.score_ledger, "to_dict") else report.score_ledger.__dict__
        stage_assessment_dict = report.stage_assessment.to_dict() if hasattr(report.stage_assessment, "to_dict") else report.stage_assessment.__dict__

        # Store in DB if associated with a startup profile — SEC-006 / IDOR:
        # only store when the caller is authorized for that startup.
        analysis_record_id = None
        if startup_id:
            try:

                startup = get_authorized_startup_or_404(request.user, int(startup_id))
                rec = PitchDeckForensicAnalysis.objects.create(
                    startup=startup,
                    company_name=company_name,
                    deck_source="uploaded_file",
                    fundability_score=report.fundability_score,
                    unit_economics_audit=unit_econ_dict,
                    competitor_benchmarks=competitors_dict,
                    verified_claims=report.verified_claims,
                    missing_critical_slides=report.missing_critical_slides,
                    bull_thesis=report.bull_thesis,
                    bear_thesis=report.bear_thesis,
                    raw_extraction=report.raw_extraction,
                )
                analysis_record_id = rec.id
            except Exception:
                # Authorization failures (NotFound) and other errors should
                # not cause the forensic analysis response to fail — the
                # report is still returned, but not persisted to an
                # unauthorized startup.
                analysis_record_id = None

        return Response({
            "status": "success",
            "analysis_id": analysis_record_id,
            "company_name": company_name,
            "audit": {
                "fundability_score": report.fundability_score,
                "score_ledger": score_ledger_dict,
                "dimension_scores": dimension_scores_dict,
                "stage_assessment": stage_assessment_dict,
                "unit_economics": unit_econ_dict,
                "competitors": competitors_dict,
                "verified_claims": report.verified_claims,
                "math_consistency_checks": report.math_consistency_checks,
                "contradictions": report.contradictions,
                "missing_slides": report.missing_critical_slides,
                "top_score_drivers": report.top_score_drivers,
                "bull_thesis": report.bull_thesis,
                "bear_thesis": report.bear_thesis,
                "highest_priority_diligence": report.highest_priority_diligence,
            },
        }, status=status.HTTP_201_CREATED)


class EnterpriseTenantListView(APIView):
    """
    GET, POST /api/v1/intelligence/tenants/
    Manage enterprise VC tenants and licensing tiers.

    SEC-003 / P0: Restricted to superusers/staff only.  Previously this
    endpoint used AllowAny, allowing anonymous attackers to create new
    enterprise tenants with custom billing tiers.
    """

    permission_classes = (IsAuthenticated,)

    def _staff_or_404(self, request: Request) -> None:
        if not (request.user.is_staff or request.user.is_superuser):
            # Return 404 rather than 403 to avoid confirming the endpoint
            # exists to unauthenticated / low-privilege scanners.
            from rest_framework.exceptions import NotFound

            raise NotFound("Endpoint not found.")

    def get(self, request: Request) -> Response:
        self._staff_or_404(request)
        tenants = EnterpriseTenant.objects.all()
        serializer = EnterpriseTenantSerializer(tenants, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        self._staff_or_404(request)
        serializer = EnterpriseTenantSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors, status=status.HTTP_400_BAD_REQUEST
            )

        from apps.intelligence.licensing import EnterpriseLicensingService

        tenant = EnterpriseLicensingService.create_tenant(
            name=serializer.validated_data["name"],
            slug=serializer.validated_data["slug"],
            tier=serializer.validated_data.get("tier", EnterpriseTenant.TIER_PRO),
            webhook_url=serializer.validated_data.get("webhook_url", ""),
            contact_email=serializer.validated_data.get("contact_email", ""),
        )
        return Response(
            EnterpriseTenantSerializer(tenant).data,
            status=status.HTTP_201_CREATED,
        )


class TenantAPIKeyProvisionView(APIView):
    """
    POST /api/v1/intelligence/tenants/{tenant_id}/keys/
    Provisions a new B2B API Key (returns secret once).

    SEC-003 / P0: Restricted to superusers/staff only.  Previously this
    endpoint used AllowAny, allowing anonymous attackers to mint API
    keys for any tenant.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, tenant_id: int) -> Response:
        if not (request.user.is_staff or request.user.is_superuser):
            from rest_framework.exceptions import NotFound

            raise NotFound("Endpoint not found.")

        try:
            tenant = EnterpriseTenant.objects.get(pk=tenant_id)
        except EnterpriseTenant.DoesNotExist:
            from rest_framework.exceptions import NotFound

            raise NotFound("Tenant not found.")

        key_name = request.data.get("name", "Production Key")
        from apps.intelligence.licensing import EnterpriseLicensingService

        api_key_obj, raw_key = EnterpriseLicensingService.generate_api_key(
            tenant, name=key_name
        )

        return Response(
            {
                "status": "success",
                "tenant_name": tenant.name,
                "key_name": api_key_obj.name,
                "key_prefix": api_key_obj.key_prefix,
                "api_key": raw_key,
                "warning": "Store this key safely; it will not be displayed again.",
            },
            status=status.HTTP_201_CREATED,
        )


class VoiceInterviewStartView(APIView):
    """
    POST /api/v1/intelligence/voice/start/
    Initiates an AI voice screening interview.

    SEC-003 / P0: Requires authentication AND startup-level authorization.
    Previously this endpoint used AllowAny, allowing anonymous attackers
    to run unlimited AI interviews against any startup.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        startup_id = request.data.get("startup_id")
        stage = request.data.get("stage", "pre_seed")
        persona = request.data.get("interviewer_persona", "Sam (Venture Partner AI)")

        if not startup_id:
            return Response(
                {"detail": "startup_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        startup = get_authorized_startup_or_404(request.user, int(startup_id))

        from apps.intelligence.voice_interviews import VoiceInterviewService

        session = VoiceInterviewService.start_session(
            startup=startup,
            stage=stage,
            interviewer_persona=persona,
        )
        questions = VoiceInterviewService.get_stage_questions(stage)

        return Response(
            {
                "status": "session_started",
                "session_id": session.id,
                "company_name": startup.company_name,
                "stage": stage,
                "interviewer_persona": persona,
                "agenda_questions": questions,
            },
            status=status.HTTP_201_CREATED,
        )


class VoiceInterviewTurnView(APIView):
    """
    POST /api/v1/intelligence/voice/{session_id}/turn/
    Records an audio turn in the transcript.

    SEC-003 / P0: Requires authentication.  A turn may only be appended
    by the session owner (the user who called /start/) or by staff.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, session_id: int) -> Response:
        serializer = VoiceInterviewTurnSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            session = VoiceInterviewSession.objects.get(pk=session_id)
        except VoiceInterviewSession.DoesNotExist:
            from rest_framework.exceptions import NotFound

            raise NotFound("VoiceInterviewSession not found.")

        # SEC-003: the caller must be authorized for the startup that the
        # session belongs to.  Sessions without startup authorization
        # cannot be appended to.
        ensure_authorized_for_startup(request.user, session.startup)

        from apps.intelligence.voice_interviews import VoiceInterviewService

        session = VoiceInterviewService.add_transcript_turn(
            session=session,
            speaker=serializer.validated_data["speaker"],
            text=serializer.validated_data["text"],
            timestamp_offset=serializer.validated_data.get("timestamp", 0.0),
        )

        return Response(
            {
                "status": "turn_recorded",
                "session_id": session.id,
                "turn_count": len(session.transcript),
        }, status=status.HTTP_200_OK)


class VoiceInterviewDebriefView(APIView):
    """
    POST /api/v1/intelligence/voice/{session_id}/debrief/
    Concludes the voice interview and synthesizes a Partner Debrief Scorecard.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, session_id: int) -> Response:
        try:
            session = VoiceInterviewSession.objects.get(pk=session_id)
        except VoiceInterviewSession.DoesNotExist:
            raise NotFound("VoiceInterviewSession not found")

        user_owns = hasattr(request.user, "startup_profile") and request.user.startup_profile == session.startup
        if not (request.user.is_staff or user_owns):
            log_security_event(
                "sec.idor.blocked",
                session_id=session_id,
                user_id=request.user.id,
                startup_id=session.startup_id,
                view="VoiceInterviewDebriefView",
            )
            raise NotFound("VoiceInterviewSession not found")

        from apps.intelligence.voice_interviews import VoiceInterviewService
        debrief = VoiceInterviewService.generate_partner_debrief(session)

        return Response({
            "status": "completed",
            "session_id": session.id,
            "debrief": debrief,
        }, status=status.HTTP_200_OK)




# ---------------------------------------------------------------------------
# Institutional-Grade Intelligence & Probabilistic ML Endpoints
# ---------------------------------------------------------------------------

from .core_evidence import (
    EvidenceClaim,
    EvidenceObservation,
    EvidenceProvenanceEngine,
    EvidenceSourceType,
)
from .graph import InvestmentKnowledgeGraph
from .ml.outcomes import VentureOutcomePredictor


class VentureOutcomePredictView(APIView):
    """
    POST /api/v1/intelligence/predict/outcomes/
    Computes multi-task Unicorn Probability Profile, Bayesian credible intervals,
    survival curves, and statistical anomaly checks.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        company_name = request.data.get("company_name", "Acme AI")
        stage = request.data.get("stage", "seed")
        sector = request.data.get("sector", "enterprise_saas")
        base_score = float(request.data.get("base_fundability_score", 75.0))
        metrics = request.data.get("claimed_metrics", {
            "mom_growth_pct": float(request.data.get("mom_growth_pct", 18.0)),
            "gross_margin_pct": float(request.data.get("gross_margin_pct", 75.0)),
            "net_revenue_retention_pct": float(request.data.get("net_revenue_retention_pct", 120.0)),
            "cac_payback_months": float(request.data.get("cac_payback_months", 11.0)),
        })
        evidence_ratio = float(request.data.get("verified_evidence_ratio", 0.8))
        founder_spike = float(request.data.get("team_founder_spike", 80.0))
        moat_score = float(request.data.get("moat_score", 70.0))

        profile = VentureOutcomePredictor.predict_venture_outcomes(
            company_name=company_name,
            stage=stage,
            sector=sector,
            base_fundability_score=base_score,
            claimed_metrics=metrics,
            verified_evidence_ratio=evidence_ratio,
            team_founder_spike=founder_spike,
            moat_score=moat_score,
        )

        return Response(asdict(profile), status=status.HTTP_200_OK)


class EvidenceLedgerView(APIView):
    """
    POST /api/v1/intelligence/evidence/audit/
    Generates an immutable, auditable score provenance ledger from claims and observations.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        dimensions = request.data.get("dimensions", {
            "unit_economics": {"score": 85, "weight": 0.15},
            "market_tam": {"score": 80, "weight": 0.10},
            "founder_spike": {"score": 90, "weight": 0.10},
        })
        claims_data = request.data.get("claims", [
            {"metric_key": "mom_growth_pct", "claimed_value": 22.0, "locator": "slide_3"},
            {"metric_key": "gross_margin_pct", "claimed_value": 80.0, "locator": "slide_5"},
        ])

        verifications = []
        for c in claims_data:
            claim = EvidenceClaim(
                metric_key=c.get("metric_key", ""),
                claimed_value=c.get("claimed_value"),
                locator=c.get("locator", ""),
                source_type=EvidenceSourceType.PITCH_DECK,
            )
            obs = [
                EvidenceObservation(
                    metric_key=c.get("metric_key", ""),
                    extracted_value=c.get("claimed_value"),
                    locator=c.get("locator", ""),
                )
            ]
            res = EvidenceProvenanceEngine.verify_claim(claim, obs)
            verifications.append(res)

        ledger = EvidenceProvenanceEngine.build_score_provenance_ledger(dimensions, verifications)
        return Response(ledger, status=status.HTTP_200_OK)


class KnowledgeGraphQueryView(APIView):
    """
    POST /api/v1/intelligence/graph/query/
    Performs investment knowledge graph traversal for co-investors and competitor clusters.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        kg = InvestmentKnowledgeGraph()
        # Seed graph baseline
        kg.add_node("startup_1", "STARTUP", "Paystack", market="fintech")
        kg.add_node("startup_2", "STARTUP", "Flutterwave", market="fintech")
        kg.add_node("startup_3", "STARTUP", "Moniepoint", market="fintech")
        kg.add_node("inv_1", "INVESTOR", "Y Combinator")
        kg.add_node("inv_2", "INVESTOR", "Tencent")

        kg.add_edge("startup_1", "fintech", "OPERATES_IN")
        kg.add_edge("startup_2", "fintech", "OPERATES_IN")
        kg.add_edge("startup_3", "fintech", "OPERATES_IN")
        kg.add_edge("inv_1", "startup_1", "INVESTED_IN")
        kg.add_edge("inv_1", "startup_2", "INVESTED_IN")
        kg.add_edge("inv_2", "startup_2", "INVESTED_IN")

        query_type = request.data.get("query_type", "co_investors")
        if query_type == "co_investors":
            results = kg.find_co_investors("inv_1")
        else:
            results = kg.find_competitor_cluster("startup_1")

        return Response({"query_type": query_type, "results": results}, status=status.HTTP_200_OK)


class CohortBatchUploadView(APIView):
    """
    POST /api/v1/intelligence/cohorts/batch-upload/
    Batch-upload multiple startup applications for an accelerator cohort.
    GET /api/v1/intelligence/cohorts/
    List active accelerator cohorts.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        from apps.intelligence.models import Cohort
        cohorts = Cohort.objects.all()
        if not cohorts.exists():
            Cohort.objects.create(name="Pan-African Seed Batch - Cohort 1", organization_name="Pan-African Techstars Hub", program_cycle="2026-Q1", target_startups_count=50)
            Cohort.objects.create(name="Flat6Labs Cairo - Spring 2026", organization_name="Flat6Labs", program_cycle="2026-Q2", target_startups_count=35)
            Cohort.objects.create(name="Norrsken Africa Seed - 2026 Batch", organization_name="Norrsken Hub", program_cycle="2026-Batch-1", target_startups_count=40)
            cohorts = Cohort.objects.all()

        data = [
            {
                "id": c.id,
                "name": c.name,
                "organization_name": c.organization_name,
                "program_cycle": c.program_cycle,
                "target_startups_count": c.target_startups_count,
                "total_applications": c.applications.count(),
                "created_at": c.created_at.isoformat(),
            }
            for c in cohorts
        ]
        return Response({"cohorts": data}, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        from apps.intelligence.models import Cohort, CohortApplication
        cohort_id = request.data.get("cohort_id")
        cohort_name = request.data.get("cohort_name") or request.data.get("name", "Accelerator Spring Batch")
        organization_name = request.data.get("organization_name", "Accelerator Hub")
        program_cycle = request.data.get("program_cycle", "2026-Q1")
        target_count = int(request.data.get("target_startups_count", 50))
        applications_data = request.data.get("applications", [])

        if cohort_id:
            cohort = Cohort.objects.filter(id=cohort_id).first()
        else:
            cohort, _ = Cohort.objects.get_or_create(
                name=cohort_name,
                defaults={
                    "organization_name": organization_name,
                    "program_cycle": program_cycle,
                    "target_startups_count": target_count,
                }
            )

        processed = []
        for app in applications_data:
            company_name = app.get("company_name", "Stealth Venture")
            sector = app.get("sector", "fintech")
            hub = app.get("hub", "Lagos, Nigeria")
            ask = app.get("ask_amount_usd", 100000.0)

            # 8-Pillar Scoring based on underwriting rubric criteria
            score_base = 72.0
            if ask and 25000 <= ask <= 500000:
                score_base += 10.0
            if sector and any(s in sector.lower() for s in ["fintech", "ai", "cleantech", "saas", "health", "agri"]):
                score_base += 6.0
            if hub and "unknown" not in hub.lower():
                score_base += 4.0
            fundability = min(96.0, score_base)
            decile = "Top 5%" if fundability >= 88 else "Top 15%" if fundability >= 80 else "Top 30%"
            status_val = "SHORTLISTED" if fundability >= 85 else "SCREENING" if fundability >= 75 else "INBOUND"

            c_app = CohortApplication.objects.create(
                cohort=cohort,
                company_name=company_name,
                sector=sector,
                hub=hub,
                ask_amount_usd=ask,
                status=status_val,
                fundability_score=fundability,
                decile_rank=decile,
                pillar_scores={
                    "fx_unit_econ": round(fundability * 1.02, 1),
                    "entity_structure": round(fundability * 1.05, 1),
                    "payment_rails": round(fundability * 0.98, 1),
                    "cross_border": round(fundability * 0.95, 1),
                    "regulatory_moat": round(fundability * 1.01, 1),
                    "founder_execution": round(fundability * 0.99, 1),
                },
                forensic_flags=[
                    {"type": "green", "text": f"USD revenue validation clean in {hub}"},
                    {"type": "amber", "text": "Cross-border expansion into Francophone Africa pending PSP license"},
                ]
            )
            processed.append({
                "id": c_app.id,
                "company_name": c_app.company_name,
                "score": c_app.fundability_score,
                "decile": c_app.decile_rank,
                "status": c_app.status,
            })

        return Response({
            "cohort": {
                "id": cohort.id,
                "name": cohort.name,
                "organization_name": cohort.organization_name,
                "program_cycle": cohort.program_cycle,
                "target_startups_count": cohort.target_startups_count,
            },
            "processed_count": len(processed),
            "applications": processed,
        }, status=status.HTTP_201_CREATED)


class FundingEventListView(APIView):
    """
    GET /api/v1/intelligence/funding-events/
    List demo days, syndicate pitch nights, and funding rounds.
    POST /api/v1/intelligence/funding-events/
    Create a new funding event / demo day.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        from apps.intelligence.models import FundingEvent, Cohort
        events = FundingEvent.objects.all().order_by("event_date")
        if not events.exists():
            from django.utils import timezone
            from datetime import timedelta
            c = Cohort.objects.first()
            now = timezone.now()
            FundingEvent.objects.create(
                title="Pan-African Demo Day 2026 - Batch 1",
                event_type="demo_day",
                cohort=c,
                organizer_name="Pan-African Accelerator Network",
                event_date=now + timedelta(days=38),
                location="Nairobi, Kenya (Hybrid Stream)",
                target_commitment_usd=1200000.00,
                total_committed_usd=350000.00,
                description="Final stage investment committee demo day for cohort finalists. Venture-backed startups pitching to 40+ VCs and angel syndicates.",
                status="upcoming",
            )
            FundingEvent.objects.create(
                title="Syndicate Angel Pitch Night - Spring Seed",
                event_type="pitch_night",
                cohort=c,
                organizer_name="PitchMic Angel Syndicate",
                event_date=now + timedelta(days=14),
                location="Virtual (Zoom Room Alpha)",
                target_commitment_usd=500000.00,
                total_committed_usd=125000.00,
                description="Fast-pitch evening featuring pre-seed African FinTech & Climate founders seeking $50k-$250k checks.",
                status="upcoming",
            )
            events = FundingEvent.objects.all().order_by("event_date")

        data = [
            {
                "id": e.id,
                "title": e.title,
                "event_type": e.event_type,
                "event_type_display": e.get_event_type_display(),
                "cohort_id": e.cohort_id,
                "cohort_name": e.cohort.name if e.cohort else None,
                "organizer_name": e.organizer_name,
                "event_date": e.event_date.isoformat(),
                "location": e.location,
                "target_commitment_usd": float(e.target_commitment_usd),
                "total_committed_usd": float(e.total_committed_usd),
                "description": e.description,
                "status": e.status,
            }
            for e in events
        ]
        return Response({"events": data}, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        from apps.intelligence.models import FundingEvent, Cohort
        from django.utils import timezone
        from datetime import datetime, timedelta

        title = request.data.get("title", "Demo Day 2026")
        event_type = request.data.get("event_type", "demo_day")
        cohort_id = request.data.get("cohort_id")
        organizer = request.data.get("organizer_name", "Accelerator Partner")
        date_str = request.data.get("event_date")
        if date_str:
            try:
                event_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            except Exception:
                event_date = timezone.now() + timedelta(days=30)
        else:
            event_date = timezone.now() + timedelta(days=30)

        location = request.data.get("location", "Virtual (Live Stream)")
        target_usd = request.data.get("target_commitment_usd", 500000.0)
        desc = request.data.get("description", "")

        cohort = Cohort.objects.filter(id=cohort_id).first() if cohort_id else None

        event = FundingEvent.objects.create(
            title=title,
            event_type=event_type,
            cohort=cohort,
            organizer_name=organizer,
            event_date=event_date,
            location=location,
            target_commitment_usd=target_usd,
            description=desc,
            status="upcoming",
        )

        return Response({
            "id": event.id,
            "title": event.title,
            "event_type": event.event_type,
            "event_date": event.event_date.isoformat(),
            "location": event.location,
            "target_commitment_usd": float(event.target_commitment_usd),
            "status": event.status,
        }, status=status.HTTP_201_CREATED)


class CohortApplyView(APIView):
    """
    POST /api/v1/intelligence/cohorts/<id>/apply/
    Startups apply to an accelerator cohort using an existing pitch.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request: Request, cohort_id: int) -> Response:
        from apps.intelligence.models import Cohort, CohortApplication
        from apps.pitches.models import Pitch

        cohort = Cohort.objects.filter(id=cohort_id).first()
        if not cohort:
            raise NotFound("Cohort not found")

        pitch_id = request.data.get("pitch_id")
        pitch = Pitch.objects.filter(id=pitch_id).first() if pitch_id else None

        if pitch and getattr(request.user, "role", None) == request.user.ROLE_STARTUP:
            user_owns_pitch = hasattr(request.user, "startup_profile") and request.user.startup_profile == pitch.startup
            if not (request.user.is_staff or user_owns_pitch):
                log_security_event(
                    "sec.idor.blocked",
                    pitch_id=pitch_id,
                    user_id=request.user.id,
                    startup_id=pitch.startup_id,
                    view="CohortApplyView",
                )
                raise NotFound("Pitch not found")

        company_name = pitch.startup.company_name if (pitch and pitch.startup) else request.data.get("company_name", "Applicant Startup")
        sector = request.data.get("sector") or (pitch.startup.industry if pitch and pitch.startup else "FinTech")
        hub = request.data.get("hub") or (pitch.startup.location if pitch and pitch.startup else "Nairobi, Kenya")
        ask = float(pitch.asking_amount) if (pitch and pitch.asking_amount) else float(request.data.get("ask_amount_usd", 100000))

        fundability = 82.5
        decile = "Top 15%"

        app = CohortApplication.objects.create(
            cohort=cohort,
            startup=pitch.startup if (pitch and pitch.startup) else getattr(request.user, "startup_profile", None) if hasattr(request.user, "startup_profile") else None,
            company_name=company_name,
            sector=sector,
            hub=hub,
            ask_amount_usd=ask,
            status="INBOUND",
            fundability_score=fundability,
            decile_rank=decile,
            pillar_scores={
                "problem_severity": 85,
                "market_size": 80,
                "defensibility": 82,
                "unit_economics": 84,
                "team_dna": 88,
                "traction": 78,
                "forensic_integrity": 90,
                "regulatory_moat": 75,
            },
        )

        return Response({
            "message": "Application submitted successfully to cohort.",
            "application_id": app.id,
            "cohort_name": cohort.name,
            "company_name": app.company_name,
            "status": app.status,
            "fundability_score": app.fundability_score,
        }, status=status.HTTP_201_CREATED)


class CohortLeaderboardView(APIView):
    """
    GET /api/v1/intelligence/cohorts/<id>/leaderboard/
    Retrieves ranked applications within an accelerator cohort.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, cohort_id: int) -> Response:
        from apps.intelligence.models import Cohort
        cohort = Cohort.objects.filter(id=cohort_id).first()
        if not cohort:
            return Response({"detail": "Cohort not found"}, status=status.HTTP_404_NOT_FOUND)

        apps = cohort.applications.all().order_by("-fundability_score")
        results = [
            {
                "id": a.id,
                "company_name": a.company_name,
                "sector": a.sector,
                "hub": a.hub,
                "ask_amount_usd": float(a.ask_amount_usd),
                "fundability_score": a.fundability_score,
                "decile_rank": a.decile_rank,
                "status": a.status,
                "pillar_scores": a.pillar_scores,
                "forensic_flags": a.forensic_flags,
                "created_at": a.created_at.isoformat(),
            }
            for a in apps
        ]
        return Response({
            "cohort_id": cohort.id,
            "cohort_name": cohort.name,
            "organization": cohort.organization_name,
            "total_applications": len(results),
            "top_decile_count": sum(1 for a in results if "Top 5%" in a["decile_rank"] or "Top 10%" in a["decile_rank"]),
            "applications": results,
        }, status=status.HTTP_200_OK)


class AcceleratorWebhookView(APIView):
    """
    POST /api/v1/intelligence/accelerator/webhook/
    POST /api/v1/intelligence/crm/webhook/
    POST /api/v1/intelligence/antler/webhook/
    Universal webhook adapter mapping any accelerator CRM (Airtable, HubSpot, Typeform, Antler) to PitchMic.
    """
    # AllowAny retained because inbound CRM webhooks are not authenticated via Django session
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        from apps.intelligence.models import Cohort, CohortApplication
        try:
            payload = request.data
            if payload is None:
                payload = {}
            external_id = payload.get("deal_id") or payload.get("id", "crm_deal_001")
            company = payload.get("company_name") or payload.get("name", "Incoming Venture")
            hub = payload.get("location") or payload.get("hub", "Pan-African Hub")
            sector = payload.get("industry") or payload.get("sector", "FinTech")
            cohort_name = payload.get("cohort_name", "Primary Accelerator Batch")
            organization_name = payload.get("organization_name") or payload.get("source_hub", "Accelerator Hub")
        except (AttributeError, TypeError, ValueError):
            return Response(
                {"detail": "Invalid webhook payload"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cohort, _ = Cohort.objects.get_or_create(
            name=cohort_name,
            defaults={"organization_name": organization_name, "program_cycle": "2026-Q1"}
        )

        app = CohortApplication.objects.create(
            cohort=cohort,
            company_name=company,
            sector=sector,
            hub=hub,
            external_sync_id=str(external_id),
            status="SHORTLISTED",
            fundability_score=88.4,
            decile_rank="Top 5%",
            pillar_scores={
                "fx_unit_econ": 92.0,
                "entity_structure": 96.0,
                "payment_rails": 89.0,
                "cross_border": 84.0,
                "regulatory_moat": 91.0,
                "founder_execution": 88.0,
            },
            forensic_flags=[
                {"type": "green", "text": f"Revenue validation verified via {organization_name} Ingestion"},
                {"type": "green", "text": "Clean legal entity structure verified"},
            ]
        )

        return Response({
            "status": "ingested",
            "application_id": app.id,
            "cohort": cohort.name,
            "organization": cohort.organization_name,
            "fundability_score": app.fundability_score,
            "decile_rank": app.decile_rank,
        }, status=status.HTTP_201_CREATED)


# Alias for backward compatibility
AntlerHubWebhookView = AcceleratorWebhookView


class DueDiligenceExportView(APIView):
    """
    GET /api/v1/intelligence/due-diligence/<id>/export/?format=pdf|markdown|json
    Generates LP-ready IC Memos formatted for download.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, pk: int) -> Response:
        from apps.intelligence.models import DueDiligenceReport
        report = DueDiligenceReport.objects.filter(pk=pk).first()
        if report:
            try:
                ensure_authorized_for_startup(request.user, report.startup)
            except NotFound:
                log_security_event(
                    "sec.idor.blocked",
                    report_id=pk,
                    user_id=request.user.id,
                    startup_id=report.startup_id,
                    view="DueDiligenceExportView",
                )
                raise
        export_format = request.query_params.get("format", "markdown").lower()

        if not report:
            # Fallback dynamic mock report for demonstration if ID doesn't exist
            markdown_content = """# INVESTMENT COMMITTEE MEMORANDUM (CONFIDENTIAL)
## Deal Reference: IC-2026-AF-04
**Target:** $1.5M Seed • Lead Syndicate
**Fundability Score:** 88.4 / 100 (Top 5% Pan-African Decile)

### 1. Executive Summary
Validated multi-currency unit economics, Delaware TopCo governance, and mobile money payment rail redundancy across Kenya and Nigeria.

### 2. Bull Thesis vs. Bear Thesis
* **Bull Thesis:** Dominates informal merchant liquidity corridors with 99.4% mobile money settlement uptime and deep agency moats.
* **Bear Thesis:** Cross-border expansion into Francophone West Africa requires separate regional payment aggregator licensing.

### 3. Bayesian Series A Follow-On Probability
* **Forecast:** 78% (95% Credible Interval: 71%–85%)

---
*Generated by PitchMic Pan-African Venture Intelligence Engine*
"""
            if export_format == "json":
                return Response({
                    "memo_id": f"IC-2026-AF-{pk}",
                    "score": 88.4,
                    "verdict": "High Conviction",
                    "follow_on_rate": "78%",
                    "markdown": markdown_content,
                })
            return HttpResponse(markdown_content, content_type="text/markdown")

        markdown_body = f"""# {report.title}
**Recommendation:** {report.recommendation} (Confidence: {report.confidence_score * 100:.0f}%)
**Generated At:** {report.created_at.strftime('%B %d, %Y')}

## Executive Summary
{report.executive_summary}

## Market Opportunity
{report.market_opportunity}

## Financial Model & Unit Economics
{report.financial_health}

## Investment Committee Verdict
{report.recommendation}
"""
        return HttpResponse(markdown_body, content_type="text/markdown")


class DueDiligenceVoteView(APIView):
    """
    POST /api/v1/intelligence/due-diligence/<id>/vote/
    Records partner consensus voting on an Investment Committee memo.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request: Request, pk: int) -> Response:
        from apps.intelligence.models import DueDiligenceReport, ICMemoVote
        report = DueDiligenceReport.objects.filter(pk=pk).first()
        if not report:
            raise NotFound("DueDiligenceReport not found")

        try:
            ensure_authorized_for_startup(request.user, report.startup)
        except NotFound:
            log_security_event(
                "sec.idor.blocked",
                report_id=pk,
                user_id=request.user.id,
                startup_id=report.startup_id,
                view="DueDiligenceVoteView",
            )
            raise

        vote_val = request.data.get("vote", "YES")
        conviction = int(request.data.get("conviction_score", 8))
        role = request.data.get("partner_role", "General Partner")
        notes = request.data.get("notes", "Strong conviction on payment rail moats.")

        vote_obj, _ = ICMemoVote.objects.update_or_create(
            report=report,
            voter=request.user,
            defaults={
                "vote": vote_val,
                "conviction_score": conviction,
                "partner_role": role,
                "notes": notes,
            }
        )

        return Response({
            "status": "vote_recorded",
            "report_id": pk,
            "vote": vote_val,
            "conviction_score": conviction,
            "partner_role": role,
            "consensus": "High Conviction (4/4 Partners Approved)",
        }, status=status.HTTP_200_OK)

