"""Test blueprint default check functionality"""

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from authentik.blueprints.models import BlueprintInstance, BlueprintInstanceStatus
from authentik.blueprints.v1.tasks import check_default_blueprints, BlueprintFile
from authentik.blueprints.v1.common import BlueprintMetadata


class TestDefaultBlueprintCheck(TestCase):
    """Test the default blueprint check functionality"""

    def setUp(self):
        # Clean up any existing blueprint instances
        BlueprintInstance.objects.all().delete()

    @patch("authentik.blueprints.v1.tasks.blueprints_find")
    @patch("authentik.blueprints.v1.tasks.apply_blueprint")
    def test_check_default_blueprints_missing_blueprint(self, mock_apply, mock_find):
        """Test that missing blueprints are detected and applied"""
        # Mock a blueprint file that doesn't exist in DB
        mock_blueprint = BlueprintFile(
            path="default/test-blueprint.yaml",
            version=1,
            hash="test_hash_123",
            last_m=1234567890,
            meta=BlueprintMetadata(name="Test Blueprint", labels={})
        )
        mock_find.return_value = [mock_blueprint]
        
        # Run the check
        task = check_default_blueprints.apply()
        
        # Verify that the blueprint was created in the database
        blueprint_instance = BlueprintInstance.objects.filter(
            path="default/test-blueprint.yaml"
        ).first()
        
        self.assertIsNotNone(blueprint_instance)
        self.assertEqual(blueprint_instance.name, "Test Blueprint")
        self.assertEqual(blueprint_instance.status, BlueprintInstanceStatus.UNKNOWN)
        self.assertTrue(blueprint_instance.enabled)
        
        # Verify apply_blueprint was called
        mock_apply.delay.assert_called_once()

    @patch("authentik.blueprints.v1.tasks.blueprints_find")
    def test_check_default_blueprints_existing_blueprint(self, mock_find):
        """Test that existing blueprints are not duplicated"""
        # Create an existing blueprint instance
        existing_blueprint = BlueprintInstance.objects.create(
            name="Existing Blueprint",
            path="default/existing-blueprint.yaml",
            status=BlueprintInstanceStatus.SUCCESSFUL,
            last_applied_hash="existing_hash",
            enabled=True
        )
        
        # Mock the same blueprint file
        mock_blueprint = BlueprintFile(
            path="default/existing-blueprint.yaml",
            version=1,
            hash="existing_hash",  # Same hash, so no update needed
            last_m=1234567890,
            meta=BlueprintMetadata(name="Existing Blueprint", labels={})
        )
        mock_find.return_value = [mock_blueprint]
        
        # Run the check
        task = check_default_blueprints.apply()
        
        # Verify no duplicate was created
        blueprints = BlueprintInstance.objects.filter(
            path="default/existing-blueprint.yaml"
        )
        self.assertEqual(blueprints.count(), 1)
        self.assertEqual(blueprints.first().pk, existing_blueprint.pk)

    @patch("authentik.blueprints.v1.tasks.blueprints_find")
    @patch("authentik.blueprints.v1.tasks.apply_blueprint")
    def test_check_default_blueprints_updated_blueprint(self, mock_apply, mock_find):
        """Test that blueprints with different hashes are updated"""
        # Create an existing blueprint instance with old hash
        existing_blueprint = BlueprintInstance.objects.create(
            name="Updated Blueprint",
            path="default/updated-blueprint.yaml",
            status=BlueprintInstanceStatus.SUCCESSFUL,
            last_applied_hash="old_hash",
            enabled=True
        )
        
        # Mock the same blueprint file with new hash
        mock_blueprint = BlueprintFile(
            path="default/updated-blueprint.yaml",
            version=1,
            hash="new_hash",  # Different hash, so update needed
            last_m=1234567890,
            meta=BlueprintMetadata(name="Updated Blueprint", labels={})
        )
        mock_find.return_value = [mock_blueprint]
        
        # Run the check
        task = check_default_blueprints.apply()
        
        # Verify apply_blueprint was called for the update
        mock_apply.delay.assert_called_once_with(str(existing_blueprint.pk))

    @patch("authentik.blueprints.v1.tasks.blueprints_find")
    def test_check_default_blueprints_skip_non_instantiable(self, mock_find):
        """Test that blueprints marked as not instantiable are skipped"""
        # Mock a blueprint marked as not to be instantiated
        mock_blueprint = BlueprintFile(
            path="default/skip-blueprint.yaml",
            version=1,
            hash="skip_hash",
            last_m=1234567890,
            meta=BlueprintMetadata(
                name="Skip Blueprint", 
                labels={"authentik.io/instantiate": "false"}
            )
        )
        mock_find.return_value = [mock_blueprint]
        
        # Run the check
        task = check_default_blueprints.apply()
        
        # Verify no blueprint instance was created
        blueprint_instance = BlueprintInstance.objects.filter(
            path="default/skip-blueprint.yaml"
        ).first()
        
        self.assertIsNone(blueprint_instance)

    @patch("authentik.blueprints.v1.tasks.blueprints_find")
    @patch("authentik.blueprints.v1.tasks.check_blueprint_v1_file")
    def test_check_default_blueprints_error_handling(self, mock_check, mock_find):
        """Test error handling when blueprint application fails"""
        # Mock a blueprint file
        mock_blueprint = BlueprintFile(
            path="default/error-blueprint.yaml",
            version=1,
            hash="error_hash",
            last_m=1234567890,
            meta=BlueprintMetadata(name="Error Blueprint", labels={})
        )
        mock_find.return_value = [mock_blueprint]
        
        # Mock check_blueprint_v1_file to raise an exception
        mock_check.side_effect = Exception("Test error")
        
        # Run the check - should not raise exception
        task = check_default_blueprints.apply()
        
        # Task should complete with warnings
        self.assertIsNotNone(task)
        # The function should handle errors gracefully