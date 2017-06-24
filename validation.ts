import { Result, Ok, Err } from 'space-lift/result'


//--------------------------------------
//  Setup
//--------------------------------------

export interface Validator<T> {
  readonly T: T
  readonly validate: (value: Value, context: Context) => Validation<T>
}

export type Any = Validator<Object>
export type TypeOf<V extends Any> = V['T']

export interface ValidationError {
  readonly message: string
  readonly context: Context
}

export type Value = Object | null | undefined

export type Context = string & { __tag: 'context' }

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

export function validate<T>(value: Value, validator: Validator<T>): Validation<T> {
  return validator.validate(value, getContext('root'))
}

export function is<T>(value: Value, validator: Validator<T>): value is T {
  return validate(value, validator).isOk()
}

//--------------------------------------
//  Primitives
//--------------------------------------

export class NullValidator {
  T: null
  validate(v: Value, c: Context): Validation<null> {
    return v === null ? success(v) : typeFailure(v, c, 'null')
  }
}

export class UndefinedValidator {
  T: undefined
  validate(v: Value, c: Context): Validation<undefined> {
    return v === void 0 ? success(v) : typeFailure(v, c, 'undefined')
  }
}

export class StringValidator implements Validator<string> {
  T: string
  validate(v: Value, c: Context): Validation<string> {
    return typeof v === 'string' ? success(v) : typeFailure(v, c, 'string')
  }
}

export class NumberValidator {
  T: number
  validate(v: Value, c: Context): Validation<number> {
    return typeof v === 'number' ? success(v) : typeFailure(v, c, 'number')
  }
}

export class BooleanValidator {
  T: boolean
  validate(v: Value, c: Context): Validation<boolean> {
    return typeof v === 'boolean' ? success(v) : typeFailure(v, c, 'boolean')
  }
}

//--------------------------------------
//  map
//--------------------------------------

export class MappedValidator<A extends Any, B> {
  constructor(private validator: A, private f: (a: TypeOf<A>) => B) {}

  T: B

  validate(v: Value, c: Context) { return this.validator.validate(v, c).map(this.f) }
}

export function map<A extends Any, B>(validator: A, f: (a: TypeOf<A>) => B): MappedValidator<A, B> {
  return new MappedValidator(validator, f)
}

//--------------------------------------
//  filter
//--------------------------------------

export class FilteredValidator<A extends Any> {
  constructor(private validator: A, private predicate: (a: TypeOf<A>) => boolean) {}

  T: TypeOf<A>

  validate(v: Value, c: Context) {
    const validated = this.validator.validate(v, c)
    return validated.flatMap(v =>
      this.predicate(v) ? validated : failure(c, `Predicate failed for value ${pretty(v)}`))
  }
}

export function filter<A extends Any>(validator: A, predicate: (a: TypeOf<A>) => boolean): FilteredValidator<A> {
  return new FilteredValidator(validator, predicate)
}

//--------------------------------------
//  array
//--------------------------------------

export class ArrayValidator<A extends Any> {
  constructor(private validator: A) {}

  T: TypeOf<A>[]

  validate(v: Value, c: Context): Validation<A[]> {
    if (!Array.isArray(v)) return typeFailure(v, c, 'array')

    const validatedArray: TypeOf<A>[] = []
    const errors: ValidationError[] = []
    let changed = false

    for (let i = 0; i < v.length; i++) {
      const item  = v[i]
      const validation = this.validator.validate(item, getContext(String(i), c))

      if (validation.isOk()) {
        changed = changed || validation.get() !== item
        validatedArray.push(validation.get())
      }
      else {
        pushAll(errors, validation.get())
      }
    }

    return errors.length ? Err(errors) : Ok(changed ? validatedArray : v)
  }
}

export function array<A extends Any>(validator: A): Validator<TypeOf<A>[]> {
  return new ArrayValidator(validator)
}

//--------------------------------------
//  object
//--------------------------------------

export type Props = Record<string, Any>

export type InterfaceFor<P extends Props> = { [K in keyof P]: TypeOf<P[K]> }

export class ObjectValidator<P extends Props> {
  constructor(private props: P) {}

  T: InterfaceFor<P>

  validate(v: Value, c: Context): Validation<InterfaceFor<P>> {
    if (v == null || typeof v !== 'object') return typeFailure(v, c, 'object')

    const validatedObject: any = { ...v }
    const errors: ValidationError[] = []
    let changed = false

    for (let key in this.props) { 
      const value = (v as any)[key]
      const validator = this.props[key]
      const validation = validator.validate(value, getContext(key, c))

      if (validation.isOk()) {
        changed = changed || value !== validation.get()
        validatedObject[key] = validation.get()
      }
      else {
        pushAll(errors, validation.get())
      }
    }
    return errors.length ? Err(errors) : Ok(changed ? validatedObject : v)
  }
}

export function object<P extends Props>(props: P): Validator<InterfaceFor<P>> {
  return new ObjectValidator(props)
}

