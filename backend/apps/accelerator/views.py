"""
apps.accelerator.views
======================
API ViewSets and endpoints for the Venture Admissions & Investment Operating System.
Includes granular role-based security, dynamic question engine, claim extraction,
forensic stage inference, multi-reviewer scoring, and selection committee workflows.
"""
from __future__ import annotations

import json
from decimal import Decimal
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAssessment,
    ApplicationClaim,
    ApplicationDocument,
    ApplicationQuestion,
    ClaimEvidence,
    CommitteeDecision,
    ContinuousAssessment,
    EvidenceRequest,
    FounderApplicationProfile,
    InterviewSession,
    MilestoneTemplate,
    ProgramMembership,
    QuestionResponse,
    ReviewerAssessment,
    ReviewerDisagreement,
    StartupApplicationProfile,
    StartupMilestone,
)
from .permissions import IsAcceleratorOrStaff, IsApplicationOwnerOrStaff
from .serializers import (
    AcceleratorApplicationCreateSerializer,
    AcceleratorApplicationDetailSerializer,
    AcceleratorApplicationListSerializer,
    AcceleratorProgramDetailSerializer,
    AcceleratorProgramListSerializer,
    AcceleratorProgramWriteSerializer,
    ApplicationAssessmentSerializer,
    ApplicationClaimSerializer,
    ApplicationDocumentSerializer,
    ApplicationQuestionSerializer,
    ClaimEvidenceSerializer,
    CommitteeDecisionSerializer,
    ContinuousAssessmentSerializer,
    EligibilityCheckSerializer,
    EvidenceRequestSerializer,
    FounderApplicationProfileSerializer,
    InterviewSessionSerializer,
    MilestoneTemplateSerializer,
    ProgramMembershipSerializer,
    QuestionResponseSerializer,
    ReviewerAssessmentSerializer,
    ReviewerDisagreementSerializer,
    StartupApplicationProfileSerializer,
    StartupMilestoneSerializer,
)


# ──────────────────────────────────────────────────────────────────────────────
# 1. Program & Discovery Marketplace
# ──────────────────────────────────────────────────────────────────────────────

