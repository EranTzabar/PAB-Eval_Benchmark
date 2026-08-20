const ALLOWED_RETURN_PATHS = new Set(["/", "/runs", "/configs"]);

export function safeReturnPath(value: string | null | undefined, fallback = "/configs"): string {
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
    default:
      return "Back to configurations";
  }
}
