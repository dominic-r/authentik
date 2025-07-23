"""v1 blueprints tasks"""

from dataclasses import asdict, dataclass, field
from hashlib import sha512
from pathlib import Path
from sys import platform

from dacite.core import from_dict
from django.db import DatabaseError, InternalError, ProgrammingError
from django.utils.text import slugify
from django.utils.timezone import now
from django.utils.translation import gettext_lazy as _
from structlog.stdlib import get_logger
from watchdog.events import (
    FileCreatedEvent,
    FileModifiedEvent,
    FileSystemEvent,
    FileSystemEventHandler,
)
from watchdog.observers import Observer
from yaml import load
from yaml.error import YAMLError

from authentik.blueprints.models import (
    BlueprintInstance,
    BlueprintInstanceStatus,
    BlueprintRetrievalFailed,
)
from authentik.blueprints.v1.common import BlueprintLoader, BlueprintMetadata, EntryInvalidError
from authentik.blueprints.v1.importer import Importer
from authentik.blueprints.v1.labels import LABEL_AUTHENTIK_INSTANTIATE
from authentik.blueprints.v1.oci import OCI_PREFIX
from authentik.events.logs import capture_logs
from authentik.events.models import TaskStatus
from authentik.events.system_tasks import SystemTask, prefill_task
from authentik.events.utils import sanitize_dict
from authentik.lib.config import CONFIG
from authentik.root.celery import CELERY_APP
from authentik.tenants.models import Tenant

LOGGER = get_logger()
_file_watcher_started = False


@dataclass
class BlueprintFile:
    """Basic info about a blueprint file"""

    path: str
    version: int
    hash: str
    last_m: int
    meta: BlueprintMetadata | None = field(default=None)


def start_blueprint_watcher():
    """Start blueprint watcher, if it's not running already."""
    # This function might be called twice since it's called on celery startup

    global _file_watcher_started  # noqa: PLW0603
    if _file_watcher_started:
        return
    observer = Observer()
    kwargs = {}
    if platform.startswith("linux"):
        kwargs["event_filter"] = (FileCreatedEvent, FileModifiedEvent)
    observer.schedule(
        BlueprintEventHandler(), CONFIG.get("blueprints_dir"), recursive=True, **kwargs
    )
    observer.start()
    _file_watcher_started = True


class BlueprintEventHandler(FileSystemEventHandler):
    """Event handler for blueprint events"""

    # We only ever get creation and modification events.
    # See the creation of the Observer instance above for the event filtering.

    # Even though we filter to only get file events, we might still get
    # directory events as some implementations such as inotify do not support
    # filtering on file/directory.

    def dispatch(self, event: FileSystemEvent) -> None:
        """Call specific event handler method. Ignores directory changes."""
        if event.is_directory:
            return None
        return super().dispatch(event)

    def on_created(self, event: FileSystemEvent):
        """Process file creation"""
        LOGGER.debug("new blueprint file created, starting discovery")
        for tenant in Tenant.objects.filter(ready=True):
            with tenant:
                blueprints_discovery.delay()

    def on_modified(self, event: FileSystemEvent):
        """Process file modification"""
        path = Path(event.src_path)
        root = Path(CONFIG.get("blueprints_dir")).absolute()
        rel_path = str(path.relative_to(root))
        for tenant in Tenant.objects.filter(ready=True):
            with tenant:
                for instance in BlueprintInstance.objects.filter(path=rel_path, enabled=True):
                    LOGGER.debug("modified blueprint file, starting apply", instance=instance)
                    apply_blueprint.delay(instance.pk.hex)


@CELERY_APP.task(
    throws=(DatabaseError, ProgrammingError, InternalError),
)
def blueprints_find_dict():
    """Find blueprints as `blueprints_find` does, but return a safe dict"""
    blueprints = []
    for blueprint in blueprints_find():
        blueprints.append(sanitize_dict(asdict(blueprint)))
    return blueprints


def blueprints_find() -> list[BlueprintFile]:
    """Find blueprints and return valid ones"""
    blueprints = []
    root = Path(CONFIG.get("blueprints_dir"))
    for path in root.rglob("**/*.yaml"):
        rel_path = path.relative_to(root)
        # Check if any part in the path starts with a dot and assume a hidden file
        if any(part for part in path.parts if part.startswith(".")):
            continue
        with open(path, encoding="utf-8") as blueprint_file:
            try:
                raw_blueprint = load(blueprint_file.read(), BlueprintLoader)
            except YAMLError as exc:
                raw_blueprint = None
                LOGGER.warning("failed to parse blueprint", exc=exc, path=str(rel_path))
            if not raw_blueprint:
                continue
            metadata = raw_blueprint.get("metadata", None)
            version = raw_blueprint.get("version", 1)
            if version != 1:
                LOGGER.warning("invalid blueprint version", version=version, path=str(rel_path))
                continue
        file_hash = sha512(path.read_bytes()).hexdigest()
        blueprint = BlueprintFile(str(rel_path), version, file_hash, int(path.stat().st_mtime))
        blueprint.meta = from_dict(BlueprintMetadata, metadata) if metadata else None
        blueprints.append(blueprint)
    return blueprints


