export interface CommandOptions {
  readonly repo?: string;
  readonly config?: string;
  readonly report?: string;
  readonly json?: string;
  readonly diff?: boolean;
  readonly base?: string;
}
