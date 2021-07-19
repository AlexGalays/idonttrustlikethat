//--------------------------------------
//  Setup
//--------------------------------------

export class Validator<T> {
  constructor(
    private validationFunction: (
      value: unknown,
      config: Configuration,
      path: Path
    ) => Validation<T>
  ) {}

  // Phantom type
  T: T = undefined as any as T

  /**
   * Validate any value.
   */
  validate(value: unknown, config?: Configuration, path?: Path): Validation<T> {
    return this.validationFunction(
      value,
      config || defaultConfig,
      path || rootPath
    )
  }

  /**
   * Maps the validated value or do nothing if this validator returned an error.
   */
  map<B>(fn: (value: T) => B): Validator<B> {
    return this.and(v => Ok(fn(v)))
  }

  /**
   * Filter this validated value or do nothing if this validator returned an error.
   */
  filter(fn: (value: T) => boolean): Validator<T> {
    return this.and(v =>
      fn(v) ? Ok(v) : Err(`filter error: ${prettifyJson(v)}"`)
    )
  }

  /**
   * Chains this validator with another one, in series.
   * The resulting value of the first validator will be the input of the second.
   *
   * ```ts
   * declare const stringToInt: Validator<number>
   * declare const intToDate: Validator<Date>
   * const stringToDate = stringToInt.then(intToDate)
   * ```
   */
  then<B>(validator: Validator<B>): Validator<B> {
    const self = this
    return new Validator((v, config, p) => {
      const validated = self.validate(v, config, p)
      if (!validated.ok) return validated
      return validator.validate(validated.value, config, p)
    })
  }

  /**
   * Further refines this validator's output.
   */
  and<B>(fn: (value: T) => Result<string, B>): Validator<B> {
    return transform(this, r => (r.ok ? fn(r.value) : r))
  }

  /**
   * Swaps the default error string with a custom one.
   */
  withError(errorFunction: (value: unknown) => string) {
    return transform(this, (result, value) =>
      result.ok ? result : Err(errorFunction(value))
    )
  }

  /**
   * Refines this string to make it more strongly typed.
   */
  tagged<TAG extends string>(this: Validator<string>): Validator<TAG>

  /**
   * Refines this number to make it more strongly typed.
   */
  tagged<TAG extends number>(this: Validator<number>): Validator<TAG>
  tagged<TAG>(): Validator<TAG> {
    return this as {} as Validator<TAG>
  }

  /**
   * Returns a new validator where undefined and null are also valid inputs.
   */
  nullable(): Validator<T | null | undefined> {
    return union(this, nullValidator, undefinedValidator)
  }

  /**
   * Returns a new validator where undefined is also a valid input.
   */
  optional(): Validator<T | undefined> {
    return union(this, undefinedValidator)
  }

  /**
   * Fallbacks to a default value if the previous validator returned null or undefined.
   */
  default<D>(defaultValue: D): Validator<NonNullable<T> | D>
  default<D>(defaultValue: D): Validator<unknown> {
    return this.nullable().map(v =>
      v === null || v === undefined ? defaultValue : v
    )
  }
}

export type Ok<VALUE> = { ok: true; value: VALUE }
export type Err<ERROR> = { ok: false; errors: ERROR }
export type Result<ERROR, VALUE> = Err<ERROR> | Ok<VALUE>

export function Ok<VALUE>(value: VALUE) {
  return { ok: true, value } as const
}

export function Err<ERROR>(errors: ERROR) {
  return { ok: false, errors } as const
}

type AnyValidator = Validator<Value>

export interface ValidationError {
  readonly message: string
  readonly path: Path
}

type Value = unknown
type Path = string & { __tag: 'path' }

type Configuration = {
  transformObjectKeys?: (key: string) => string
}

export type Validation<T> = Result<ValidationError[], T>

function failure(path: Path, message: string): Validation<never> {
  return Err([{ path, message }])
}

function valueType(value: any) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

function typeFailureMessage(expectedType: string, value: any) {
  return `Expected ${expectedType}, got ${valueType(value)}`
}

function typeFailure(value: any, path: Path, expectedType: string) {
  const message = typeFailureMessage(expectedType, value)
  return Err([{ path, message }])
}

export function getPath(name: string, parent?: string): Path {
  return (parent ? `${parent}.${name}` : name) as Path
}

const rootPath = getPath('')

const defaultConfig: Configuration = {}

export function is<T>(value: Value, validator: Validator<T>): value is T {
  return validator.validate(value).ok
}

//--------------------------------------
//  Primitives
//--------------------------------------

const nullValidator: Validator<null> = new Validator((v, _c, p) =>
  v === null ? Ok(v) : typeFailure(v, p, 'null')
)

