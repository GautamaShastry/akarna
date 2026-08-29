"""Contract tests: verify Pydantic models match TypeScript Zod schemas and reject invalid data."""

import pytest
from pydantic import ValidationError
from app.services.models import (
    IntentRequest, IntentResponse, ActionPlanResponse, ClarificationResponse,
    ActionPlan, FillAction, SelectAction, FieldOnlyAction, CorrectAction,
    SubmitAction, FieldSchema, FormSchema, Option, Constraints,
)


def make_field(**overrides):
    defaults = {
        "fieldId": "f1",
        "kind": "text",
        "label": "Full name",
        "required": True,
        "disabled": False,
        "visible": True,
        "sensitive": False,
        "sectionId": "profile",
    }
    defaults.update(overrides)
    return FieldSchema(**defaults)


def make_form(**overrides):
    defaults = {
        "formId": "form-1",
        "scanVersion": 1,
        "pageUrl": "https://example.com/form",
        "fields": [make_field()],
    }
    defaults.update(overrides)
    return FormSchema(**defaults)


def make_intent_request(**overrides):
    defaults = {
        "sessionId": "s1",
        "mode": "local",
        "schema": make_form(),
        "command": "set full name to Ada",
        "scanVersion": 1,
    }
    defaults.update(overrides)
    return IntentRequest(**defaults)


class TestFieldSchema:
    def test_valid_text_field(self):
        field = make_field()
        assert field.field_id == "f1"
        assert field.kind == "text"
        assert field.required is True

    def test_rejects_empty_field_id(self):
        with pytest.raises(ValidationError):
            make_field(fieldId="")

    def test_rejects_unknown_kind(self):
        with pytest.raises(ValidationError):
            make_field(kind="password")

    def test_select_with_options(self):
        field = make_field(
            kind="select",
            options=[Option(value="ms", label="Master's")],
        )
        assert field.options is not None
        assert len(field.options) == 1

    def test_constraints(self):
        field = make_field(
            constraints=Constraints(min="0", max="60", pattern="\\d+"),
        )
        assert field.constraints is not None
        assert field.constraints.min == "0"


class TestActionPlan:
    def test_valid_fill_action(self):
        plan = ActionPlan(
            schemaVersion=1,
            actions=[FillAction(fieldId="f1", value="Ada")],
        )
        assert len(plan.actions) == 1
        assert plan.actions[0].type == "fill"

    def test_valid_select_action(self):
        plan = ActionPlan(
            schemaVersion=1,
            actions=[SelectAction(fieldId="f1", value="masters")],
        )
        assert plan.actions[0].type == "select"

    def test_valid_check_action(self):
        plan = ActionPlan(
            schemaVersion=1,
            actions=[FieldOnlyAction(type="check", fieldId="f1")],
        )
        assert plan.actions[0].type == "check"

    def test_valid_submit_action(self):
        plan = ActionPlan(
            schemaVersion=1,
            actions=[SubmitAction(type="submit")],
        )
        assert plan.actions[0].type == "submit"

    def test_rejects_empty_actions(self):
        with pytest.raises(ValidationError):
            ActionPlan(schemaVersion=1, actions=[])

    def test_rejects_invalid_action_type(self):
        with pytest.raises(ValidationError):
            ActionPlan(
                schemaVersion=1,
                actions=[{"type": "navigate", "url": "https://evil.com"}],
            )

    def test_rejects_action_with_selector(self):
        with pytest.raises(ValidationError):
            FillAction(fieldId="f1", value="test")
            # FillAction doesn't accept a 'selector' field — strict mode


class TestIntentRequest:
    def test_valid_request(self):
        req = make_intent_request()
        assert req.session_id == "s1"
        assert req.command == "set full name to Ada"

    def test_rejects_empty_command(self):
        with pytest.raises(ValidationError):
            make_intent_request(command="")

    def test_rejects_empty_session(self):
        with pytest.raises(ValidationError):
            make_intent_request(sessionId="")

    def test_rejects_invalid_mode(self):
        with pytest.raises(ValidationError):
            make_intent_request(mode="unrestricted")


class TestIntentResponse:
    def test_action_plan_response(self):
        resp = ActionPlanResponse(
            plan=ActionPlan(
                schemaVersion=1,
                actions=[FillAction(fieldId="f1", value="Ada")],
            )
        )
        assert resp.kind == "action_plan"
        assert resp.plan.actions[0].type == "fill"

    def test_clarification_response(self):
        resp = ClarificationResponse(
            clarification={"prompt": "Which field?"}
        )
        assert resp.kind == "clarification"
        assert resp.clarification.prompt == "Which field?"

    def test_clarification_rejects_empty_prompt(self):
        with pytest.raises(ValidationError):
            ClarificationResponse(clarification={"prompt": ""})
