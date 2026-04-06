/**
 * Parse validation errors from API responses
 * Handles Pydantic validation error format:
 * {
 *   "detail": [
 *     { "type": "value_error", "loc": ["body", "field"], "msg": "Error message", ... },
 *     ...
 *   ]
 * }
 */
export function parseApiError(data) {
  // If it's a validation error array (Pydantic format)
  if (Array.isArray(data.detail)) {
    const errors = data.detail.map((err) => {
      // Extract the field name from loc array (usually ["body", "fieldname"])
      const fieldName = err.loc ? err.loc[err.loc.length - 1] : "general";
      return {
        field: fieldName,
        message: err.msg || "Validation error",
      };
    });

    // Group errors by field for easier display
    const errorsByField = {};
    errors.forEach(({ field, message }) => {
      if (!errorsByField[field]) {
        errorsByField[field] = [];
      }
      errorsByField[field].push(message);
    });

    return errorsByField;
  }

  // If it's a simple error message
  if (typeof data.detail === "string") {
    return { general: [data.detail] };
  }

  // Fallback
  return { general: ["An error occurred"] };
}

/**
 * Format errors for display
 * Returns a string representation of all errors
 */
export function formatErrorMessage(errorsByField) {
  const lines = [];

  for (const [field, messages] of Object.entries(errorsByField)) {
    if (field === "general") {
      lines.push(...messages);
    } else {
      const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
      lines.push(`${fieldLabel}: ${messages.join(", ")}`);
    }
  }

  return lines.join("\n");
}