const undefinedValidator: Validator<undefined> = new Validator((v, _c, p) =>
  v === void 0 ? Ok(v) : typeFailure(v, p, 'undefined')
)

export const string: Validator<string> = new Validator((v, _c, p) =>
  typeof v === 'string' ? Ok(v) : typeFailure(v, p, 'string')
)

export const number: Validator<number> = new Validator((v, _c, p) =>
  typeof v === 'number' ? Ok(v) : typeFailure(v, p, 'number')
)

export const boolean: Validator<boolean> = new Validator((v, _c, p) =>
  typeof v === 'boolean' ? Ok(v) : typeFailure(v, p, 'boolean')
)

export const unknown: Validator<unknown> = new Validator(Ok)

//--------------------------------------
//  array
//--------------------------------------

export function array<A>(validator: Validator<A>): Validator<A[]> {
  return new Validator((v, config, p) => {
    if (!Array.isArray(v)) return typeFailure(v, p, 'array')

    const validatedArray: A[] = []
    const errors: ValidationError[] = []

    for (let i = 0; i < v.length; i++) {
      const item = v[i]
      const validation = validator.validate(item, config, getPath(String(i), p))

      if (validation.ok) {
        validatedArray.push(validation.value)
      } else {
        pushAll(errors, validation.errors)
      }
    }

    return errors.length ? Err(errors) : Ok(validatedArray)
  })
}

//--------------------------------------
//  tuple
//--------------------------------------

export function tuple<VS extends AnyValidator[]>(
  ...vs: VS
): Validator<
  { [NUM in keyof VS]: VS[NUM] extends AnyValidator ? VS[NUM]['T'] : never }
>

export function tuple(...validators: any[]): any {
  return new Validator((v, config, p) => {
    if (!Array.isArray(v)) return typeFailure(v, p, 'Tuple')
    if (v.length !== validators.length)
      return failure(
        p,
        `Expected Tuple${validators.length}, got Tuple${v.length}`
      )

    const validatedArray: any[] = []
    const errors: ValidationError[] = []

    for (let i = 0; i < v.length; i++) {
      const item = v[i]
      const validation = validators[i].validate(
        item,
        config,
        getPath(String(i), p)
      )

      if (validation.ok) {
        validatedArray.push(validation.value)
      } else {
        pushAll(errors, validation.errors)
      }
    }

    return errors.length ? Err(errors) : Ok(validatedArray)
  })
}

//--------------------------------------
//  object
//--------------------------------------

type Props = Record<string, AnyValidator>

// Unpack helps TS inference.
type Unpack<P extends Props> = { [K in keyof P]: P[K]['T'] }

type OptionalKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never
}[keyof T]

type MandatoryKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? never : K
}[keyof T]

// Intermediary mapped type so that we only Unpack once, and not for each key.
type ObjectWithOptionalKeysOf<P extends Record<string, unknown>> = Id<
  {
    [K in MandatoryKeys<P>]: P[K]
  } &
    { [K in OptionalKeys<P>]?: P[K] }
>

export type ObjectOf<P extends Props> = ObjectWithOptionalKeysOf<Unpack<P>>

type ObjectValidator<P extends Props> = Validator<ObjectOf<P>> & { props: P }

export function object<P extends Props>(props: P): ObjectValidator<P> {
  const validator = new Validator((v, config, p) => {
    if (v == null || typeof v !== 'object') return typeFailure(v, p, 'object')

    const validatedObject: any = {}
    const errors: ValidationError[] = []

    for (let key in props) {
      const transformedKey =
        config.transformObjectKeys !== undefined
          ? config.transformObjectKeys(key)
          : key

      const value = (v as any)[transformedKey]
      const validator = props[key]
      const validation = validator.validate(
        value,
        config,
        getPath(transformedKey, p)
      )

      if (validation.ok) {
        if (validation.value !== undefined)
          validatedObject[key] = validation.value
      } else {
        pushAll(errors, validation.errors)
      }
    }
    return errors.length ? Err(errors) : Ok(validatedObject)
  })

  ;(validator as any).props = props
  return validator as ObjectValidator<P>
}

//--------------------------------------
//  dictionary
//--------------------------------------

