"""
apps.accelerator.models_os
==========================
Program OS models — reconstructed to match migrations 0004-0006 exactly.

These models back the configurable multi-tenant Program OS: organizations,
application cycles, invitations & memberships, cohort workspaces, curriculum,
mentorship, milestones/tasks, demo day, investor readiness, outcomes, alumni,
risk signals & interventions, workflow automations, blueprints, and program
memory. They are imported at the bottom of ``models.py`` so Django registers
them under the ``accelerator`` app label.

Foreign keys use string references (``to='accelerator.X'`` /
``settings.AUTH_USER_MODEL``) so import order does not matter.
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import models
from django.utils import timezone


class AcceleratorOrganization(models.Model):
    name = models.CharField(verbose_name='organization name', max_length=255)
    slug = models.SlugField(max_length=120, unique=True)
    logo_url = models.URLField(verbose_name='logo URL', blank=True)
    website = models.URLField(verbose_name='website', blank=True)
    description = models.TextField(verbose_name='description', blank=True)
    primary_domain = models.CharField(verbose_name='primary domain', max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        verbose_name = 'accelerator organization'
        verbose_name_plural = 'accelerator organizations'


class AlumniProfile(models.Model):
    is_mentor_available = models.BooleanField(default=False)
    is_speaker_available = models.BooleanField(default=False)
    is_investor = models.BooleanField(default=False)
    linkedin = models.URLField(blank=True)
    latest_company_url = models.URLField(blank=True)
    bio = models.TextField(blank=True)
    cohort_label = models.CharField(max_length=120, blank=True)
    is_public = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    membership = models.OneToOneField(related_name='alumni_profile', on_delete=models.CASCADE, to='accelerator.programmembership')
    organization = models.ForeignKey(related_name='alumni', on_delete=models.CASCADE, to='accelerator.acceleratororganization')
    program = models.ForeignKey(related_name='alumni', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'alumni profile'
        verbose_name_plural = 'alumni profiles'


class ApplicationCycleManager(models.Manager):
    """Adds ``current_for`` — the one place that decides which cycle a new
    submission belongs in."""

    def current_for(self, program, now=None):
        """The open cycle a submission to ``program`` should be filed under.

        Either exactly one cycle is open or the answer is None. Overlapping
        windows are what a rolling intake looks like, and picking the newest or
        the first would be a guess about which door a founder walked through, so
        the row is left uncycled instead.

        ``status="OPEN"`` is what opens a cycle — a director's own declaration.
        Dates only contradict it: a window that has not opened yet, or whose
        deadline has passed, is not open, while a cycle opened without dates
        stays open because nothing says otherwise. An application with no cycle
        is a real state, and every count that reads these rows has to live with
        it.
        """
        from django.utils import timezone

        now = now or timezone.now()
        candidates = [
            cycle for cycle in self.filter(program=program, status="OPEN")
            if (cycle.open_date is None or cycle.open_date <= now)
            and (cycle.deadline is None or cycle.deadline >= now)
        ]
        return candidates[0] if len(candidates) == 1 else None


class ApplicationCycle(models.Model):
    objects = ApplicationCycleManager()

    name = models.CharField(verbose_name='cycle name', max_length=120)
    cycle_code = models.CharField(verbose_name='cycle code', max_length=50, blank=True)
    status = models.CharField(verbose_name='cycle status', max_length=30, default='OPEN', choices=[('DRAFT', 'Draft'), ('OPEN', 'Open for Applications'), ('REVIEWING', 'Under Review'), ('INTERVIEWING', 'Interviews Active'), ('DECISION', 'Selection Committee Active'), ('ACTIVE_COHORT', 'Cohort in Session'), ('COMPLETED', 'Completed'), ('ARCHIVED', 'Archived')])
    intake_type = models.CharField(verbose_name='intake type', max_length=20, default='batch', choices=[('batch', 'Fixed Batch / Cohort'), ('rolling', 'Rolling Window / Continuous')])
    open_date = models.DateTimeField(verbose_name='applications open date', blank=True, null=True)
    deadline = models.DateTimeField(verbose_name='applications deadline', blank=True, null=True)
    cohort_start_date = models.DateField(verbose_name='cohort start date', blank=True, null=True)
    cohort_end_date = models.DateField(verbose_name='cohort end date', blank=True, null=True)
    target_cohort_size = models.PositiveIntegerField(verbose_name='target cohort size', default=15)
    intake_key_hash = models.CharField(
        verbose_name='intake key hash', max_length=64, blank=True,
        help_text='SHA-256 of the key this cycle accepts from an external form. Blank means '
                  'the cycle has no receiving door, whatever its dates say.',
    )
    intake_key_hint = models.CharField(
        verbose_name='intake key hint', max_length=24, blank=True,
        help_text='Leading characters of the issued key, for recognition in the UI. Not the key.',
    )
    intake_key_set_at = models.DateTimeField(verbose_name='intake key issued at', blank=True, null=True)
    intake_key_set_by = models.ForeignKey(
        blank=True, null=True, related_name='intake_keys_issued', on_delete=models.SET_NULL,
        to=settings.AUTH_USER_MODEL,
        help_text='Who opened this receiving door. A credential with no name behind it cannot be questioned later.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    program = models.ForeignKey(related_name='cycles', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'application cycle'
        verbose_name_plural = 'application cycles'
        ordering = ['-created_at']


class ApplicationSnapshot(models.Model):
    founder_snapshot = models.JSONField(verbose_name='founder profile snapshot', default=dict, help_text='Full FounderApplicationProfile at submission time')
    startup_snapshot = models.JSONField(verbose_name='startup profile snapshot', default=dict, help_text='Full StartupApplicationProfile at submission time')
    responses_snapshot = models.JSONField(verbose_name='question responses snapshot', default=list, help_text='All QuestionResponses at submission time')
    documents_snapshot = models.JSONField(verbose_name='documents snapshot', default=list, help_text='All ApplicationDocument metadata at submission time')
    claims_snapshot = models.JSONField(verbose_name='claims snapshot', default=list, help_text='All extracted claims at submission time')
    snapshot_hash = models.CharField(verbose_name='integrity hash (SHA-256)', max_length=64, blank=True, help_text='SHA-256 of the serialised snapshot for tamper detection')
    created_at = models.DateTimeField(auto_now_add=True)
    application = models.OneToOneField(related_name='snapshot', on_delete=models.CASCADE, to='accelerator.acceleratorapplication')
    class Meta:
        verbose_name = 'application snapshot'
        verbose_name_plural = 'application snapshots'


class BaselineMetrics(models.Model):
    recorded_at = models.DateTimeField(auto_now_add=True)
    revenue_mrr_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    revenue_arr_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    customer_count = models.PositiveIntegerField(blank=True, null=True)
    monthly_active_users = models.PositiveIntegerField(blank=True, null=True)
    employee_count = models.PositiveIntegerField(blank=True, null=True)
    runway_months = models.PositiveIntegerField(blank=True, null=True)
    total_funding_raised_usd = models.DecimalField(default=0, max_digits=15, decimal_places=2)
    investors_count = models.PositiveIntegerField(default=0)
    product_stage = models.CharField(max_length=20, blank=True, choices=[('idea', 'Idea'), ('prototype', 'Prototype'), ('mvp', 'MVP'), ('pilot', 'Pilot'), ('live', 'Live'), ('scaling', 'Scaling')])
    markets_active = models.JSONField(blank=True, default=list)
    custom_metrics = models.JSONField(blank=True, default=dict)
    notes = models.TextField(blank=True)
    membership = models.OneToOneField(related_name='baseline', on_delete=models.CASCADE, to='accelerator.programmembership')
    submitted_by = models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'baseline metrics'
        verbose_name_plural = 'baseline metrics'


class CohortAnnouncement(models.Model):
    title = models.CharField(max_length=255)
    body = models.TextField()
    is_pinned = models.BooleanField(default=False)
    is_urgent = models.BooleanField(default=False)
    visible_to_tracks = models.JSONField(verbose_name='visible to tracks (empty = all)', blank=True, default=list)
    published_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    author = models.ForeignKey(blank=True, null=True, related_name='authored_announcements', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    workspace = models.ForeignKey(related_name='announcements', on_delete=models.CASCADE, to='accelerator.cohortworkspace')
    class Meta:
        verbose_name = 'cohort announcement'
        verbose_name_plural = 'cohort announcements'
        ordering = ['-is_pinned', '-published_at']


class CohortEvent(models.Model):
    title = models.CharField(max_length=255)
    event_type = models.CharField(max_length=30, default='workshop', choices=[('workshop', 'Workshop'), ('office_hours', 'Office Hours'), ('mentor_day', 'Mentor Day'), ('investor_session', 'Investor Session'), ('cohort_call', 'Cohort Call'), ('demo_prep', 'Demo Preparation Session'), ('graduation', 'Graduation'), ('external_speaker', 'External Speaker'), ('peer_session', 'Peer Accountability Session'), ('other', 'Other')])
    description = models.TextField(blank=True)
    guest_speaker_name = models.CharField(max_length=255, blank=True)
    guest_speaker_bio = models.TextField(blank=True)
    guest_speaker_url = models.URLField(blank=True)
    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=60)
    location_or_url = models.CharField(max_length=500, blank=True)
    is_mandatory = models.BooleanField(default=False)
    requires_rsvp = models.BooleanField(default=False)
    recording_url = models.URLField(blank=True)
    resources = models.JSONField(blank=True, default=list, help_text='[{title, url, type}]')
    created_at = models.DateTimeField(auto_now_add=True)
    host = models.ForeignKey(blank=True, null=True, related_name='hosted_events', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    workspace = models.ForeignKey(related_name='events', on_delete=models.CASCADE, to='accelerator.cohortworkspace')
    track = models.ForeignKey(blank=True, null=True, related_name='events', on_delete=models.SET_NULL, to='accelerator.programtrack')
    class Meta:
        verbose_name = 'cohort event'
        verbose_name_plural = 'cohort events'
        ordering = ['scheduled_at']


class CohortWorkspace(models.Model):
    cohort_name = models.CharField(verbose_name='cohort name', max_length=120)
    cohort_number = models.PositiveIntegerField(verbose_name='cohort number', default=1)
    status = models.CharField(max_length=20, default='onboarding', choices=[('onboarding', 'Onboarding'), ('active', 'Active'), ('mid_review', 'Mid-Program Review'), ('demo_prep', 'Demo Day Preparation'), ('graduated', 'Graduated'), ('archived', 'Archived')])
    slack_url = models.URLField(blank=True)
    lms_url = models.URLField(blank=True)
    calendar_url = models.URLField(blank=True)
    communication_config = models.JSONField(verbose_name='communication config', blank=True, default=dict, help_text='{primary_channel: email|slack|whatsapp, announcement_channel: ...}')
    mid_program_review_date = models.DateField(blank=True, null=True)
    demo_day_date = models.DateField(blank=True, null=True)
    graduation_date = models.DateField(blank=True, null=True)
    dashboard_layout = models.JSONField(verbose_name='dashboard widget layout', blank=True, default=list, help_text='[{widget_key, title, order, visible, size: full|half|third}]')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    cycle = models.OneToOneField(related_name='workspace', on_delete=models.CASCADE, to='accelerator.applicationcycle')
    director = models.ForeignKey(blank=True, null=True, related_name='directed_workspaces', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    manager = models.ForeignKey(blank=True, null=True, related_name='managed_workspaces', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    program = models.ForeignKey(related_name='cohort_workspaces', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'cohort workspace'
        verbose_name_plural = 'cohort workspaces'
        ordering = ['-created_at']


class CurriculumWeek(models.Model):
    week_number = models.PositiveIntegerField()
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    theme = models.CharField(max_length=255, blank=True)
    learning_objectives = models.JSONField(blank=True, default=list)
    resources = models.JSONField(blank=True, default=list, help_text='[{title, url, type: video|doc|article|tool}]')
    tracks = models.JSONField(verbose_name='applicable tracks (empty=all)', blank=True, default=list)
    order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    program = models.ForeignKey(related_name='curriculum_weeks', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'curriculum week'
        verbose_name_plural = 'curriculum weeks'
        ordering = ['week_number']
        unique_together = [('program', 'week_number')]


class DashboardWidgetConfig(models.Model):
    role = models.CharField(max_length=20, choices=[('director', 'Program Director'), ('manager', 'Program Manager'), ('reviewer', 'Reviewer'), ('mentor', 'Mentor'), ('founder', 'Founder'), ('sponsor', 'Sponsor'), ('committee', 'Selection Committee')])
    widgets = models.JSONField(blank=True, default=list)
    nav_items = models.JSONField(blank=True, default=list)
    quick_actions = models.JSONField(blank=True, default=list)
    metric_cards = models.JSONField(blank=True, default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    program = models.ForeignKey(related_name='dashboard_configs', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    user = models.ForeignKey(blank=True, null=True, related_name='dashboard_configs', on_delete=models.CASCADE, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'dashboard widget config'
        verbose_name_plural = 'dashboard widget configs'
        unique_together = [('program', 'role', 'user')]


class DemoDaySlot(models.Model):
    slot_number = models.PositiveIntegerField()
    presentation_time = models.DateTimeField(blank=True, null=True)
    deck_url = models.URLField(blank=True)
    deck_approved = models.BooleanField(default=False)
    pitch_duration_minutes = models.PositiveIntegerField(default=5)
    qa_duration_minutes = models.PositiveIntegerField(default=5)
    demo_video_url = models.URLField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    deck_approved_by = models.ForeignKey(blank=True, null=True, related_name='approved_decks', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    membership = models.ForeignKey(related_name='demo_slot', on_delete=models.CASCADE, to='accelerator.programmembership')
    workspace = models.ForeignKey(related_name='demo_slots', on_delete=models.CASCADE, to='accelerator.cohortworkspace')
    class Meta:
        verbose_name = 'demo day slot'
        verbose_name_plural = 'demo day slots'
        ordering = ['slot_number']


class EventAttendance(models.Model):
    attended = models.BooleanField(default=False)
    late_arrival = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    event = models.ForeignKey(related_name='attendance', on_delete=models.CASCADE, to='accelerator.cohortevent')
    membership = models.ForeignKey(related_name='attendance', on_delete=models.CASCADE, to='accelerator.programmembership')
    recorded_by = models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'event attendance'
        verbose_name_plural = 'event attendance records'
        unique_together = [('event', 'membership')]


class ExternalIntakeSubmission(models.Model):
    """A submission received from outside the dashboard, held until a person decides what it is.

    A row here is deliberately not an application. The application spine requires
    a submitting account (``AcceleratorApplication.submitted_by``) and a founder
    profile hanging off exactly one account
    (``FounderApplicationProfile.user`` is a OneToOne), so work that arrives from
    a program's own website form or a director's spreadsheet cannot become a real
    row without someone asserting that identity. Accepting does that, and records
    who did it. Until then the row just waits, with its gaps listed.

    ``raw_payload`` is stored as received and never rewritten by a later mapping
    change. ``issues`` describes what could not be resolved on the way in — it is
    a list of gaps for a human to read, not a score, and it decides nothing.
    """

    SOURCE_CHOICES = [
        ('website', 'Website form'),
        ('spreadsheet', 'Spreadsheet import'),
        ('api', 'Direct post'),
    ]
    STATUS_CHOICES = [
        ('staged', 'Awaiting a decision'),
        ('accepted', 'Accepted into the funnel'),
        ('dismissed', 'Dismissed'),
    ]

    source = models.CharField(
        verbose_name='received via', max_length=20, default='website', choices=SOURCE_CHOICES,
        help_text='How this reached the queue, not what it is worth. A spreadsheet row and a '
                  'website post carry the same standing until a person decides.',
    )
    external_id = models.CharField(
        verbose_name='external reference', max_length=120, blank=True, null=True,
        help_text='The sender\'s own id for this submission. Kept null when absent: two '
                  'unknowns are not the same unknown, so they must not collide on the unique key.',
    )
    founder_email = models.EmailField(verbose_name='founder email', blank=True)
    founder_name = models.CharField(verbose_name='founder name', max_length=255, blank=True)
    company_name = models.CharField(verbose_name='company name', max_length=255, blank=True)
    raw_payload = models.JSONField(verbose_name='payload as received', default=dict, blank=True)
    issues = models.JSONField(verbose_name='mapping gaps', default=list, blank=True)
    status = models.CharField(verbose_name='status', max_length=20, default='staged', choices=STATUS_CHOICES)
    note = models.TextField(verbose_name='note', blank=True, help_text='Whatever the person wrote when deciding.')
    batch_ref = models.UUIDField(
        verbose_name='import batch', blank=True, null=True,
        help_text='Groups the rows that arrived in one file, so an import can be spoken about as a unit.',
    )
    decided_at = models.DateTimeField(verbose_name='decided at', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    program = models.ForeignKey(related_name='intake_submissions', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    cycle = models.ForeignKey(
        blank=True, null=True, related_name='intake_submissions', on_delete=models.SET_NULL,
        to='accelerator.applicationcycle',
    )
    decided_by = models.ForeignKey(
        blank=True, null=True, related_name='intake_decisions', on_delete=models.SET_NULL,
        to=settings.AUTH_USER_MODEL,
    )
    application = models.OneToOneField(
        blank=True, null=True, related_name='intake_submission', on_delete=models.SET_NULL,
        to='accelerator.acceleratorapplication',
    )

    class Meta:
        verbose_name = 'external intake submission'
        verbose_name_plural = 'external intake submissions'
        ordering = ['-created_at']
        unique_together = [('cycle', 'external_id')]

    def __str__(self) -> str:
        return f"{self.company_name or self.founder_name or 'Unnamed'} → {self.program_id} [{self.status}]"

    def blocking_gaps(self) -> list[str]:
        """What is missing before this can become an application.

        Both are hard requirements of the schema rather than opinions about data
        quality: without an email there is no account to file the work under, and
        without a company name there is nothing to file. Neither is invented. An
        address that is not an address is a gap too — accepting one would open an
        account nobody can ever claim, and the queue would never say so again.
        """
        gaps = []
        email = (self.founder_email or '').strip()
        if not email:
            gaps.append("No founder email — an application has to belong to an account.")
        else:
            try:
                validate_email(email)
            except ValidationError:
                gaps.append(f"“{email}” is not an email address, so it cannot name an account.")
        if not (self.company_name or '').strip():
            gaps.append("No company name — there is nothing to file under the program.")
        return gaps


class FounderTask(models.Model):
    status = models.CharField(max_length=20, default='not_started', choices=[('not_started', 'Not Started'), ('in_progress', 'In Progress'), ('submitted', 'Submitted'), ('under_review', 'Under Review'), ('completed', 'Completed'), ('overdue', 'Overdue')])
    submission_text = models.TextField(blank=True)
    submission_url = models.URLField(blank=True)
    submission_files = models.JSONField(blank=True, default=list)
    submitted_at = models.DateTimeField(blank=True, null=True)
    due_date = models.DateTimeField(blank=True, null=True)
    score = models.FloatField(blank=True, null=True)
    feedback = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    membership = models.ForeignKey(related_name='tasks', on_delete=models.CASCADE, to='accelerator.programmembership')
    reviewer = models.ForeignKey(blank=True, null=True, related_name='assigned_task_reviews', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    template = models.ForeignKey(related_name='instances', on_delete=models.CASCADE, to='accelerator.tasktemplate')
    class Meta:
        verbose_name = 'founder task'
        verbose_name_plural = 'founder tasks'
        ordering = ['due_date']
        unique_together = [('template', 'membership')]


class InterventionLog(models.Model):
    intervention_type = models.CharField(max_length=30, choices=[('mentor_session', 'Mentor Session'), ('director_call', 'Director Call'), ('evidence_request', 'Evidence Request'), ('task_assigned', 'Task Assigned'), ('resource_shared', 'Resource Shared'), ('custom', 'Custom')])
    description = models.TextField()
    outcome = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(blank=True, null=True)
    actor = models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    membership = models.ForeignKey(related_name='interventions', on_delete=models.CASCADE, to='accelerator.programmembership')
    risk_signal = models.ForeignKey(related_name='interventions', on_delete=models.CASCADE, to='accelerator.risksignal')
    class Meta:
        verbose_name = 'intervention log'
        verbose_name_plural = 'intervention logs'


class InvestorIntroduction(models.Model):
    investor_email = models.EmailField(max_length=254)
    investor_name = models.CharField(max_length=255, blank=True)
    investor_firm = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default='identified', choices=[('identified', 'Identified'), ('requested', 'Introduction Requested'), ('introduced', 'Introduced'), ('meeting_requested', 'Meeting Requested'), ('meeting_scheduled', 'Meeting Scheduled'), ('follow_up', 'Follow-up Active'), ('dd', 'In Due Diligence'), ('term_sheet', 'Term Sheet'), ('invested', 'Invested'), ('passed', 'Passed')])
    interest_level = models.CharField(max_length=10, blank=True, choices=[('high', 'High'), ('medium', 'Medium'), ('low', 'Low'), ('none', 'None')])
    notes = models.TextField(blank=True)
    investment_amount_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    follow_up_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    introduced_by = models.ForeignKey(blank=True, null=True, related_name='investor_introductions_made', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    membership = models.ForeignKey(related_name='investor_introductions', on_delete=models.CASCADE, to='accelerator.programmembership')
    class Meta:
        verbose_name = 'investor introduction'
        verbose_name_plural = 'investor introductions'
        ordering = ['-created_at']


class InvestorReadinessReport(models.Model):
    assessed_at = models.DateTimeField(auto_now_add=True)
    overall_score = models.FloatField(default=0.0)
    dimension_scores = models.JSONField(blank=True, default=dict, help_text='{pitch_deck, financials, data_room, traction, cap_table, legal_dd, market, team}')
    gaps = models.JSONField(blank=True, default=list, help_text='[{dimension, gap_description, severity, action}]')
    ready_for_introductions = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    assessed_by = models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    membership = models.ForeignKey(related_name='readiness_reports', on_delete=models.CASCADE, to='accelerator.programmembership')
    class Meta:
        verbose_name = 'investor readiness report'
        verbose_name_plural = 'investor readiness reports'
        ordering = ['-assessed_at']


class MemberAssessmentResult(models.Model):
    dimension_scores = models.JSONField(blank=True, default=dict)
    overall_score = models.FloatField(default=0.0)
    strengths = models.JSONField(blank=True, default=list)
    gaps = models.JSONField(blank=True, default=list)
    recommendations = models.JSONField(blank=True, default=list)
    assessed_at = models.DateTimeField(auto_now_add=True)
    assessed_by = models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    membership = models.ForeignKey(related_name='assessment_results', on_delete=models.CASCADE, to='accelerator.programmembership')
    assessment = models.ForeignKey(related_name='results', on_delete=models.CASCADE, to='accelerator.programassessment')
    class Meta:
        verbose_name = 'member assessment result'
        verbose_name_plural = 'member assessment results'
        unique_together = [('assessment', 'membership')]


class MentorAssignment(models.Model):
    focus_area = models.CharField(max_length=255, blank=True)
    assignment_type = models.CharField(max_length=20, default='primary', choices=[('primary', 'Primary Mentor'), ('specialist', 'Specialist Mentor'), ('advisor', 'Advisor'), ('connector', 'Network Connector')])
    status = models.CharField(max_length=20, default='active', choices=[('active', 'Active'), ('paused', 'Paused'), ('completed', 'Completed')])
    sessions_completed = models.PositiveIntegerField(default=0)
    match_score = models.FloatField(verbose_name='match score at assignment', default=0.0)
    assigned_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(blank=True, null=True)
    notes = models.TextField(blank=True)
    assigned_by = models.ForeignKey(blank=True, null=True, related_name='mentor_assignments_made', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    membership = models.ForeignKey(related_name='mentor_assignment_records', on_delete=models.CASCADE, to='accelerator.programmembership')
    workspace = models.ForeignKey(related_name='mentor_assignments', on_delete=models.CASCADE, to='accelerator.cohortworkspace')
    mentor = models.ForeignKey(related_name='assignments', on_delete=models.CASCADE, to='accelerator.mentorprofile')
    class Meta:
        verbose_name = 'mentor assignment'
        verbose_name_plural = 'mentor assignments'


class MentorMatchRequest(models.Model):
    challenge_description = models.TextField()
    expertise_needed = models.JSONField(blank=True, default=list)
    urgency = models.CharField(max_length=10, default='medium', choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High')])
    status = models.CharField(max_length=20, default='pending', choices=[('pending', 'Pending'), ('matched', 'Matched'), ('fulfilled', 'Fulfilled'), ('cancelled', 'Cancelled')])
    created_at = models.DateTimeField(auto_now_add=True)
    membership = models.ForeignKey(related_name='mentor_requests', on_delete=models.CASCADE, to='accelerator.programmembership')
    resolved_assignment = models.ForeignKey(blank=True, null=True, related_name='requests', on_delete=models.SET_NULL, to='accelerator.mentorassignment')
    class Meta:
        verbose_name = 'mentor match request'
        verbose_name_plural = 'mentor match requests'


class MentorProfile(models.Model):
    full_name = models.CharField(max_length=255, blank=True)
    title = models.CharField(max_length=120, blank=True)
    company = models.CharField(max_length=120, blank=True)
    bio = models.TextField(blank=True)
    linkedin = models.URLField(blank=True)
    avatar_url = models.URLField(blank=True)
    expertise_areas = models.JSONField(blank=True, default=list, help_text='[{area, score_1_to_10}]')
    industry_focus = models.JSONField(blank=True, default=list)
    stage_focus = models.JSONField(blank=True, default=list)
    geography_focus = models.JSONField(blank=True, default=list)
    mentoring_style = models.JSONField(blank=True, default=dict, help_text='{hands_on, advisor, connector, technical, commercial}')
    availability_hours_per_week = models.FloatField(default=4.0)
    max_active_mentees = models.PositiveIntegerField(default=3)
    is_active = models.BooleanField(default=True)
    total_sessions_completed = models.PositiveIntegerField(default=0)
    average_founder_rating = models.FloatField(default=0.0)
    embedding_vector = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    organization = models.ForeignKey(blank=True, null=True, related_name='mentors', on_delete=models.SET_NULL, to='accelerator.acceleratororganization')
    user = models.OneToOneField(related_name='mentor_profile', on_delete=models.CASCADE, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'mentor profile'
        verbose_name_plural = 'mentor profiles'


class MentorSession(models.Model):
    session_number = models.PositiveIntegerField(default=1)
    session_type = models.CharField(max_length=20, default='regular', choices=[('intro', 'Introduction'), ('regular', 'Regular'), ('deep_dive', 'Deep Dive'), ('emergency', 'Emergency / Urgent'), ('final', 'Final / Wrap-up')])
    status = models.CharField(max_length=20, default='scheduled', choices=[('scheduled', 'Scheduled'), ('completed', 'Completed'), ('cancelled', 'Cancelled'), ('no_show', 'No Show')])
    scheduled_at = models.DateTimeField(blank=True, null=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    meeting_url = models.URLField(blank=True)
    agenda = models.JSONField(blank=True, default=list, help_text='[{topic, owner, time_mins}]')
    notes = models.TextField(blank=True)
    founder_challenges = models.JSONField(blank=True, default=list)
    recommendations = models.JSONField(blank=True, default=list)
    action_items = models.JSONField(blank=True, default=list, help_text='[{item, owner, due_date, status: open|complete}]')
    founder_feedback_score = models.FloatField(blank=True, null=True)
    founder_feedback_notes = models.TextField(blank=True)
    mentor_private_notes = models.TextField(blank=True)
    next_session_date = models.DateField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    assignment = models.ForeignKey(related_name='sessions', on_delete=models.CASCADE, to='accelerator.mentorassignment')
    class Meta:
        verbose_name = 'mentor session'
        verbose_name_plural = 'mentor sessions'
        ordering = ['scheduled_at']


class MetricSnapshot(models.Model):
    period_label = models.CharField(max_length=100)
    revenue_mrr_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    revenue_arr_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    customer_count = models.PositiveIntegerField(blank=True, null=True)
    monthly_active_users = models.PositiveIntegerField(blank=True, null=True)
    employee_count = models.PositiveIntegerField(blank=True, null=True)
    runway_months = models.PositiveIntegerField(blank=True, null=True)
    total_funding_raised_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    custom_metrics = models.JSONField(blank=True, default=dict)
    recorded_at = models.DateTimeField(auto_now_add=True)
    membership = models.ForeignKey(related_name='metric_snapshots', on_delete=models.CASCADE, to='accelerator.programmembership')
    submitted_by = models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'metric snapshot'
        verbose_name_plural = 'metric snapshots'
        ordering = ['recorded_at']


class OfferLetter(models.Model):
    offer_template = models.CharField(max_length=100, blank=True, default='standard')
    offer_content = models.JSONField(blank=True, default=dict, help_text='{investment_terms, program_benefits, requirements, conditions}')
    investment_amount_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    equity_pct = models.FloatField(blank=True, null=True)
    program_start_date = models.DateField(blank=True, null=True)
    acceptance_deadline = models.DateTimeField(blank=True, null=True)
    status = models.CharField(max_length=20, default='draft', choices=[('draft', 'Draft'), ('sent', 'Sent to Founder'), ('accepted', 'Accepted'), ('declined', 'Declined'), ('expired', 'Expired')])
    sent_at = models.DateTimeField(blank=True, null=True)
    accepted_at = models.DateTimeField(blank=True, null=True)
    declined_at = models.DateTimeField(blank=True, null=True)
    founder_signature_url = models.URLField(blank=True)
    acceptance_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    application = models.OneToOneField(related_name='offer_letter', on_delete=models.CASCADE, to='accelerator.acceleratorapplication')
    generated_by = models.ForeignKey(blank=True, null=True, related_name='generated_offers', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    program = models.ForeignKey(related_name='offer_letters', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'offer letter'
        verbose_name_plural = 'offer letters'


class OnboardingChecklist(models.Model):
    items = models.JSONField(blank=True, default=list)
    completion_pct = models.FloatField(default=0.0)
    completed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    membership = models.OneToOneField(related_name='onboarding', on_delete=models.CASCADE, to='accelerator.programmembership')
    class Meta:
        verbose_name = 'onboarding checklist'
        verbose_name_plural = 'onboarding checklists'


class OrganizationMembership(models.Model):
    role = models.CharField(verbose_name='organization role', max_length=32, default='member', choices=[('owner', 'Organization Owner'), ('director', 'Program Director'), ('manager', 'Program Operations Manager'), ('reviewer', 'Reviewer'), ('mentor', 'Mentor'), ('member', 'Member')])
    permissions = models.JSONField(verbose_name='permissions list', blank=True, default=list, help_text="e.g. ['program.manage', 'billing.manage', 'member.invite']")
    is_active = models.BooleanField(verbose_name='is active', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    organization = models.ForeignKey(related_name='memberships', on_delete=models.CASCADE, to='accelerator.acceleratororganization')
    user = models.ForeignKey(related_name='org_memberships', on_delete=models.CASCADE, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'organization membership'
        verbose_name_plural = 'organization memberships'
        unique_together = [('user', 'organization')]


class OutcomeRecord(models.Model):
    recorded_at = models.DateTimeField(auto_now_add=True)
    period_label = models.CharField(max_length=100)
    revenue_mrr_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    revenue_arr_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    customer_count = models.PositiveIntegerField(blank=True, null=True)
    employee_count = models.PositiveIntegerField(blank=True, null=True)
    total_funding_raised_usd = models.DecimalField(blank=True, null=True, max_digits=15, decimal_places=2)
    latest_funding_round = models.JSONField(blank=True, default=dict)
    valuation_usd = models.DecimalField(blank=True, null=True, max_digits=18, decimal_places=2)
    markets_active = models.JSONField(blank=True, default=list)
    product_stage = models.CharField(max_length=20, blank=True)
    is_still_operating = models.BooleanField(default=True)
    has_exited = models.BooleanField(default=False)
    exit_details = models.JSONField(blank=True, default=dict)
    custom_metrics = models.JSONField(blank=True, default=dict)
    evidence_urls = models.JSONField(blank=True, default=list)
    verified = models.BooleanField(default=False)
    membership = models.ForeignKey(related_name='outcome_records', on_delete=models.CASCADE, to='accelerator.programmembership')
    submitted_by = models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'outcome record'
        verbose_name_plural = 'outcome records'
        ordering = ['recorded_at']


class OutcomeSurvey(models.Model):
    period_label = models.CharField(max_length=100)
    survey_type = models.CharField(max_length=10, default='auto', choices=[('auto', 'Automated'), ('manual', 'Manual')])
    status = models.CharField(max_length=20, default='pending', choices=[('pending', 'Pending'), ('sent', 'Sent'), ('completed', 'Completed'), ('skipped', 'Skipped')])
    due_at = models.DateTimeField()
    completed_at = models.DateTimeField(blank=True, null=True)
    response = models.JSONField(blank=True, default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    membership = models.ForeignKey(related_name='outcome_surveys', on_delete=models.CASCADE, to='accelerator.programmembership')
    class Meta:
        verbose_name = 'outcome survey'
        verbose_name_plural = 'outcome surveys'
        ordering = ['due_at']


class ProgramAssessment(models.Model):
    assessment_type = models.CharField(max_length=30, default='mid_program', choices=[('mid_program', 'Mid-Program Review'), ('investor_readiness', 'Investor Readiness Assessment'), ('final', 'Final Assessment'), ('diagnostic', 'Entry Diagnostic'), ('custom', 'Custom')])
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    rubric = models.JSONField(blank=True, default=list, help_text='[{dimension, weight, criteria_description}]')
    scheduled_at = models.DateTimeField(blank=True, null=True)
    due_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    workspace = models.ForeignKey(related_name='assessments', on_delete=models.CASCADE, to='accelerator.cohortworkspace')
    class Meta:
        verbose_name = 'program assessment'
        verbose_name_plural = 'program assessments'


class ProgramBlueprint(models.Model):
    name = models.CharField(verbose_name='blueprint name', max_length=255)
    blueprint_version = models.CharField(max_length=30, default='v1')
    description = models.TextField(blank=True)
    program_type = models.CharField(max_length=30, blank=True)
    workflow_snapshot = models.JSONField(blank=True, default=dict)
    form_snapshot = models.JSONField(blank=True, default=dict)
    policy_snapshot = models.JSONField(blank=True, default=dict)
    module_config_snapshot = models.JSONField(blank=True, default=dict)
    branding_snapshot = models.JSONField(blank=True, default=dict)
    portal_snapshot = models.JSONField(blank=True, default=dict)
    curriculum_snapshot = models.JSONField(blank=True, default=dict)
    milestone_snapshot = models.JSONField(blank=True, default=dict)
    automation_snapshot = models.JSONField(blank=True, default=dict)
    notification_snapshot = models.JSONField(blank=True, default=dict)
    is_published = models.BooleanField(verbose_name='published / available to clone', default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(blank=True, null=True, related_name='created_blueprints', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    organization = models.ForeignKey(related_name='blueprints', on_delete=models.CASCADE, to='accelerator.acceleratororganization')
    source_program = models.ForeignKey(blank=True, null=True, related_name='saved_blueprints', on_delete=models.SET_NULL, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'program blueprint'
        verbose_name_plural = 'program blueprints'
        ordering = ['-created_at']


class ProgramGraduation(models.Model):
    graduated_at = models.DateTimeField(auto_now_add=True)
    graduation_status = models.CharField(max_length=20, default='graduated', choices=[('graduated', 'Graduated'), ('incomplete', 'Incomplete'), ('withdrawn', 'Withdrawn'), ('deferred', 'Deferred')])
    final_assessment_score = models.FloatField(default=0.0)
    milestones_completed_pct = models.FloatField(default=0.0)
    mentor_sessions_count = models.PositiveIntegerField(default=0)
    events_attended_pct = models.FloatField(default=0.0)
    graduation_notes = models.TextField(blank=True)
    graduation_video_url = models.URLField(blank=True)
    certificate_url = models.URLField(blank=True)
    membership = models.OneToOneField(related_name='graduation', on_delete=models.CASCADE, to='accelerator.programmembership')
    recorded_by = models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'program graduation'
        verbose_name_plural = 'program graduations'


class ProgramInvitation(models.Model):
    email = models.EmailField(verbose_name='invited email address', max_length=254)
    role = models.CharField(verbose_name='intended role', max_length=32)
    permissions = models.JSONField(verbose_name='permissions payload', blank=True, default=list)
    scope = models.CharField(verbose_name='intended scope', max_length=20, default='assigned')
    token = models.CharField(verbose_name='invitation secure token', max_length=64, unique=True)
    status = models.CharField(verbose_name='invitation status', max_length=20, default='pending', choices=[('pending', 'Pending'), ('accepted', 'Accepted'), ('expired', 'Expired'), ('cancelled', 'Cancelled')])
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    invited_by = models.ForeignKey(null=True, related_name='sent_invitations', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    organization = models.ForeignKey(related_name='invitations', on_delete=models.CASCADE, to='accelerator.acceleratororganization')
    program = models.ForeignKey(blank=True, null=True, related_name='invitations', on_delete=models.SET_NULL, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'program invitation'
        verbose_name_plural = 'program invitations'


class ProgramMemoryEntry(models.Model):
    memory_type = models.CharField(max_length=30, choices=[('selection_insight', 'Selection Insight'), ('cohort_insight', 'Cohort Insight'), ('mentor_insight', 'Mentor Insight'), ('outcome_pattern', 'Outcome Pattern'), ('risk_pattern', 'Risk Pattern'), ('intervention_outcome', 'Intervention Outcome'), ('curriculum_feedback', 'Curriculum Feedback'), ('process_improvement', 'Process Improvement')])
    title = models.CharField(max_length=255)
    description = models.TextField()
    evidence = models.JSONField(blank=True, default=dict)
    confidence = models.FloatField(default=0.5, help_text='0.0 to 1.0')
    is_actionable = models.BooleanField(default=True)
    suggested_change = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    cycle = models.ForeignKey(blank=True, null=True, related_name='memory_entries', on_delete=models.SET_NULL, to='accelerator.applicationcycle')
    program = models.ForeignKey(related_name='memory_entries', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'program memory entry'
        verbose_name_plural = 'program memory entries'
        ordering = ['-created_at']


class ProgramStaffMembership(models.Model):
    role = models.CharField(verbose_name='program role', max_length=32, default='reviewer', choices=[('director', 'Program Director'), ('manager', 'Program Manager'), ('reviewer', 'Reviewer'), ('committee', 'Selection Committee'), ('mentor', 'Mentor'), ('sponsor', 'Sponsor Observer')])
    scope = models.CharField(verbose_name='access scope', max_length=20, default='assigned', choices=[('all', 'All Applications in Program'), ('assigned', 'Assigned Only')], help_text='Determines whether data queries default to all items or only assigned ones.')
    permissions = models.JSONField(verbose_name='permissions list', blank=True, default=list, help_text="e.g. ['application.view.assigned', 'application.review', 'intelligence.run']")
    is_active = models.BooleanField(verbose_name='is active', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    program = models.ForeignKey(related_name='staff_memberships', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    user = models.ForeignKey(related_name='program_staff_memberships', on_delete=models.CASCADE, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'program staff membership'
        verbose_name_plural = 'program staff memberships'
        unique_together = [('user', 'program', 'role')]


class ProgramTrack(models.Model):
    name = models.CharField(verbose_name='track name', max_length=120)
    slug = models.SlugField(max_length=120)
    description = models.TextField(blank=True)
    sector_tags = models.JSONField(verbose_name='sector tags', blank=True, default=list)
    geography_tags = models.JSONField(verbose_name='geography tags', blank=True, default=list)
    stage_tags = models.JSONField(verbose_name='stage tags', blank=True, default=list)
    mentor_ids = models.JSONField(verbose_name='mentor user IDs', blank=True, default=list)
    reviewer_ids = models.JSONField(verbose_name='reviewer user IDs', blank=True, default=list)
    milestone_template_ids = models.JSONField(verbose_name='milestone template IDs', blank=True, default=list)
    color = models.CharField(verbose_name='display color hex', max_length=10, blank=True, default='')
    icon = models.CharField(verbose_name='icon key', max_length=50, blank=True, default='')
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    evaluation_policy = models.ForeignKey(blank=True, null=True, related_name='tracks', on_delete=models.SET_NULL, to='accelerator.programevaluationpolicy')
    program = models.ForeignKey(related_name='tracks', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'program track'
        verbose_name_plural = 'program tracks'
        ordering = ['order']
        unique_together = [('program', 'slug')]


class ReviewAssignment(models.Model):
    """Who a program has asked to review an application.

    An assignment records intent and ownership; it is not a gate. Any eligible
    reviewer may still file a scorecard without one, and being assigned obliges
    nothing — the human still decides, and the scorecard (not this row) is the
    evidence that a review happened.
    """

    round_id = models.CharField(verbose_name='review round', max_length=50, default='round-1')
    assigned_at = models.DateTimeField(auto_now_add=True)
    due_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(verbose_name='assignment status', max_length=20, default='pending', choices=[('pending', 'Pending'), ('in_progress', 'In Progress'), ('completed', 'Completed')])
    conflict_status = models.CharField(verbose_name='conflict status', max_length=20, default='none', choices=[('none', 'No Conflict'), ('potential', 'Potential Conflict Flagged'), ('recused', 'Recused')])
    notes = models.TextField(verbose_name='reviewer private notes', blank=True)
    application = models.ForeignKey(related_name='reviewer_assignments', on_delete=models.CASCADE, to='accelerator.acceleratorapplication')
    reviewer = models.ForeignKey(related_name='review_assignments', on_delete=models.CASCADE, to=settings.AUTH_USER_MODEL)
    assigned_by = models.ForeignKey(blank=True, null=True, related_name='review_assignments_made', on_delete=models.SET_NULL, verbose_name='assigned by', to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'review assignment'
        verbose_name_plural = 'review assignments'
        unique_together = [('reviewer', 'application', 'round_id')]

    def is_overdue(self, now=None, scorecard_filed=False) -> bool:
        """The one overdue rule for a seat.

        No deadline is not a late seat, it is an undated one. A recused seat is
        not late either — the human stepped off, which is a different fact and
        reads as itself. And a seat with a scorecard behind it is finished
        whatever the date says."""
        if self.due_at is None or scorecard_filed or self.conflict_status == 'recused':
            return False
        return self.due_at < (now or timezone.now())


class ReviewerProfile(models.Model):
    title = models.CharField(verbose_name='title / role', max_length=120, blank=True)
    organization = models.CharField(verbose_name='organization', max_length=120, blank=True)
    bio = models.TextField(verbose_name='bio', blank=True)
    expertise_areas = models.JSONField(verbose_name='expertise areas', blank=True, default=list, help_text="[{area: 'fintech', score: 9}, {area: 'AI/ML', score: 8}]")
    sector_expertise = models.JSONField(verbose_name='sector expertise', blank=True, default=list)
    stage_expertise = models.JSONField(verbose_name='stage expertise', blank=True, default=dict)
    geography_expertise = models.JSONField(verbose_name='geography expertise', blank=True, default=list)
    availability_hours_per_week = models.FloatField(verbose_name='available hrs/wk', default=5.0)
    max_active_reviews = models.PositiveIntegerField(verbose_name='max active reviews', default=10)
    is_active = models.BooleanField(verbose_name='is active', default=True)
    conflict_disclosures = models.JSONField(verbose_name='conflict disclosures', blank=True, default=list, help_text="[{entity: 'Company X', type: 'investor|advisor|founder|board'}]")
    scoring_calibration = models.JSONField(verbose_name='scoring calibration', blank=True, default=dict, help_text="{dim_variance: {...}, avg_score: 6.8, tendency: 'lenient|harsh|balanced'}")
    total_reviews_completed = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    user = models.OneToOneField(related_name='reviewer_profile', on_delete=models.CASCADE, to=settings.AUTH_USER_MODEL)
    class Meta:
        verbose_name = 'reviewer profile'
        verbose_name_plural = 'reviewer profiles'


class RiskSignal(models.Model):
    signal_type = models.CharField(max_length=20, choices=[('execution', 'Execution Risk'), ('engagement', 'Engagement Risk'), ('financial', 'Financial Risk'), ('milestone', 'Milestone Risk'), ('mentor', 'Mentor Engagement Gap'), ('traction', 'Traction Decline'), ('regulatory', 'Regulatory Risk'), ('team', 'Team Risk'), ('other', 'Other')])
    severity = models.CharField(max_length=10, default='warning', choices=[('info', 'Info'), ('warning', 'Warning'), ('critical', 'Critical')])
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    evidence = models.JSONField(blank=True, default=dict)
    recommended_action = models.TextField(blank=True)
    status = models.CharField(max_length=20, default='open', choices=[('open', 'Open'), ('acknowledged', 'Acknowledged'), ('resolved', 'Resolved'), ('false_positive', 'False Positive')])
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    acknowledged_by = models.ForeignKey(blank=True, null=True, related_name='acknowledged_signals', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    membership = models.ForeignKey(related_name='risk_signals', on_delete=models.CASCADE, to='accelerator.programmembership')
    program = models.ForeignKey(related_name='risk_signals', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    rule = models.ForeignKey(blank=True, null=True, related_name='generated_signals', on_delete=models.SET_NULL, to='accelerator.programrule')
    class Meta:
        verbose_name = 'risk signal'
        verbose_name_plural = 'risk signals'
        ordering = ['-created_at']


class TaskTemplate(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    instructions = models.TextField(blank=True)
    task_type = models.CharField(max_length=20, default='submission', choices=[('submission', 'Submission'), ('reflection', 'Reflection'), ('exercise', 'Exercise'), ('preparation', 'Preparation'), ('research', 'Research'), ('building', 'Building'), ('presentation', 'Presentation')])
    expected_output = models.TextField(blank=True)
    evaluation_rubric = models.JSONField(blank=True, default=list, help_text='[{criterion, weight, max_score}]')
    is_graded = models.BooleanField(default=False)
    max_score = models.FloatField(default=100.0)
    due_offset_days = models.PositiveIntegerField(verbose_name='due days from cohort start', default=7)
    tracks = models.JSONField(verbose_name='applicable tracks (empty=all)', blank=True, default=list)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    program = models.ForeignKey(related_name='task_templates', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    week = models.ForeignKey(blank=True, null=True, related_name='tasks', on_delete=models.SET_NULL, to='accelerator.curriculumweek')
    class Meta:
        verbose_name = 'task template'
        verbose_name_plural = 'task templates'
        ordering = ['due_offset_days', 'order']


class WorkflowAutomation(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    trigger_event = models.CharField(max_length=60, choices=[('application.submitted', 'Application Submitted'), ('application.eligibility_passed', 'Application Passed Eligibility'), ('application.eligibility_failed', 'Application Failed Eligibility'), ('application.shortlisted', 'Application Shortlisted'), ('application.interview_invited', 'Interview Invitation Sent'), ('application.interview_complete', 'Interview Completed'), ('application.committee_ready', 'Moved to Committee Review'), ('application.accepted', 'Application Accepted'), ('application.rejected', 'Application Rejected'), ('application.waitlisted', 'Application Waitlisted'), ('application.evidence_requested', 'Evidence Requested'), ('cohort.enrolled', 'Founder Enrolled in Cohort'), ('cohort.onboarding_complete', 'Onboarding Completed'), ('milestone.created', 'Milestone Created'), ('milestone.overdue_warn', 'Milestone Overdue Warning'), ('milestone.overdue_critical', 'Milestone Critically Overdue'), ('milestone.completed', 'Milestone Completed'), ('mentor_session.completed', 'Mentor Session Completed'), ('mentor_session.missed', 'Mentor Session Missed'), ('demo_day.scheduled', 'Demo Day Scheduled'), ('founder.graduated', 'Founder Graduated'), ('outcome.survey_due', 'Outcome Survey Due')])
    conditions = models.JSONField(blank=True, default=dict)
    actions = models.JSONField(default=list, help_text="[{type: 'send_notification', params: {role: 'reviewer', template: '...'}}]")
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(blank=True, null=True, related_name='created_automations', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)
    program = models.ForeignKey(related_name='automations', on_delete=models.CASCADE, to='accelerator.acceleratorprogram')
    class Meta:
        verbose_name = 'workflow automation'
        verbose_name_plural = 'workflow automations'
        ordering = ['program', 'order']


class WorkflowAutomationLog(models.Model):
    trigger_event = models.CharField(max_length=60)
    context_snapshot = models.JSONField(blank=True, default=dict)
    actions_executed = models.JSONField(blank=True, default=list)
    actions_skipped = models.JSONField(blank=True, default=list)
    success = models.BooleanField(default=True)
    error_detail = models.TextField(blank=True)
    fired_at = models.DateTimeField(auto_now_add=True)
    automation = models.ForeignKey(related_name='logs', on_delete=models.CASCADE, to='accelerator.workflowautomation')
    class Meta:
        verbose_name = 'automation log'
        verbose_name_plural = 'automation logs'
        ordering = ['-fired_at']
