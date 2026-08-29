"""Pydantic models matching the TypeScript Zod contracts in packages/contracts/src/index.ts."""

from pydantic import BaseModel, Field


class Option(BaseModel):
    value: str = Field(min_length=1)
    label: str = Field(min_length=1)


class Constraints(BaseModel):
    min: str | None = None
    max: str | None = None
    pattern: str | None = None
    input_mode: str | None = Field(None, alias="inputMode")


class FieldSchema(BaseModel):
    field_id: str = Field(min_length=1, alias="fieldId")
    kind: str  # text | email | tel | number | date | textarea | select | radio_group | checkbox
    label: str = Field(min_length=1)
    help_text: str | None = Field(None, alias="helpText")
    required: bool
    disabled: bool
    visible: bool
    sensitive: bool
    current_value: str | bool | None = Field(None, alias="currentValue")
    options: list[Option] | None = None
    constraints: Constraints | None = None
    section_id: str = Field(min_length=1, alias="sectionId")

    model_config = {"populate_by_name": True}


class FormSchema(BaseModel):
    form_id: str = Field(min_length=1, alias="formId")
    scan_version: int = Field(gt=0, alias="scanVersion")
    page_url: str = Field(alias="pageUrl")
    fields: list[FieldSchema]

    model_config = {"populate_by_name": True}


# --- Actions ---

class FillAction(BaseModel):
    type: str = "fill"
    field_id: str = Field(min_length=1, alias="fieldId")
    value: str

    model_config = {"populate_by_name": True}


class SelectAction(BaseModel):
    type: str = "select"
    field_id: str = Field(min_length=1, alias="fieldId")
    value: str

    model_config = {"populate_by_name": True}


class FieldOnlyAction(BaseModel):
    type: str  # check | uncheck | skip | clear | focus | read
    field_id: str = Field(min_length=1, alias="fieldId")

    model_config = {"populate_by_name": True}


class CorrectAction(BaseModel):
    type: str = "correct"
    field_id: str = Field(min_length=1, alias="fieldId")
    value: str

    model_config = {"populate_by_name": True}


class SubmitAction(BaseModel):
    type: str = "submit"


Action = FillAction | SelectAction | FieldOnlyAction | CorrectAction | SubmitAction


class ActionPlan(BaseModel):
    schema_version: int = Field(gt=0, alias="schemaVersion")
    actions: list[Action] = Field(min_length=1)

    model_config = {"populate_by_name": True}


# --- Clarification ---

class Clarification(BaseModel):
    prompt: str = Field(min_length=1)
    candidates: list[str] | None = None


# --- Request/Response ---

class IntentRequest(BaseModel):
    session_id: str = Field(min_length=1, alias="sessionId")
    mode: str  # local | cloud_redacted
    schema: FormSchema
    command: str = Field(min_length=1)
    scan_version: int = Field(gt=0, alias="scanVersion")

    model_config = {"populate_by_name": True}


class ActionPlanResponse(BaseModel):
    kind: str = "action_plan"
    plan: ActionPlan


class ClarificationResponse(BaseModel):
    kind: str = "clarification"
    clarification: Clarification


IntentResponse = ActionPlanResponse | ClarificationResponse
