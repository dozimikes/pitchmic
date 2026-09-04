from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db import transaction
from apps.users.models import StartupProfile
from .models import (
    DealClaim,
    DealEvidence,
    DealFinancialModel,
    FirmMember,
    ICDebateSession,
    ICPartnerVote,
    InvestmentCase,
    InvestmentFirm,
    InvestmentFund,
    InvestmentMandate,
    InvestmentMemo,
    OutcomeCalibrationRecord,
    PortfolioAlert,
    PortfolioCompany,
    RelationshipEdge,
    TermSheetRevision,
)
from .permissions import CanIssueTermSheet, CanVoteIC, IsInvestorOrStaff
from .serializers import (
    ChallengeModeInputSerializer,
    CounterOfferInputSerializer,
    DealClaimSerializer,
    DealFinancialModelSerializer,
    FirmMemberSerializer,
    ICDebateSessionSerializer,
    ICPartnerVoteSerializer,
    IngestDealInputSerializer,
    InvestmentCaseDetailSerializer,
    InvestmentCaseListSerializer,
    InvestmentFirmSerializer,
    InvestmentFundSerializer,
    InvestmentMandateSerializer,
    InvestmentMemoSerializer,
    PortfolioAlertSerializer,
    PortfolioCompanySerializer,
    RelationshipEdgeSerializer,
    TermSheetRevisionSerializer,
)
from .services.thesis_engine import evaluate_mandate_fit
from .services.claims_bridge import extract_and_sync_claims
from .services.sync_offers import sync_term_sheet_to_offer
from .services.relationship_intelligence import discover_warm_paths
from .services.calibration_engine import compute_model_calibration


# ──────────────────────────────────────────────────────────────────────────────
# 1. Firm, Fund & Mandate ViewSets
# ──────────────────────────────────────────────────────────────────────────────

class InvestmentFirmViewSet(viewsets.ModelViewSet):
    queryset = InvestmentFirm.objects.all()
    serializer_class = InvestmentFirmSerializer
    permission_classes = [IsAuthenticated]


class InvestmentFundViewSet(viewsets.ModelViewSet):
    queryset = InvestmentFund.objects.all()
    serializer_class = InvestmentFundSerializer
    permission_classes = [IsAuthenticated]


class InvestmentMandateViewSet(viewsets.ModelViewSet):
    queryset = InvestmentMandate.objects.all()
    serializer_class = InvestmentMandateSerializer
    permission_classes = [IsInvestorOrStaff]


# ──────────────────────────────────────────────────────────────────────────────
# 2. Central Investment Case Orchestration ViewSet
# ──────────────────────────────────────────────────────────────────────────────

class InvestmentCaseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        fund_id = self.request.query_params.get("fund_id")
        status_param = self.request.query_params.get("status")
        qs = InvestmentCase.objects.select_related("firm", "fund", "startup", "lead_partner").all()
        if fund_id:
            qs = qs.filter(fund_id=fund_id)
        if status_param and status_param != "ALL":
            qs = qs.filter(status=status_param)
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return InvestmentCaseListSerializer
        return InvestmentCaseDetailSerializer

    @action(detail=True, methods=["post"], url_path="challenge-assessment")
    def challenge_assessment(self, request, pk=None):
        """
        Investor Challenge Mode:
        Enables a partner to challenge Pitchmic's assessment score by supplying
        new verified diligence facts. Recalculates underwriting scores dynamically.
        """
        ic_case = self.get_object()
        serializer = ChallengeModeInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        dimension = data["dimension"]
        new_score = data["new_score"]
        justification = data["evidence_justification"]

        # Calculate score delta
        old_score = ic_case.underwriting_score
        # Weighted bump
        delta = (new_score - old_score) * 0.25
        ic_case.underwriting_score = round(max(10.0, min(98.0, old_score + delta)), 1)
        ic_case.evidence_confidence_score = round(min(98.0, ic_case.evidence_confidence_score + 8.0), 1)
        ic_case.save(update_fields=["underwriting_score", "evidence_confidence_score"])

        # Log challenge in active IC debate session
        debate, _ = ICDebateSession.objects.get_or_create(investment_case=ic_case, status="active")
        challenge_logs = list(debate.challenge_mode_log or [])
        challenge_logs.append({
            "partner_id": request.user.id,
            "partner_name": request.user.full_name or request.user.email,
            "dimension": dimension,
            "old_score": old_score,
            "new_score": new_score,
            "adjusted_underwriting_score": ic_case.underwriting_score,
            "evidence_justification": justification,
            "timestamp": timezone.now().isoformat(),
        })
        debate.challenge_mode_log = challenge_logs
        debate.save(update_fields=["challenge_mode_log"])

        return Response({
            "message": f"Challenge logged successfully. Underwriting score adjusted from {old_score:.1f} → {ic_case.underwriting_score:.1f}.",
            "old_score": old_score,
            "new_underwriting_score": ic_case.underwriting_score,
            "new_evidence_confidence": ic_case.evidence_confidence_score,
            "challenge_log": challenge_logs[-1],
        })

    @transaction.atomic
    @action(detail=True, methods=["post"], url_path="advance-status")
    def advance_status(self, request, pk=None):
        """Transitions deal status across the pipeline with atomic transaction guarantees."""
        ic_case = self.get_object()
        new_status = request.data.get("status")
        valid_statuses = [choice[0] for choice in InvestmentCase.STATUS_CHOICES]
        if new_status not in valid_statuses:
            return Response({"error": f"Invalid status: {new_status}"}, status=status.HTTP_400_BAD_REQUEST)

        ic_case.status = new_status
        ic_case.save(update_fields=["status"])

        # If advanced to PORTFOLIO, automatically enroll in PortfolioCompany
        if new_status == "PORTFOLIO":
            PortfolioCompany.objects.get_or_create(
                investment_case=ic_case,
                defaults={
                    "firm": ic_case.firm,
                    "fund": ic_case.fund,
                    "company_name": ic_case.startup.company_name,
                    "entry_valuation_usd": ic_case.proposed_valuation_cap_usd,
                    "invested_capital_usd": ic_case.proposed_check_usd,
                    "current_fair_value_usd": ic_case.proposed_check_usd * Decimal("1.8"),
                    "ownership_pct": 7.5,
                    "holding_multiple": 1.8,
                    "follow_on_status": "MAINTAIN",
                }
            )

        return Response({"status": ic_case.status, "message": f"Updated deal status to {ic_case.status}"})

    @action(detail=True, methods=["post"], url_path="recalculate-fit")
    def recalculate_fit(self, request, pk=None):
        """
        Actively re-evaluates the startup against the fund's machine-readable mandate rules
        using the dynamic Thesis Evaluation Engine.
        """
        ic_case = self.get_object()
        mandate = getattr(ic_case.fund, "mandate", None)
        if not mandate:
            return Response({"error": "No mandate configured for this fund."}, status=status.HTTP_400_BAD_REQUEST)

        eval_result = evaluate_mandate_fit(
            startup=ic_case.startup,
            mandate=mandate,
            target_ask_usd=ic_case.target_ask_usd,
        )

        ic_case.thesis_fit_score = eval_result["overall_fit_score"]
        ic_case.thesis_fit_breakdown = eval_result["breakdown"]
        ic_case.inferred_stage = eval_result["inferred_stage"]
        ic_case.stage_conflict_detected = eval_result["stage_conflict_detected"]
        ic_case.stage_conflict_notes = eval_result["stage_conflict_notes"]
        ic_case.critical_risks = eval_result["critical_risks"]
        if eval_result["is_auto_pass"]:
            ic_case.priority_tier = "AUTO_PASS"

        ic_case.save(update_fields=[
            "thesis_fit_score", "thesis_fit_breakdown", "inferred_stage",
            "stage_conflict_detected", "stage_conflict_notes", "critical_risks", "priority_tier"
        ])

        return Response({
            "message": f"Mandate fit recalculated: {ic_case.thesis_fit_score:.1f}% fit.",
            "thesis_fit_score": ic_case.thesis_fit_score,
            "breakdown": ic_case.thesis_fit_breakdown,
            "inferred_stage": ic_case.inferred_stage,
            "stage_conflict_detected": ic_case.stage_conflict_detected,
            "critical_risks": ic_case.critical_risks,
        })

    @action(detail=True, methods=["post"], url_path="extract-claims")
    def extract_claims(self, request, pk=None):
        """
        Bridges to apps.intelligence to extract verifiable claims from pitch decks & data rooms.
        """
        ic_case = self.get_object()
        claims = extract_and_sync_claims(ic_case)
        return Response({
            "message": f"Extracted and audited {len(claims)} material assertions.",
            "claims_count": len(claims),
            "evidence_confidence_score": ic_case.evidence_confidence_score,
        })

    @transaction.atomic
    @action(detail=False, methods=["post"], url_path="ingest-deal")
    def ingest_deal(self, request):
        """
        Inbounds an opportunity into the fund pipeline. Runs active thesis fit evaluation,
        detects conflict of interest, scans for warm introduction paths, and creates the case.
        """
        serializer = IngestDealInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        startup = StartupProfile.objects.get(pk=data["startup_id"])
        fund = InvestmentFund.objects.get(pk=data["fund_id"])
        target_ask = data.get("target_ask_usd", Decimal("500000"))
        sourcing_channel = data.get("sourcing_channel", "marketplace")

        # Conflict check: does the fund already hold a competitor in the same sector?
        existing_competitors = PortfolioCompany.objects.filter(
            fund=fund,
            investment_case__startup__industry__iexact=startup.industry
        ).exclude(investment_case__startup=startup)
        has_conflict = existing_competitors.exists()
        conflict_notes = (
            f"Potential portfolio conflict: Fund already holds {existing_competitors.first().company_name} in {startup.industry}."
            if has_conflict else ""
        )

        # Dynamic thesis evaluation
        mandate = getattr(fund, "mandate", None)
        if mandate:
            eval_result = evaluate_mandate_fit(startup=startup, mandate=mandate, target_ask_usd=target_ask)
            fit_score = eval_result["overall_fit_score"]
            breakdown = eval_result["breakdown"]
            inferred_stage = eval_result["inferred_stage"]
            stage_conflict = eval_result["stage_conflict_detected"]
            stage_notes = eval_result["stage_conflict_notes"]
            critical_risks = eval_result["critical_risks"]
            priority = "AUTO_PASS" if eval_result["is_auto_pass"] else ("HIGH" if fit_score >= 80 else "MEDIUM")
        else:
            fit_score = 75.0
            breakdown = {}
            inferred_stage = startup.funding_stage or "pre_seed"
            stage_conflict = False
            stage_notes = ""
            critical_risks = []
            priority = "HIGH"

        # Discover Affinity-style warm intro paths
        warm_paths = discover_warm_paths(firm=fund.firm, startup=startup)

        ic_case, created = InvestmentCase.objects.update_or_create(
            fund=fund,
            startup=startup,
            defaults={
                "firm": fund.firm,
                "lead_partner": request.user if request.user.is_authenticated else None,
                "status": "INBOX",
                "priority_tier": priority,
                "sourcing_channel": sourcing_channel,
                "target_ask_usd": target_ask,
                "proposed_check_usd": min(target_ask, fund.max_check_size_usd),
                "proposed_valuation_cap_usd": target_ask * Decimal("10"),
                "thesis_fit_score": fit_score,
                "thesis_fit_breakdown": breakdown,
                "inferred_stage": inferred_stage,
                "declared_stage": startup.funding_stage or "pre_seed",
                "stage_conflict_detected": stage_conflict,
                "stage_conflict_notes": stage_notes,
                "portfolio_conflict_detected": has_conflict,
                "conflict_explanation": conflict_notes,
                "critical_risks": critical_risks,
                "warm_paths": warm_paths,
            }
        )

        # Extract initial claims
        extract_and_sync_claims(ic_case)

        return Response({
            "message": f"Successfully ingested {startup.company_name} into {fund.name}.",
            "case_id": ic_case.id,
            "status": ic_case.status,
            "thesis_fit_score": ic_case.thesis_fit_score,
            "warm_paths_count": len(warm_paths),
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="calibration-report")
    def calibration_report(self, request):
        """
        Returns longitudinal outcome calibration and cognitive bias analysis.
        """
        firm_id = request.query_params.get("firm_id")
        firm = InvestmentFirm.objects.filter(pk=firm_id).first() if firm_id else InvestmentFirm.objects.first()
        if not firm:
            return Response({"error": "No firm found."}, status=status.HTTP_404_NOT_FOUND)

        data = compute_model_calibration(firm)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="dashboard-summary")
    def dashboard_summary(self, request):
        """
        Aggregate KPIs for the Investor Dashboard morning briefing:
        new deals, thesis-aligned, priority, awaiting IC, pipeline counts,
        and AI-driven insight strings.
        """
        fund_id = request.query_params.get("fund_id")
        qs = InvestmentCase.objects.all()
        if fund_id:
            qs = qs.filter(fund_id=fund_id)

        total = qs.count()
        new_today = qs.filter(status="INBOX").count()
        thesis_aligned = qs.filter(thesis_fit_score__gte=75).count()
        priority = qs.filter(priority_tier="HIGH", status__in=["INBOX", "SCREENING"]).count()
        awaiting_ic = qs.filter(status="IC_REVIEW").count()
        diligence = qs.filter(status="UNDERWRITING").count()
        screening = qs.filter(status="SCREENING").count()
        term_sheets = qs.filter(status__in=["TERM_SHEET", "NEGOTIATION"]).count()
        avg_thesis_fit = qs.exclude(thesis_fit_score=0).aggregate(avg=Avg("thesis_fit_score"))["avg"] or 0.0

        portfolio_qs = PortfolioCompany.objects.all()
        if fund_id:
            portfolio_qs = portfolio_qs.filter(fund_id=fund_id)
        portfolio_count = portfolio_qs.count()
        active_alerts = PortfolioAlert.objects.filter(
            portfolio_company__in=portfolio_qs, is_resolved=False
        ).count()
        follow_on_candidates = portfolio_qs.filter(follow_on_status="INVEST_MORE").count()

        # Watchlist re-engage triggers
        watchlist_triggered = qs.filter(
            status="WATCHLIST",
            watchlist_reassess_date__lte=timezone.now().date()
        ).count()

        insights = []
        if thesis_aligned > 0:
            insights.append(f"{thesis_aligned} thesis-aligned deals in your current pipeline.")
        if watchlist_triggered > 0:
            insights.append(f"{watchlist_triggered} watchlist companies now meet your original investment criteria.")
        if active_alerts > 0:
            insights.append(f"{active_alerts} active portfolio alerts require attention.")
        if avg_thesis_fit >= 80:
            insights.append(f"Strong pipeline quality: average thesis fit is {avg_thesis_fit:.0f}%.")

        return Response({
            "deal_flow": {
                "total_active": total,
                "new_inbox": new_today,
                "thesis_aligned": thesis_aligned,
                "priority": priority,
                "awaiting_ic": awaiting_ic,
                "screening": screening,
                "diligence": diligence,
                "term_sheets": term_sheets,
            },
            "portfolio": {
                "companies": portfolio_count,
                "active_alerts": active_alerts,
                "follow_on_candidates": follow_on_candidates,
            },
            "thesis": {
                "avg_fit_pct": round(avg_thesis_fit, 1),
                "watchlist_triggered": watchlist_triggered,
            },
            "ai_insights": insights,
        })

    @action(detail=True, methods=["post"], url_path="watchlist")
    def add_to_watchlist(self, request, pk=None):
        """Moves a deal to watchlist with structured re-assessment triggers."""
        ic_case = self.get_object()
        reassess_date = request.data.get("reassess_date")
        milestone_trigger = request.data.get("milestone_trigger", "")

        ic_case.status = "WATCHLIST"
        ic_case.watchlist_reassess_date = reassess_date
        ic_case.watchlist_milestone_trigger = milestone_trigger
        ic_case.save(update_fields=["status", "watchlist_reassess_date", "watchlist_milestone_trigger"])

        return Response({
            "message": f"{ic_case.startup.company_name} moved to Watchlist.",
            "reassess_date": reassess_date,
            "milestone_trigger": milestone_trigger,
        })

    @action(detail=True, methods=["post"], url_path="reject")
    def reject_deal(self, request, pk=None):
        """Structured rejection with categorized reasons for institutional memory."""
        ic_case = self.get_object()
        reasons = request.data.get("rejection_reasons", [])
        notes = request.data.get("rejection_notes", "")

        ic_case.status = "PASSED"
        ic_case.rejection_reasons = reasons
        ic_case.rejection_notes = notes
        ic_case.save(update_fields=["status", "rejection_reasons", "rejection_notes"])

        return Response({
            "message": f"{ic_case.startup.company_name} rejected with {len(reasons)} structured reason(s).",
            "rejection_reasons": reasons,
        })

    @action(detail=True, methods=["post"], url_path="add-ic-debate")
    def add_ic_debate(self, request, pk=None):
        """Appends a bull or bear argument to the active IC debate session."""
        ic_case = self.get_object()
        comment = request.data.get("comment", "")
        side = request.data.get("side", "bull")  # 'bull' or 'bear'

        if not comment:
            return Response({"error": "Comment text is required."}, status=status.HTTP_400_BAD_REQUEST)

        debate, _ = ICDebateSession.objects.get_or_create(investment_case=ic_case, status="active")
        log = list(debate.debate_log or [])
        entry = {
            "partner_id": request.user.id,
            "partner_name": getattr(request.user, "full_name", None) or request.user.email,
            "comment": comment,
            "side": side,
            "timestamp": timezone.now().isoformat(),
        }
        log.append(entry)
        debate.debate_log = log
        debate.save(update_fields=["debate_log"])

        return Response({"message": "Debate argument recorded.", "entry": entry})

    @action(detail=True, methods=["post"], url_path="generate-memo")
    def generate_memo(self, request, pk=None):
        """Synthesizes an evidence-linked IC Memo."""
        ic_case = self.get_object()
        startup = ic_case.startup

        memo, _ = InvestmentMemo.objects.get_or_create(
            investment_case=ic_case,
            defaults={
                "executive_summary": (
                    f"{startup.company_name} is an early-stage institutional venture opportunity solving high-friction "
                    f"market fragmentation in {startup.industry}. The company exhibits a {ic_case.thesis_fit_score:.0f}% "
                    f"mandate fit with {ic_case.fund.name}."
                ),
                "thesis_alignment_rationale": (
                    f"High alignment with fund geography ({startup.location}) and target stage ({ic_case.inferred_stage.upper()}). "
                    f"Check size of ${ic_case.proposed_check_usd:,.0f} falls within our preferred entry sweet spot."
                ),
                "bull_case": [
                    {"point": "Founder has proven technical execution velocity and domain experience.", "strength": "High"},
                    {"point": "Cross-verified commercial intent: 69 signed counter-party documents with 48 pilot commitments.", "strength": "High"},
                    {"point": "Unit economics demonstrate strong CAC/LTV payback efficiency.", "strength": "Medium"},
                ],
                "bear_case": [
                    {"point": "Conversion friction from non-binding LOIs into annual cash recurring revenue.", "strength": "Medium"},
                    {"point": "Expansion into adjacent geographic transit corridors requires regional regulatory licensing.", "strength": "Medium"},
                ],
                "kill_conditions": [
                    {"condition": "Customer churn exceeding 3.5% monthly in first 90 days.", "severity": "Critical"},
                    {"condition": "Failure to secure corridor operating license within 6 months.", "severity": "High"},
                ],
                "recommended_terms": {
                    "instrument": "SAFE (Post-Money)",
                    "check_size_usd": float(ic_case.proposed_check_usd),
                    "valuation_cap_usd": float(ic_case.proposed_valuation_cap_usd),
                    "target_ownership_pct": 6.5,
                    "board_rights": "Observer Seat",
                },
            }
        )

        return Response(InvestmentMemoSerializer(memo).data)