export function dictionary<K extends string, V>(
  domain: Validator<K>,
  codomain: Validator<V>
): Validator<ObjectWithOptionalKeysOf<Record<K, V>>> {
  return new Validator((v, config, p) => {
    if (v == null || typeof v !== 'object') return typeFailure(v, p, 'object')

    const validatedDict: any = {}
    const errors: ValidationError[] = []

    for (let key in v) {
      const value = (v as any)[key]

      const path = getPath(key, p)
      const domainValidation = domain.validate(key, config, path)
      const codomainValidation = codomain.validate(value, config, path)

      if (domainValidation.ok) {
        key = domainValidation.value
      } else {
        const error = domainValidation.errors
        pushAll(
          errors,
          error.map(e => ({ path, message: `key error: ${e.message}` }))
        )
      }

      if (codomainValidation.ok) {
        validatedDict[key] = codomainValidation.value
      } else {
        const error = codomainValidation.errors
        pushAll(
          errors,
          error.map(e => ({
            path,
            message: `value error: ${e.message}`
          }))
        )
      }
    }
    return errors.length ? Err(errors) : Ok(validatedDict)
  })
}

//--------------------------------------
//  literal
//--------------------------------------

type Literal = string | number | boolean | null | undefined
type LiteralValidator<V extends Literal> = Validator<V> & { value: V }

export function literal<V extends Literal>(value: V): LiteralValidator<V> {
  const validator = new Validator((v, _c, p) =>
    v === value
      ? Ok(v as V)
      : failure(p, `Expected ${prettifyJson(value)}, got ${prettifyJson(v)}`)
  )

  ;(validator as any).value = value
  return validator as LiteralValidator<V>
}

//--------------------------------------
//  intersection
//--------------------------------------

// Hack to flatten an intersection into a single type.
type Id<T> = {} & { [P in keyof T]: T[P] }

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never

// Just like ObjectValidator... but with one extra step. The compiler can't make ObjectValidator work here.
type IntersectionOfObjectsResult<VS extends ObjectValidator<any>[]> = Validator<
  Id<UnionToIntersection<VS[number]['T']>>
> & {
  props: Id<UnionToIntersection<VS[number]['props']>>
}
// Special signature for when all validators are object validators: we want the output to be compatible with ObjectValidator too.
export function intersection<VS extends ObjectValidator<any>[]>(
  ...vs: VS
): IntersectionOfObjectsResult<VS>
export function intersection<VS extends AnyValidator[]>(
  ...vs: VS
): Validator<Id<UnionToIntersection<VS[number]['T']>>>
export function intersection(...validators: any[]): any {
  const allObjectValidators = validators.every(v => Boolean(v.props))

  const validator = new Validator((v, config, p) => {
    let result: any = {}

    for (let i = 0; i < validators.length; i++) {
      const validation = validators[i].validate(v, config, p)

      if (validation.ok) {
        result = { ...result, ...(validation.value as object) }
      } else {
        return validation
      }
    }

    return Ok(result)
  })

  if (allObjectValidators) {
    ;(validator as any).props = validators.reduce((acc, v) => {
      Object.assign(acc, v.props)
      return acc
    }, {})
  }

  return validator
}

//--------------------------------------
//  union
//--------------------------------------

export function union<VS extends AnyValidator[]>(
  ...vs: VS
): Validator<VS[number]['T']>
export function union<LS extends Literal[]>(...ls: LS): Validator<LS[number]>
export function union(...validators: any[]): any {
  const probe = validators[0]

  if (probe && typeof probe === 'object') {
    return new Validator((v, config, p) => {
      const errors: ValidationError[][] = []

      for (let i = 0; i < validators.length; i++) {
        const validation = validators[i].validate(v, config, p)
        if (validation.ok) return validation
        else errors.push(validation.errors)
      }

      const detailString = errors
        .map(
          (es, index) =>
            `Union type #${index} => \n  ${errorDebugString(es).replace(
              /\n/g,
              '\n  '
            )}`
        )
        .join('\n')

      return failure(
        p,
        `The value ${prettifyJson(
          v
        )} \nis not part of the union: \n\n${detailString}`
      )
    })
  }

  return new Validator((v, config, p) => {
    for (let i = 0; i < validators.length; i++) {
      const validator = literal(validators[i])
      const validation = validator.validate(v, config, p)
      if (validation.ok) return validation
    }
    return failure(p, `The value ${prettifyJson(v)} is not part of the union`)
  })
}

//--------------------------------------
//  discriminatedUnion
//--------------------------------------

export function discriminatedUnion<
  TYPEKEY extends string,
  VS extends ObjectValidator<{ [K in TYPEKEY]: LiteralValidator<any> }>[]
>(typeKey: TYPEKEY, ...vs: VS): Validator<VS[number]['T']> {
  const validatorByType = vs.reduce(
    (map, validator) => map.set(validator.props[typeKey].value, validator),
    new Map<Literal, VS[number]>()
  )
  return new Validator((v, config, p) => {
    if (v == null) return failure(p, `union member is nullish: ${v}`)

    const typeValue = (v as any)[typeKey]
    const validator = validatorByType.get(typeValue)

    if (typeValue === undefined || !validator)
      return failure(
        p,
        `union member ${typeKey}=${typeValue} is unknown. ${prettifyJson(v)}`
      )

    return validator.validate(v, config, p)
  })
}

