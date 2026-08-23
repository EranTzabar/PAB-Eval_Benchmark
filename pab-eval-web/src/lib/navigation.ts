const ALLOWED_RETURN_PATHS = new Set(["/", "/runs", "/configs", "/judges", "/judges/activate", "/dataset"]);

export function safeReturnPath(value: string | null | undefined, fallback = "/judges"): string {
  if (value && ALLOWED_RETURN_PATHS.has(value)) {
    return value;
  }
  return fallback;
}

export function returnPathLabel(path: string): string {
  switch (path) {
    case "/":
      return "Back to generate";
    case "/runs":
      return "Back to runs";
    case "/judges":
      return "Back to judges";
    case "/judges/activate":
      return "Back to run judge";
    case "/dataset":
      return "Back to dataset";
    default:
      return "Back to configurations";
  }
}
