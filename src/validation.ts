//--------------------------------------
//  Setup
//--------------------------------------

export class Validator<T> {
  constructor(
    private validationFunction: (
      value: unknown,
      context: Context,
      path: Path
    ) => Validation<T>
  ) {
    this.meta = {}
  }

  // Phantom type
  T: T = undefined as any as T

  // Opaque metadata
  meta: any = undefined

  /**
   * Validate any value.
   */
  validate(value: unknown, context?: Context, path?: Path): Validation<T> {
    return this.validationFunction(
      value,
      context || { ...defaultContext },
      path || rootPath
    )
  }

  /**
   * Maps the validated value or do nothing if this validator returned an error.
   */
  map<B>(fn: (value: T) => B): Validator<B> {
    return withSameMeta(
      this,
      this.and(v => Ok(fn(v)))
    )
  }

  /**
   * Filter this validated value or do nothing if this validator returned an error.
   */
  filter(fn: (value: T) => boolean): Validator<T> {
    return withSameMeta(
      this,
      this.and(v => (fn(v) ? Ok(v) : Err(`filter error: ${prettifyJson(v)}"`)))
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

    return withSameMeta(
      this,
      new Validator((v, context, p) => {
        const validated = self.validate(v, context, p)
        if (!validated.ok) return validated
        return validator.validate(validated.value, context, p)
      })
    )
  }

  /**
   * Further refines this validator's output.
   */
  and<B>(fn: (value: T) => Result<string, B>): Validator<B> {
    return withSameMeta(
      this,
      transform(this, r => (r.ok ? fn(r.value) : r))
    )
  }

  /**
   * Swaps the default error string with a custom one.
   */
  withError(errorFunction: (value: unknown) => string) {
    return withSameMeta(
      this,
      transform(this, (result, value, _p, context) => {
        if (result.ok || '_hadCustomError' in context) return result
        ;(context as any)._hadCustomError = true
        return Err(errorFunction(value))
      })
    )
  }

  /**
   * Maps the produced errors to new ones. This is the more advanced counterpart of withError.
   */
  mapErrors(errorFunction: (errors: ValidationError[]) => ValidationError[]) {
    return withSameMeta(
      this,
      transform(this, (result, _value, _p, context) => {
        if (result.ok || '_hadCustomError' in context) return result
        ;(context as any)._hadCustomError = true
        return Err(errorFunction(result.errors))
      })
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
  nullable(): UnionValidator<[T, null, undefined]> {
    const n = withSameMeta(this, union(this, nullValidator, undefinedValidator))

    n.meta.nullable = true

    return n
  }

  /**
   * Returns a new validator where undefined is also a valid input.
   */
  optional(): UnionValidator<[T, undefined]> {
    const u = withSameMeta(this, union(this, undefinedValidator))

    u.meta.optional = true

    return u
  }

  /**
   * Fallbacks to a default value if the previous validator returned null or undefined.
   */
  default<D>(defaultValue: D): Validator<NonNullable<T> | D>
  default<D>(defaultValue: D): Validator<unknown> {
    const opt = withSameMeta(
      this,
      this.nullable().map(v =>
        v === null || v === undefined ? defaultValue : v
      )
    )

    opt.meta.default = defaultValue

    return opt
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

type Context = {
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

const defaultContext: Context = {}

export function is<T>(value: Value, validator: Validator<T>): value is T {
  return validator.validate(value).ok
}

function withSameMeta<A extends { meta: any }, B extends { meta: any }>(
  source: A,
  target: B
): B {
  target.meta = { ...source.meta }

  return target
}

//--------------------------------------
//  Primitives
//--------------------------------------

function primitive<T>(
  name: string,
  validationFunction: (
    value: unknown,
    context: Context,
    path: Path
  ) => Validation<T>
): Validator<T> {
  const v = new Validator(validationFunction)
  v.meta.tag = name
  return v
}

const nullValidator: Validator<null> = primitive<null>('null', (v, _c, p) =>
  v === null ? Ok(v) : typeFailure(v, p, 'null')
)

const undefinedValidator: Validator<undefined> = primitive<undefined>(
  'undefined',
  (v, _c, p) => {
    return v === void 0 ? Ok(v) : typeFailure(v, p, 'undefined')
  }
)

export const string: Validator<string> = primitive<string>(
  'string',
  (v, _c, p) => {
    return typeof v === 'string' ? Ok(v) : typeFailure(v, p, 'string')
  }
)

export const number: Validator<number> = primitive<number>(
  'number',
  (v, _c, p) => {
    return typeof v === 'number' ? Ok(v) : typeFailure(v, p, 'number')
  }
)

export const boolean: Validator<boolean> = primitive<boolean>(
  'boolean',
  (v, _c, p) => {
    return typeof v === 'boolean' ? Ok(v) : typeFailure(v, p, 'boolean')
  }
)

export const unknown: Validator<unknown> = primitive<unknown>('unknown', Ok)

//--------------------------------------
//  array
//--------------------------------------

export function array<A>(validator: Validator<A>): Validator<A[]> {
  const arrayValidator = new Validator((v, context, p) => {
    if (!Array.isArray(v)) return typeFailure(v, p, 'array')

    const validatedArray: A[] = []
    const errors: ValidationError[] = []

    for (let i = 0; i < v.length; i++) {
      const item = v[i]
      const validation = validator.validate(
        item,
        { ...context },
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

  arrayValidator.meta.tag = 'array'
  arrayValidator.meta.value = validator

  return arrayValidator
}

export function readonlyArray<A>(validator: Validator<A>): Validator<readonly A[]> {
  return array<A>(validator).map(arr => arr as ReadonlyArray<A>)
}

//--------------------------------------
//  set
//--------------------------------------

export function arrayAsSet<A>(validator: Validator<A>, allowDuplicate: boolean = false): Validator<Set<A>> {
  const setValidator = new Validator((v, context, p) => {
    if (!Array.isArray(v)) return typeFailure(v, p, 'array')

    const validatedSet: Set<A> = new Set<A>([])
    const errors: ValidationError[] = []

    for (let i = 0; i < v.length; i++) {
      const item = v[i]
      const path = getPath(String(i), p)

      const validation = validator.validate(
        item,
        { ...context },
        path
      )

      if (validation.ok) {
        if (!allowDuplicate && validatedSet.has(validation.value)) {
          errors.push({
            message: `Duplicate value in set: ${validation.value}`,
            path
          })
        } else {
          validatedSet.add(validation.value)
        }
      } else {
        pushAll(errors, validation.errors)
      }
    }

    return errors.length ? Err(errors) : Ok(validatedSet)
  })

  setValidator.meta.tag = 'set'
  setValidator.meta.value = validator

  return setValidator
}

export function arrayAsReadonlySet<A>(validator: Validator<A>): Validator<ReadonlySet<A>> {
  return arrayAsSet<A>(validator).map(s => s as ReadonlySet<A>)
}

//--------------------------------------
//  tuple
//--------------------------------------

export function tuple<VS extends AnyValidator[]>(
  ...vs: VS
): Validator<{
  [NUM in keyof VS]: VS[NUM] extends AnyValidator ? VS[NUM]['T'] : never
}>

export function tuple(...validators: any[]): any {
  const validator = new Validator((v, context, p) => {
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
        { ...context },
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

  validator.meta.tag = 'tuple'

  return validator
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
  } & { [K in OptionalKeys<P>]?: P[K] }
>

export type ObjectOf<P extends Props> = ObjectWithOptionalKeysOf<Unpack<P>>

type ObjectValidator<P extends Props> = Validator<ObjectOf<P>> & { props: P }

export function object<P extends Props>(props: P): ObjectValidator<P> {
  const validator = new Validator((v, context, p) => {
    if (v == null || typeof v !== 'object') return typeFailure(v, p, 'object')

    const validatedObject: any = {}
    const errors: ValidationError[] = []

    for (let key in props) {
      const transformedKey =
        context.transformObjectKeys !== undefined
          ? context.transformObjectKeys(key)
          : key

      const value = (v as any)[transformedKey]
      const validator = props[key]!
      const validation = validator.validate(
        value,
        { ...context },
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

  validator.meta.tag = 'object'
  validator.meta.props = props
  ;(validator as any).props = props // For compatibility

  return validator as ObjectValidator<P>
}

//--------------------------------------
//  dictionary
//--------------------------------------

export function dictionary<K extends string, V>(
  domain: Validator<K>,
  codomain: Validator<V>
): Validator<ObjectWithOptionalKeysOf<Record<K, V>>> {
  const validator = new Validator((v, context, p) => {
    if (v == null || typeof v !== 'object') return typeFailure(v, p, 'object')

    const validatedDict: any = {}
    const errors: ValidationError[] = []

    for (let key in v) {
      const value = (v as any)[key]

      const path = getPath(key, p)
      const domainValidation = domain.validate(key, { ...context }, path)
      const codomainValidation = codomain.validate(value, { ...context }, path)

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
            path: e.path,
            message: `value error: ${e.message}`
          }))
        )
      }
    }

    return errors.length ? Err(errors) : Ok(validatedDict)
  })

  validator.meta.tag = 'dictionary'
  validator.meta.value = codomain

  return validator
}

//--------------------------------------
//  literal
//--------------------------------------

type Literal = string | number | boolean | null | undefined
type LiteralValidator<V extends Literal> = Validator<V> & { literal: V }

export function literal<V extends Literal>(value: V): LiteralValidator<V> {
  const validator = new Validator((v, _c, p) =>
    v === value
      ? Ok(v as V)
      : failure(p, `Expected ${prettifyJson(value)}, got ${prettifyJson(v)}`)
  )

  ;(validator as any).literal = value
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

  const validator = new Validator((v, context, p) => {
    let result: any = {}
    const errors: ValidationError[] = []

    for (let i = 0; i < validators.length; i++) {
      const validation = validators[i].validate(v, context, p)

      if (validation.ok) {
        result = { ...result, ...(validation.value as object) }
      } else {
        pushAll(errors, validation.errors)
      }
    }

    return errors.length ? Err(errors) : Ok(result)
  })

  if (allObjectValidators) {
    const allProps = validators.reduce((acc, v) => {
      Object.assign(acc, v.meta.props)
      return acc
    }, {})

    validator.meta.tag = 'object'
    validator.meta.props = allProps
    ;(validator as any).props = allProps // For compatibility
  } else {
    validator.meta.tag = 'intersection'
  }

  return validator
}

//--------------------------------------
//  union
//--------------------------------------

type ValidatorFromLiteral<T> = T extends Literal ? LiteralValidator<T> : never

type TupleOfLiteralsToTupleOfValidators<T extends Literal[]> = {
  [Index in keyof T]: ValidatorFromLiteral<T[Index]>
}

type TupleOfAnyToTupleOfValidators<T extends any[]> = {
  [Index in keyof T]: Validator<T[Index]>
}

type UnionValidator<T extends any[]> = Validator<T[number]> & {
  union: TupleOfAnyToTupleOfValidators<T>
}

type UnionValidatorOfValidators<VS extends AnyValidator[]> = Validator<
  VS[number]['T']
> & { union: VS }

type UnionValidatorOfLiterals<LS extends Literal[]> = Validator<LS[number]> & {
  union: TupleOfLiteralsToTupleOfValidators<LS>
}

export function union<LS extends Literal[]>(
  ...union: LS
): UnionValidatorOfLiterals<LS>

export function union<VS extends AnyValidator[]>(
  ...union: VS
): UnionValidatorOfValidators<VS>

export function union(...validators: any[]): any {
  const probe = validators[0]

  // All arguments are validators
  if (probe && typeof probe === 'object') {
    const validator = new Validator((v, context, p) => {
      const errors: ValidationError[][] = []

      for (let i = 0; i < validators.length; i++) {
        const validation = validators[i].validate(v, { ...context }, p)
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

    ;(validator as any).union = validators // for compatibility
    validator.meta.union = validators
    validator.meta.tag = 'union'

    return validator
  }

  // All arguments are primitives

  validators = validators.map(literal)

  const validator = new Validator((v, context, p) => {
    for (let i = 0; i < validators.length; i++) {
      const validator = validators[i]
      const validation = validator.validate(v, { ...context }, p)
      if (validation.ok) return validation
    }
    return failure(p, `The value ${prettifyJson(v)} is not part of the union`)
  })

  ;(validator as any).union = validators // for compatibility
  validator.meta.union = validators
  validator.meta.tag = 'union'

  return validator
}

//--------------------------------------
//  discriminatedUnion
//--------------------------------------

export function discriminatedUnion<
  TYPEKEY extends string,
  VS extends ObjectValidator<{
    [K in TYPEKEY]: LiteralValidator<any> | UnionValidatorOfLiterals<Literal[]>
  }>[]
>(typeKey: TYPEKEY, ...vs: VS): Validator<VS[number]['T']> {
  const validatorByType = vs.reduce((map, validator) => {
    const v: LiteralValidator<any> | UnionValidatorOfLiterals<Literal[]> =
      validator.props[typeKey]

    if ('literal' in v) {
      map.set(v.literal, validator)
    } else {
      v.union.forEach(l => map.set(l.literal, validator))
    }

    return map
  }, new Map<Literal, VS[number]>())

  const discriminated = new Validator((v, context, p) => {
    if (v == null) return failure(p, `union member is nullish: ${v}`)

    const typeValue = (v as any)[typeKey]
    const validator = validatorByType.get(typeValue)

    if (typeValue === undefined) {
      return failure(
        getPath(typeKey, p),
        `discriminant key ("${typeKey}") missing in: ${prettifyJson(v)}`
      )
    } else if (!validator) {
      return failure(
        getPath(typeKey, p),
        `discriminant value ("${typeKey}": "${typeValue}") not part of the union`
      )
    }

    return validator.validate(v, context, p)
  })

  discriminated.meta.tag = 'discriminatedUnion'

  return discriminated
}

//--------------------------------------
//  transform
//--------------------------------------

function transform<V, B>(
  validator: Validator<V>,
  fn: (
    result: Validation<V>,
    value: Value,
    p: Path,
    context: Context
  ) => Result<string | ValidationError[], B>
): Validator<B> {
  return new Validator((v, context, p) => {
    const validated = validator.validate(v, context, p)
    const transformed = fn(validated, v, p, context)

    if (transformed.ok) return transformed

    const error = transformed.errors
    if (typeof error === 'string') return failure(p, error)

    return transformed as Err<ValidationError[]>
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
  const Self = new Validator<T>((value, context, path) =>
    Result.validate(value, context, path)
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
//  context
//--------------------------------------

const upperThenLower = /([A-Z]+)([A-Z][a-z])/g
const lowerThenUpper = /([a-z\\\\d])([A-Z])/g
export const snakeCaseTransformation = (key: string): string =>
  key
    .replace(upperThenLower, '$1_$2')
    .replace(lowerThenUpper, '$1_$2')
    .toLowerCase()

function withLogicalType<T>(
  logicalType: string,
  validator: Validator<T>
): Validator<T> {
  validator.meta.logicalType = logicalType
  return validator
}

//--------------------------------------
//  url
//--------------------------------------

export const relativeUrl = (baseUrl: string = 'http://some-domain.com') =>
  withLogicalType(
    'relativeUrl',
    string.and(str => {
      try {
        new URL(str, baseUrl)
        return Ok(str)
      } catch (err) {
        return Err(`${str} is not a relative URL for baseURL: ${baseUrl}`)
      }
    })
  )

export const absoluteUrl = withLogicalType(
  'absoluteUrl',
  string.and(str => {
    try {
      new URL(str)
      return Ok(str)
    } catch (err) {
      return Err(`${str} is not an absolute URL`)
    }
  })
)

export const url = union(absoluteUrl, relativeUrl())

//--------------------------------------
//  parsed from string
//--------------------------------------

export const booleanFromString = withLogicalType(
  'boolean',
  union('true', 'false')
    .withError(v => `Expected "true" | "false", got: ${v}`)
    .map(str => str === 'true')
)

export const numberFromString = withLogicalType(
  'number',
  string.and(str => {
    const parsed = Number(str)
    return Number.isNaN(parsed)
      ? Err(`"${str}" is not a stringified number`)
      : Ok(parsed)
  })
)

export const intFromString = withLogicalType(
  'integer',
  numberFromString.and(num => {
    return Number.isInteger(num) ? Ok(num) : Err(`${num} is not an int`)
  })
)

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
export function nonEmpty<T extends HasSize>(
  value: T
): Result<string, NonEmptyResult<T>> {
  return minSize<T>(1)(value) as any
}

type NonEmptyResult<T> = T extends Array<infer E> ? NonEmptyArray<E> : T

export type NonEmptyArray<E> = [E, ...E[]]