//--------------------------------------
//  transform
//--------------------------------------

function transform<V, B>(
  validator: Validator<V>,
  fn: (
    result: Validation<V>,
    value: Value,
    p: Path
  ) => Result<string | ValidationError[], B>
): Validator<B> {
  return new Validator((v, config, p) => {
    const validated = validator.validate(v, config, p)
    const transformed = fn(validated, v, p)

    if (transformed.ok) return Ok(transformed.value)

    const error = transformed.errors

    if (typeof error === 'string') return failure(p, error)

    return Err(error)
  })
}

//--------------------------------------
//  validateAs
//--------------------------------------

type NoInfer<T> = [T][T extends unknown ? 0 : never]

export function validateAs<TYPE = 'validateAs requires an explicit type param'>(
  validator: NoInfer<Validator<TYPE>>,
  value: Value
): Validation<TYPE> {
  return validator.validate(value)
}

//--------------------------------------
//  util
//--------------------------------------

function pushAll<A>(xs: A[], ys: A[]) {
  Array.prototype.push.apply(xs, ys)
}

export function prettifyJson(value: Value) {
  return JSON.stringify(value, undefined, 2)
}

export function errorDebugString(errors: ValidationError[]) {
  return errors
    .map(e => `At [root${(e.path && '.' + e.path) || ''}] ${e.message}`)
    .join('\n')
}

//--------------------------------------
//  Export aliases
//--------------------------------------

export { nullValidator as null, undefinedValidator as undefined }

//--------------------------------------
//  extra validators
//--------------------------------------

export function recursion<T>(
  definition: (self: Validator<T>) => Validator<unknown>
): Validator<T> {
  const Self = new Validator<T>((value, config, path) =>
    Result.validate(value, config, path)
  )
  const Result: any = definition(Self)
  return Result
}

export const isoDate = string.and(str => {
  const date = new Date(str)
  return isNaN(date.getTime())
    ? Err(`Expected ISO date, got: ${prettifyJson(str)}`)
    : Ok(date)
})

//--------------------------------------
//  config
//--------------------------------------

const upperThenLower = /([A-Z]+)([A-Z][a-z])/g
const lowerThenUpper = /([a-z\\\\d])([A-Z])/g
export const snakeCaseTransformation = (key: string): string =>
  key
    .replace(upperThenLower, '$1_$2')
    .replace(lowerThenUpper, '$1_$2')
    .toLowerCase()

//--------------------------------------
//  url
//--------------------------------------

export const relativeUrl = (baseUrl: string = 'http://some-domain.com') =>
  string.and(str => {
    try {
      new URL(str, baseUrl)
      return Ok(str)
    } catch (err) {
      return Err(`${str} is not a relative URL for baseURL: ${baseUrl}`)
    }
  })

export const absoluteUrl = string.and(str => {
  try {
    new URL(str)
    return Ok(str)
  } catch (err) {
    return Err(`${str} is not an absolute URL`)
  }
})

export const url = union(absoluteUrl, relativeUrl())

//--------------------------------------
//  parsed from string
//--------------------------------------

export const booleanFromString = union('true', 'false')
  .withError(v => `Expected "true" | "false", got: ${v}`)
  .map(str => str === 'true')

export const numberFromString = string.and(str => {
  const parsed = Number(str)
  return Number.isNaN(parsed)
    ? Err(`"${str}" is not a stringified number`)
    : Ok(parsed)
})

export const intFromString = numberFromString.and(num => {
  return Number.isInteger(num) ? Ok(num) : Err(`${num} is not an int`)
})

//--------------------------------------
//  generic refinement functions
//--------------------------------------

type HasSize =
  | object
  | string
  | Array<unknown>
  | Map<unknown, unknown>
  | Set<unknown>

export function minSize<T extends HasSize>(
  minSize: number
): (value: T) => Result<string, T> {
  return (value: T) => {
    const size =
      typeof value === 'string'
        ? value.length
        : Array.isArray(value)
        ? value.length
        : value instanceof Map || value instanceof Set
        ? value.size
        : Object.keys(value).length

    return size >= minSize
      ? Ok(value)
      : Err(`Expected a min size of ${minSize}, got ${size}`)
  }
}

// Note: this a fully fledged function so that inference on T will work.
export function nonEmpty<T extends HasSize>(value: T): Result<string, T> {
  return minSize<T>(1)(value)
}
