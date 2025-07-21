"""Management command to fix invalid avatar configurations"""

from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ValidationError

from authentik.tenants.models import Tenant
from authentik.lib.avatars import validate_avatar_modes


class Command(BaseCommand):
    """Fix invalid avatar configurations in tenants"""
    
    help = "Fix invalid avatar configurations by replacing them with safe defaults"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be changed without making changes",
        )
        parser.add_argument(
            "--fix-all",
            action="store_true", 
            help="Automatically fix all invalid configurations with default 'gravatar,initials'",
        )
        parser.add_argument(
            "--tenant-uuid",
            type=str,
            help="Fix only the tenant with this UUID",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        fix_all = options["fix_all"]
        tenant_uuid = options["tenant_uuid"]
        
        # Filter tenants
        if tenant_uuid:
            try:
                tenants = [Tenant.objects.get(tenant_uuid=tenant_uuid)]
            except Tenant.DoesNotExist:
                raise CommandError(f"Tenant with UUID {tenant_uuid} not found")
        else:
            tenants = Tenant.objects.all()
        
        invalid_tenants = []
        
        # Find tenants with invalid avatar configurations
        for tenant in tenants:
            try:
                validate_avatar_modes(tenant.avatars)
            except ValidationError as exc:
                invalid_tenants.append((tenant, str(exc)))
        
        if not invalid_tenants:
            self.stdout.write(
                self.style.SUCCESS("No invalid avatar configurations found!")
            )
            return
        
        self.stdout.write(
            self.style.WARNING(f"Found {len(invalid_tenants)} tenant(s) with invalid avatar configurations:")
        )
        
        for tenant, error in invalid_tenants:
            self.stdout.write(f"  - Tenant '{tenant.name}' ({tenant.tenant_uuid})")
            self.stdout.write(f"    Current config: {tenant.avatars}")
            self.stdout.write(f"    Error: {error}")
            
            if dry_run:
                self.stdout.write(f"    Would change to: gravatar,initials")
            elif fix_all:
                tenant.avatars = "gravatar,initials"
                # Bypass validation during save since we're fixing invalid config
                super(Tenant, tenant).save(update_fields=["avatars"])
                self.stdout.write(
                    self.style.SUCCESS(f"    Fixed: changed to 'gravatar,initials'")
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f"    Use --fix-all to automatically fix this configuration")
                )
        
        if dry_run:
            self.stdout.write("\nRun with --fix-all to apply these changes")
        elif fix_all:
            self.stdout.write(
                self.style.SUCCESS(f"\nFixed {len(invalid_tenants)} invalid avatar configuration(s)")
            )
        else:
            self.stdout.write("\nTo fix these configurations:")
            self.stdout.write("  - Run with --fix-all to automatically fix all")
            self.stdout.write("  - Or manually update the configurations in the admin interface")
            self.stdout.write("  - Valid URL format: https://example.com/%(username)s.jpg")
            self.stdout.write("  - Valid placeholders: %(username)s, %(mail_hash)s, %(upn)s")