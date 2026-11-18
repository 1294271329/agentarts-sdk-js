/* eslint-disable */
// Helper shared by the generated models.

export function toWire(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toWire(item));
  }
  if (typeof value === 'object' && typeof value.toDict === 'function') {
    return value.toDict();
  }
  return value;
}
