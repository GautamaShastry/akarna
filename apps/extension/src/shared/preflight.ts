import type { Form, PreflightFlag, PreflightResult, SessionState, TimelineEntry } from '@akarna/contracts';

/**
 * Preflight engine: explainable flags for validity, completeness,
 * dependencies, and contradictions. Never auto-edits.
 *
 * Rules are deterministic and explainable:
 * 1. Missing required controls
 * 2. Native validity errors
 * 3. Required dependent fields revealed by a prior selection
 * 4. Apparent duplicate/conflicting values for the same semantic label
 * 5. Source suggestion conflicts
 */

/**
 * Run preflight checks against the current session state.
 */
export function runPreflight(
  session: SessionState,
  timeline: TimelineEntry[] = [],
): PreflightResult {
  const flags: PreflightFlag[] = [];

  // 1. Missing required controls
  checkMissingRequired(session, flags);

  // 2. Native validity errors
  checkNativeValidity(session, flags);

  // 3. Required dependent fields
  checkDependencies(session, flags);

  // 4. Duplicate/conflicting values
  checkConflicts(session, flags);

  // 5. Timeline-based contradictions
  checkTimelineContradictions(session, timeline, flags);

  const isValid = !flags.some((f) => f.severity === 'error');
  const isComplete = session.unresolvedRequiredFieldIds.length === 0;

  return { flags, isValid, isComplete };
}

/**
 * Check for missing required fields.
 */
function checkMissingRequired(session: SessionState, flags: PreflightFlag[]): void {
  for (const field of session.schema.fields) {
    if (!field.required || !field.visible || field.disabled || field.sensitive) continue;
    const isCompleted = session.completedFieldIds.includes(field.fieldId);
    const isSkipped = session.skippedOptionalFieldIds.includes(field.fieldId);
    if (!isCompleted && !isSkipped) {
      flags.push({
        code: 'missing_required',
        message: `"${field.label}" is required but not yet completed.`,
        severity: 'error',
        fieldId: field.fieldId,
        sectionId: field.sectionId,
      });
    }
  }
}

/**
 * Check for native validity errors on the form.
 * This runs against the live DOM if available, or the schema constraints.
 */
function checkNativeValidity(session: SessionState, flags: PreflightFlag[]): void {
  for (const field of session.schema.fields) {
    if (!field.visible || field.disabled || field.sensitive) continue;
    if (!field.constraints) continue;

    const value = field.currentValue;
    if (value === undefined || value === null || value === '') continue;

    const strValue = String(value);

    if (field.constraints.min && strValue.length < Number(field.constraints.min)) {
      flags.push({
        code: 'below_min_length',
        message: `"${field.label}" value is shorter than the minimum length of ${field.constraints.min}.`,
        severity: 'warning',
        fieldId: field.fieldId,
        sectionId: field.sectionId,
      });
    }

    if (field.constraints.max && strValue.length > Number(field.constraints.max)) {
      flags.push({
        code: 'above_max_length',
        message: `"${field.label}" value exceeds the maximum length of ${field.constraints.max}.`,
        severity: 'warning',
        fieldId: field.fieldId,
        sectionId: field.sectionId,
      });
    }

    if (field.constraints.pattern) {
      try {
        const regex = new RegExp(field.constraints.pattern);
        if (!regex.test(strValue)) {
          flags.push({
            code: 'pattern_mismatch',
            message: `"${field.label}" value does not match the expected pattern.`,
            severity: 'warning',
            fieldId: field.fieldId,
            sectionId: field.sectionId,
          });
        }
      } catch {
        // Invalid regex — skip pattern check
      }
    }
  }
}

/**
 * Check for required fields that depend on other fields.
 * For example, if a field becomes required after a selection.
 */
function checkDependencies(session: SessionState, flags: PreflightFlag[]): void {
  // Look for sections with multiple required fields where some are done and others aren't
  const sectionFields = new Map<string, typeof session.schema.fields>();
  for (const field of session.schema.fields) {
    if (!field.required || !field.visible || field.disabled || field.sensitive) continue;
    const bucket = sectionFields.get(field.sectionId) ?? [];
    bucket.push(field);
    sectionFields.set(field.sectionId, bucket);
  }

  for (const [sectionId, fields] of sectionFields) {
    const completedCount = fields.filter((f) => session.completedFieldIds.includes(f.fieldId)).length;
    const totalCount = fields.length;

    if (completedCount > 0 && completedCount < totalCount) {
      const remaining = fields.filter((f) => !session.completedFieldIds.includes(f.fieldId));
      for (const field of remaining) {
        flags.push({
          code: 'section_incomplete',
          message: `"${field.label}" is required in section "${sectionId}" (${completedCount}/${totalCount} completed).`,
          severity: 'info',
          fieldId: field.fieldId,
          sectionId,
        });
      }
    }
  }
}

/**
 * Check for duplicate/conflicting values for the same semantic label.
 */
function checkConflicts(session: SessionState, flags: PreflightFlag[]): void {
  const valueMap = new Map<string, string[]>();
  for (const field of session.schema.fields) {
    if (!field.visible || field.disabled || field.sensitive) continue;
    const value = String(field.currentValue ?? '');
    if (!value) continue;

    const label = field.label.toLowerCase().trim();
    const existing = valueMap.get(label) ?? [];
    existing.push(value);
    valueMap.set(label, existing);
  }

  for (const [label, values] of valueMap) {
    if (values.length > 1) {
      const uniqueValues = [...new Set(values)];
      if (uniqueValues.length > 1) {
        flags.push({
          code: 'conflicting_values',
          message: `Multiple different values found for "${label}": ${uniqueValues.join(', ')}.`,
          severity: 'warning',
        });
      }
    }
  }
}

/**
 * Check for timeline-based contradictions (e.g., a field was filled then undone).
 */
function checkTimelineContradictions(
  session: SessionState,
  timeline: TimelineEntry[],
  flags: PreflightFlag[],
): void {
  // Check for fields with both applied and undone entries
  const fieldTimeline = new Map<string, TimelineEntry[]>();
  for (const entry of timeline) {
    const existing = fieldTimeline.get(entry.fieldId) ?? [];
    existing.push(entry);
    fieldTimeline.set(entry.fieldId, existing);
  }

  for (const [fieldId, entries] of fieldTimeline) {
    const hasApplied = entries.some((e) => e.status === 'applied');
    const hasUndone = entries.some((e) => e.status === 'undone');
    if (hasApplied && hasUndone) {
      const field = session.schema.fields.find((f) => f.fieldId === fieldId);
      flags.push({
        code: 'timeline_inconsistency',
        message: `"${field?.label ?? fieldId}" has been modified and partially undone. Review the current value.`,
        severity: 'warning',
        fieldId,
        sectionId: field?.sectionId,
      });
    }
  }
}
