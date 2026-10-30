import { homedir } from "node:os";

export class TargetScopeError extends Error {
  readonly code: string;

  constructor(message: string, code = "TARGET_SCOPE_TOO_BROAD") {
    super(message);
    this.name = "TargetScopeError";
    this.code = code;
  }
}

export function assertNotHomeDirectory(realPath: string): void {
  if (realPath === homedir()) {
    throw new TargetScopeError(
      "Refusing to analyze the home directory; select the application folder inside it",
    );
  }
}
