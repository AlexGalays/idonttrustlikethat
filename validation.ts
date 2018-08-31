import { Result, Ok, Err, Option, None, Some } from 'space-lift'


//--------------------------------------
//  Setup
//--------------------------------------

export abstract class Validator<T> {
  readonly T: T = null as any as T // Phantom type

  abstract validate(value: Value, config?: Configuration, context?: Context): Validation<T>

  map<B>(fn: (value: T) => B): Validator<B> {
    return new MappedValidator(this, fn)
  }

  filter(fn: (value: T) => boolean): Validator<T> {
    return new FilteredValidator(this, fn)
  }

  tagged<TAG extends string>(this: Validator<string>): Validator<TAG>
  tagged<TAG extends number>(this: Validator<number>): Validator<TAG>
  tagged<TAG>(): Validator<TAG> {
    return this as {} as Validator<TAG>
  }
}

export type Any = Validator<Value>
export type TypeOf<V extends Any> = V['T']

export interface ValidationError {
  readonly message: string
  readonly context: Context
}

export type Value = Object | null | undefined

export type Context = string & { __tag: 'context' }

export type Configuration = {
  transformObjectKeys?: (key: string) => string
}

export type Validation<T> = Result<ValidationError[], T>


export function success<T>(value: T): Validation<T> {
  return Ok(value)
}

export function failure(context: Context, message: string): Validation<never> {
  return Err([{ context, message }])
}

export function typeFailure(value: any, context: Context, expectedType: string) {
  const valueType = (() => {
    if (Array.isArray(value)) return 'array'
    if (value === null) return 'null'
    return typeof value
  })()
  const message = `Type error: expected ${expectedType} but got ${valueType}`
  return Err([{ context, message }])
}

export function getContext(name: string, parent?: string) {
  return (parent ? `${parent} / ${name}` : name) as Context
}

const rootContext = getContext('root')

const defaultConfig: Configuration = {}

const upperThenLower = /([A-Z]+)([A-Z][a-z])/g
const lowerThenUpper = /([a-z\\\\d])([A-Z])/g
export const snakeCaseTransformation = (key: string): string =>
  key
    .replace(upperThenLower, '$1_$2')
    .replace(lowerThenUpper, '$1_$2')
    .toLocaleLowerCase()

export function is<T>(value: Value, validator: Validator<T>): value is T {
  return validator.validate(value).isOk()
}

//--------------------------------------
//  Primitives
//--------------------------------------

export class NullValidator extends Validator<null> {
  validate(v: Value, _config: Configuration = defaultConfig, c: Context = rootContext) {
    return v === null ? success(v as null) : typeFailure(v, c, 'null')
  }
}

export class UndefinedValidator extends Validator<undefined> {
  validate(v: Value, _config: Configuration = defaultConfig, c: Context = rootContext) {
    return v === void 0 ? success(v as undefined) : typeFailure(v, c, 'undefined')
  }
}

export class StringValidator extends Validator<string> {
  validate(v: Value, _config: Configuration = defaultConfig, c: Context = rootContext) {
    return typeof v === 'string' ? success(v) : typeFailure(v, c, 'string')
  }
}

export class NumberValidator extends Validator<number> {
  validate(v: Value, _config: Configuration = defaultConfig, c: Context = rootContext) {
    return typeof v === 'number' ? success(v) : typeFailure(v, c, 'number')
  }
}

export class BooleanValidator extends Validator<boolean> {
  validate(v: Value, _config: Configuration = defaultConfig, c: Context = rootContext) {
    return typeof v === 'boolean' ? success(v) : typeFailure(v, c, 'boolean')
  }
}

//--------------------------------------
//  map
//--------------------------------------

export class MappedValidator<A, B> extends Validator<B> {
  constructor(
    private validator: Validator<A>,
    private f: (a: A) => B) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    return this.validator.validate(v, config, c).map(this.f)
  }
}

export function map<A, B>(validator: Validator<A>, f: (a: A) => B): MappedValidator<A, B> {
  return new MappedValidator(validator, f)
}

