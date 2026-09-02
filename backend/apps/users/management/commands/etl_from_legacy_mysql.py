"""
management command: etl_from_legacy_mysql
==========================================
Migrates users and startup/investor profiles from the legacy PHP/MySQL
database into the new Django/Postgres schema.

Usage::

    python manage.py etl_from_legacy_mysql \\
        --host 127.0.0.1 --port 3306 \\
        --db pitchmic_legacy --user root --password secret \\
        --batch-size 500 --dry-run

Environment fallbacks (all overridable via CLI flags):
    LEGACY_DB_HOST, LEGACY_DB_PORT, LEGACY_DB_NAME,
    LEGACY_DB_USER, LEGACY_DB_PASSWORD

Legacy table assumptions (adapt SQL queries below to match actual schema):
    users            (id, email, password_hash, role, first_name, last_name,
                      is_verified, created_at, updated_at)
    startup_profiles (id, user_id, company_name, tagline, description,
                      website, linkedin, twitter, logo_url, industry,
                      founded_year, location, employee_count)
    investor_profiles(id, user_id, full_name, company_name, title, bio,
                      website, linkedin, twitter, avatar_url, location,
                      investment_range_min, investment_range_max,
                      preferred_industries)
"""
from __future__ import annotations

import logging
from typing import Any

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

logger = logging.getLogger(__name__)

try:
    import MySQLdb  # mysqlclient
    HAS_MYSQL = True
except ImportError:
    HAS_MYSQL = False


class Command(BaseCommand):
    help = "ETL: migrate users + profiles from legacy MySQL into Django Postgres"

    def add_arguments(self, parser: Any) -> None:
        import os
        parser.add_argument("--host", default=os.getenv("LEGACY_DB_HOST", "127.0.0.1"))
        parser.add_argument("--port", type=int, default=int(os.getenv("LEGACY_DB_PORT", "3306")))
        parser.add_argument("--db", default=os.getenv("LEGACY_DB_NAME", "pitchmic_legacy"))
        parser.add_argument("--user", default=os.getenv("LEGACY_DB_USER", "root"))
        parser.add_argument("--password", default=os.getenv("LEGACY_DB_PASSWORD", ""))
        parser.add_argument("--batch-size", type=int, default=500, dest="batch_size")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            dest="dry_run",
            help="Parse and validate data without writing to Postgres",
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            dest="skip_existing",
            default=True,
            help="Skip users whose email already exists in Django (default: True)",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if not HAS_MYSQL:
            raise CommandError(
                "mysqlclient is not installed. Run: pip install mysqlclient"
            )

        from apps.users.models import InvestorProfile, StartupProfile, User

        dry_run: bool = options["dry_run"]
        skip_existing: bool = options["skip_existing"]
        batch_size: int = options["batch_size"]

        self.stdout.write(self.style.NOTICE(
            f"Connecting to MySQL {options['host']}:{options['port']}/{options['db']} …"
        ))

        try:
            conn = MySQLdb.connect(
                host=options["host"],
                port=options["port"],
                db=options["db"],
                user=options["user"],
                passwd=options["password"],
                charset="utf8mb4",
            )
        except Exception as exc:
            raise CommandError(f"MySQL connection failed: {exc}") from exc

        cursor = conn.cursor(MySQLdb.cursors.DictCursor)

        # ------------------------------------------------------------------ #
        # 1. Migrate users
        # ------------------------------------------------------------------ #
        self.stdout.write("Fetching legacy users …")
        cursor.execute(
            "SELECT id, email, password_hash, role, first_name, last_name, "
            "is_verified, created_at FROM users ORDER BY id LIMIT %s",
            (batch_size,),
        )
        rows = cursor.fetchall()
        created_count = skipped_count = 0

        for row in rows:
            email: str = (row["email"] or "").strip().lower()
            if not email:
                logger.warning("Skipping row with no email: %s", row)
                continue

            if skip_existing and User.objects.filter(email=email).exists():
                skipped_count += 1
                continue

            role = row.get("role", "startup")
            if role not in ("startup", "investor"):
                role = "startup"

            if dry_run:
                self.stdout.write(f"  [DRY RUN] Would create user: {email} ({role})")
                created_count += 1
                continue

            try:
                with transaction.atomic():
                    user = User(
                        email=email,
                        first_name=row.get("first_name") or "",
                        last_name=row.get("last_name") or "",
                        role=role,
                        is_verified=bool(row.get("is_verified", False)),
                        is_active=True,
                    )
                    # Re-hash using Argon2; legacy hash stored verbatim is unusable
                    # so users will need to reset passwords via email.
                    user.password = make_password(None)  # unusable password
                    user.save()
                    created_count += 1

                    # -------------------------------------------------------- #
                    # 2. Migrate linked profiles
                    # -------------------------------------------------------- #
                    legacy_id: int = row["id"]
                    if role == "startup":
                        cursor.execute(
                            "SELECT * FROM startup_profiles WHERE user_id = %s LIMIT 1",
                            (legacy_id,),
                        )
                        sp = cursor.fetchone()
                        StartupProfile.objects.create(
                            user=user,
                            company_name=(sp or {}).get("company_name") or email.split("@")[0],
                            tagline=(sp or {}).get("tagline") or "",
                            description=(sp or {}).get("description") or "",
                            website=(sp or {}).get("website") or "",
                            linkedin=(sp or {}).get("linkedin") or "",
                            twitter=(sp or {}).get("twitter") or "",
                            logo_url=(sp or {}).get("logo_url") or "",
                            industry=(sp or {}).get("industry") or "",
                            location=(sp or {}).get("location") or "",
                        )
                    elif role == "investor":
                        cursor.execute(
                            "SELECT * FROM investor_profiles WHERE user_id = %s LIMIT 1",
                            (legacy_id,),
                        )
                        ip = cursor.fetchone()
                        InvestorProfile.objects.create(
                            user=user,
                            full_name=(ip or {}).get("full_name") or user.email.split("@")[0],
                            company_name=(ip or {}).get("company_name") or "",
                            title=(ip or {}).get("title") or "",
                            bio=(ip or {}).get("bio") or "",
                            website=(ip or {}).get("website") or "",
                            linkedin=(ip or {}).get("linkedin") or "",
                            twitter=(ip or {}).get("twitter") or "",
                            avatar_url=(ip or {}).get("avatar_url") or "",
                            location=(ip or {}).get("location") or "",
                            investment_range_min=(ip or {}).get("investment_range_min"),
                            investment_range_max=(ip or {}).get("investment_range_max"),
                            preferred_industries=(ip or {}).get("preferred_industries") or "",
                        )
            except Exception as exc:
                logger.error("Failed to migrate user %s: %s", email, exc)

        cursor.close()
        conn.close()

        summary = (
            f"Done. Created: {created_count}  Skipped (existing): {skipped_count}"
        )
        if dry_run:
            summary = f"[DRY RUN] {summary}"
        self.stdout.write(self.style.SUCCESS(summary))
