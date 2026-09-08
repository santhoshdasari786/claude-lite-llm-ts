/**
 * Exception classes for claude-lite-llm-ts.
 */

/**
 * Base exception for all claude-lite-llm errors.
 */
export class ClaudeError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'ERR_CLAUDE') {
    super(message);
    this.name = 'ClaudeError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised when the `claude` executable cannot be found or is not executable.
 */
export class ClaudeCLINotFoundError extends ClaudeError {
  constructor(message: string) {
    super(message, 'ERR_CLAUDE_NOT_FOUND');
    this.name = 'ClaudeCLINotFoundError';
  }
}

/**
 * Raised when authentication fails (missing/invalid token, 401/403).
 */
export class ClaudeAuthError extends ClaudeError {
  constructor(message: string) {
    super(message, 'ERR_CLAUDE_AUTH');
    this.name = 'ClaudeAuthError';
  }
}

/**
 * Raised when subscription quota or rate limit (429) is encountered.
 */
export class ClaudeRateLimitError extends ClaudeError {
  public readonly rawResponse?: Record<string, unknown>;

  constructor(message: string, rawResponse?: Record<string, unknown>) {
    super(message, 'ERR_CLAUDE_RATE_LIMIT');
    this.name = 'ClaudeRateLimitError';
    this.rawResponse = rawResponse;
  }
}

/**
 * Raised when the CLI returns a non-zero exit code or execution error.
 */
export class ClaudeExecutionError extends ClaudeError {
  public readonly returncode?: number;
  public readonly stdout?: string;
  public readonly stderr?: string;
  public readonly rawResponse?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      returncode?: number;
      stdout?: string;
      stderr?: string;
      rawResponse?: Record<string, unknown>;
    },
  ) {
    super(message, 'ERR_CLAUDE_EXECUTION');
    this.name = 'ClaudeExecutionError';
    this.returncode = options?.returncode;
    this.stdout = options?.stdout;
    this.stderr = options?.stderr;
    this.rawResponse = options?.rawResponse;
  }
}

/**
 * Base exception for all codex-lite errors.
 */
export class CodexError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'ERR_CODEX') {
    super(message);
    this.name = 'CodexError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised when the `codex` executable cannot be found or is not executable.
 */
export class CodexCLINotFoundError extends CodexError {
  constructor(message: string) {
    super(message, 'ERR_CODEX_NOT_FOUND');
    this.name = 'CodexCLINotFoundError';
  }
}

/**
 * Raised when authentication fails with Codex CLI.
 */
export class CodexAuthError extends CodexError {
  constructor(message: string) {
    super(message, 'ERR_CODEX_AUTH');
    this.name = 'CodexAuthError';
  }
}

/**
 * Raised when OpenAI / Codex quota or rate limit is encountered.
 */
export class CodexRateLimitError extends CodexError {
  public readonly rawResponse?: Record<string, unknown>;

  constructor(message: string, rawResponse?: Record<string, unknown>) {
    super(message, 'ERR_CODEX_RATE_LIMIT');
    this.name = 'CodexRateLimitError';
    this.rawResponse = rawResponse;
  }
}

/**
 * Raised when the Codex CLI returns a non-zero exit code or execution error.
 */
export class CodexExecutionError extends CodexError {
  public readonly returncode?: number;
  public readonly stdout?: string;
  public readonly stderr?: string;
  public readonly rawResponse?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      returncode?: number;
      stdout?: string;
      stderr?: string;
      rawResponse?: Record<string, unknown>;
    },
  ) {
    super(message, 'ERR_CODEX_EXECUTION');
    this.name = 'CodexExecutionError';
    this.returncode = options?.returncode;
    this.stdout = options?.stdout;
    this.stderr = options?.stderr;
    this.rawResponse = options?.rawResponse;
  }
}