@CELERY_APP.task(
    throws=(DatabaseError, ProgrammingError, InternalError), base=SystemTask, bind=True
)
@prefill_task
def check_default_blueprints(self: SystemTask):
    """Check for missing default blueprints and ensure they are applied"""
    LOGGER.info("Starting default blueprint validation check")
    
    count_checked = 0
    count_missing = 0
    count_applied = 0
    count_errors = 0
    
    # Get all blueprint files from the filesystem
    all_blueprints = blueprints_find()
    
    # Get all blueprints currently in the database
    db_blueprints = set(BlueprintInstance.objects.values_list('path', flat=True))
    
    LOGGER.info(
        "Blueprint check status", 
        filesystem_blueprints=len(all_blueprints),
        database_blueprints=len(db_blueprints)
    )
    
    for blueprint in all_blueprints:
        count_checked += 1
        
        # Skip if blueprint is marked as not to be instantiated
        if (
            blueprint.meta
            and blueprint.meta.labels.get(LABEL_AUTHENTIK_INSTANTIATE, "").lower() == "false"
        ):
            LOGGER.debug("Skipping blueprint marked as not instantiable", path=blueprint.path)
            continue
        
        # Check if blueprint exists in database
        if blueprint.path not in db_blueprints:
            count_missing += 1
            LOGGER.warning(
                "Default blueprint missing from database, attempting to apply",
                path=blueprint.path,
                blueprint_name=blueprint.meta.name if blueprint.meta else blueprint.path
            )
            
            try:
                # Create blueprint instance
                check_blueprint_v1_file(blueprint)
                count_applied += 1
                LOGGER.info(
                    "Successfully queued missing default blueprint for application",
                    path=blueprint.path,
                    blueprint_name=blueprint.meta.name if blueprint.meta else blueprint.path
                )
            except Exception as exc:
                count_errors += 1
                LOGGER.error(
                    "Failed to apply missing default blueprint",
                    path=blueprint.path,
                    blueprint_name=blueprint.meta.name if blueprint.meta else blueprint.path,
                    error=str(exc),
                    exc_info=True
                )
        else:
            # Blueprint exists, check if it needs to be reapplied
            instance = BlueprintInstance.objects.filter(path=blueprint.path).first()
            if instance and instance.last_applied_hash != blueprint.hash:
                LOGGER.info(
                    "Default blueprint needs update due to file changes",
                    path=blueprint.path,
                    blueprint_name=blueprint.meta.name if blueprint.meta else blueprint.path,
                    instance_id=str(instance.pk)
                )
                try:
                    apply_blueprint.delay(str(instance.pk))
                    count_applied += 1
                except Exception as exc:
                    count_errors += 1
                    LOGGER.error(
                        "Failed to queue blueprint update",
                        path=blueprint.path,
                        instance_id=str(instance.pk),
                        error=str(exc),
                        exc_info=True
                    )
    
    # Log summary
    LOGGER.info(
        "Default blueprint check completed",
        total_checked=count_checked,
        missing_blueprints=count_missing,
        blueprints_applied=count_applied,
        errors=count_errors
    )
    
    if count_errors > 0:
        self.set_status(
            TaskStatus.WARNING,
            _(
                "Blueprint check completed with {errors} errors. "
                "Checked {total} blueprints, found {missing} missing, applied {applied}."
            ).format(
                errors=count_errors,
                total=count_checked,
                missing=count_missing,
                applied=count_applied
            )
        )
    else:
        self.set_status(
            TaskStatus.SUCCESSFUL,
            _(
                "Blueprint check completed successfully. "
                "Checked {total} blueprints, found {missing} missing, applied {applied}."
            ).format(
                total=count_checked,
                missing=count_missing,
                applied=count_applied
            )
        )


@CELERY_APP.task(
    throws=(DatabaseError, ProgrammingError, InternalError), base=SystemTask, bind=True
)
@prefill_task
def blueprints_discovery(self: SystemTask, path: str | None = None):
    """Find blueprints and check if they need to be created in the database"""
    count = 0
    for blueprint in blueprints_find():
        if path and blueprint.path != path:
            continue
        check_blueprint_v1_file(blueprint)
        count += 1
    
    # After discovery, run the default blueprint check
    LOGGER.info("Running default blueprint validation after discovery")
    check_default_blueprints.delay()
    
    self.set_status(
        TaskStatus.SUCCESSFUL, _("Successfully imported {count} files.".format(count=count))
    )


