"""
Management command: seed_intelligence_engine

Seeds the SourceRegistry with default Tier-1 and Tier-3 sources,
then optionally triggers an immediate crawl of all due sources.

Usage:
    python manage.py seed_intelligence_engine
    python manage.py seed_intelligence_engine --crawl
    python manage.py seed_intelligence_engine --crawl --limit 5
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Seed SourceRegistry with default sources and optionally trigger first crawl"

    def add_arguments(self, parser):
        parser.add_argument(
            "--crawl",
            action="store_true",
            default=False,
            help="Immediately crawl all seeded sources after seeding",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=30,
            help="Max number of sources to crawl (default: 30)",
        )
        parser.add_argument(
            "--no-ai",
            action="store_true",
            default=False,
            help="Disable AI extraction during crawl (faster, deterministic signals only)",
        )

    def handle(self, *args, **options):
        from apps.intelligence_engine.ingestion.source_registry import SourceRegistryService
        from apps.intelligence_engine.models_core import SourceRegistry

        self.stdout.write(self.style.MIGRATE_HEADING("Seeding SourceRegistry..."))

        svc = SourceRegistryService()
        created = svc.seed_default_sources()
        total = SourceRegistry.objects.filter(is_active=True).count()

        self.stdout.write(
            self.style.SUCCESS(
                f"  Sources created: {created}  |  Total active: {total}"
            )
        )

        if options["crawl"]:
            self.stdout.write(self.style.MIGRATE_HEADING("\nStarting crawl..."))
            from apps.intelligence_engine.ingestion.crawl_engine import FetchDispatcher

            dispatcher = FetchDispatcher(run_extraction=not options["no_ai"])
            result = dispatcher.run_all_due(limit=options["limit"])

            self.stdout.write(self.style.SUCCESS(
                f"\nCrawl complete:\n"
                f"  Sources checked        : {result['sources_checked']}\n"
                f"  Pages changed          : {result['pages_changed']}\n"
                f"  Facts extracted        : {result['total_facts_extracted']}\n"
                f"  Opportunities upserted : {result['opportunities_upserted']}\n"
                f"  Errors                 : {result['total_errors']}\n"
                f"  Completed at           : {result['completed_at']}"
            ))

            if result["total_errors"] > 0:
                self.stdout.write(self.style.WARNING(
                    f"\n  {result['total_errors']} sources had errors (see logs for details)."
                    f"\n  Errors are expected for sources that block scrapers - "
                    f"the system degrades gracefully."
                ))
        else:
            self.stdout.write(
                "\nTo start crawling, run:\n"
                "  python manage.py seed_intelligence_engine --crawl\n"
                "  # or trigger via Celery:\n"
                "  celery -A config call intelligence_engine.crawl_due_sources\n"
            )