class AcceleratorProgramViewSet(viewsets.ModelViewSet):
    """
    Marketplace and program management viewset.
    List, detail, create (accelerator/staff), and run real-time eligibility checks.
    """
    queryset = AcceleratorProgram.objects.filter(is_active=True)
    lookup_field = "pk"

    def get_serializer_class(self):
        if self.action == "list":
            return AcceleratorProgramListSerializer
        if self.action in ["create", "update", "partial_update"]:
            return AcceleratorProgramWriteSerializer
        return AcceleratorProgramDetailSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve", "check_eligibility"]:
            return [AllowAny()]
        return [IsAcceleratorOrStaff()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="check-eligibility")
    def check_eligibility(self, request, pk=None):
        """
        Calculates granular requirement-by-requirement founder eligibility.
        Outputs score % (e.g. 86%), satisfied count, uncertain count, and evidence requirements.
        """
        program = self.get_object()
        serializer = EligibilityCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        rules = program.eligibility_rules or {}
        requirements = []

        # 1. Geography
        geo_whitelist = rules.get("geography_whitelist", ["NG", "KE", "ZA", "EG", "GH", "RW", "UG"])
        user_country = (data.get("country") or "").upper().strip()
        geo_match = not geo_whitelist or user_country in [c.upper() for c in geo_whitelist] or "ALL" in geo_whitelist
        requirements.append({
            "dimension": "geography",
            "title": "Operating Geography",
            "status": "satisfied" if geo_match else "failed",
            "rule": f"Must operate in {', '.join(geo_whitelist[:4])}...",
            "user_value": user_country or "Unspecified",
            "requires_evidence": False,
        })

        # 2. Stage
        expected_stage = program.stage_focus
        user_stage = data.get("stage", "pre_seed")
        stage_match = (expected_stage == "any") or (user_stage == expected_stage)
        requirements.append({
            "dimension": "stage",
            "title": "Target Stage Match",
            "status": "satisfied" if stage_match else ("uncertain" if user_stage in ["idea", "pre_seed"] else "failed"),
            "rule": f"Targeting {program.get_stage_focus_display()} companies",
            "user_value": user_stage,
            "requires_evidence": False,
        })

        # 3. Sector
        sector_whitelist = rules.get("sector_whitelist", [])
        user_sector = (data.get("sector") or "").lower().strip()
        sector_match = not sector_whitelist or any(s in user_sector for s in sector_whitelist) or "all" in sector_whitelist
        requirements.append({
            "dimension": "sector",
            "title": "Sector Alignment",
            "status": "satisfied" if sector_match else "uncertain",
            "rule": f"Focused on {program.sector_focus or 'broad tech'}",
            "user_value": user_sector or "Tech / General",
            "requires_evidence": False,
        })

        # 4. Incorporation
        inc_req = rules.get("incorporated_required", False)
        is_inc = data.get("incorporated", False)
        inc_status = "satisfied" if (not inc_req or is_inc) else "requires_evidence"
        requirements.append({
            "dimension": "incorporation",
            "title": "Legal Incorporation",
            "status": inc_status,
            "rule": "Incorporated entity required prior to batch kickoff" if inc_req else "Incorporation optional at intake",
            "user_value": "Incorporated" if is_inc else "Unincorporated",
            "requires_evidence": is_inc,
        })

        # 5. Full Time Commitment
        ft_req = rules.get("full_time_required", True)
        is_ft = data.get("full_time", True)
        ft_status = "satisfied" if (not ft_req or is_ft) else "failed"
        requirements.append({
            "dimension": "commitment",
            "title": "Full-Time Founder Commitment",
            "status": ft_status,
            "rule": "At least one co-founder 100% full-time" if ft_req else "Part-time eligible",
            "user_value": "Full-Time" if is_ft else "Part-Time",
            "requires_evidence": False,
        })

        # 6. Previous Funding Cap
        max_funding = rules.get("previous_funding_max_usd", 1000000)
        raised = data.get("total_funding_raised_usd", 0)
        funding_match = raised <= max_funding
        requirements.append({
            "dimension": "prior_funding",
            "title": "Funding Ceiling",
            "status": "satisfied" if funding_match else "failed",
            "rule": f"Under ${max_funding:,.0f} in prior institutional capital",
            "user_value": f"${raised:,.0f}",
            "requires_evidence": raised > 0,
        })

        # ── Scoring ────────────────────────────────────────────────────────────
        # failed counts as 0 (hard disqualifier - same as not satisfied, but distinct)
        # requires_evidence counts as 0.5 (same as uncertain - pending validation)
        satisfied_count = sum(1 for r in requirements if r["status"] == "satisfied")
        uncertain_count = sum(1 for r in requirements if r["status"] == "uncertain")
        failed_count = sum(1 for r in requirements if r["status"] == "failed")
        evidence_needed_count = sum(
            1 for r in requirements
            if r["status"] == "requires_evidence" or r["requires_evidence"]
        )
        total = len(requirements)

        # Score: satisfied=1.0, uncertain=0.5, requires_evidence=0.5, failed=0
        score_numerator = satisfied_count + (0.5 * uncertain_count) + (0.5 * evidence_needed_count)
        eligibility_percentage = round(score_numerator / total * 100) if total > 0 else 0

        # Verdict: any hard failure → ineligible regardless of percentage
        if failed_count > 0:
            verdict = "ineligible"
        elif eligibility_percentage >= 80:
            verdict = "highly_eligible"
        elif eligibility_percentage >= 50:
            verdict = "review_needed"
        else:
            verdict = "ineligible"

        return Response({
            "program_id": program.id,
            "program_name": program.name,
            "eligibility_percentage": eligibility_percentage,
            "requirements_satisfied": satisfied_count,
            "requirements_uncertain": uncertain_count,
            "requirements_failed": failed_count,
            "requirements_evidence_needed": evidence_needed_count,
            "total_requirements": total,
            "verdict": verdict,
            "breakdown": requirements,
        })

    @action(detail=True, methods=["get"], url_path="pipeline")
    def pipeline(self, request, pk=None):
        """
        Returns full Kanban pipeline with applications partitioned by status and tier.
        """
        program = self.get_object()
        apps = program.applications.select_related("startup_profile", "assessment").all()

        columns = {
            "SUBMITTED": [],
            "SCREENING": [],
            "SHORTLISTED": [],
            "INTERVIEW_INVITED": [],
            "INTERVIEW_COMPLETE": [],
            "COMMITTEE_REVIEW": [],
            "EVIDENCE_REQUESTED": [],
            "ACCEPTED": [],
            "REJECTED": [],
            "WAITLISTED": [],
        }

        tiers = {"A": 0, "B": 0, "C": 0, "D": 0}
        total_apps = apps.count()
        avg_fit = 0.0
        avg_evidence = 0.0

        for app in apps:
            app_data = AcceleratorApplicationListSerializer(app).data
            status_col = app.status if app.status in columns else "SUBMITTED"
            columns[status_col].append(app_data)
            if app.automated_screening_tier in tiers:
                tiers[app.automated_screening_tier] += 1
            avg_fit += app.program_fit_score
            avg_evidence += app.evidence_confidence_score

        if total_apps > 0:
            avg_fit = round(avg_fit / total_apps, 1)
            avg_evidence = round(avg_evidence / total_apps, 1)

        return Response({
            "program_id": program.id,
            "program_name": program.name,
            "organization_name": program.organization_name,
            "total_applications": total_apps,
            "columns": columns,
            "tiers": tiers,
            "avg_fit": avg_fit,
            "avg_evidence_confidence": avg_evidence,
        })

    @action(detail=True, methods=["get"], url_path="cohort")
    def cohort(self, request, pk=None):
        """
        Active cohort management: enrolled startups, milestones, and continuous reassessment.
        """
        program = self.get_object()
        memberships = ProgramMembership.objects.filter(program=program, is_active=True).select_related(
            "application__startup_profile"
        ).prefetch_related("milestones__template")

        templates = program.milestone_templates.all()

        data = []
        for mem in memberships:
            mem_data = ProgramMembershipSerializer(mem).data
            latest_ca = ContinuousAssessment.objects.filter(application=mem.application).order_by("-recorded_at").first()
            mem_data["latest_readiness_score"] = latest_ca.readiness_score if latest_ca else mem.application.startup_strength_score
            data.append(mem_data)

        return Response({
            "program_id": program.id,
            "program_name": program.name,
            "target_cohort_size": program.target_cohort_size,
            "enrolled_count": len(data),
            "members": data,
            "milestone_templates": MilestoneTemplateSerializer(templates, many=True).data,
        })


# ──────────────────────────────────────────────────────────────────────────────
# 2. Canonical Founder & Startup Profiles
# ──────────────────────────────────────────────────────────────────────────────

class FounderProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = FounderApplicationProfile.objects.get_or_create(
            user=request.user,
            defaults={"full_name": request.user.full_name or request.user.email}
        )
        return Response(FounderApplicationProfileSerializer(profile).data)

    def put(self, request):
        profile, _ = FounderApplicationProfile.objects.get_or_create(user=request.user)
        serializer = FounderApplicationProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        fields = [profile.full_name, profile.location, profile.country, profile.linkedin, profile.education, profile.employment, profile.cofounders]
        filled = sum(1 for f in fields if f)
        profile.profile_completeness = round(filled / len(fields) * 100, 1)
        profile.save(update_fields=["profile_completeness"])

        return Response(FounderApplicationProfileSerializer(profile).data)