//--------------------------------------
//  keyof
//--------------------------------------

export class KeyOfValidator<KEYS extends object> {
  constructor(private keys: KEYS) {}

  T: keyof KEYS

  validate(v: Value, c: Context): Validation<keyof KEYS> {
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

export class DictionaryValidator<D extends Validator<string>, CD extends Any> {
  constructor(private domain: D, private codomain: CD) {}

  T: Record<TypeOf<D>, TypeOf<CD>>

  validate(v: Value, c: Context) {
    if (v == null || typeof v !== 'object') return typeFailure(v, c, 'object')

    const validatedDict: any = {}
    const errors: ValidationError[] = []
    let changed = false

    for (let key in v) {
      const value = (v as any)[key]

      const context = getContext(key, c)
      const domainValidation = this.domain.validate(key, context)
      const codomainValidation = this.codomain.validate(value, context)

      if (domainValidation.isOk()) {
        changed = changed || key !== domainValidation.get()
        key = domainValidation.get()
      }
      else {
        const error = domainValidation.get()
        pushAll(errors, error.map(e => ({ context, message: `Error validating the key. ${e.message}` })))
      }

      if (codomainValidation.isOk()) {
        changed = changed || value !== codomainValidation.get()
        validatedDict[key] = codomainValidation.get()
      }
      else {
        const error = codomainValidation.get()
        pushAll(errors, error.map(e => ({ context, message: `Error validating the value. ${e.message}` })))
      }
    }
    return errors.length ? Err(errors) : Ok(changed ? validatedDict : v)
  }
}

export function dictionary<D extends Validator<string>, CD extends Any>(
  domain: D,
  codomain: CD): Validator<Record<TypeOf<D>, TypeOf<CD>>> {

  return new DictionaryValidator(domain, codomain)
}

//--------------------------------------
//  literal
//--------------------------------------

export type Literal = string | number | boolean

class LiteralValidator<V extends Literal> {
  constructor(private value: V) {}

  T: V

  validate(v: Value, c: Context): Validation<V> {
    return v === this.value
      ? success(v as V)
      : failure(c, `Expected literal value ${this.value} but found ${pretty(v)}`)
  }
}

export function literal<V extends Literal>(value: V): Validator<V> {
  return new LiteralValidator(value)
}

//--------------------------------------
//  union
//--------------------------------------

export class UnionValidator<A extends Any> {
  constructor(private validators: A[]) {}

  T: TypeOf<A>

  validate(v: Value, c: Context): Validation<TypeOf<A>> {
    for (let i = 0; i < this.validators.length; i++) {
      const validation = this.validators[i].validate(v, c)
      if (validation.isOk()) return validation
    }
    return failure(c, `The value ${pretty(v)} is not part of the union`)
  }
}

export class LiteralUnionValidator<A extends Literal> {
  constructor(private values: A[]) {}

  T: A

  validate(v: Value, c: Context): Validation<A> {
    for (let i = 0; i < this.values.length; i++) {
      const validator = literal(this.values[i])
      const validation = validator.validate(v, c)
      if (validation.isOk()) return validation
    }
    return failure(c, `The value ${pretty(v)} is not part of the union`)
  }
}


export function union<A extends Any, B extends Any>(a: A, b: B): UnionValidator<A | B>
export function union<A extends Literal, B extends Literal>(a: A, b: B): LiteralUnionValidator<A | B>

export function union<A extends Any, B extends Any, C extends Any>(a: A, b: B, c: C): UnionValidator<A | B | C>
export function union<A extends Literal, B extends Literal, C extends Literal>(a: A, b: B, c: C): LiteralUnionValidator<A | B | C>

export function union<A extends Any, B extends Any, C extends Any, D extends Any>(a: A, b: B, c: C, d: D): UnionValidator<A | B | C | D>
export function union<A extends Literal, B extends Literal, C extends Literal, D extends Literal>(a: A, b: B, c: C, d: D): LiteralUnionValidator<A | B | C | D>

export function union(...values: any[]): any {
  return (typeof values[0] === 'object') ? new UnionValidator(values) : new LiteralUnionValidator(values)
}

//--------------------------------------
//  optional
//--------------------------------------

export class OptionalValidator<V extends Any> {
  constructor(private validator: V) {}

  T: TypeOf<V> | undefined

  validate(v: Value, c: Context): Validation<TypeOf<V> | undefined> {
    if (v === undefined) return success(v)
    return this.validator.validate(v, c)
  }
}

export function optional<V extends Any>(validator: V): OptionalValidator<V> {
  return new OptionalValidator(validator)
}

//--------------------------------------
//  recursion
//--------------------------------------

export function recursion<T>(definition: (self: Any) => Any): Validator<T> {
  const Self = { validate: (v, c) => Result.validate(v, c) } as Validator<any>
  const Result: any = definition(Self)
  return Result
}

//--------------------------------------
//  isoDate
//--------------------------------------

export class IsoDateValidator {

  T: Date

  validate(v: Value, c: Context) {
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