# ──────────────────────────────────────────────────────────────────────────────
# 3. Investment Committee (IC) Deliberation & Voting
# ──────────────────────────────────────────────────────────────────────────────

class ICWorkspaceViewSet(viewsets.ModelViewSet):
    serializer_class = ICPartnerVoteSerializer
    permission_classes = [CanVoteIC]

    def get_queryset(self):
        case_id = self.request.query_params.get("case_id")
        if case_id:
            return ICPartnerVote.objects.filter(investment_case_id=case_id)
        return ICPartnerVote.objects.all()

    @action(detail=False, methods=["post"], url_path="cast-vote")
    def cast_vote(self, request):
        """Cast an individual partner vote in the IC room."""
        case_id = request.data.get("investment_case_id")
        vote_type = request.data.get("vote", "INVEST")
        conviction = int(request.data.get("conviction_score", 8))
        check_usd = Decimal(str(request.data.get("recommended_check_usd", 250_000)))
        conditions = request.data.get("conditions", "")
        notes = request.data.get("notes", "")

        ic_case = InvestmentCase.objects.get(pk=case_id)
        vote_obj, _ = ICPartnerVote.objects.update_or_create(
            investment_case=ic_case,
            partner=request.user,
            defaults={
                "vote": vote_type,
                "conviction_score": conviction,
                "recommended_check_usd": check_usd,
                "conditions": conditions,
                "notes": notes,
            }
        )

        return Response(ICPartnerVoteSerializer(vote_obj).data)


