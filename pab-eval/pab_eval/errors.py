"""Shared exception types."""


class ConfigError(Exception):
    """Invalid configuration or missing environment variable."""


class DatasetError(Exception):
    """Invalid or malformed benchmark dataset."""


class RunConflictError(Exception):
    """Resume refused because run manifest differs from current config."""


class JobAlreadyRunningError(Exception):
    """A job with this id is already active."""


class JudgeParseError(Exception):
    """Judge response could not be parsed as valid scores."""
