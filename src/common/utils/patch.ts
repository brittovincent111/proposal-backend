/**
 * Flattens `{ company: { name: 'x' } }` into `{ 'company.name': 'x' }`.
 *
 * A plain `$set: { company: {...} }` would replace the whole sub-document and
 * silently drop the fields the caller did not send, which turns every PATCH into
 * an accidental PUT.
 */
export function flattenPatch(
  input: Record<string, unknown>,
  prefix = '',
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;

    const isPlainObject =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      Object.getPrototypeOf(value) === Object.prototype;

    if (isPlainObject) {
      Object.assign(output, flattenPatch(value as Record<string, unknown>, path));
      continue;
    }
    output[path] = value;
  }

  return output;
}

/**
 * Drops keys whose value is `undefined`.
 *
 * `class-transformer` materialises every property declared on a DTO, so a PATCH
 * that sends only `{ status }` arrives with `name: undefined`, `type: undefined`
 * and the rest alongside it. Mongoose's `doc.set()` reads `undefined` as "unset
 * this path", so applying that object blanks required fields and the save then
 * fails validation — or worse, succeeds with an array field gone.
 *
 * Absent and "explicitly cleared" are different intents; only the caller's real
 * keys should reach the document.
 */
export function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
