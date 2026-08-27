import { z } from 'zod';

const StrictObject = z.object;

export const FieldKindSchema = z.enum([
  'text', 'email', 'tel', 'number', 'date', 'textarea',
  'select', 'radio_group', 'checkbox',
]);
export type FieldKind = z.infer<typeof FieldKindSchema>;

export const OptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
}).strict();

export const ConstraintsSchema = z.object({
  min: z.string().optional(),
  max: z.string().optional(),
  pattern: z.string().optional(),
  inputMode: z.string().optional(),
}).strict();

export const FieldSchema = z.object({
  fieldId: z.string().min(1),
  kind: FieldKindSchema,
  label: z.string().min(1),
  helpText: z.string().optional(),
  required: z.boolean(),
  disabled: z.boolean(),
  visible: z.boolean(),
  sensitive: z.boolean(),
  currentValue: z.union([z.string(), z.boolean()]).optional(),
  options: z.array(OptionSchema).optional(),
  constraints: ConstraintsSchema.optional(),
  sectionId: z.string().min(1),
}).strict();
export type FieldSchema = z.infer<typeof FieldSchema>;

export const FormSchema = z.object({
  formId: z.string().min(1),
  scanVersion: z.number().int().positive(),
  pageUrl: z.string().url(),
  fields: z.array(FieldSchema),
}).strict();
export type Form = z.infer<typeof FormSchema>;

const FieldAction = z.object({ fieldId: z.string().min(1) }).strict();
const ValueAction = FieldAction.extend({ value: z.string() }).strict();

export const ActionSchema = z.discriminatedUnion('type', [
  ValueAction.extend({ type: z.literal('fill') }),
  ValueAction.extend({ type: z.literal('select') }),
  FieldAction.extend({ type: z.enum(['check', 'uncheck', 'skip', 'clear', 'focus', 'read']) }),
  ValueAction.extend({ type: z.literal('correct') }),
  z.object({ type: z.literal('submit') }).strict(),
]);
export type Action = z.infer<typeof ActionSchema>;

export const ActionPlanSchema = z.object({
  schemaVersion: z.number().int().positive(),
  actions: z.array(ActionSchema).min(1),
}).strict();
export type ActionPlan = z.infer<typeof ActionPlanSchema>;

export const ExecutionResultSchema = z.object({
  success: z.boolean(),
  errorCode: z.string().optional(),
  message: z.string().min(1),
  observedValue: z.union([z.string(), z.boolean()]).optional(),
  nativeValidationMessage: z.string().optional(),
  nextSchema: FormSchema,
}).strict();
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

export const SessionPhaseSchema = z.enum([
  'idle', 'form_detected', 'form_selected', 'awaiting_answer',
  'clarifying', 'executing', 'verifying', 'reviewing_section',
  'awaiting_submit_confirmation', 'submitted', 'cancelled',
]);
export type SessionPhase = z.infer<typeof SessionPhaseSchema>;

export const SessionMetadataSchema = z.object({
  sessionId: z.string().min(1),
  formId: z.string().min(1),
  pageUrl: z.string().url(),
  schemaFingerprint: z.string().min(1),
  phase: SessionPhaseSchema,
  currentGroup: z.string().optional(),
  unresolvedFieldIds: z.array(z.string().min(1)),
}).strict();
export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

export const ProtocolEnvelopeSchema = z.object({
  protocolVersion: z.literal(1),
  sessionId: z.string().min(1),
}).strict();

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  ProtocolEnvelopeSchema.extend({ type: z.literal('start_session') }),
  ProtocolEnvelopeSchema.extend({ type: z.literal('request_schema') }),
  ProtocolEnvelopeSchema.extend({ type: z.literal('schema_result'), schema: FormSchema }),
  ProtocolEnvelopeSchema.extend({ type: z.literal('command'), command: z.string().min(1), schema: FormSchema }),
  ProtocolEnvelopeSchema.extend({ type: z.literal('action_plan'), plan: ActionPlanSchema }),
  ProtocolEnvelopeSchema.extend({ type: z.literal('execute'), formId: z.string().min(1), scanVersion: z.number().int().positive(), plan: ActionPlanSchema }),
  ProtocolEnvelopeSchema.extend({ type: z.literal('execution_result'), result: ExecutionResultSchema }),
  ProtocolEnvelopeSchema.extend({ type: z.literal('cancel_session') }),
]);
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

export { StrictObject };