//--------------------------------------
//  filter
//--------------------------------------

export class FilteredValidator<A> extends Validator<A> {
  constructor(
    private validator: Validator<A>,
    private predicate: (a: A) => boolean) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    const validated = this.validator.validate(v, config, c)
    return validated.flatMap(v => {
      if (this.predicate(v)) return validated

      let predicateName = this.predicate.name
      if (!predicateName) {
        const functionStr = this.predicate.toString()
        predicateName = functionStr.length > 60 ? functionStr.slice(0, 60) + '...' : functionStr
      }

      return failure(c, `The value ${pretty(v)} failed the predicate "${predicateName}"`)
    })
  }
}

export function filter<A>(validator: Validator<A>, predicate: (a: A) => boolean): FilteredValidator<A> {
  return new FilteredValidator(validator, predicate)
}

//--------------------------------------
//  array
//--------------------------------------

export class ArrayValidator<A> extends Validator<A[]> {
  constructor(private validator: Validator<A>) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    if (!Array.isArray(v)) return typeFailure(v, c, 'array')

    const validatedArray: A[] = []
    const errors: ValidationError[] = []

    for (let i = 0; i < v.length; i++) {
      const item  = v[i]
      const validation = this.validator.validate(item, config, getContext(String(i), c))

      if (validation.isOk()) {
        validatedArray.push(validation.get())
      }
      else {
        pushAll(errors, validation.get())
      }
    }

    return errors.length ? Err(errors) : Ok(validatedArray)
  }
}

export function array<A>(validator: Validator<A>): Validator<A[]> {
  return new ArrayValidator(validator)
}

//--------------------------------------
//  tuple
//--------------------------------------

export class TupleValidator extends Validator<any> {
  constructor(private validators: Validator<any>[]) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    if (!Array.isArray(v)) return typeFailure(v, c, 'Tuple')
    if (v.length !== this.validators.length) return failure(c, `Expected a Tuple${this.validators.length} but got a Tuple${v.length}`)

    const validatedArray: any[] = []
    const errors: ValidationError[] = []

    for (let i = 0; i < v.length; i++) {
      const item  = v[i]
      const validation = this.validators[i].validate(item, config, getContext(String(i), c))

      if (validation.isOk()) {
        validatedArray.push(validation.get())
      }
      else {
        pushAll(errors, validation.get())
      }
    }

    return errors.length ? Err(errors) : Ok(validatedArray)
  }
}

export function tuple<A = never>(): Validator<A[]>
export function tuple<A>(a: Validator<A>): Validator<[A]>
export function tuple<A, B>(a: Validator<A>, b: Validator<B>): Validator<[A, B]>
export function tuple<A, B, C>(a: Validator<A>, b: Validator<B>, c: Validator<C>): Validator<[A, B, C]>
export function tuple<A, B, C, D>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>): Validator<[A, B, C, D]>
export function tuple<A, B, C, D, E>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>): Validator<[A, B, C, D, E]>
export function tuple<A, B, C, D, E, F>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>): Validator<[A, B, C, D, E, F]>
export function tuple<A, B, C, D, E, F, G>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>): Validator<[A, B, C, D, E, F, G]>
export function tuple<A, B, C, D, E, F, G, H>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>, h: Validator<H>): Validator<[A, B, C, D, E, F, G, H]>
export function tuple<A, B, C, D, E, F, G, H, I>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>, h: Validator<H>, i: Validator<I>): Validator<[A, B, C, D, E, F, G, H, I]>
export function tuple<A, B, C, D, E, F, G, H, I, J>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>, h: Validator<H>, i: Validator<I>, j: Validator<J>): Validator<[A, B, C, D, E, F, G, H, I, J]>
export function tuple<A, B, C, D, E, F, G, H, I, J, K>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>, h: Validator<H>, i: Validator<I>, j: Validator<J>, k: Validator<K>): Validator<[A, B, C, D, E, F, G, H, I, J, K]>
export function tuple<A, B, C, D, E, F, G, H, I, J, K, L>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>, h: Validator<H>, i: Validator<I>, j: Validator<J>, k: Validator<K>, l: Validator<L>): Validator<[A, B, C, D, E, F, G, H, I, J, K, L]>

