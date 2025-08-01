"""Validation stage challenge checking"""

from json import loads
from typing import TYPE_CHECKING
from urllib.parse import urlencode

from django.http import HttpRequest
from django.http.response import Http404
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as __
from django.utils.translation import gettext_lazy as _
from rest_framework.fields import CharField, ChoiceField, DateTimeField
from rest_framework.serializers import ValidationError
from structlog.stdlib import get_logger
from webauthn import options_to_json
from webauthn.authentication.generate_authentication_options import generate_authentication_options
from webauthn.authentication.verify_authentication_response import verify_authentication_response
from webauthn.helpers import parse_authentication_credential_json
from webauthn.helpers.base64url_to_bytes import base64url_to_bytes
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidJSONStructure
from webauthn.helpers.structs import PublicKeyCredentialType, UserVerificationRequirement

from authentik.core.api.utils import JSONDictField, PassiveSerializer
from authentik.core.models import Application, User
from authentik.core.signals import login_failed
from authentik.events.middleware import audit_ignore
from authentik.events.models import Event, EventAction
from authentik.flows.stage import StageView
from authentik.flows.views.executor import SESSION_KEY_APPLICATION_PRE
from authentik.lib.utils.email import mask_email
from authentik.lib.utils.time import timedelta_from_string
from authentik.root.middleware import ClientIPMiddleware
from authentik.stages.authenticator import match_token
from authentik.stages.authenticator.models import Device
from authentik.stages.authenticator_duo.models import AuthenticatorDuoStage, DuoDevice
from authentik.stages.authenticator_email.models import EmailDevice
from authentik.stages.authenticator_sms.models import SMSDevice
from authentik.stages.authenticator_validate.models import AuthenticatorValidateStage, DeviceClasses
from authentik.stages.authenticator_webauthn.models import UserVerification, WebAuthnDevice
from authentik.stages.authenticator_webauthn.stage import PLAN_CONTEXT_WEBAUTHN_CHALLENGE
from authentik.stages.authenticator_webauthn.utils import get_origin, get_rp_id

LOGGER = get_logger()
if TYPE_CHECKING:
    from authentik.stages.authenticator_validate.stage import AuthenticatorValidateStageView


class DeviceChallenge(PassiveSerializer):
    """Single device challenge"""

    device_class = ChoiceField(choices=DeviceClasses.choices)
    device_uid = CharField()
    challenge = JSONDictField()
    last_used = DateTimeField(allow_null=True)


def get_challenge_for_device(
    stage_view: "AuthenticatorValidateStageView", stage: AuthenticatorValidateStage, device: Device
) -> dict:
    """Generate challenge for a single device"""
    if isinstance(device, WebAuthnDevice):
        return get_webauthn_challenge(stage_view, stage, device)
    if isinstance(device, EmailDevice):
        return {"email": mask_email(device.email)}
    # Code-based challenges have no hints
    return {}


def get_webauthn_challenge_without_user(
    stage_view: "AuthenticatorValidateStageView", stage: AuthenticatorValidateStage
) -> dict:
    """Same as `get_webauthn_challenge`, but allows any client device. We can then later check
    who the device belongs to."""
    stage_view.executor.plan.context.pop(PLAN_CONTEXT_WEBAUTHN_CHALLENGE, None)
    authentication_options = generate_authentication_options(
        rp_id=get_rp_id(stage_view.request),
        allow_credentials=[],
        user_verification=UserVerificationRequirement(stage.webauthn_user_verification),
    )
    stage_view.executor.plan.context[PLAN_CONTEXT_WEBAUTHN_CHALLENGE] = (
        authentication_options.challenge
    )

    return loads(options_to_json(authentication_options))


def get_webauthn_challenge(
    stage_view: "AuthenticatorValidateStageView",
    stage: AuthenticatorValidateStage,
    device: WebAuthnDevice | None = None,
) -> dict:
    """Send the client a challenge that we'll check later"""
    stage_view.executor.plan.context.pop(PLAN_CONTEXT_WEBAUTHN_CHALLENGE, None)

    allowed_credentials = []

    if device:
        # We want all the user's WebAuthn devices and merge their challenges
        for user_device in WebAuthnDevice.objects.filter(user=device.user).order_by("name"):
            user_device: WebAuthnDevice
            allowed_credentials.append(user_device.descriptor)

    authentication_options = generate_authentication_options(
        rp_id=get_rp_id(stage_view.request),
        allow_credentials=allowed_credentials,
        user_verification=UserVerificationRequirement(stage.webauthn_user_verification),
    )

    stage_view.executor.plan.context[PLAN_CONTEXT_WEBAUTHN_CHALLENGE] = (
        authentication_options.challenge
    )

    return loads(options_to_json(authentication_options))


def select_challenge(request: HttpRequest, device: Device):
    """Callback when the user selected a challenge in the frontend."""
    if isinstance(device, SMSDevice):
        select_challenge_sms(request, device)
    elif isinstance(device, EmailDevice):
        select_challenge_email(request, device)


def select_challenge_sms(request: HttpRequest, device: SMSDevice):
    """Send SMS"""
    device.generate_token()
    device.stage.send(request, device.token, device)


def select_challenge_email(request: HttpRequest, device: EmailDevice):
    """Send Email"""
    valid_secs: int = timedelta_from_string(device.stage.token_expiry).total_seconds()
    device.generate_token(valid_secs=valid_secs)
    device.stage.send(device)


