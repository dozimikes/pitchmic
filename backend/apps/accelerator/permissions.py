"""
apps.accelerator.permissions
============================
Custom DRF permissions for the Venture Admissions & Investment Operating System.
"""
from django.db.models import Q
from rest_framework import permissions

from .models import AcceleratorProgram


PROGRAM_TEAM_ROLES = ("accelerator", "investor")


def runs_a_program(user):
    """The role question, answered once: is this account on the operating side
    of a pipeline?

    `IsAcceleratorOrStaff`, `programs_visible_to` and the row scopers in
    `tenant.py` all have to ask it, and an account cannot be allowed to be on
    one side of the table in one module and the other side elsewhere.
    """
    if not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return True
    return getattr(user, "role", "").lower() in PROGRAM_TEAM_ROLES


def programs_visible_to(user):
    """Which programs this account may work in. Nothing a client sends widens it.

    Four grants, and each is a different fact about the account:

    * it *made* the program — the ordinary case;
    * the program *staffed* it — an active `ProgramStaffMembership`, written by
      the program's own people rather than claimed by the caller;
    * a program *seated* the account on an application — an assignment written
      by that program's staff. A reviewer who is not the creator is otherwise
      blind to the row they were told to work, which is not a boundary but a
      dead end.
    * the program is open for public intake **and** the account is a founder.
      `is_public` is the switch that lets a founder find a program and apply to
      it; it was also, until here, the one that let a rival team read that
      program's applications, stage graph and diligence questions. Two teams
      that both run a pipeline must not be each other's readers because one of
      them accepts public applications, so the public branch belongs to the side
      of the intake door it was opened for.

    All four stop at read and work. Rewriting how a program judges founders is
    ``programs_owned_by``, which is narrower on purpose.
    """
    if not getattr(user, "is_authenticated", False):
        return AcceleratorProgram.objects.none()
    reachable = (
        Q(created_by=user)
        | Q(staff_memberships__user=user, staff_memberships__is_active=True)
        | Q(applications__reviewer_assignments__reviewer=user)
    )
    if not runs_a_program(user):
        reachable |= Q(is_public=True)
    return AcceleratorProgram.objects.filter(reachable).distinct()


def programs_owned_by(user):
    """The programs whose *configuration* this account may change.

    Deliberately narrower than ``programs_visible_to``. ``is_public`` is an
    intake switch — it is what lets a founder read a program's application form
    and apply — so treating it as an edit licence would let any accelerator
    account rewrite another team's stage graph, forms and roles. Changing how a
    pipeline judges founders belongs to the account that made it (staff excepted,
    which the caller decides, since "every program" is not a filter here).
    """
    return AcceleratorProgram.objects.filter(created_by=user)


class IsAcceleratorOrStaff(permissions.BasePermission):
    """
    Allows access only to accelerator managers, investment committee members, or staff admins.
    Founders are denied access to reviewer scorecards, committee voting, and status transitions.
    """

    def has_permission(self, request, view):
        return runs_a_program(request.user)


class IsApplicationOwnerOrStaff(permissions.BasePermission):
    """
    Allows founders to read/edit only their own applications.
    Accelerators and staff can view all applications.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if runs_a_program(user):
            return True
        # For AcceleratorApplication: check submitted_by
        if hasattr(obj, "submitted_by"):
            return obj.submitted_by == user
        # For QuestionResponse / ApplicationDocument: check application.submitted_by
        if hasattr(obj, "application"):
            return obj.application.submitted_by == user
        return False
