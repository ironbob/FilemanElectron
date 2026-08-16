/**
 * JSON → TypeScript interface 生成（纯函数）。
 * 对象数组按「样本合并」提取形状：缺失字段 optional、多类型取并集；
 * 嵌套对象生成独立 interface（名 = 父名 + 字段 PascalCase）。
 */

interface FieldShape {
  type: string
  optional: boolean
}

interface IfaceEntry {
  name: string
  fields: Map<string, FieldShape>
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return value.length > 0 ? typeName(value[0]) + '[]' : 'unknown[]'
  switch (typeof value) {
    case 'string': return 'string'
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'object': return 'object'
    default: return 'unknown'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pascalCase(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_$]+(.)/g, (_, c: string) => c.toUpperCase())
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/** 一组样本值 → 字段类型（并集 / 嵌套 interface 引用）。 */
function shapeFromSamples(samples: unknown[], name: string, interfaces: IfaceEntry[], visiting: Map<unknown, string>): FieldShape {
  const nonNull = samples.filter(sample => sample !== null)
  if (nonNull.length === 0) return { type: 'null', optional: false }

  const objectSamples = nonNull.filter(isPlainObject)
  const arraySamples = nonNull.filter(Array.isArray)
  const scalarSamples = nonNull.filter(sample => !isPlainObject(sample) && !Array.isArray(sample))

  const parts: string[] = []
  if (objectSamples.length > 0) {
    const ref = collectInterface(objectSamples, name, interfaces, visiting)
    parts.push(ref)
  }
  if (arraySamples.length > 0) {
    // 合并各数组的元素样本
    const elementSamples = arraySamples.flatMap(arr => arr)
    parts.push(shapeFromSamples(elementSamples, `${name}Item`, interfaces, visiting).type + '[]')
  }
  if (scalarSamples.length > 0) {
    const scalarTypes = Array.from(new Set(scalarSamples.map(typeName)))
    parts.push(...scalarTypes)
  }
  return { type: parts.join(' | ') || 'unknown', optional: false }
}

/**
 * 生成 interfaces 文本。root 为对象或对象数组；数组根的 Root 即元素
 * 合并形状。标量根返回 null。
 */
export function jsonToInterfaces(root: unknown): string | null {
  const interfaces: IfaceEntry[] = []
  collectInterface(
    Array.isArray(root) ? root.filter(isPlainObject) : root,
    'Root',
    interfaces,
    new Map()
  )
  if (interfaces.length === 1 && interfaces[0].fields.size === 0) return null
  return interfaces
    .map(iface => {
      const lines = Array.from(iface.fields.entries()).map(([key, shape]) => {
        const safeKey = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
        return `  ${safeKey}${shape.optional ? '?' : ''}: ${shape.type};`
      })
      return `interface ${iface.name} {\n${lines.join('\n')}\n}`
    })
    .join('\n\n')
}

/**
 * shape 两种形态：
 *  - 普通对象：字段值即单样本（包一层数组统一处理）；
 *  - 对象样本数组：跨样本合并（缺失 → optional）。
 * 返回该形状的 interface 名（已 push 进 interfaces）。
 */
function collectInterface(
  shape: unknown,
  name: string,
  interfaces: IfaceEntry[],
  visiting: Map<unknown, string>
): string {
  const fields = new Map<string, FieldShape>()
  interfaces.push({ name, fields })

  const fieldSamples = new Map<string, unknown[]>()
  let objectCount = 0
  if (Array.isArray(shape)) {
    objectCount = shape.length
    for (const item of shape) {
      if (!isPlainObject(item)) continue
      for (const [key, value] of Object.entries(item)) {
        const bucket = fieldSamples.get(key)
        if (bucket) bucket.push(value)
        else fieldSamples.set(key, [value])
      }
    }
  } else if (isPlainObject(shape)) {
    objectCount = 1
    for (const [key, value] of Object.entries(shape)) {
      fieldSamples.set(key, [value])
    }
  }

  for (const [key, samples] of fieldSamples) {
    const shapeResult = shapeFromSamples(samples, `${name}${pascalCase(key)}`, interfaces, visiting)
    shapeResult.optional = objectCount > 1 && samples.length < objectCount
    fields.set(key, shapeResult)
  }
  return name
}