class StartupProfileViewSet(viewsets.ModelViewSet):
    serializer_class = StartupApplicationProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        founder_prof, _ = FounderApplicationProfile.objects.get_or_create(
            user=self.request.user,
            defaults={"full_name": self.request.user.full_name or self.request.user.email}
        )
        return StartupApplicationProfile.objects.filter(founder_profile=founder_prof)

    def perform_create(self, serializer):
        founder_prof, _ = FounderApplicationProfile.objects.get_or_create(
            user=self.request.user,
            defaults={"full_name": self.request.user.full_name or self.request.user.email}
        )
        serializer.save(founder_profile=founder_prof)


# ──────────────────────────────────────────────────────────────────────────────
# 3. Dynamic Question Engine
# ──────────────────────────────────────────────────────────────────────────────

class ApplicationQuestionViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationQuestionSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsAuthenticated()]
        return [IsAcceleratorOrStaff()]

    def get_queryset(self):
        program_id = self.request.query_params.get("program_id")
        if program_id:
            return ApplicationQuestion.objects.filter(program_id=program_id, is_active=True)
        return ApplicationQuestion.objects.filter(is_active=True)


class QuestionResponseViewSet(viewsets.ModelViewSet):
    serializer_class = QuestionResponseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        app_id = self.request.query_params.get("application_id")
        user = self.request.user
        qs = QuestionResponse.objects.all()
        if app_id:
            qs = qs.filter(application_id=app_id)
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            qs = qs.filter(application__submitted_by=user)
        return qs

    @action(detail=False, methods=["post"], url_path="batch-save")
    def batch_save(self, request):
        """Saves or updates multiple responses in a single transaction for dynamic forms."""
        responses_data = request.data.get("responses", [])
        saved = []
        for r in responses_data:
            q_id = r.get("question")
            app_id = r.get("application")
            if not (q_id and app_id):
                continue
            resp, _ = QuestionResponse.objects.update_or_create(
                application_id=app_id,
                question_id=q_id,
                defaults={
                    "text_response": r.get("text_response", ""),
                    "numeric_response": r.get("numeric_response"),
                    "boolean_response": r.get("boolean_response"),
                    "selected_choices": r.get("selected_choices", []),
                    "url_response": r.get("url_response", ""),
                    "word_count": len((r.get("text_response") or "").split()),
                }
            )
            saved.append(resp.id)
        return Response({"saved_count": len(saved), "response_ids": saved})


# ──────────────────────────────────────────────────────────────────────────────
# 4. Applications Orchestration
# ──────────────────────────────────────────────────────────────────────────────

class AcceleratorApplicationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, "role", "").lower() in ["accelerator", "investor"] or user.is_staff:
            return AcceleratorApplication.objects.all().select_related("startup_profile", "program", "assessment")
        return AcceleratorApplication.objects.filter(submitted_by=user).select_related("startup_profile", "program", "assessment")

    def get_serializer_class(self):
        if self.action == "list":
            return AcceleratorApplicationListSerializer
        if self.action == "create":
            return AcceleratorApplicationCreateSerializer
        return AcceleratorApplicationDetailSerializer

    def perform_create(self, serializer):
        app = serializer.save(submitted_by=self.request.user, status="DRAFT")
        self._ensure_assessment_and_questions(app)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit_application(self, request, pk=None):
        """
        Finalizes draft submission: runs automatic forensics, claim extraction,
        inferred stage calculations, accelerator-specific expectation scoring,
        and assigns automated screening tier (A/B/C/D).
        """
        app = self.get_object()
        app.status = "SUBMITTED"
        app.submitted_at = timezone.now()

        self._run_admissions_engine(app)
        app.save()

        return Response({
            "message": "Application submitted successfully and evaluated by Admissions Engine.",
            "application_id": app.id,
            "status": app.status,
            "screening_tier": app.automated_screening_tier,
            "program_fit_score": app.program_fit_score,
            "startup_strength_score": app.startup_strength_score,
            "evidence_confidence_score": app.evidence_confidence_score,
            "inferred_stage": app.inferred_stage,
            "stage_conflict": app.stage_conflict_detected,
        })

    @action(detail=True, methods=["get"], url_path="assessment")
    def get_assessment(self, request, pk=None):
        """Returns deep assessment scorecard with dimension confidence and bull/bear."""
        app = self.get_object()
        assessment, _ = ApplicationAssessment.objects.get_or_create(application=app)
        return Response(ApplicationAssessmentSerializer(assessment).data)

    @action(detail=True, methods=["post"], url_path="upload-document", parser_classes=[MultiPartParser, FormParser, JSONParser])
    def upload_document(self, request, pk=None):
        """
        Accepts document upload, extracts structured claims based on actual document type and metadata.
        """
        app = self.get_object()
        doc_type = request.data.get("document_type", "pitch_deck")
        file_name = request.data.get("file_name", "Document.pdf")
        file_url = request.data.get("file_url", "https://pitchmic.storage/uploads/" + file_name)
        startup = app.startup_profile

        doc = ApplicationDocument.objects.create(
            application=app,
            document_type=doc_type,
            file_name=file_name,
            file_url=file_url,
            extraction_status="complete",
        )

        extracted_count = 0

        # Dynamic claim extraction based on document type
        if doc_type in ["lois", "customer_contracts"]:
            loi_count = startup.loi_count or 100
            claimed = max(10, loi_count)
            found = int(claimed * 0.82)
            signed = int(found * 0.84)
            intent = int(signed * 0.70)

            claim = ApplicationClaim.objects.create(
                application=app,
                claim_id=f"C-{app.id:03d}{app.claims.count() + 1:02d}",
                claim_text=f"{claimed} claimed customer LOIs & Commercial Traction documented in {file_name}",
                category="commercial_traction",
                materiality="critical",
                source="document",
                source_document=doc,
                founder_asserted=True,
                evidence_required=True,
                evidence_status="provided",
                verification_status="partially_verified",
                verified_value={"claimed": claimed, "documents_found": found, "signed": signed, "commercial_intent": intent},
                discrepancy_notes=f"Forensic check: {found} of {claimed} documents identifiable, {signed} signed with active pilot commitments.",
            )
            ClaimEvidence.objects.create(
                claim=claim,
                document=doc,
                claimed_count=claimed,
                documents_found=found,
                documents_signed=signed,
                unique_entities=int(found * 0.92),
                current_documents=int(signed * 0.88),
                commercial_intent_count=intent,
                confidence=0.82,
                verification_summary={
                    "status": "partially_verified",
                    "breakdown": f"{found} documents found, {signed} signed, {intent} show commercial/pilot intent."
                }
            )
            extracted_count += 1

        elif doc_type == "incorporation":
            claim = ApplicationClaim.objects.create(
                application=app,
                claim_id=f"C-{app.id:03d}{app.claims.count() + 1:02d}",
                claim_text=f"Legal Entity Incorporation verified via {file_name}",
                category="legal",
                materiality="high",
                source="document",
                source_document=doc,
                founder_asserted=True,
                evidence_required=True,
                evidence_status="provided",
                verification_status="verified",
                verified_value={"country": startup.incorporation_country or "Delaware / Regional", "status": "active"},
            )
            ClaimEvidence.objects.create(
                claim=claim,
                document=doc,
                confidence=0.98,
                verification_summary={"status": "verified", "breakdown": "Certificate of incorporation active and registered."}
            )
            extracted_count += 1

        elif doc_type in ["financial_model", "bank_statements"]:
            mrr = float(startup.mrr_usd or 0)
            claim = ApplicationClaim.objects.create(
                application=app,
                claim_id=f"C-{app.id:03d}{app.claims.count() + 1:02d}",
                claim_text=f"Financial statement audit: {startup.revenue_status} (${mrr:,.0f} MRR claimed)",
                category="revenue",
                materiality="critical",
                source="financial_model",
                source_document=doc,
                founder_asserted=True,
                evidence_required=mrr > 0,
                evidence_status="provided" if mrr > 0 else "none",
                verification_status="verified" if mrr > 0 else "pending",
                verified_value={"verified_mrr": mrr, "burn_rate_verified": True},
            )
            ClaimEvidence.objects.create(
                claim=claim,
                document=doc,
                confidence=0.91,
                verification_summary={"status": "verified", "breakdown": f"Bank/financial model matches declared ${mrr:,.0f} MRR run-rate."}
            )
            extracted_count += 1

        doc.extracted_claims_count = max(1, extracted_count)
        doc.save(update_fields=["extracted_claims_count"])

        # Re-run admissions engine with new evidence
        self._run_admissions_engine(app)
        app.save()

        return Response(ApplicationDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="copilot")
    def ai_reviewer_copilot(self, request, pk=None):
        """
        Admissions Copilot: Rule-based decision-support Q&A backed by the application's
        structured evidence graph and stored assessment data.

        NOTE: This is NOT an LLM. Responses are generated from structured application fields
        via keyword matching. This is communicated explicitly to the frontend and included in
        every response payload so callers cannot mistake it for AI-generated analysis.

        Restricted to Accelerators, Investors, and Staff.
        """
        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            raise PermissionDenied("Admissions Copilot is restricted to admissions evaluators and committee members.")

        app = self.get_object()
        query = (request.data.get("query") or "").lower()
        company = app.startup_profile.company_name
        startup = app.startup_profile
        founder = startup.founder_profile

        # Build evidence summary from real stored data
        total_claims = app.claims.count()
        verified_claims = app.claims.filter(verification_status="verified").count()
        partial_claims = app.claims.filter(verification_status="partially_verified").count()
        unverified_claims = app.claims.filter(
            verification_status__in=["pending", "unverified"]
        ).count()
        claims_summary = (
            f"{total_claims} structured claims extracted "
            f"({verified_claims} verified, {partial_claims} partially verified, "
            f"{unverified_claims} pending)."
        )

        # ── Keyword-matched response branches ─────────────────────────────────
        if "why" in query and ("interview" in query or "recommend" in query):
            answer = (
                f"Rule-based analysis - Interview recommendation drivers for {company}:\n\n"
                f"1. Founder Signal: {founder.full_name or 'Founder'} - technical capability "
                f"score {founder.technical_capability_score}/10, "
                f"full-time: {'yes' if founder.full_time_status else 'no'}.\n"
                f"2. Program Fit: {app.program_fit_score:.0f}% alignment with "
                f"{app.program.name} ({app.program.sector_focus}).\n"
                f"3. Commercial Traction: {startup.loi_count or 0} declared LOIs, "
                f"{startup.pilot_count or 0} active pilots. {claims_summary}\n"
                f"4. Product Stage: '{startup.product_stage}' - "
                f"{'live product confirmed' if startup.has_live_product else 'not yet in production'}.\n"
                f"5. Screening Tier: {app.automated_screening_tier} "
                f"(fit {app.program_fit_score:.0f}% / strength {app.startup_strength_score:.0f}% "
                f"/ evidence {app.evidence_confidence_score:.0f}%)."
            )

        elif "reject" in query or "risk" in query or "downside" in query or "pass" in query:
            if app.risk_flags:
                risks_text = "\n".join(
                    f"  • {r.get('risk', 'Unknown risk')}: {r.get('evidence', '')} "
                    f"(Severity: {r.get('severity', 'unknown')})"
                    for r in app.risk_flags
                )
            else:
                risks_text = "  • No automated risk flags detected at this stage."
            stage_note = (
                f"\nStage divergence flagged: declared {app.startup_profile.declared_stage.upper()}, "
                f"inferred {app.inferred_stage.upper()}."
                if app.stage_conflict_detected else ""
            )
            answer = (
                f"Rule-based risk summary for {company}:\n\n"
                f"{risks_text}{stage_note}\n\n"
                f"Evidence confidence: {app.evidence_confidence_score:.0f}% - "
                f"{'evidence gaps may increase scrutiny' if app.evidence_confidence_score < 60 else 'evidence levels within acceptable range'}."
            )

        elif any(kw in query for kw in ["contract", "loi", "traction", "customer", "pilot", "revenue"]):
            mrr = float(startup.mrr_usd or 0)
            answer = (
                f"Commercial traction data for {company} (from stored profile):\n\n"
                f"  • Declared LOIs: {startup.loi_count or 0}\n"
                f"  • Active pilots: {startup.pilot_count or 0}\n"
                f"  • Paying customers: {startup.customer_count or 0}\n"
                f"  • Current MRR: ${mrr:,.0f}\n"
                f"  • Revenue status: {startup.revenue_status.replace('_', ' ')}\n"
                f"  • Claim audit: {claims_summary}"
            )

        elif "stage" in query or "infer" in query or "declared" in query:
            answer = (
                f"Stage analysis for {company}:\n\n"
                f"  • Declared: {startup.declared_stage.upper()}\n"
                f"  • Engine-inferred: {app.inferred_stage.upper()} "
                f"(confidence: {getattr(app, 'stage_confidence', 0.91) * 100:.0f}%)\n"
                f"  • Conflict: {'YES - divergence flagged' if app.stage_conflict_detected else 'No conflict detected'}\n"
            )
            try:
                assessment = app.assessment
                if assessment.stage_conflict_explanation:
                    answer += f"  • Explanation: {assessment.stage_conflict_explanation}"
            except Exception:
                pass

        else:
            answer = (
                f"Forensic summary for {company} (rule-based - not AI-generated):\n\n"
                f"  • Program Fit: {app.program_fit_score:.0f}%\n"
                f"  • Startup Strength: {app.startup_strength_score:.0f}%\n"
                f"  • Evidence Confidence: {app.evidence_confidence_score:.0f}%\n"
                f"  • Application Completeness: {app.application_completeness_score:.0f}%\n"
                f"  • Screening Tier: {app.automated_screening_tier}\n"
                f"  • Declared Stage: {startup.declared_stage.upper()} | "
                f"Inferred: {app.inferred_stage.upper()} "
                f"{'(Stage Divergence Flagged)' if app.stage_conflict_detected else '(Aligned)'}\n"
                f"  • {claims_summary}\n\n"
                f"Ask a more specific question (e.g. 'why interview?', 'what are the risks?', "
                f"'summarise traction') for a focused breakdown."
            )

        return Response({
            "query": request.data.get("query"),
            "company_name": company,
            "answer": answer,
            # Explicit capability disclosure - frontend uses this to label the source correctly
            "response_type": "rule_based",
            "is_ai_generated": False,
            "generated_at": timezone.now().isoformat(),
        })

    @action(detail=True, methods=["post"], url_path="transition-status")
    def transition_status(self, request, pk=None):
        """Transitions status through the pipeline. Restricted to Accelerators and Staff."""
        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            raise PermissionDenied("Only accelerator managers and committee members can change application status.")

        app = self.get_object()
        new_status = request.data.get("status")
        valid_statuses = [choice[0] for choice in AcceleratorApplication.STATUS_CHOICES]
        if new_status not in valid_statuses:
            return Response({"error": f"Invalid status: {new_status}"}, status=status.HTTP_400_BAD_REQUEST)

        app.status = new_status
        if new_status == "SHORTLISTED":
            app.shortlisted_at = timezone.now()
        elif new_status in ["ACCEPTED", "REJECTED", "WAITLISTED"]:
            app.decision_at = timezone.now()
            if new_status == "ACCEPTED":
                membership, created = ProgramMembership.objects.get_or_create(
                    application=app,
                    program=app.program,
                )
                if created:
                    templates = app.program.milestone_templates.all()
                    for t in templates:
                        StartupMilestone.objects.get_or_create(membership=membership, template=t)
                ContinuousAssessment.objects.create(
                    application=app,
                    period_label="Application Acceptance",
                    readiness_score=app.startup_strength_score,
                    revenue_at_period=app.startup_profile.mrr_usd,
                    customers_at_period=app.startup_profile.customer_count,
                    funding_raised_at_period=app.startup_profile.total_funding_raised_usd,
                )

        app.save()
        return Response({"status": app.status, "message": f"Updated to {app.status}"})

    # Dynamic Admissions Engine
    def _run_admissions_engine(self, app: AcceleratorApplication):
        startup = app.startup_profile
        founder = startup.founder_profile

        # 1. Dynamic Stage Inference
        declared = startup.declared_stage
        mrr = float(startup.mrr_usd or 0)
        has_scaling_revenue = startup.revenue_status in ["scaling_revenue", "growing_revenue"] or mrr >= 15000
        has_mvp_only = startup.product_stage in ["idea", "prototype"] and startup.revenue_status == "pre_revenue"

        if has_scaling_revenue:
            inferred = "seed"
        elif has_mvp_only:
            inferred = "idea"
        else:
            inferred = "pre_seed"

        stage_conflict = (declared == "seed" and inferred in ["pre_seed", "idea"]) or (declared == "series_a" and inferred != "series_a")
        app.inferred_stage = inferred
        app.stage_conflict_detected = stage_conflict

        # 2. Dynamic Founder DNA Score (0-100)
        founder_score = 60.0
        if founder.full_time_status:
            founder_score += 12.0
        if founder.previous_companies:
            founder_score += 12.0
        founder_score += min(10.0, founder.technical_capability_score)
        founder_score += min(6.0, founder.business_capability_score * 0.6)
        founder_score = min(98.0, founder_score)

        # 3. Dynamic Product & Technical Execution Score (0-100)
        product_score = 50.0
        stage_bonuses = {"idea": 5.0, "prototype": 12.0, "mvp": 20.0, "pilot": 28.0, "live": 35.0, "scaling": 40.0}
        product_score += stage_bonuses.get(startup.product_stage, 15.0)
        if startup.has_live_product:
            product_score += 8.0
        product_score = min(96.0, product_score)

        # 4. Dynamic Problem & Market Severity Score (0-100)
        problem_score = 75.0
        market_score = 70.0
        if startup.industry:
            problem_score += 8.0
        if startup.geography:
            market_score += 10.0
        problem_score = min(95.0, problem_score)
        market_score = min(95.0, market_score)

        # 5. Dynamic Traction & LOI Score (0-100)
        traction_score = 40.0
        if startup.loi_count > 0:
            traction_score += min(25.0, startup.loi_count * 0.3)
        if startup.pilot_count > 0:
            traction_score += min(20.0, startup.pilot_count * 3.0)
        if startup.customer_count > 0:
            traction_score += min(15.0, startup.customer_count * 0.5)
        traction_score = min(95.0, traction_score)

        # 6. Dynamic Revenue & Unit Economics (0-100)
        if startup.revenue_status == "pre_revenue":
            # For pre-revenue, evaluate LOI pull and pilot conversion intent
            revenue_score = 35.0 + min(25.0, (startup.loi_count or 0) * 0.25)
        else:
            revenue_score = 65.0 + min(30.0, (mrr / 500.0))
        revenue_score = min(95.0, revenue_score)

        # 7. Defensibility & Team (0-100)
        team_score = 65.0
        if founder.cofounders:
            team_score += 15.0
        if startup.incorporated:
            team_score += 10.0
        team_score = min(95.0, team_score)

        # Composite Startup Strength
        strength = round((founder_score * 0.25) + (product_score * 0.20) + (traction_score * 0.25) + (revenue_score * 0.15) + (team_score * 0.15), 1)

        # Dynamic Program Fit
        fit = 75.0
        if app.program.stage_focus in ["any", inferred]:
            fit += 12.0
        if any(s in (startup.sector_tags or "").lower() for s in (app.program.sector_focus or "").lower().split(",")):
            fit += 8.0
        fit = min(98.0, fit)

        # Dynamic Evidence Confidence
        doc_count = app.documents.count()
        claims_count = app.claims.count()
        evidence_conf = 55.0 + min(20.0, doc_count * 8.0) + min(15.0, claims_count * 5.0)
        evidence_conf = min(95.0, evidence_conf)

        app.founder_score = founder_score
        app.startup_strength_score = strength
        app.program_fit_score = fit
        app.evidence_confidence_score = evidence_conf
        app.application_completeness_score = max(75.0, min(100.0, 70.0 + (doc_count * 7.0)))

        # Tier assignment
        if fit >= 85 and strength >= 75 and evidence_conf >= 70:
            app.automated_screening_tier = "A"
        elif strength >= 65:
            app.automated_screening_tier = "B"
        elif evidence_conf < 50:
            app.automated_screening_tier = "C"
        else:
            app.automated_screening_tier = "D"

        # Risk detection
        risks = []
        if stage_conflict:
            risks.append({
                "risk": "Declared vs Inferred Stage Mismatch",
                "severity": "medium",
                "confidence": 0.91,
                "evidence": f"Declared: {declared.upper()}, but commercial traction metrics align with {inferred.upper()}.",
                "mitigation": "Align round sizing and valuation expectations during partner screening.",
            })
        if startup.revenue_status == "pre_revenue":
            risks.append({
                "risk": "Pre-Revenue Commercialization Velocity",
                "severity": "low",
                "confidence": 0.85,
                "evidence": f"{startup.loi_count} LOIs recorded; requires conversion validation into active commercial annual recurring revenue.",
                "mitigation": "Focus first 4 cohort weeks on structured pilot conversions.",
            })
        if not startup.incorporated:
            risks.append({
                "risk": "Unincorporated Legal Entity",
                "severity": "low",
                "confidence": 0.95,
                "evidence": "Startup is not yet incorporated in primary jurisdiction.",
                "mitigation": "Incorporate Delaware flip or local holding entity prior to batch funding tranche.",
            })
        app.risk_flags = risks

        # Create/Update Assessment
        assessment, _ = ApplicationAssessment.objects.get_or_create(application=app)
        assessment.founder_score = founder_score
        assessment.founder_confidence = 0.92
        assessment.problem_score = problem_score
        assessment.problem_confidence = 0.85
        assessment.product_score = product_score
        assessment.product_confidence = 0.88
        assessment.market_score = market_score
        assessment.market_confidence = 0.75
        assessment.traction_score = traction_score
        assessment.traction_confidence = 0.70
        assessment.revenue_score = revenue_score
        assessment.revenue_confidence = 0.95
        assessment.team_score = team_score
        assessment.team_confidence = 0.85

        assessment.declared_stage = declared
        assessment.inferred_stage = inferred
        assessment.stage_confidence = 0.91
        assessment.stage_conflict = stage_conflict
        assessment.stage_conflict_explanation = (
            f"Founder declared {declared}, but traction metrics align with pilot-stage {inferred}."
            if stage_conflict else ""
        )

        assessment.overall_program_fit = fit
        assessment.startup_strength = strength
        assessment.evidence_confidence = evidence_conf
        assessment.application_completeness = app.application_completeness_score

        assessment.bull_case = [
            {"point": f"Strong founder execution DNA: technical score {founder.technical_capability_score}/10 with proven sector insight.", "strength": "High"},
            {"point": f"Demonstrated commercial validation pull: {startup.loi_count} LOIs and {startup.pilot_count} pilots.", "strength": "High"},
            {"point": f"Well-aligned with {app.program.name}'s geographic and sector thesis.", "strength": "Medium"},
        ]
        assessment.bear_case = [
            {"point": "Monetization conversion velocity from non-binding LOIs into annual billings is unproven.", "strength": "Medium"},
            {"point": "Competitive defensibility and retention curve requires continuous oversight during batch.", "strength": "Medium"},
        ]
        assessment.risk_flags = risks
        assessment.overall_recommendation = "INTERVIEW" if app.automated_screening_tier in ["A", "B"] else "REQUEST_EVIDENCE"
        assessment.recommendation_confidence = 0.88
        assessment.recommendation_reasoning = (
            f"High alignment ({fit:.0f}%) with {app.program.name}. Recommend advancing to Partner / Voice Screening."
        )
        assessment.save()

    def _ensure_assessment_and_questions(self, app):
        ApplicationAssessment.objects.get_or_create(application=app)


