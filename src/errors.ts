export class NavigatorError extends Error {
  constructor(
    message: string,
    readonly code:
      'input' | 'api' | 'network' | 'rate-limit' | 'not-found' | 'metadata',
  ) {
    super(message);
    this.name = 'NavigatorError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof NavigatorError) return error.message;
  console.error(
    'Video navigator encountered an unexpected error.',
    error instanceof Error ? error.name : typeof error,
  );
  return 'Something unexpected went wrong. Reload the page and try again.';
}
