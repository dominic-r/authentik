"""SAMLProvider API Views"""

from copy import copy
from xml.etree.ElementTree import ParseError  # nosec

from defusedxml.ElementTree import fromstring
from django.http import HttpRequest
from django.http.response import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from guardian.shortcuts import get_objects_for_user
from rest_framework.decorators import action
from rest_framework.fields import CharField, FileField, SerializerMethodField
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import PrimaryKeyRelatedField, ValidationError
from rest_framework.viewsets import ModelViewSet
from structlog.stdlib import get_logger

from authentik.core.api.providers import ProviderSerializer
from authentik.core.api.used_by import UsedByMixin
from authentik.core.api.utils import PassiveSerializer, PropertyMappingPreviewSerializer
from authentik.core.models import Provider
from authentik.flows.models import Flow, FlowDesignation
from authentik.providers.saml.models import SAMLProvider
from authentik.providers.saml.processors.assertion import AssertionProcessor
from authentik.providers.saml.processors.authn_request_parser import AuthNRequest
from authentik.providers.saml.processors.metadata import MetadataProcessor
from authentik.providers.saml.processors.metadata_parser import ServiceProviderMetadataParser
from authentik.rbac.decorators import permission_required
from authentik.sources.saml.processors.constants import SAML_BINDING_POST, SAML_BINDING_REDIRECT

LOGGER = get_logger()


class RawXMLDataRenderer(BaseRenderer):
    """Renderer to allow application/xml as value for 'Accept' in the metadata endpoint."""

    media_type = "application/xml"
    format = "xml"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class SAMLProviderSerializer(ProviderSerializer):
    """SAMLProvider Serializer"""

    url_download_metadata = SerializerMethodField()

    url_sso_post = SerializerMethodField()
    url_sso_redirect = SerializerMethodField()
    url_sso_init = SerializerMethodField()
    url_slo_post = SerializerMethodField()
    url_slo_redirect = SerializerMethodField()

    def get_url_download_metadata(self, instance: SAMLProvider) -> str:
        """Get metadata download URL"""
        if "request" not in self._context:
            return ""
        request: HttpRequest = self._context["request"]._request
        try:
            return request.build_absolute_uri(
                reverse(
                    "authentik_providers_saml:metadata-download",
                    kwargs={"application_slug": instance.application.slug},
                )
            )
        except Provider.application.RelatedObjectDoesNotExist:
            return request.build_absolute_uri(
                reverse(
                    "authentik_api:samlprovider-metadata",
                    kwargs={
                        "pk": instance.pk,
                    },
                )
                + "?download"
            )

    def get_url_sso_post(self, instance: SAMLProvider) -> str:
        """Get SSO Post URL"""
        if "request" not in self._context:
            return ""
        request: HttpRequest = self._context["request"]._request
        try:
            return request.build_absolute_uri(
                reverse(
                    "authentik_providers_saml:sso-post",
                    kwargs={"application_slug": instance.application.slug},
                )
            )
        except Provider.application.RelatedObjectDoesNotExist:
            return "-"

    def get_url_sso_redirect(self, instance: SAMLProvider) -> str:
        """Get SSO Redirect URL"""
        if "request" not in self._context:
            return ""
        request: HttpRequest = self._context["request"]._request
        try:
            return request.build_absolute_uri(
                reverse(
                    "authentik_providers_saml:sso-redirect",
                    kwargs={"application_slug": instance.application.slug},
                )
            )
        except Provider.application.RelatedObjectDoesNotExist:
            return "-"

    def get_url_sso_init(self, instance: SAMLProvider) -> str:
        """Get SSO IDP-Initiated URL"""
        if "request" not in self._context:
            return ""
        request: HttpRequest = self._context["request"]._request
        try:
            return request.build_absolute_uri(
                reverse(
                    "authentik_providers_saml:sso-init",
                    kwargs={"application_slug": instance.application.slug},
                )
            )
        except Provider.application.RelatedObjectDoesNotExist:
            return "-"

    def get_url_slo_post(self, instance: SAMLProvider) -> str:
        """Get SLO POST URL"""
        if "request" not in self._context:
            return ""
        request: HttpRequest = self._context["request"]._request
        try:
            return request.build_absolute_uri(
                reverse(
                    "authentik_providers_saml:slo-post",
                    kwargs={"application_slug": instance.application.slug},
                )
            )
        except Provider.application.RelatedObjectDoesNotExist:
            return "-"

    def get_url_slo_redirect(self, instance: SAMLProvider) -> str:
        """Get SLO redirect URL"""
        if "request" not in self._context:
            return ""
        request: HttpRequest = self._context["request"]._request
        try:
            return request.build_absolute_uri(
                reverse(
                    "authentik_providers_saml:slo-redirect",
                    kwargs={"application_slug": instance.application.slug},
                )
            )
        except Provider.application.RelatedObjectDoesNotExist:
            return "-"

    def validate(self, attrs: dict):
        if attrs.get("signing_kp"):
            if not attrs.get("sign_assertion") and not attrs.get("sign_response"):
                raise ValidationError(
                    _(
                        "With a signing keypair selected, at least one of 'Sign assertion' "
                        "and 'Sign Response' must be selected."
                    )
                )
        return super().validate(attrs)

    class Meta:
        model = SAMLProvider
        fields = ProviderSerializer.Meta.fields + [
            "acs_url",
            "audience",
            "issuer",
            "assertion_valid_not_before",
            "assertion_valid_not_on_or_after",
            "session_valid_not_on_or_after",
            "property_mappings",
            "name_id_mapping",
            "authn_context_class_ref_mapping",
            "digest_algorithm",
            "signature_algorithm",
            "signing_kp",
            "verification_kp",
            "encryption_kp",
            "sign_assertion",
            "sign_response",
            "sp_binding",
            "default_relay_state",
            "url_download_metadata",
            "url_sso_post",
            "url_sso_redirect",
            "url_sso_init",
            "url_slo_post",
            "url_slo_redirect",
        ]
        extra_kwargs = ProviderSerializer.Meta.extra_kwargs