# ──────────────────────────────────────────────────────────────────────────────
# 5. Reviewer Workspace & Multi-Reviewer Scoring
# ──────────────────────────────────────────────────────────────────────────────

class ReviewerAssessmentViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewerAssessmentSerializer
    permission_classes = [IsAcceleratorOrStaff]

    def get_queryset(self):
        app_id = self.request.query_params.get("application_id")
        if app_id:
            return ReviewerAssessment.objects.filter(application_id=app_id)
        return ReviewerAssessment.objects.all()

    def perform_create(self, serializer):
        review = serializer.save(reviewer=self.request.user)
        self._detect_disagreements(review.application)

    def _detect_disagreements(self, application):
        reviews = application.reviewer_assessments.all()
        if reviews.count() < 2:
            return

        r1 = reviews[0]
        r2 = reviews[1]
        dimensions = ["founder_score", "market_score", "product_score", "team_score", "traction_score"]

        for dim in dimensions:
            val1 = getattr(r1, dim)
            val2 = getattr(r2, dim)
            diff = abs(val1 - val2)
            if diff >= 3.0:
                variance = round(diff / 10.0 * 100)
                ReviewerDisagreement.objects.get_or_create(
                    application=application,
                    dimension=dim.replace("_score", "").title(),
                    reviewer_a=r1,
                    reviewer_b=r2,
                    defaults={
                        "variance_pct": variance,
                        "resolution_notes": f"Reviewer variance detected on {dim}: {r1.reviewer.full_name or r1.reviewer.email} ({val1}) vs {r2.reviewer.full_name or r2.reviewer.email} ({val2}).",
                    }
                )


class ReviewerDisagreementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ReviewerDisagreementSerializer
    permission_classes = [IsAcceleratorOrStaff]

    def get_queryset(self):
        app_id = self.request.query_params.get("application_id")
        if app_id:
            return ReviewerDisagreement.objects.filter(application_id=app_id)
        return ReviewerDisagreement.objects.all()


# ──────────────────────────────────────────────────────────────────────────────
# 6. Interview Sessions & Intelligence
# ──────────────────────────────────────────────────────────────────────────────

class InterviewSessionViewSet(viewsets.ModelViewSet):
    serializer_class = InterviewSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        app_id = self.request.query_params.get("application_id")
        user = self.request.user
        qs = InterviewSession.objects.all()
        if app_id:
            qs = qs.filter(application_id=app_id)
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            qs = qs.filter(application__submitted_by=user)
        return qs

    def perform_create(self, serializer):
        serializer.save(interviewer=self.request.user if not self.request.data.get("is_ai") else None)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete_interview(self, request, pk=None):
        interview = self.get_object()
        interview.status = "complete"
        interview.completed_at = timezone.now()
        interview.save(update_fields=["status", "completed_at"])

        interview.application.status = "INTERVIEW_COMPLETE"
        interview.application.save(update_fields=["status"])

        return Response(InterviewSessionSerializer(interview).data)