export function tuple(...validators: any[]): any {
  return new TupleValidator(validators)
}

//--------------------------------------
//  object
//--------------------------------------

export type Props = Record<string, Any>

type OptionalKeys<P extends Props> = { [K in keyof P]: undefined extends TypeOf<P[K]> ? K : never }[keyof P]
type MandatoryKeys<P extends Props> = { [K in keyof P]: undefined extends TypeOf<P[K]> ? never : K }[keyof P]

export type ObjectOf<P extends Props> = { [K in MandatoryKeys<P>]: TypeOf<P[K]> } & { [K in OptionalKeys<P>]?: TypeOf<P[K]> }

export class ObjectValidator<P extends Props> extends Validator<ObjectOf<P>> {
  constructor(private props: P) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    if (v == null || typeof v !== 'object') return typeFailure(v, c, 'object')

    const validatedObject: any = {}
    const errors: ValidationError[] = []

    for (let key in this.props) {
      const transformedKey = config.transformObjectKeys !== undefined
        ? config.transformObjectKeys(key)
        : key

      const value = (v as any)[transformedKey]
      const validator = this.props[key]
      const validation = validator.validate(value, config, getContext(transformedKey, c))

      if (validation.isOk()) {
        if (validation.get() !== undefined)
          validatedObject[key] = validation.get()
      }
      else {
        pushAll(errors, validation.get())
      }
    }
    return errors.length ? Err(errors) : Ok(validatedObject)
  }
}

export function object<P extends Props>(props: P): Validator<ObjectOf<P>> {
  return new ObjectValidator(props)
}

//--------------------------------------
//  keyof
//--------------------------------------

export class KeyOfValidator<KEYS extends object> extends Validator<keyof KEYS> {
  constructor(private keys: KEYS) { super() }

  validate(v: Value, _config: Configuration = defaultConfig, c: Context = rootContext): Validation<keyof KEYS> {
    return this.keys.hasOwnProperty(v as string)
      ? success(v as any)
      : failure(c, `${pretty(v)} is not a key of ${pretty(this.keys)}`)
  }
}

export function keyof<KEYS extends object>(keys: KEYS): KeyOfValidator<KEYS> {
  return new KeyOfValidator(keys)
}

//--------------------------------------
//  dictionary
//--------------------------------------

export class DictionaryValidator<K extends string, V> extends Validator<Record<K, V>> {
  constructor(
    private domain: Validator<K>,
    private codomain: Validator<V>) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    if (v == null || typeof v !== 'object') return typeFailure(v, c, 'object')

    const validatedDict: any = {}
    const errors: ValidationError[] = []

    for (let key in v) {
      const value = (v as any)[key]

      const context = getContext(key, c)
      const domainValidation = this.domain.validate(key, config, context)
      const codomainValidation = this.codomain.validate(value, config, context)

      if (domainValidation.isOk()) {
        key = domainValidation.get()
      }
      else {
        const error = domainValidation.get()
        pushAll(errors, error.map(e => ({ context, message: `Error validating the key. ${e.message}` })))
      }

      if (codomainValidation.isOk()) {
        validatedDict[key] = codomainValidation.get()
      }
      else {
        const error = codomainValidation.get()
        pushAll(errors, error.map(e => ({ context, message: `Error validating the value. ${e.message}` })))
      }
    }
    return errors.length ? Err(errors) : Ok(validatedDict)
  }
}

export function dictionary<K extends string, V>(
  domain: Validator<K>,
  codomain: Validator<V>): Validator<Record<K, V>> {

  return new DictionaryValidator(domain, codomain)
}

//--------------------------------------
//  literal
//--------------------------------------

export type Literal = string | number | boolean | null | undefined