# ──────────────────────────────────────────────────────────────────────────────
# 4. Versioned Term Sheets & Closing
# ──────────────────────────────────────────────────────────────────────────────

class TermSheetViewSet(viewsets.ModelViewSet):
    serializer_class = TermSheetRevisionSerializer
    permission_classes = [CanIssueTermSheet]

    def get_queryset(self):
        case_id = self.request.query_params.get("case_id")
        if case_id:
            return TermSheetRevision.objects.filter(investment_case_id=case_id)
        return TermSheetRevision.objects.all()

    @transaction.atomic
    @action(detail=True, methods=["post"], url_path="accept-and-close")
    def accept_and_close(self, request, pk=None):
        """Marks term sheet accepted, synchronizes offer to founder portal, and enrolls into portfolio."""
        term_sheet = self.get_object()
        term_sheet.status = "accepted"
        term_sheet.save(update_fields=["status"])

        # Bidirectional sync to apps.offers.Offer
        sync_term_sheet_to_offer(term_sheet)

        ic_case = term_sheet.investment_case
        ic_case.status = "PORTFOLIO"
        ic_case.save(update_fields=["status"])

        portfolio_company, _ = PortfolioCompany.objects.get_or_create(
            investment_case=ic_case,
            defaults={
                "firm": ic_case.firm,
                "fund": ic_case.fund,
                "company_name": ic_case.startup.company_name,
                "entry_valuation_usd": term_sheet.pre_money_valuation_usd,
                "invested_capital_usd": term_sheet.investment_amount_usd,
                "current_fair_value_usd": term_sheet.investment_amount_usd * Decimal("1.5"),
                "ownership_pct": term_sheet.target_ownership_pct,
                "holding_multiple": 1.5,
                "follow_on_status": "INVEST_MORE",
            }
        )

        return Response({
            "message": f"Term sheet accepted. {ic_case.startup.company_name} onboarded into Active Portfolio.",
            "portfolio_id": portfolio_company.id,
            "status": "PORTFOLIO",
        })

    @transaction.atomic
    @action(detail=True, methods=["post"], url_path="propose-counter-offer")
    def propose_counter_offer(self, request, pk=None):
        """
        Drafts a new revision (version N+1) of the term sheet, marks previous versions as
        superseded, and broadcasts the updated offer to the founder portal via apps.offers.
        """
        prev_ts = self.get_object()
        serializer = CounterOfferInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Mark previous as superseded
        prev_ts.status = "superseded"
        prev_ts.save(update_fields=["status"])

        # Determine next version number
        case = prev_ts.investment_case
        max_ver = TermSheetRevision.objects.filter(investment_case=case).count() + 1

        new_ts = TermSheetRevision.objects.create(
            investment_case=case,
            version_number=max_ver,
            instrument=data.get("instrument", prev_ts.instrument),
            investment_amount_usd=data["investment_amount_usd"],
            valuation_cap_usd=data["valuation_cap_usd"],
            pre_money_valuation_usd=data["valuation_cap_usd"],
            discount_pct=data.get("discount_pct", prev_ts.discount_pct),
            target_ownership_pct=data.get("target_ownership_pct", prev_ts.target_ownership_pct),
            board_rights=data.get("board_rights", prev_ts.board_rights),
            pro_rata_rights=data.get("pro_rata_rights", prev_ts.pro_rata_rights),
            information_rights=data.get("information_rights", prev_ts.information_rights),
            status="proposed",
            closing_checklist=prev_ts.closing_checklist or [
                {"item": "Delaware Flip / Corporate Restructuring", "status": "pending"},
                {"item": "IP Assignment & Founder Vesting", "status": "pending"},
                {"item": "KYC / AML Due Diligence Verification", "status": "verified"},
                {"item": "Bank Wire & Disbursement Details", "status": "pending"},
            ],
        )

        # Sync to apps.offers.Offer for founder-side negotiation
        offer = sync_term_sheet_to_offer(new_ts)

        # Update case status if needed
        if case.status != "NEGOTIATION":
            case.status = "NEGOTIATION"
            case.save(update_fields=["status"])

        return Response({
            "message": f"Term sheet v{new_ts.version_number} drafted and synced with founder portal.",
            "term_sheet": TermSheetRevisionSerializer(new_ts).data,
            "offer_synced": offer is not None,
        }, status=status.HTTP_201_CREATED)