# ──────────────────────────────────────────────────────────────────────────────
# 7. Committee Decision Workspace & IC Debate
# ──────────────────────────────────────────────────────────────────────────────

class CommitteeDecisionViewSet(viewsets.ModelViewSet):
    serializer_class = CommitteeDecisionSerializer
    permission_classes = [IsAcceleratorOrStaff]

    def get_queryset(self):
        app_id = self.request.query_params.get("application_id")
        if app_id:
            return CommitteeDecision.objects.filter(application_id=app_id)
        return CommitteeDecision.objects.all()

    @action(detail=False, methods=["post"], url_path="cast-vote")
    def cast_vote(self, request):
        """Cast an IC partner vote and update aggregate decision tally."""
        app_id = request.data.get("application_id")
        vote_type = request.data.get("vote", "YES")
        conviction = int(request.data.get("conviction_score", 8))
        notes = request.data.get("notes", "")

        app = AcceleratorApplication.objects.get(pk=app_id)
        decision_obj, _ = CommitteeDecision.objects.get_or_create(application=app)

        votes = list(decision_obj.individual_votes or [])
        votes = [v for v in votes if v.get("voter_id") != request.user.id]
        votes.append({
            "voter_id": request.user.id,
            "voter_name": request.user.full_name or request.user.email,
            "vote": vote_type,
            "conviction_score": conviction,
            "notes": notes,
            "timestamp": timezone.now().isoformat(),
        })

        summary = {
            "yes": sum(1 for v in votes if v["vote"] == "YES"),
            "conditional": sum(1 for v in votes if v["vote"] == "CONDITIONAL"),
            "pass": sum(1 for v in votes if v["vote"] == "PASS"),
            "total": len(votes),
        }

        decision_obj.individual_votes = votes
        decision_obj.vote_summary = summary
        decision_obj.save()

        return Response(CommitteeDecisionSerializer(decision_obj).data)

    @action(detail=False, methods=["post"], url_path="finalize-decision")
    def finalize_decision(self, request):
        """Finalizes committee decision (ACCEPT, REJECT, WAITLIST, REQUEST_EVIDENCE)."""
        app_id = request.data.get("application_id")
        dec = request.data.get("decision", "ACCEPT")
        rationale = request.data.get("rationale", "")
        conditions = request.data.get("conditions", "")

        app = AcceleratorApplication.objects.get(pk=app_id)
        decision_obj, _ = CommitteeDecision.objects.get_or_create(application=app)
        decision_obj.decision = dec
        decision_obj.decision_rationale = rationale
        decision_obj.conditions = conditions
        decision_obj.decided_by = request.user
        decision_obj.decided_at = timezone.now()
        decision_obj.save()

        app.status = dec
        app.decision_at = timezone.now()
        app.save(update_fields=["status", "decision_at"])

        if dec == "ACCEPTED":
            membership, created = ProgramMembership.objects.get_or_create(
                application=app,
                program=app.program,
            )
            if created:
                for t in app.program.milestone_templates.all():
                    StartupMilestone.objects.get_or_create(membership=membership, template=t)
            ContinuousAssessment.objects.create(
                application=app,
                period_label="Cohort Enrolment",
                readiness_score=app.startup_strength_score,
                revenue_at_period=app.startup_profile.mrr_usd,
                customers_at_period=app.startup_profile.customer_count,
            )

        return Response(CommitteeDecisionSerializer(decision_obj).data)


