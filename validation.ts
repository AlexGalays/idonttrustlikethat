//--------------------------------------
//  Setup
//--------------------------------------

export type Validator<T> = {
  readonly T: T // Phantom type

  validate(value: Value, config?: Configuration, path?: Path): Validation<T>

  map<B>(fn: (value: T) => B): Validator<B>
  filter(fn: (value: T) => boolean): Validator<T>
  flatMap<B>(fn: (value: T) => Result<string, B>): Validator<B>
  then<B>(validator: Validator<B>): Validator<B>
  withError(newError: string): Validator<T>
  tagged<TAG extends string>(this: Validator<string>): Validator<TAG>
  tagged<TAG extends number>(this: Validator<number>): Validator<TAG>
  optional(): Validator<T | undefined>
} & NullableValidator<T>

type NullableValidator<T> = undefined extends T
  ? ValidatorWithDefault<T>
  : null extends T
  ? ValidatorWithDefault<T>
  : { default: never }

type ValidatorWithDefault<T> = {
  default<D>(defaultValue: D): Validator<NonNullable<T> | D>
}

// Use object composition as transpiled classes are insanely byte intensive, especially with super/extends being involved.
// Move to classes if we stop supporting IE11.
const validatorMethods = {
  map<B>(fn: (value: Value) => B): Validator<B> {
    return this.flatMap(v => Ok(fn(v)))
  },

  filter(fn: (value: Value) => boolean): Validator<unknown> {
    return this.flatMap(v =>
      fn(v) ? Ok(v) : Err(`filter error: ${pretty(v)}"`)
    ) as any
  },

  then<B>(validator: Validator<B>): Validator<B> {
    const originalValidator = (this as unknown) as Validator<Value>
    return ({
      validate(
        v: Value,
        config: Configuration = defaultConfig,
        p: Path = rootPath
      ) {
        const validated = originalValidator.validate(v, config, p)
        if (!validated.ok) return validated
        return validator.validate(validated.value, config, p)
      },
      ...validatorMethods,
    } as any) as Validator<B>
  },

  flatMap<B>(fn: (value: Value) => Result<string, B>): Validator<B> {
    return transform((this as unknown) as Validator<unknown>, r =>
      r.ok ? fn(r.value) : r
    )
  },

  withError(error: string) {
    return transform((this as unknown) as Validator<unknown>, r =>
      r.ok ? r : Err(error)
    )
  },

  tagged<TAG>(): Validator<TAG> {
    return (this as {}) as Validator<TAG>
  },

  optional(): Validator<unknown> {
    return optional((this as unknown) as Validator<unknown>)
  },

  default(value: unknown) {
    return this.map(v => (v === null || v === undefined ? value : v))
  },
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

type Value = Object | null | undefined
type Path = string & { __tag: 'path' }

export type Configuration = {
  transformObjectKeys?: (key: string) => string
}

export type Validation<T> = Result<ValidationError[], T>

function success<T>(value: T): Validation<T> {
  return Ok(value)
}

function failure(path: Path, message: string): Validation<never> {
  return Err([{ path, message }])
}

function typeFailure(value: any, path: Path, expectedType: string) {
  const valueType = (() => {
    if (Array.isArray(value)) return 'array'
    if (value === null) return 'null'
    return typeof value
  })()
  const message = `Expected ${expectedType}, got ${valueType}`
  return Err([{ path, message }])
}

export function getPath(name: string, parent?: string): Path {
  return (parent ? `${parent}.${name}` : name) as Path
}

const rootPath = getPath('')

const defaultConfig: Configuration = {}

const upperThenLower = /([A-Z]+)([A-Z][a-z])/g
const lowerThenUpper = /([a-z\\\\d])([A-Z])/g
export const snakeCaseTransformation = (key: string): string =>
  key
    .replace(upperThenLower, '$1_$2')
    .replace(lowerThenUpper, '$1_$2')
    .toLowerCase()

export function is<T>(value: Value, validator: Validator<T>): value is T {
  return validator.validate(value).ok
}

//--------------------------------------
//  Primitives
//--------------------------------------

const nullValidator = ({
  validate: (v: Value, _config: Configuration, p: Path = rootPath) =>
    v === null ? success(v as null) : typeFailure(v, p, 'null'),
  ...validatorMethods,
} as any) as Validator<null>

const undefinedValidator = ({
  validate: (v: Value, _config: Configuration, p: Path = rootPath) =>
    v === void 0 ? success(v as undefined) : typeFailure(v, p, 'undefined'),
  ...validatorMethods,
} as any) as Validator<undefined>

export const string = ({
  validate: (v: Value, _config: Configuration, p: Path = rootPath) =>
    typeof v === 'string' ? success(v) : typeFailure(v, p, 'string'),
  ...validatorMethods,
} as any) as Validator<string>

export const number = ({
  validate: (v: Value, _config: Configuration, p: Path = rootPath) =>
    typeof v === 'number' ? success(v) : typeFailure(v, p, 'number'),
  ...validatorMethods,
} as any) as Validator<number>

export const boolean = ({
  validate: (v: Value, _config: Configuration, p: Path = rootPath) =>
    typeof v === 'boolean' ? success(v) : typeFailure(v, p, 'boolean'),
  ...validatorMethods,
} as any) as Validator<boolean>

export const unknown = ({
  validate: (v: Value) => success(v),
  ...validatorMethods,
} as any) as Validator<unknown>

//--------------------------------------
//  array
//--------------------------------------

export function array<A>(validator: Validator<A>) {
  return ({
    validate(
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ) {
      if (!Array.isArray(v)) return typeFailure(v, p, 'array')

      const validatedArray: A[] = []
      const errors: ValidationError[] = []

      for (let i = 0; i < v.length; i++) {
        const item = v[i]
        const validation = validator.validate(
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
    },
    ...validatorMethods,
  } as any) as Validator<A[]>
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
  return {
    validate(
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ) {
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
    },
    ...validatorMethods,
  }
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

export type ObjectOf<P extends Props> = ObjectOf2<Unpack<P>>

// Intermediary mapped type so that we only Unpack once.
type ObjectOf2<P extends Record<string, unknown>> = Id<
  {
    [K in MandatoryKeys<P>]: P[K]
  } &
    { [K in OptionalKeys<P>]?: P[K] }
>

export function object<P extends Props>(
  props: P
): Validator<ObjectOf<P>> & { props: P } {
  return {
    props,
    validate(
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ) {
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
    },
    ...validatorMethods,
  } as any
}

//--------------------------------------
//  dictionary
//--------------------------------------

export function dictionary<K extends string, V>(
  domain: Validator<K>,
  codomain: Validator<V>
) {
  return ({
    validate(
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ) {
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
              message: `value error: ${e.message}`,
            }))
          )
        }
      }
      return errors.length ? Err(errors) : Ok(validatedDict)
    },
    ...validatorMethods,
  } as any) as Validator<Record<K, V>>
}