class LiteralValidator<V extends Literal> extends Validator<V> {
  constructor(private value: V) { super() }

  validate(v: Value, _config: Configuration = defaultConfig, c: Context = rootContext) {
    return v === this.value
      ? success(v as V)
      : failure(c, `Expected literal value ${this.value} but found ${pretty(v)}`)
  }
}

export function literal<V extends Literal>(value: V): Validator<V> {
  return new LiteralValidator(value)
}

//--------------------------------------
//  intersection
//--------------------------------------

class IntersectionValidator<A> extends Validator<A> {
  constructor(private validators: Validator<any>[]) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    let result: any = {}

    for (let i = 0; i < this.validators.length; i++) {
      const validation = this.validators[i].validate(v, config, c)
      
      if (validation.isOk()) {
        result = { ...result, ...validation.get() }
      }
      else {
        return validation
      }
    }

    return success(result)
  }
}

export function intersection<A, B>(a: Validator<A>, b: Validator<B>): Validator<A & B>
export function intersection<A, B, C>(a: Validator<A>, b: Validator<B>, c: Validator<C>): Validator<A & B & C>
export function intersection<A, B, C>(a: Validator<A>, b: Validator<B>, c: Validator<C>): Validator<A & B & C>
export function intersection<A, B, C, D>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>): Validator<A & B & C & D>
export function intersection<A, B, C, D, E>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>): Validator<A & B & C & D & E>
export function intersection<A, B, C, D, E, F>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>): Validator<A & B & C & D & E & F>


export function intersection(...values: any[]): any {
  return new IntersectionValidator(values)
}

//--------------------------------------
//  union
//--------------------------------------

export class UnionValidator<A> extends Validator<A> {
  constructor(private validators: Validator<A>[]) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    const errors: ValidationError[][] = []

    for (let i = 0; i < this.validators.length; i++) {
      const validation = this.validators[i].validate(v, config, c)
      if (validation.isOk())
        return validation
      else
        errors.push(validation.get())
    }

    const detailString = errors.map((es, index) =>
      `Union type #${index} => \n  ${errorDebugString(es).replace(/\n/g, '\n  ')}`).join('\n')

    return failure(c, `The value ${pretty(v)} \nis not part of the union: \n\n${detailString}`)
  }
}

export class LiteralUnionValidator<A extends Literal> extends Validator<A> {
  constructor(private values: A[]) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    for (let i = 0; i < this.values.length; i++) {
      const validator = literal(this.values[i])
      const validation = validator.validate(v, config, c)
      if (validation.isOk()) return validation
    }
    return failure(c, `The value ${pretty(v)} is not part of the union`)
  }
}


export function union<A, B>(a: Validator<A>, b: Validator<B>): Validator<A | B>
export function union<A extends Literal, B extends Literal>(a: A, b: B): Validator<A | B>

export function union<A, B, C>(a: Validator<A>, b: Validator<B>, c: Validator<C>): Validator<A | B | C>
export function union<A extends Literal, B extends Literal, C extends Literal>(a: A, b: B, c: C): Validator<A | B | C>

export function union<A, B, C, D>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>): Validator<A | B | C | D>
export function union<A extends Literal, B extends Literal, C extends Literal, D extends Literal>(a: A, b: B, c: C, d: D): Validator<A | B | C | D>

export function union<A, B, C, D, E>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>): Validator<A | B | C | D | E>
export function union<A extends Literal, B extends Literal, C extends Literal, D extends Literal, E extends Literal>(a: A, b: B, c: C, d: D, e: E): Validator<A | B | C | D | E>

export function union<A, B, C, D, E, F>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>): Validator<A | B | C | D | E | F>
export function union<A extends Literal, B extends Literal, C extends Literal, D extends Literal, E extends Literal, F extends Literal>(a: A, b: B, c: C, d: D, e: E, f: F): Validator<A | B | C | D | E | F>