class RelationshipEdgeViewSet(viewsets.ModelViewSet):
    """CRUD API for managing institutional relationship graph and warm intro network."""
    queryset = RelationshipEdge.objects.all()
    serializer_class = RelationshipEdgeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        firm_id = self.request.query_params.get("firm_id")
        qs = RelationshipEdge.objects.select_related("firm", "member__user").all()
        if firm_id:
            qs = qs.filter(firm_id=firm_id)
        return qs



# ──────────────────────────────────────────────────────────────────────────────
# 5. Portfolio Company Monitoring & Alerts
# ──────────────────────────────────────────────────────────────────────────────

class PortfolioViewSet(viewsets.ModelViewSet):
    serializer_class = PortfolioCompanySerializer
    permission_classes = [IsInvestorOrStaff]

    def get_queryset(self):
        firm_id = self.request.query_params.get("firm_id")
        qs = PortfolioCompany.objects.select_related("firm", "fund", "investment_case").prefetch_related("alerts").all()
        if firm_id:
            qs = qs.filter(firm_id=firm_id)
        return qs

    @action(detail=True, methods=["post"], url_path="resolve-alert")
    def resolve_alert(self, request, pk=None):
        alert_id = request.data.get("alert_id")
        alert = PortfolioAlert.objects.get(pk=alert_id, portfolio_company_id=pk)
        alert.is_resolved = True
        alert.save(update_fields=["is_resolved"])
        return Response({"message": f"Alert '{alert.title}' marked as resolved."})

    @action(detail=False, methods=["get"], url_path="fund-exposure")
    def fund_exposure(self, request):
        """
        Returns portfolio-wide exposure breakdowns by geography, sector, and stage
        for the Portfolio Intelligence fund map.
        """
        firm_id = request.query_params.get("firm_id")
        fund_id = request.query_params.get("fund_id")
        qs = PortfolioCompany.objects.select_related("investment_case__startup").all()
        if firm_id:
            qs = qs.filter(firm_id=firm_id)
        if fund_id:
            qs = qs.filter(fund_id=fund_id)

        geo_map: dict = defaultdict(float)
        sector_map: dict = defaultdict(float)
        stage_map: dict = defaultdict(float)
        total_invested = Decimal("0")

        for pc in qs:
            amt = pc.invested_capital_usd or Decimal("0")
            total_invested += amt
            startup = pc.investment_case.startup
            geo = getattr(startup, "location", "Unknown") or "Unknown"
            sector = getattr(startup, "industry", "Unknown") or "Unknown"
            stage = getattr(pc.investment_case, "inferred_stage", "unknown") or "unknown"
            geo_map[geo] += float(amt)
            sector_map[sector] += float(amt)
            stage_map[stage] += float(amt)

        def to_pct_list(d: dict, total: float):
            if not total:
                return [{"label": k, "amount_usd": v, "pct": 0.0} for k, v in d.items()]
            return [
                {"label": k, "amount_usd": round(v, 2), "pct": round(v / total * 100, 1)}
                for k, v in sorted(d.items(), key=lambda x: -x[1])
            ]

        total_float = float(total_invested)
        return Response({
            "total_invested_usd": float(total_invested),
            "geography": to_pct_list(geo_map, total_float),
            "sector": to_pct_list(sector_map, total_float),
            "stage": to_pct_list(stage_map, total_float),
        })


