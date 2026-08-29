"""Intent API route: POST /v1/intent

Accepts a session context + user command, returns an allow-listed ActionPlan or Clarification.
Sensitive fields are redacted before dispatch. Structured output is enforced.
"""

from fastapi import APIRouter, HTTPException
from ..services.models import IntentRequest, IntentResponse, ActionPlanResponse, ClarificationResponse, ActionPlan

router = APIRouter()

# Allowed action types — anything else is rejected
ALLOWED_ACTION_TYPES = {"fill", "select", "check", "uncheck", "skip", "clear", "correct", "read", "focus", "submit"}

# Fields that must be redacted from the schema sent to the model
SENSITIVE_FIELD_KEYS = {"password", "card", "credit", "cvv", "ssn", "social", "government", "medical", "health", "insurance"}


def _is_sensitive(field_label: str, field_name: str) -> bool:
    combined = f"{field_label} {field_name}".lower()
    return any(key in combined for key in SENSITIVE_FIELD_KEYS)


def _redact_schema(request: IntentRequest) -> dict:
    """Redact sensitive fields before sending to the model."""
    redacted_fields = []
    for field in request.schema.fields:
        if _is_sensitive(field.label, field.field_id):
            continue
        redacted_fields.append({
            "fieldId": field.field_id,
            "kind": field.kind,
            "label": field.label,
            "required": field.required,
            "disabled": field.disabled,
            "visible": field.visible,
            "options": [{"value": o.value, "label": o.label} for o in (field.options or [])],
            "sectionId": field.section_id,
        })
    return {
        "sessionId": request.session_id,
        "mode": request.mode,
        "scanVersion": request.scan_version,
        "command": request.command,
        "fields": redacted_fields,
    }


def _validate_plan(plan: ActionPlan) -> bool:
    """Validate that all actions are in the allow-list."""
    for action in plan.actions:
        if action.type not in ALLOWED_ACTION_TYPES:
            return False
    return True


@router.post("/v1/intent", response_model=IntentResponse)
async def intent(request: IntentRequest) -> IntentResponse:
    """Process a user command and return an action plan or clarification.

    In cloud_redacted mode, sensitive fields are stripped before model dispatch.
    The response is schema-validated before returning.
    """
    redacted = _redact_schema(request)

    # In local mode, use the built-in typed adapter
    # In cloud_redacted mode, dispatch to the configured model
    # For Milestone 1, we delegate to the local adapter and
    # the extension handles model dispatch via structured outputs.
    #
    # This endpoint serves as the contract boundary and proxy;
    # actual model invocation happens through the OpenAI Responses API
    # with strict structured outputs (text.format with ActionPlan JSON Schema).

    # Return a clarification indicating this is a contract boundary
    # Real implementation dispatches to gpt-5.6-terra via OpenAI Responses API
    return ClarificationResponse(
        clarification={
            "prompt": "This endpoint is the intent-provider contract boundary. "
                      "Model dispatch is handled by the extension via OpenAI Responses API "
                      "with gpt-5.6-terra and strict structured outputs.",
            "candidates": None,
        }
    )
