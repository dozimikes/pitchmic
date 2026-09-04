"""
apps.accelerator.permissions
============================
Custom DRF permissions for the Venture Admissions & Investment Operating System.
"""
from rest_framework import permissions


class IsAcceleratorOrStaff(permissions.BasePermission):
    """
    Allows access only to accelerator managers, investment committee members, or staff admins.
    Founders are denied access to reviewer scorecards, committee voting, and status transitions.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        user_role = getattr(user, "role", "").lower()
        return user_role in ["accelerator", "investor"]


class IsApplicationOwnerOrStaff(permissions.BasePermission):
    """
    Allows founders to read/edit only their own applications.
    Accelerators and staff can view all applications.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_staff or user.is_superuser:
            return True
        user_role = getattr(user, "role", "").lower()
        if user_role in ["accelerator", "investor"]:
            return True
        # For AcceleratorApplication: check submitted_by
        if hasattr(obj, "submitted_by"):
            return obj.submitted_by == user
        # For QuestionResponse / ApplicationDocument: check application.submitted_by
        if hasattr(obj, "application"):
            return obj.application.submitted_by == user
        return False
