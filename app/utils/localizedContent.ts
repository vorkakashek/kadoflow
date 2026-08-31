export function mergeLocalizedContent<T>(structure: unknown, copy: unknown): T {
  if (copy === null || copy === undefined) return structure as T
  if (structure === null || structure === undefined) return copy as T

  if (Array.isArray(structure) && Array.isArray(copy)) {
    return structure.map((item, index) => (
      mergeLocalizedContent(item, copy[index])
    )) as T
  }

  if (
    typeof structure === 'object'
    && typeof copy === 'object'
    && !Array.isArray(structure)
    && !Array.isArray(copy)
  ) {
    const result = { ...structure } as Record<string, unknown>
    for (const [key, value] of Object.entries(copy)) {
      result[key] = mergeLocalizedContent(result[key], value)
    }
    return result as T
  }

  return copy as T
}
