//--------------------------------------
//  Setup
//--------------------------------------

export type Validator<T> = {
  readonly T: T // Phantom type

  validate(value: Value, config?: Configuration, path?: Path): Validation<T>

  map<B>(fn: (value: T) => B): Validator<B>
  filter(fn: (value: T) => boolean): Validator<T>
  flatMap<B>(fn: (value: T) => Result<string, B>): Validator<B>
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

// Use object composition as transpiled classes are insanely byte intensive.
const validatorMethods = {
  map<B>(fn: (value: Value) => B): Validator<B> {
    return this.flatMap(v => Ok(fn(v)))
  },

  filter(fn: (value: Value) => boolean): Validator<unknown> {
    return this.flatMap(v =>
      fn(v) ? Ok(v) : Err(`filter error: ${pretty(v)}"`)
    ) as any
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
  validate: (
    v: Value,
    _config: Configuration = defaultConfig,
    p: Path = rootPath
  ) => (v === null ? success(v as null) : typeFailure(v, p, 'null')),
  ...validatorMethods,
} as any) as Validator<null>

const undefinedValidator = ({
  validate: (
    v: Value,
    _config: Configuration = defaultConfig,
    p: Path = rootPath
  ) =>
    v === void 0 ? success(v as undefined) : typeFailure(v, p, 'undefined'),
  ...validatorMethods,
} as any) as Validator<undefined>

export const string = ({
  validate: (
    v: Value,
    _config: Configuration = defaultConfig,
    p: Path = rootPath
  ) => (typeof v === 'string' ? success(v) : typeFailure(v, p, 'string')),
  ...validatorMethods,
} as any) as Validator<string>

export const number = ({
  validate: (
    v: Value,
    _config: Configuration = defaultConfig,
    p: Path = rootPath
  ) => (typeof v === 'number' ? success(v) : typeFailure(v, p, 'number')),
  ...validatorMethods,
} as any) as Validator<number>

export const boolean = ({
  validate: (
    v: Value,
    _config: Configuration = defaultConfig,
    p: Path = rootPath
  ) => (typeof v === 'boolean' ? success(v) : typeFailure(v, p, 'boolean')),
  ...validatorMethods,
} as any) as Validator<boolean>

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

export function tuple<A = never>(): Validator<A[]>
export function tuple<A>(a: Validator<A>): Validator<[A]>
export function tuple<A, B>(a: Validator<A>, b: Validator<B>): Validator<[A, B]>
export function tuple<A, B, C>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>
): Validator<[A, B, C]>
export function tuple<A, B, C, D>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>
): Validator<[A, B, C, D]>
export function tuple<A, B, C, D, E>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>
): Validator<[A, B, C, D, E]>
export function tuple<A, B, C, D, E, F>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>
): Validator<[A, B, C, D, E, F]>
export function tuple<A, B, C, D, E, F, G>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>
): Validator<[A, B, C, D, E, F, G]>
export function tuple<A, B, C, D, E, F, G, H>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>,
  h: Validator<H>
): Validator<[A, B, C, D, E, F, G, H]>
export function tuple<A, B, C, D, E, F, G, H, I>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>,
  h: Validator<H>,
  i: Validator<I>
): Validator<[A, B, C, D, E, F, G, H, I]>
export function tuple<A, B, C, D, E, F, G, H, I, J>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>,
  h: Validator<H>,
  i: Validator<I>,
  j: Validator<J>
): Validator<[A, B, C, D, E, F, G, H, I, J]>
export function tuple<A, B, C, D, E, F, G, H, I, J, K>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>,
  h: Validator<H>,
  i: Validator<I>,
  j: Validator<J>,
  k: Validator<K>
): Validator<[A, B, C, D, E, F, G, H, I, J, K]>
export function tuple<A, B, C, D, E, F, G, H, I, J, K, L>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>,
  h: Validator<H>,
  i: Validator<I>,
  j: Validator<J>,
  k: Validator<K>,
  l: Validator<L>
): Validator<[A, B, C, D, E, F, G, H, I, J, K, L]>

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

// Unpack helps TS inference. It worked without it in TS 3.0 but no longer does in 3.1.
type Unpack<P extends Props> = { [K in keyof P]: P[K]['T'] }
type OptionalKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never
}[keyof T]
type MandatoryKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? never : K
}[keyof T]

