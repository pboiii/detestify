/** Standard JS/TS test-file naming conventions. */
const TEST_FILE_PATTERN =
  /(^|\/)[^/]*\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_DIRECTORY_PATTERN =
  /(^|\/)__tests__\/[^/]+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export function isTestFilePath(file: string): boolean {
  return TEST_FILE_PATTERN.test(file) || TEST_DIRECTORY_PATTERN.test(file);
}