//--------------------------------------
//  literal
//--------------------------------------

type Literal = string | number | boolean | null | undefined

export function literal<V extends Literal>(value: V) {
  return ({
    validate(v: Value, _config: Configuration, p: Path = rootPath) {
      return v === value
        ? success(v as V)
        : failure(p, `Expected ${pretty(value)}, got ${pretty(v)}`)
    },
    ...validatorMethods,
  } as any) as Validator<V>
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

export function intersection<VS extends AnyValidator[]>(
  ...vs: VS
): Validator<Id<UnionToIntersection<VS[number]['T']>>>
export function intersection(...validators: any[]): any {
  return {
    validate(
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ) {
      let result: any = {}

      for (let i = 0; i < validators.length; i++) {
        const validation = validators[i].validate(v, config, p)

        if (validation.ok) {
          result = { ...result, ...(validation.value as object) }
        } else {
          return validation
        }
      }

      return success(result)
    },
    ...validatorMethods,
  }
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
    return {
      validate(
        v: Value,
        config: Configuration = defaultConfig,
        p: Path = rootPath
      ) {
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
          `The value ${pretty(
            v
          )} \nis not part of the union: \n\n${detailString}`
        )
      },
      ...validatorMethods,
    }
  }

  return {
    validate(
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ) {
      for (let i = 0; i < validators.length; i++) {
        const validator = literal(validators[i])
        const validation = validator.validate(v, config, p)
        if (validation.ok) return validation
      }
      return failure(p, `The value ${pretty(v)} is not part of the union`)
    },
    ...validatorMethods,
  }
}

//--------------------------------------
//  optional
//--------------------------------------

function optional<V>(validator: Validator<V>) {
  return ({
    validate(
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ) {
      if (v === undefined) return success(v as undefined)
      return validator.validate(v, config, p)
    },
    ...validatorMethods,
  } as any) as Validator<V | undefined>
}

//--------------------------------------
//  transform
//--------------------------------------

function transform<V, B>(
  validator: Validator<V>,
  fn: (result: Validation<Value>) => Result<string | ValidationError[], B>
) {
  return ({
    validate(
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ) {
      const validated = validator.validate(v, config, p)
      const transformed = fn(validated)

      if (transformed.ok) return success(transformed.value)

      const error = transformed.errors

      if (typeof error === 'string') return failure(p, error)

      return Err(error)
    },
    ...validatorMethods,
  } as any) as Validator<B>
}

//--------------------------------------
//  recursion
//--------------------------------------

export function recursion<T>(
  definition: (self: Validator<T>) => AnyValidator
): Validator<T> {
  const Self = ({
    validate: (
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ) => Result.validate(v, config, p),
    ...validatorMethods,
  } as any) as Validator<T>
  const Result: any = definition(Self)
  return Result
}

//--------------------------------------
//  isoDate
//--------------------------------------

export const isoDate = string.flatMap(str => {
  const date = new Date(str)
  return isNaN(date.getTime())
    ? Err(`Expected ISO date, got: ${pretty(str)}`)
    : Ok(date)
})

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

function pretty(value: Value) {
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
