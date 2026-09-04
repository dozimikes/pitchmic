from rest_framework import permissions
from .models import FirmMember


class IsInvestorOrStaff(permissions.BasePermission):
    """Allows access only to authenticated investors or staff."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        return getattr(user, "role", "").lower() in ["investor", "accelerator"]


class CanVoteIC(permissions.BasePermission):
    """Allows IC voting only to firm members with institutional voting rights."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        # Check FirmMember
        member = FirmMember.objects.filter(user=user).first()
        if member and member.can_vote_ic:
            return True
        return getattr(user, "role", "").lower() == "investor"


class CanIssueTermSheet(permissions.BasePermission):
    """Allows issuing term sheets only to authorized partners."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        member = FirmMember.objects.filter(user=user).first()
        if member and member.can_issue_term_sheet:
            return True
        return getattr(user, "role", "").lower() == "investor"
