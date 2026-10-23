import { homedir } from "node:os";

export class TargetScopeError extends Error {
  readonly code = "TARGET_SCOPE_TOO_BROAD";

  constructor(message: string) {
    super(message);
    this.name = "TargetScopeError";
  }
}

export function assertNotHomeDirectory(realPath: string): void {
  if (realPath === homedir()) {
    throw new TargetScopeError(
      "Refusing to analyze the home directory; select the application folder inside it",
    );
  }
}