export type ObjectOf<P extends Props> = {
  [K in MandatoryKeys<Unpack<P>>]: Unpack<P>[K]
} &
  { [K in OptionalKeys<Unpack<P>>]?: Unpack<P>[K] }

export function object<P extends Props>(props: P) {
  return ({
    props,
    validate(
      v: Value,
      config: Configuration = defaultConfig,
      p: Path = rootPath
    ): Validation<ObjectOf<P>> {
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
  } as any) as Validator<ObjectOf<P>> & { props: P }
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
    validate(
      v: Value,
      _config: Configuration = defaultConfig,
      p: Path = rootPath
    ) {
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

export function intersection<A, B>(
  a: Validator<A>,
  b: Validator<B>
): Validator<A & B>
export function intersection<A, B, C>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>
): Validator<A & B & C>
export function intersection<A, B, C>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>
): Validator<A & B & C>
export function intersection<A, B, C, D>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>
): Validator<A & B & C & D>
export function intersection<A, B, C, D, E>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>
): Validator<A & B & C & D & E>
export function intersection<A, B, C, D, E, F>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>
): Validator<A & B & C & D & E & F>

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

export function union<A, B>(a: Validator<A>, b: Validator<B>): Validator<A | B>
export function union<A extends Literal, B extends Literal>(
  a: A,
  b: B
): Validator<A | B>

export function union<A, B, C>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>
): Validator<A | B | C>
export function union<A extends Literal, B extends Literal, C extends Literal>(
  a: A,
  b: B,
  c: C
): Validator<A | B | C>

export function union<A, B, C, D>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>
): Validator<A | B | C | D>
export function union<
  A extends Literal,
  B extends Literal,
  C extends Literal,
  D extends Literal
>(a: A, b: B, c: C, d: D): Validator<A | B | C | D>

export function union<A, B, C, D, E>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>
): Validator<A | B | C | D | E>
export function union<
  A extends Literal,
  B extends Literal,
  C extends Literal,
  D extends Literal,
  E extends Literal
>(a: A, b: B, c: C, d: D, e: E): Validator<A | B | C | D | E>

export function union<A, B, C, D, E, F>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>
): Validator<A | B | C | D | E | F>
export function union<
  A extends Literal,
  B extends Literal,
  C extends Literal,
  D extends Literal,
  E extends Literal,
  F extends Literal
>(a: A, b: B, c: C, d: D, e: E, f: F): Validator<A | B | C | D | E | F>

export function union<A, B, C, D, E, F, G>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>
): Validator<A | B | C | D | E | F | G>
export function union<
  A extends Literal,
  B extends Literal,
  C extends Literal,
  D extends Literal,
  E extends Literal,
  F extends Literal,
  G extends Literal
>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
  g: G
): Validator<A | B | C | D | E | F | G>

export function union<A, B, C, D, E, F, G, H>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>,
  h: Validator<H>
): Validator<A | B | C | D | E | F | G | H>
export function union<
  A extends Literal,
  B extends Literal,
  C extends Literal,
  D extends Literal,
  E extends Literal,
  F extends Literal,
  G extends Literal,
  H extends Literal
>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
  g: G,
  h: H
): Validator<A | B | C | D | E | F | G | H>

export function union<A, B, C, D, E, F, G, H, I>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>,
  h: Validator<H>,
  i: Validator<I>
): Validator<A | B | C | D | E | F | G | H | I>
export function union<
  A extends Literal,
  B extends Literal,
  C extends Literal,
  D extends Literal,
  E extends Literal,
  F extends Literal,
  G extends Literal,
  H extends Literal,
  I extends Literal
>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
  g: G,
  h: H,
  i: I
): Validator<A | B | C | D | E | F | G | H | I>

export function union<A, B, C, D, E, F, G, H, I, J>(
  a: Validator<A>,
  b: Validator<B>,
  c: Validator<C>,
  d: Validator<D>,
  e: Validator<E>,
  f: Validator<F>,
  g: Validator<G>,
  h: Validator<H>,
  i: Validator<I>,
  j: Validator<J>
): Validator<A | B | C | D | E | F | G | H | I | J>
export function union<
  A extends Literal,
  B extends Literal,
  C extends Literal,
  D extends Literal,
  E extends Literal,
  F extends Literal,
  G extends Literal,
  H extends Literal,
  I extends Literal,
  J extends Literal
>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
  g: G,
  h: H,
  i: I,
  j: J
): Validator<A | B | C | D | E | F | G | H | I | J>

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