def check_blueprint_v1_file(blueprint: BlueprintFile):
    """Check if blueprint should be imported"""
    instance: BlueprintInstance = BlueprintInstance.objects.filter(path=blueprint.path).first()
    if (
        blueprint.meta
        and blueprint.meta.labels.get(LABEL_AUTHENTIK_INSTANTIATE, "").lower() == "false"
    ):
        return
    if not instance:
        instance = BlueprintInstance(
            name=blueprint.meta.name if blueprint.meta else str(blueprint.path),
            path=blueprint.path,
            context={},
            status=BlueprintInstanceStatus.UNKNOWN,
            enabled=True,
            managed_models=[],
            metadata={},
        )
        instance.save()
        LOGGER.info(
            "Creating new blueprint instance from file", 
            instance=instance, 
            path=instance.path,
            blueprint_name=blueprint.meta.name if blueprint.meta else "unnamed"
        )
    if instance.last_applied_hash != blueprint.hash:
        LOGGER.info(
            "Applying blueprint due to changed file", 
            instance=instance, 
            path=instance.path,
            blueprint_name=blueprint.meta.name if blueprint.meta else "unnamed"
        )
        apply_blueprint.delay(str(instance.pk))


@CELERY_APP.task(
    bind=True,
    base=SystemTask,
)
def apply_blueprint(self: SystemTask, instance_pk: str):
    """Apply single blueprint"""
    self.save_on_success = False
    instance: BlueprintInstance | None = None
    try:
        instance: BlueprintInstance = BlueprintInstance.objects.filter(pk=instance_pk).first()
        if not instance or not instance.enabled:
            LOGGER.warning("Blueprint instance not found or disabled", instance_pk=instance_pk)
            return
        self.set_uid(slugify(instance.name))
        
        LOGGER.info(
            "Starting blueprint application",
            instance=instance,
            path=instance.path,
            blueprint_name=instance.name
        )
        
        blueprint_content = instance.retrieve()
        file_hash = sha512(blueprint_content.encode()).hexdigest()
        importer = Importer.from_string(blueprint_content, instance.context)
        if importer.blueprint.metadata:
            instance.metadata = asdict(importer.blueprint.metadata)
        valid, logs = importer.validate()
        if not valid:
            instance.status = BlueprintInstanceStatus.ERROR
            instance.save()
            LOGGER.error(
                "Blueprint validation failed",
                instance=instance,
                path=instance.path,
                blueprint_name=instance.name,
                validation_logs=logs
            )
            self.set_status(TaskStatus.ERROR, *logs)
            return
        with capture_logs() as logs:
            applied = importer.apply()
            if not applied:
                instance.status = BlueprintInstanceStatus.ERROR
                instance.save()
                LOGGER.error(
                    "Blueprint application failed",
                    instance=instance,
                    path=instance.path,
                    blueprint_name=instance.name,
                    application_logs=logs
                )
                self.set_status(TaskStatus.ERROR, *logs)
                return
        instance.status = BlueprintInstanceStatus.SUCCESSFUL
        instance.last_applied_hash = file_hash
        instance.last_applied = now()
        
        LOGGER.info(
            "Blueprint application successful",
            instance=instance,
            path=instance.path,
            blueprint_name=instance.name,
            file_hash=file_hash[:8]  # Log first 8 chars of hash for reference
        )
        
        self.set_status(TaskStatus.SUCCESSFUL)
    except (
        OSError,
        DatabaseError,
        ProgrammingError,
        InternalError,
        BlueprintRetrievalFailed,
        EntryInvalidError,
    ) as exc:
        if instance:
            instance.status = BlueprintInstanceStatus.ERROR
            LOGGER.error(
                "Blueprint application error",
                instance=instance,
                path=instance.path if instance else "unknown",
                blueprint_name=instance.name if instance else "unknown",
                error=str(exc),
                exc_info=True
            )
        self.set_error(exc)
    finally:
        if instance:
            instance.save()


@CELERY_APP.task()
def clear_failed_blueprints():
    """Remove blueprints which couldn't be fetched"""
    # Exclude OCI blueprints as those might be temporarily unavailable
    count_removed = 0
    for blueprint in BlueprintInstance.objects.exclude(path__startswith=OCI_PREFIX):
        try:
            blueprint.retrieve()
        except BlueprintRetrievalFailed:
            LOGGER.info(
                "Removing failed blueprint that could not be retrieved",
                instance=blueprint,
                path=blueprint.path,
                blueprint_name=blueprint.name
            )
            blueprint.delete()
            count_removed += 1
    
    if count_removed > 0:
        LOGGER.info("Removed failed blueprints", count=count_removed)
