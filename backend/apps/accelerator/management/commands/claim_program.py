"""
management.commands.claim_program
===================================
Give an unowned program an owner.

A program with ``created_by = NULL`` is reachable by nobody's *own* account:
the read rule lets an account see programs it made, programs it is seated in,
and programs it works as a reviewer on — an account holding none of those three
sees nothing, and ``is_public`` does not help, because public is a founder-side
intake switch, not a grant of the records inside. The only account that reaches
such a row today is platform staff. That is the right rule; it is also a dead
program for anyone who means to run it.

So the recovery path is named and narrow rather than a default:

    python manage.py claim_program --list-unowned
    python manage.py claim_program pan-african-accelerator-2026 --to director@example.com
    python manage.py claim_program 3 --to director@example.com --dry-run

What it refuses, and why:

* A program that already has an owner. Re-owning is a transfer, and a transfer
  is a decision between two named accounts — not something a shell command does
  as a side effect of a typo. There is no transfer path yet; add one when the
  question is asked.
* An account that does not run programs. Handing a founder a program makes that
  founder's account read the program's whole record layer, which is the same
  rule ``ProgramStaffMembershipSerializer.validate_user`` applies to a seat.
* A deactivated account, for the same reason a seat refuses one.
* A program or an account that does not exist, and a program named by a slug
  nothing carries. Each refusal names the thing it could not resolve.

Idempotent by design: re-running after a successful claim reports that the
account already owns the program and writes nothing.

The command writes the ownership row and publishes ``program_claimed`` to the
event outbox with ``actor = None``. There is no authenticated request here, so
nobody would be honest about "who did this" beyond "a human at a shell, on this
date, from this deploy" — which is what the command output says, and what an
invented actor id on the event would falsely claim.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accelerator.models import AcceleratorProgram
from apps.accelerator.permissions import runs_a_program
from apps.accelerator.workflows import publish_event

from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = (
        "Set created_by on a program that has no owner. Refuses to move a "
        "program that already has one."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "program", nargs="?",
            help="Program slug or primary key.",
        )
        parser.add_argument(
            "--to", dest="to_email",
            help="Email of the account that will own the program.",
        )
        parser.add_argument(
            "--list-unowned", action="store_true",
            help="List programs with no owner and exit without writing.",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would change; write nothing.",
        )

    def handle(self, *args, **options):
        if options["list_unowned"]:
            self._list_unowned()
            return

        if not options["program"]:
            raise CommandError(
                "Name the program to claim (slug or pk), or pass --list-unowned."
            )
        if not options["to_email"]:
            raise CommandError(
                "Say who should own it: --to someone@example.com"
            )

        program = self._program(options["program"])
        account = self._account(options["to_email"])

        if program.created_by_id == account.pk:
            self.stdout.write(
                f"{program.slug}: already owned by {account.email}. Nothing written."
            )
            return
        if program.created_by_id is not None:
            raise CommandError(
                f"{program.slug} is already owned by {program.created_by.email}. "
                "This command claims unowned programs only — moving a program "
                "between two accounts is a transfer and needs its own path."
            )

        if options["dry_run"]:
            self.stdout.write(
                f"{program.slug}: created_by NULL -> {account.email} (dry run, nothing written)"
            )
            return

        with transaction.atomic():
            program.created_by = account
            program.save(update_fields=["created_by", "updated_at"])
            publish_event(
                program, "program_claimed", actor=None,
                payload={
                    "owner_email": account.email,
                    "owner_id": account.pk,
                    "via": "claim_program",
                },
            )

        self.stdout.write(self.style.SUCCESS(
            f"{program.slug}: now owned by {account.email}. That account can "
            "configure the program and seat a team; the events outbox records "
            "the claim with no actor, because a shell command has none."
        ))

    # ── lookups ─────────────────────────────────────────────────────────────

    def _list_unowned(self):
        unowned = AcceleratorProgram.objects.filter(created_by__isnull=True).order_by("id")
        total = AcceleratorProgram.objects.count()
        if not unowned:
            self.stdout.write(f"Every program has an owner ({total} total). Nothing to claim.")
            return
        self.stdout.write(f"{unowned.count()} of {total} programs have no owner:\n")
        for program in unowned:
            self.stdout.write(
                f"  {program.pk:>4}  {program.slug:<44} "
                f"applications={program.applications.count():<5} public={program.is_public}"
            )
        self.stdout.write(
            "\nClaim one with: python manage.py claim_program <slug> --to <email>"
        )

    def _program(self, ref):
        if str(ref).isdigit():
            found = AcceleratorProgram.objects.filter(pk=ref).first()
            if found is None:
                raise CommandError(f"No program with pk {ref}.")
            return found
        matches = AcceleratorProgram.objects.filter(slug=ref)
        if not matches.exists():
            raise CommandError(
                f"No program with slug '{ref}'. Run --list-unowned to see "
                "programs with no owner."
            )
        return matches.get()

    def _account(self, email):
        User = get_user_model()
        found = User.objects.filter(email__iexact=email.strip()).first()
        if found is None:
            raise CommandError(f"No account with email {email}.")
        if not found.is_active:
            raise CommandError(
                f"{found.email} is deactivated. An owner who cannot log in is a "
                "program with nobody who can run it."
            )
        if not runs_a_program(found):
            raise CommandError(
                f"{found.email} does not run programs (role: {found.role or 'unset'}). "
                "Owning one would hand a founder-side account the program's whole "
                "record layer."
            )
        return found
