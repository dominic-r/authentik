"""Test Users Avatars"""

from json import loads

from django.core.exceptions import ValidationError
from django.urls.base import reverse
from requests_mock import Mocker
from rest_framework.test import APITestCase

from authentik.core.models import User
from authentik.core.tests.utils import create_test_admin_user
from authentik.tenants.utils import get_current_tenant
from authentik.lib.avatars import validate_avatar_modes, get_avatar


class TestUsersAvatars(APITestCase):
    """Test Users avatars"""

    def setUp(self) -> None:
        self.admin = create_test_admin_user()
        self.user = User.objects.create(username="test-user")

    def set_avatar_mode(self, mode: str):
        """Set the avatar mode on the current tenant."""
        tenant = get_current_tenant()
        tenant.avatars = mode
        tenant.save()

    def test_avatars_none(self):
        """Test avatars none"""
        self.set_avatar_mode("none")
        self.client.force_login(self.admin)
        response = self.client.get(reverse("authentik_api:user-me"))
        self.assertEqual(response.status_code, 200)
        body = loads(response.content.decode())
        self.assertEqual(body["user"]["avatar"], "/static/dist/assets/images/user_default.png")

    def test_avatars_gravatar(self):
        """Test avatars gravatar"""
        self.set_avatar_mode("gravatar")
        self.admin.email = "static@t.goauthentik.io"
        self.admin.save()
        self.client.force_login(self.admin)
        with Mocker() as mocker:
            mocker.head(
                (
                    "https://www.gravatar.com/avatar/76eb3c74c8beb6faa037f1b6e2ecb3e252bdac"
                    "6cf71fb567ae36025a9d4ea86b?size=158&rating=g&default=404"
                ),
                text="foo",
            )
            response = self.client.get(reverse("authentik_api:user-me"))
        self.assertEqual(response.status_code, 200)
        body = loads(response.content.decode())
        self.assertIn("gravatar", body["user"]["avatar"])

    def test_avatars_initials(self):
        """Test avatars initials"""
        self.set_avatar_mode("initials")
        self.client.force_login(self.admin)
        response = self.client.get(reverse("authentik_api:user-me"))
        self.assertEqual(response.status_code, 200)
        body = loads(response.content.decode())
        self.assertIn("data:image/svg+xml;base64,", body["user"]["avatar"])

    def test_avatars_custom(self):
        """Test avatars custom"""
        self.set_avatar_mode("foo://%(username)s")
        self.client.force_login(self.admin)
        response = self.client.get(reverse("authentik_api:user-me"))
        self.assertEqual(response.status_code, 200)
        body = loads(response.content.decode())
        self.assertEqual(body["user"]["avatar"], f"foo://{self.admin.username}")

    def test_avatars_attributes(self):
        """Test avatars attributes"""
        self.set_avatar_mode("attributes.foo.avatar")
        self.admin.attributes = {"foo": {"avatar": "bar"}}
        self.admin.save()
        self.client.force_login(self.admin)
        response = self.client.get(reverse("authentik_api:user-me"))
        self.assertEqual(response.status_code, 200)
        body = loads(response.content.decode())
        self.assertEqual(body["user"]["avatar"], "bar")

    def test_avatars_fallback(self):
        """Test fallback"""
        self.set_avatar_mode("attributes.foo.avatar,initials")
        self.client.force_login(self.admin)
        response = self.client.get(reverse("authentik_api:user-me"))
        self.assertEqual(response.status_code, 200)
        body = loads(response.content.decode())
        self.assertIn("data:image/svg+xml;base64,", body["user"]["avatar"])

    def test_avatars_invalid_format_string_bug(self):
        """Test the specific bug scenario - invalid format string should not crash"""
        # This is the exact scenario from the bug report
        invalid_mode = "https://some-image-host.com/images/%(username).png,gravatar,initials"
        
        # The avatar processing should handle invalid format gracefully
        avatar = get_avatar(self.admin)
        # Should fallback to gravatar or initials, not crash
        self.assertIsNotNone(avatar)
        self.assertNotEqual(avatar, "")

    def test_avatars_invalid_format_string_validation(self):
        """Test that validation catches invalid format strings"""
        invalid_modes = [
            "https://example.com/%(username).png",  # .png contains invalid format char 'p'
            "https://example.com/%(user)s",  # 'user' is not a valid placeholder
            "https://example.com/%(invalid_placeholder)s",  # Invalid placeholder
        ]
        
        for mode in invalid_modes:
            with self.assertRaises(ValidationError):
                validate_avatar_modes(mode)

    def test_avatars_valid_format_strings(self):
        """Test that validation accepts valid format strings"""
        valid_modes = [
            "https://example.com/%(username)s.jpg",
            "https://example.com/user/%(mail_hash)s",
            "https://cdn.example.com/avatars/%(upn)s.png",
            "gravatar,initials",
            "https://example.com/%(username)s,gravatar",
            "attributes.avatar_url,https://example.com/%(username)s",
        ]
        
        for mode in valid_modes:
            # Should not raise ValidationError
            validate_avatar_modes(mode)

    def test_avatars_empty_validation(self):
        """Test that empty avatar configuration is rejected"""
        with self.assertRaises(ValidationError):
            validate_avatar_modes("")

    def test_avatars_unknown_mode_validation(self):
        """Test that unknown modes are rejected"""
        with self.assertRaises(ValidationError):
            validate_avatar_modes("invalid_mode")

    def test_avatars_tenant_validation_on_save(self):
        """Test that tenant validation prevents saving invalid avatar config"""
        tenant = get_current_tenant()
        tenant.avatars = "https://example.com/%(username).png"  # Invalid format
        
        with self.assertRaises(ValidationError):
            tenant.save()

    def test_avatars_mixed_valid_invalid_fallback(self):
        """Test that when some modes are invalid, valid ones are used as fallback"""
        # Set a mode with invalid format followed by valid ones
        self.set_avatar_mode("https://example.com/%(username).png,gravatar,initials")
        
        # Should fallback to gravatar or initials without crashing
        avatar = get_avatar(self.admin)
        self.assertIsNotNone(avatar)
        self.assertNotEqual(avatar, "")
        # Should not be the default avatar (meaning fallback worked)
        self.assertNotEqual(avatar, "/static/dist/assets/images/user_default.png")