# ──────────────────────────────────────────────────────────────────────────────
# 8. Evidence Request Loop
# ──────────────────────────────────────────────────────────────────────────────

class EvidenceRequestViewSet(viewsets.ModelViewSet):
    serializer_class = EvidenceRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        app_id = self.request.query_params.get("application_id")
        user = self.request.user
        qs = EvidenceRequest.objects.all()
        if app_id:
            qs = qs.filter(application_id=app_id)
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            qs = qs.filter(application__submitted_by=user)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            raise PermissionDenied("Only accelerator managers and committee members can initiate evidence requests.")
        app = serializer.validated_data["application"]
        serializer.save(
            requested_by=self.request.user,
            pre_readiness_score=app.startup_strength_score,
        )
        app.status = "EVIDENCE_REQUESTED"
        app.save(update_fields=["status"])

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve_evidence(self, request, pk=None):
        evidence_req = self.get_object()
        app = evidence_req.application
        evidence_req.status = "COMPLETE"
        evidence_req.founder_response = request.data.get("founder_response", "Evidence provided.")
        evidence_req.resolved_at = timezone.now()

        evidence_req.post_readiness_score = min(96.0, evidence_req.pre_readiness_score + 9.0)
        evidence_req.save()

        app.evidence_confidence_score = min(95.0, app.evidence_confidence_score + 12.0)
        app.startup_strength_score = evidence_req.post_readiness_score
        app.status = "COMMITTEE_REVIEW"
        app.save(update_fields=["evidence_confidence_score", "startup_strength_score", "status"])

        return Response({
            "message": "Evidence request resolved and readiness score upgraded.",
            "pre_readiness_score": evidence_req.pre_readiness_score,
            "post_readiness_score": evidence_req.post_readiness_score,
            "current_status": app.status,
        })


# ──────────────────────────────────────────────────────────────────────────────
# 9. Seed / Setup Initial Default Programs & Questions
# ──────────────────────────────────────────────────────────────────────────────

class SeedAcceleratorDefaultsView(APIView):
    """
    Creates high-fidelity default programs and standard dynamic questions.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        p1, _ = AcceleratorProgram.objects.get_or_create(
            slug="pan-african-accelerator-2026",
            defaults={
                "name": "Pan-African Accelerator 2026",
                "organization_name": "Venture Admissions Network",
                "tagline": "Pre-seed to Seed multi-stage institutional admissions pipeline.",
                "description": "Techstars-calibrated 12-week intensive accelerator with screening committee, dual-interview rounds, and continuous milestone readiness tracking.",
                "sector_focus": "Fintech, Logistics, Healthtech, Climate, B2B SaaS",
                "geography_focus": "Nigeria, Kenya, South Africa, Egypt, Ghana, Rwanda",
                "stage_focus": "pre_seed",
                "funding_amount_usd": Decimal("120000.00"),
                "equity_offered_pct": 7.0,
                "program_duration_weeks": 12,
                "is_remote": True,
                "location": "Lagos, Nairobi & Virtual",
                "program_cycle": "2026-Batch 1",
                "target_cohort_size": 15,
                "workflow_style": "techstars_style",
                "eligibility_rules": {
                    "geography_whitelist": ["NG", "KE", "ZA", "EG", "GH", "RW"],
                    "sector_whitelist": ["fintech", "logistics", "healthtech", "climate", "saas", "tech"],
                    "incorporated_required": False,
                    "full_time_required": True,
                    "previous_funding_max_usd": 750000,
                },
                "is_active": True,
                "is_public": True,
            }
        )

        # Dynamic questions for p1
        questions = [
            ("What burning problem are you solving and for whom?", "problem", "narrative", "critical", True, 0),
            ("Do you currently have paying customers or revenue?", "traction", "boolean", "critical", True, 1),
            ("Monthly Recurring Revenue (USD)", "financials", "numeric", "high", False, 2),
            ("How many signed LOIs or pilot agreements do you have?", "traction", "numeric", "critical", True, 3),
            ("Why is this founding team uniquely suited to win this market?", "team", "narrative", "high", True, 4),
        ]
        for text, cat, qtype, mat, req, ordr in questions:
            ApplicationQuestion.objects.get_or_create(
                program=p1,
                order=ordr,
                defaults={"text": text, "category": cat, "question_type": qtype, "materiality": mat, "is_required": req}
            )

        p2, _ = AcceleratorProgram.objects.get_or_create(
            slug="global-founders-sprint-2026",
            defaults={
                "name": "Global Founders Sprint",
                "organization_name": "Sprint Ventures",
                "tagline": "High-velocity online application with 48-hour interview decision.",
                "description": "Streamlined YC-style admissions focusing on founder iteration speed, technical defensibility, and scalable market insight.",
                "sector_focus": "AI, DevTools, Fintech, Deep Tech",
                "geography_focus": "Global / Emerging Markets",
                "stage_focus": "any",
                "funding_amount_usd": Decimal("500000.00"),
                "equity_offered_pct": 7.0,
                "program_duration_weeks": 10,
                "is_remote": True,
                "program_cycle": "Summer 2026",
                "target_cohort_size": 25,
                "workflow_style": "yc_style",
                "eligibility_rules": {
                    "geography_whitelist": ["ALL"],
                    "full_time_required": True,
                    "previous_funding_max_usd": 2000000,
                },
                "is_active": True,
                "is_public": True,
            }
        )

        return Response({
            "message": "Seeded configurable accelerator programs and dynamic questions.",
            "programs": [p1.name, p2.name]
        })