export function union<A, B, C, D, E, F, G>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>): Validator<A | B | C | D | E | F | G>
export function union<A extends Literal, B extends Literal, C extends Literal, D extends Literal, E extends Literal, F extends Literal, G extends Literal>(a: A, b: B, c: C, d: D, e: E, f: F, g: G): Validator<A | B | C | D | E | F | G>

export function union<A, B, C, D, E, F, G, H>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>, h: Validator<H>): Validator<A | B | C | D | E | F | G | H>
export function union<A extends Literal, B extends Literal, C extends Literal, D extends Literal, E extends Literal, F extends Literal, G extends Literal, H extends Literal>(a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H): Validator<A | B | C | D | E | F | G | H>

export function union<A, B, C, D, E, F, G, H, I>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>, h: Validator<H>, i: Validator<I>): Validator<A | B | C | D | E | F | G | H | I>
export function union<A extends Literal, B extends Literal, C extends Literal, D extends Literal, E extends Literal, F extends Literal, G extends Literal, H extends Literal, I extends Literal>(a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I): Validator<A | B | C | D | E | F | G | H | I>

export function union<A, B, C, D, E, F, G, H, I, J>(a: Validator<A>, b: Validator<B>, c: Validator<C>, d: Validator<D>, e: Validator<E>, f: Validator<F>, g: Validator<G>, h: Validator<H>, i: Validator<I>, j: Validator<J>): Validator<A | B | C | D | E | F | G | H | I | J>
export function union<A extends Literal, B extends Literal, C extends Literal, D extends Literal, E extends Literal, F extends Literal, G extends Literal, H extends Literal, I extends Literal, J extends Literal>(a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J): Validator<A | B | C | D | E | F | G | H | I | J>

export function union(...values: any[]): any {
  const probe = values[0]
  return (probe && typeof probe === 'object')
    ? new UnionValidator(values)
    : new LiteralUnionValidator(values)
}

//--------------------------------------
//  optional
//--------------------------------------

export class OptionalValidator<V> extends Validator<V | undefined> {
  constructor(private validator: Validator<V>) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    if (v === undefined) return success(v as undefined)
    return this.validator.validate(v, config, c)
  }
}

export function optional<V>(validator: Validator<V>): Validator<V | undefined> {
  return new OptionalValidator(validator)
}

//--------------------------------------
//  option
//--------------------------------------

export class OptionValidator<V> extends Validator<Option<V>> {
  constructor(private validator: Validator<V>) { super() }

  validate(v: Value, config: Configuration = defaultConfig, c: Context = rootContext) {
    if (v === undefined || v === null) return success(None)
    return this.validator.validate(v, config, c).map(Some)
  }
}

export function option<V>(validator: Validator<V>): Validator<Option<V>> {
  return new OptionValidator(validator)
}

//--------------------------------------
//  recursion
//--------------------------------------

export function recursion<T>(definition: (self: Validator<T>) => Any): Validator<T> {
  const Self = new (Validator as any)()
  Self.validate = (v: Value, config: Configuration = defaultConfig, c: Context = rootContext) =>
    Result.validate(v, config, c)
  const Result: any = definition(Self)
  return Result
}

//--------------------------------------
//  isoDate
//--------------------------------------

export class IsoDateValidator extends Validator<Date> {

  validate(v: Value, _config: Configuration = defaultConfig, c: Context = rootContext) {
    if (typeof v !== 'string') return typeFailure(v, c, 'string')
    const date = new Date(v)
    return isNaN(date.getTime())
      ? failure(c, `Expected an ISO date but got: ${pretty(v)}`)
      : success(date)
  }
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
  return errors.map(e => `At [${e.context}] ${e.message}`).join('\n')
}

//--------------------------------------
//  Export aliases and singletons
//--------------------------------------

const nullValidation = new NullValidator()
const undefinedValidation = new UndefinedValidator()

export {
  nullValidation as null,
  undefinedValidation as undefined
}

export const string = new StringValidator()
export const number = new NumberValidator()
export const boolean = new BooleanValidator()
export const isoDate = new IsoDateValidator()