# ──────────────────────────────────────────────────────────────────────────────
# 6. Seed Default Institutional VC Data
# ──────────────────────────────────────────────────────────────────────────────

class SeedInvestorDefaultsView(APIView):
    """Seeds institutional VC firm, funds, mandates, deals, and active portfolio companies."""
    permission_classes = [AllowAny]

    def post(self, request):
        user = request.user if request.user.is_authenticated else None

        # 1. Firm: Savannah Alpha Capital ($125M AUM)
        firm, _ = InvestmentFirm.objects.get_or_create(
            slug="savannah-alpha-capital",
            defaults={
                "name": "Savannah Alpha Capital",
                "headquarters": "Lagos, Nigeria & Nairobi, Kenya",
                "investment_regions": "Nigeria, Kenya, South Africa, Egypt, Ghana, Rwanda",
                "fund_type": "venture_capital",
                "founded_year": 2021,
                "aum_usd": Decimal("125000000.00"),
                "website": "https://savannahalpha.vc",
            }
        )

        if user:
            FirmMember.objects.get_or_create(
                firm=firm,
                user=user,
                defaults={
                    "title": "Managing Partner",
                    "institutional_role": "MANAGING_PARTNER",
                    "can_vote_ic": True,
                    "can_issue_term_sheet": True,
                    "can_underwrite": True,
                    "is_lead_partner": True,
                }
            )

        # 2. Fund II: Early Stage ($50M)
        fund_ii, _ = InvestmentFund.objects.get_or_create(
            firm=firm,
            name="Savannah Fund II (Early Stage)",
            defaults={
                "vintage_year": 2024,
                "fund_size_usd": Decimal("50000000.00"),
                "deployed_capital_usd": Decimal("24500000.00"),
                "stage_focus": "multi_stage",
                "geography_focus": "Nigeria, Kenya, South Africa, Egypt, Ghana",
                "sector_focus": "Fintech, Logistics, B2B SaaS, Healthtech, Climate",
                "min_check_size_usd": Decimal("150000.00"),
                "max_check_size_usd": Decimal("1500000.00"),
                "target_ownership_pct_min": 7.0,
                "target_ownership_pct_max": 15.0,
                "has_reserves": True,
            }
        )

        # 3. Machine-readable mandate
        InvestmentMandate.objects.get_or_create(
            fund=fund_ii,
            defaults={
                "thesis_summary": "Pre-Seed to Series A institutional investments across mission-critical infrastructure in West & East Africa.",
                "stage_rules": ["pre_seed", "seed"],
                "geography_whitelist": ["NG", "KE", "ZA", "EG", "GH", "RW"],
                "sector_whitelist": ["fintech", "logistics", "b2b_saas", "healthtech", "climate"],
                "min_revenue_usd": Decimal("0.00"),
                "pre_revenue_allowed": True,
                "founder_preferences": {"technical_founder_preferred": True, "full_time_required": True},
                "exclusion_list": ["crypto_speculative", "gambling", "tobacco"],
            }
        )

        # 4. Target Startup: KoraPay Logistics
        startup = StartupProfile.objects.filter(company_name__icontains="kora").first()
        if not startup:
            startup = StartupProfile.objects.first()

        if startup:
            # Case 1: KoraPay Logistics (High Priority / In Underwriting)
            case_a, _ = InvestmentCase.objects.get_or_create(
                fund=fund_ii,
                startup=startup,
                defaults={
                    "firm": firm,
                    "lead_partner": user,
                    "status": "UNDERWRITING",
                    "priority_tier": "HIGH",
                    "sourcing_channel": "marketplace",
                    "thesis_fit_score": 92.0,
                    "underwriting_score": 81.0,
                    "evidence_confidence_score": 76.0,
                    "overall_readiness_score": 84.0,
                    "declared_stage": "seed",
                    "inferred_stage": "pre_seed",
                    "stage_conflict_detected": True,
                    "stage_conflict_notes": "Founder declared Seed ($1.5M round target); verified commercial metrics reflect pilot-stage Pre-Seed.",
                    "target_ask_usd": Decimal("500000.00"),
                    "proposed_check_usd": Decimal("250000.00"),
                    "proposed_valuation_cap_usd": Decimal("5000000.00"),
                    "thesis_fit_breakdown": {
                        "geography_fit": 100,
                        "sector_fit": 95,
                        "stage_fit": 88,
                        "check_size_fit": 94,
                        "business_model_fit": 90,
                        "founder_fit": 85,
                    },
                }
            )

            # Claims for Case A
            cl1, _ = DealClaim.objects.get_or_create(
                investment_case=case_a,
                claim_id="CL-00127",
                defaults={
                    "claim_text": "100 signed Letters of Intent (LOIs) from regional freight forwarders",
                    "category": "commercial_traction",
                    "materiality": "critical",
                    "source": "Pitch Deck & Uploaded Docs",
                    "verification_status": "partially_verified",
                    "discrepancy_notes": "Cross-verification: 82 documents uploaded, 76 unique businesses, 69 signed, 48 active pilot commitments.",
                }
            )
            DealEvidence.objects.get_or_create(
                claim=cl1,
                defaults={
                    "claimed_value": "100 signed LOIs",
                    "audited_value": "69 verified signed with pilot commitments",
                    "counterparties_found": 82,
                    "counterparties_signed": 69,
                    "active_commitments": 48,
                    "confidence": 0.82,
                    "audit_summary": {"status": "partially_verified", "verified_pct": 69.0}
                }
            )

            # Financial Forensics Model for Case A
            DealFinancialModel.objects.get_or_create(
                investment_case=case_a,
                defaults={
                    "declared_mrr_usd": Decimal("0.00"),
                    "audited_mrr_usd": Decimal("0.00"),
                    "monthly_burn_usd": Decimal("18000.00"),
                    "runway_months": 8,
                    "gross_margin_pct": 74.0,
                    "scenario_models": {
                        "growth_slowdown": {"runway_months": 6, "burn_reduction_needed": 30},
                        "larger_check_dilution": {"new_check_usd": 500000, "dilution_pct": 10.0},
                    }
                }
            )

            # Memo for Case A
            InvestmentMemo.objects.get_or_create(
                investment_case=case_a,
                defaults={
                    "executive_summary": "KoraPay Logistics provides proprietary freight liquidity routing across West Africa. Exceptional founder exit track record.",
                    "thesis_alignment_rationale": "Perfect match with Fund II's logistics infrastructure mandate. High conviction interview recommendation.",
                    "bull_case": [
                        {"point": "Founder has previous exit as CTO of regional freight forwarder.", "strength": "High"},
                        {"point": "Market demand verified: 69 signed counter-parties with 48 pilot commitments.", "strength": "High"},
                    ],
                    "bear_case": [
                        {"point": "Pre-revenue: Conversion velocity from non-binding LOIs into annual billings is unproven.", "strength": "High"},
                    ],
                }
            )

            # Term Sheet Revision v1 for Case A
            TermSheetRevision.objects.get_or_create(
                investment_case=case_a,
                version_number=1,
                defaults={
                    "instrument": "SAFE",
                    "investment_amount_usd": Decimal("250000.00"),
                    "valuation_cap_usd": Decimal("5000000.00"),
                    "discount_pct": 20.0,
                    "target_ownership_pct": 5.0,
                    "board_rights": "Observer Seat",
                    "status": "proposed",
                    "closing_checklist": [
                        {"item": "Delaware / Regional Flip", "status": "verified"},
                        {"item": "IP Assignment Agreements", "status": "verified"},
                        {"item": "Bank Wire Details", "status": "pending"},
                    ]
                }
            )

            # Active Portfolio Company: PayRail Africa
            pc, _ = PortfolioCompany.objects.get_or_create(
                investment_case=case_a,
                defaults={
                    "firm": firm,
                    "fund": fund_ii,
                    "company_name": "PayRail Africa",
                    "entry_valuation_usd": Decimal("4000000.00"),
                    "invested_capital_usd": Decimal("300000.00"),
                    "current_fair_value_usd": Decimal("1020000.00"),
                    "ownership_pct": 7.5,
                    "holding_multiple": 3.4,
                    "follow_on_status": "INVEST_MORE",
                }
            )

            # Operational Alert for Portfolio Company
            PortfolioAlert.objects.get_or_create(
                portfolio_company=pc,
                alert_type="FOLLOW_ON_TRIGGER",
                defaults={
                    "severity": "OPPORTUNITY",
                    "title": "Series A Readiness Threshold Exceeded",
                    "description": "PayRail crossed $45k MRR run-rate with 32% QoQ expansion. Recommend leading follow-on round.",
                    "metric_delta": "ARR: $280k → $540k (+93%)",
                }
            )

            # 5. Seed Outcome Calibration Record for Longitudinal Learning
            OutcomeCalibrationRecord.objects.get_or_create(
                investment_case=case_a,
                defaults={
                    "predicted_quality_score": 88.0,
                    "predicted_unicorn_prob": 0.28,
                    "actual_outcome": "PROFITABLE_M_A",
                    "realized_multiple": 3.4,
                    "investor_bias_notes": "Optimal calibration: Commercial traction verification was the highest return predictor.",
                }
            )

            # 6. Seed Relationship Network Edges (Affinity-style graph)
            member = firm.members.first()
            if member:
                RelationshipEdge.objects.get_or_create(
                    firm=firm,
                    member=member,
                    target_person_name="Ibrahim Kora",
                    defaults={
                        "target_organization": "Kora Logistics & Flutterwave Alumni",
                        "target_email": "ibrahim@korapay.io",
                        "connection_type": "former_colleague",
                        "strength_score": 0.92,
                        "notes": "Co-worked during early payments gateway infrastructure integration. High integrity engineer.",
                    }
                )
                RelationshipEdge.objects.get_or_create(
                    firm=firm,
                    member=member,
                    target_person_name="Amara Diallo",
                    defaults={
                        "target_organization": "Savannah Syndicate Angel Network",
                        "target_email": "amara@diallo.vc",
                        "connection_type": "co_investor",
                        "strength_score": 0.88,
                        "notes": "Co-investor in PayRail seed round ($150k ticket). Active mentor in logistics regulatory pathways.",
                    }
                )

        return Response({
            "message": "Seeded Savannah Alpha Capital ($125M AUM), Fund II ($50M), cases, relationship graph, and outcome records.",
            "firm": firm.name,
            "fund": fund_ii.name,
        })