def validate_challenge_code(code: str, stage_view: StageView, user: User) -> Device:
    """Validate code-based challenges. We test against every device, on purpose, as
    the user mustn't choose between totp and static devices."""
    device = match_token(user, code)
    if not device:
        login_failed.send(
            sender=__name__,
            credentials={"username": user.username},
            request=stage_view.request,
            stage=stage_view.executor.current_stage,
            device_class=DeviceClasses.TOTP.value,
        )
        raise ValidationError(
            _("Invalid Token. Please ensure the time on your device is accurate and try again.")
        )
    return device


def validate_challenge_webauthn(data: dict, stage_view: StageView, user: User) -> Device:
    """Validate WebAuthn Challenge"""
    request = stage_view.request
    challenge = stage_view.executor.plan.context.get(PLAN_CONTEXT_WEBAUTHN_CHALLENGE)
    stage: AuthenticatorValidateStage = stage_view.executor.current_stage
    if "MinuteMaid" in request.META.get("HTTP_USER_AGENT", ""):
        # Workaround for Android sign-in, when signing into Google Workspace on android while
        # adding the account to the system (not in Chrome), for some reason `type` is not set
        # so in that case we fall back to `public-key`
        # since that's the only option we support anyways
        data.setdefault("type", PublicKeyCredentialType.PUBLIC_KEY)
    try:
        credential = parse_authentication_credential_json(data)
    except InvalidJSONStructure as exc:
        LOGGER.warning("Invalid WebAuthn challenge response", exc=exc)
        raise ValidationError("Invalid device", "invalid") from None

    device = WebAuthnDevice.objects.filter(credential_id=credential.id).first()
    if not device:
        raise ValidationError("Invalid device", "invalid")
    # We can only check the device's user if the user we're given isn't anonymous
    # as this validation is also used for password-less login where webauthn is the very first
    # step done by a user. Only if this validation happens at a later stage we can check
    # that the device belongs to the user
    if not user.is_anonymous and device.user != user:
        raise ValidationError("Invalid device", "invalid")
    # When a device_type was set when creating the device (2024.4+), and we have a limitation,
    # make sure the device type is allowed.
    if (
        device.device_type
        and stage.webauthn_allowed_device_types.exists()
        and not stage.webauthn_allowed_device_types.filter(pk=device.device_type.pk).exists()
    ):
        raise ValidationError(
            _(
                "Invalid device type. Contact your {brand} administrator for help.".format(
                    brand=stage_view.request.brand.branding_title
                )
            ),
            "invalid",
        )
    try:
        authentication_verification = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=get_rp_id(request),
            expected_origin=get_origin(request),
            credential_public_key=base64url_to_bytes(device.public_key),
            credential_current_sign_count=device.sign_count,
            require_user_verification=stage.webauthn_user_verification == UserVerification.REQUIRED,
        )
    except InvalidAuthenticationResponse as exc:
        LOGGER.warning("Assertion failed", exc=exc)
        login_failed.send(
            sender=__name__,
            credentials={"username": user.username},
            request=stage_view.request,
            stage=stage_view.executor.current_stage,
            device=device,
            device_class=DeviceClasses.WEBAUTHN.value,
            device_type=device.device_type,
        )
        raise ValidationError("Assertion failed") from exc

    with audit_ignore():
        device.set_sign_count(authentication_verification.new_sign_count)
    return device


def validate_challenge_duo(device_pk: int, stage_view: StageView, user: User) -> Device:
    """Duo authentication"""
    device = get_object_or_404(DuoDevice, pk=device_pk)
    if device.user != user:
        LOGGER.warning("device mismatch")
        raise Http404
    stage: AuthenticatorDuoStage = device.stage

    # Get additional context for push
    pushinfo = {
        __("Domain"): stage_view.request.get_host(),
    }
    if SESSION_KEY_APPLICATION_PRE in stage_view.request.session:
        pushinfo[__("Application")] = stage_view.request.session.get(
            SESSION_KEY_APPLICATION_PRE, Application()
        ).name

    try:
        response = stage.auth_client().auth(
            "auto",
            user_id=device.duo_user_id,
            ipaddr=ClientIPMiddleware.get_client_ip(stage_view.request),
            type=__(
                "{brand_name} Login request".format_map(
                    {
                        "brand_name": stage_view.request.brand.branding_title,
                    }
                )
            ),
            display_username=user.username,
            device="auto",
            pushinfo=urlencode(pushinfo),
        )
        # {'result': 'allow', 'status': 'allow', 'status_msg': 'Success. Logging you in...'}
        if response["result"] == "deny":
            LOGGER.debug("duo push response", result=response["result"], msg=response["status_msg"])
            login_failed.send(
                sender=__name__,
                credentials={"username": user.username},
                request=stage_view.request,
                stage=stage_view.executor.current_stage,
                device_class=DeviceClasses.DUO.value,
                duo_response=response,
            )
            raise ValidationError("Duo denied access", code="denied")
        return device
    except RuntimeError as exc:
        Event.new(
            EventAction.CONFIGURATION_ERROR,
            message=f"Failed to DUO authenticate user: {str(exc)}",
            user=user,
        ).from_http(stage_view.request, user)
        raise ValidationError("Duo denied access", code="denied") from exc