class SAMLMetadataSerializer(PassiveSerializer):
    """SAML Provider Metadata serializer"""

    metadata = CharField(read_only=True)
    download_url = CharField(read_only=True, required=False)


class SAMLProviderImportSerializer(PassiveSerializer):
    """Import saml provider from XML Metadata"""

    name = CharField(required=True)
    authorization_flow = PrimaryKeyRelatedField(
        queryset=Flow.objects.filter(designation=FlowDesignation.AUTHORIZATION),
    )
    invalidation_flow = PrimaryKeyRelatedField(
        queryset=Flow.objects.filter(designation=FlowDesignation.INVALIDATION),
    )
    file = FileField()


class SAMLProviderViewSet(UsedByMixin, ModelViewSet):
    """SAMLProvider Viewset"""

    queryset = SAMLProvider.objects.all()
    serializer_class = SAMLProviderSerializer
    filterset_fields = "__all__"
    ordering = ["name"]
    search_fields = ["name"]

    @extend_schema(
        responses={
            200: SAMLMetadataSerializer(many=False),
            404: OpenApiResponse(description="Provider has no application assigned"),
        },
        parameters=[
            OpenApiParameter(
                name="download",
                location=OpenApiParameter.QUERY,
                type=OpenApiTypes.BOOL,
            ),
            OpenApiParameter(
                name="force_binding",
                location=OpenApiParameter.QUERY,
                type=OpenApiTypes.STR,
                enum=[
                    SAML_BINDING_REDIRECT,
                    SAML_BINDING_POST,
                ],
                description="Optionally force the metadata to only include one binding.",
            ),
            # Explicitly excluded, because otherwise spectacular automatically
            # add it when using multiple renderer_classes
            OpenApiParameter(
                name="format",
                exclude=True,
                required=False,
            ),
        ],
    )
    @action(
        methods=["GET"],
        detail=True,
        permission_classes=[AllowAny],
        renderer_classes=[JSONRenderer, RawXMLDataRenderer],
    )
    def metadata(self, request: Request, pk: int) -> Response:
        """Return metadata as XML string"""
        # We don't use self.get_object() on purpose as this view is un-authenticated
        try:
            provider = get_object_or_404(SAMLProvider, pk=pk)
        except ValueError:
            raise Http404 from None
        try:
            proc = MetadataProcessor(provider, request)
            proc.force_binding = request.query_params.get("force_binding", None)
            metadata = proc.build_entity_descriptor()
            if "download" in request.query_params:
                response = HttpResponse(metadata, content_type="application/xml")
                response["Content-Disposition"] = (
                    f'attachment; filename="{provider.name}_authentik_meta.xml"'
                )
                return response
            return Response({"metadata": metadata}, content_type="application/json")
        except Provider.application.RelatedObjectDoesNotExist:
            return Response({"metadata": ""}, content_type="application/json")

    @permission_required(
        None,
        [
            "authentik_providers_saml.add_samlprovider",
            "authentik_crypto.add_certificatekeypair",
        ],
    )
    @extend_schema(
        request={
            "multipart/form-data": SAMLProviderImportSerializer,
        },
        responses={
            204: OpenApiResponse(description="Successfully imported provider"),
            400: OpenApiResponse(description="Bad request"),
        },
    )
    @action(detail=False, methods=["POST"], parser_classes=(MultiPartParser,))
    def import_metadata(self, request: Request) -> Response:
        """Create provider from SAML Metadata"""
        data = SAMLProviderImportSerializer(data=request.data)
        if not data.is_valid():
            raise ValidationError(data.errors)
        file = data.validated_data["file"]
        # Validate syntax first
        try:
            fromstring(file.read())
        except ParseError:
            raise ValidationError(_("Invalid XML Syntax")) from None
        file.seek(0)
        try:
            metadata = ServiceProviderMetadataParser().parse(file.read().decode())
            metadata.to_provider(
                data.validated_data["name"],
                data.validated_data["authorization_flow"],
                data.validated_data["invalidation_flow"],
            )
        except ValueError as exc:  # pragma: no cover
            LOGGER.warning(str(exc))
            raise ValidationError(
                _("Failed to import Metadata: {messages}".format_map({"messages": str(exc)})),
            ) from None
        return Response(status=204)

    @permission_required(
        "authentik_providers_saml.view_samlprovider",
    )
    @extend_schema(
        responses={
            200: PropertyMappingPreviewSerializer(),
            400: OpenApiResponse(description="Bad request"),
        },
        parameters=[
            OpenApiParameter(
                name="for_user",
                location=OpenApiParameter.QUERY,
                type=OpenApiTypes.INT,
            )
        ],
    )
    @action(detail=True, methods=["GET"])
    def preview_user(self, request: Request, pk: int) -> Response:
        """Preview user data for provider"""
        provider: SAMLProvider = self.get_object()
        for_user = request.user
        if "for_user" in request.query_params:
            try:
                for_user = (
                    get_objects_for_user(request.user, "authentik_core.preview_user")
                    .filter(pk=request.query_params.get("for_user"))
                    .first()
                )
                if not for_user:
                    raise ValidationError({"for_user": "User not found"})
            except ValueError:
                raise ValidationError({"for_user": "input must be numerical"}) from None

        new_request = copy(request._request)
        new_request.user = for_user

        processor = AssertionProcessor(provider, new_request, AuthNRequest())
        attributes = processor.get_attributes()
        name_id = processor.get_name_id()
        data = []
        for attribute in attributes:
            item = {"Value": []}
            item.update(attribute.attrib)
            for value in attribute:
                item["Value"].append(value.text)
            data.append(item)
        serializer = PropertyMappingPreviewSerializer(
            instance={"preview": {"attributes": data, "nameID": name_id.text}}
        )
        return Response(serializer.data)
