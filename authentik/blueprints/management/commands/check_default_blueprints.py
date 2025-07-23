"""Blueprint default check command"""

from django.core.management.base import BaseCommand
from structlog.stdlib import get_logger

from authentik.blueprints.v1.tasks import check_default_blueprints

LOGGER = get_logger()


class Command(BaseCommand):
    """Check if all default blueprints are applied and apply missing ones"""

    help = "Check if all default blueprints are applied and apply missing ones"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only check for missing blueprints without applying them",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        
        if dry_run:
            self.stdout.write("Running in dry-run mode - no blueprints will be applied")
            # TODO: Add dry-run logic to check_default_blueprints function
            self.stdout.write(
                self.style.WARNING(
                    "Dry-run mode not yet implemented. "
                    "This command will apply missing blueprints."
                )
            )
        
        self.stdout.write("Starting default blueprint check...")
        
        try:
            # Run the check synchronously for the management command
            task = check_default_blueprints.apply()
            
            if task.successful():
                self.stdout.write(
                    self.style.SUCCESS("Default blueprint check completed successfully")
                )
                if hasattr(task.result, 'get'):
                    result_message = task.result.get('message', 'No details available')
                    self.stdout.write(f"Result: {result_message}")
            else:
                self.stdout.write(
                    self.style.ERROR("Default blueprint check failed")
                )
                if hasattr(task.result, 'get'):
                    error_message = task.result.get('message', 'No error details available')
                    self.stdout.write(f"Error: {error_message}")
                    
        except Exception as exc:
            self.stdout.write(
                self.style.ERROR(f"Failed to run default blueprint check: {exc}")
            )
            LOGGER.error("Blueprint check command failed", error=str(exc), exc_info=True)