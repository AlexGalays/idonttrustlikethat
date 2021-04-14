import * as expect from 'expect'
import { lift } from 'space-lift'

import * as v from '../commonjs/core'
import { Ok, Err } from '../commonjs/core'

const showErrorMessages = true

describe('validation core', () => {
  it('can validate that a value is a null', () => {
    expect(v.null.validate(null).ok).toBe(true)
    expect(v.is(null, v.null)).toBe(true)

    expect(v.null.validate(undefined).ok).toBe(false)
    expect(v.null.validate({}).ok).toBe(false)
    expect(v.is({}, v.null)).toBe(false)

    type Null = typeof v.null.T
    const n: Null = null
  })

  it('can validate that a value is a string', () => {
    expect(v.string.validate('hola').ok).toBe(true)
    expect(v.is('hola', v.string)).toBe(true)

    expect(v.string.validate(undefined).ok).toBe(false)
    expect(v.string.validate({}).ok).toBe(false)
    expect(v.is({}, v.string)).toBe(false)

    type String = typeof v.string.T
    const str: String = 'hola'
  })

  it('can validate a value and map it', () => {
    const validator = v.number.map(x => x * 2)

    expect((validator.validate(10) as any).value).toBe(20)

    type Number = typeof validator.T
    const num: Number = 33
  })

  it('can validate a value and further flatMap it', () => {
    const validator = v.number.flatMap(x => Ok(String(x * 2)))

    type StringFromNumber = typeof validator.T
    const str: StringFromNumber = 'ok'

    expect((validator.validate(10) as Ok<unknown>).value).toBe('20')

    const validator2 = v.number.flatMap(x =>
      x < 1000 ? Err('hell no') : Ok(x)
    )

    type Number = typeof validator2.T
    const num: Number = 33

    const result2 = validator2.validate(10)
    expect(!result2.ok && result2.errors[0].message).toBe('hell no')

    const validator3 = v.number.flatMap(x =>
      x > 10 ? Ok(String(x).split('')) : Err('aww')
    )

    type StrArray = typeof validator3.T
    const strArray: StrArray = ['1']

    expect((validator3.validate(20) as Ok<unknown>).value).toEqual(['2', '0'])
    const result3 = validator3.validate(5)
    expect(!result3.ok && result3.errors[0].message).toBe('aww')
    printErrorMessage(result3)
  })

  it('can compose two validators returning a single string error', () => {
    const stringToInt = v.string.flatMap(str => {
      const result = Number.parseInt(str, 10)
      if (Number.isFinite(result)) return Ok(result)
      return Err('Expected an integer-like string, got: ' + str)
    })

    const timestampOk = v.number.flatMap(n => {
      const date = new Date(n)
      if (date.getTime() === NaN) return Err('Not a valid date')
      return Ok(date)
    })

    const timestampNope = v.number.flatMap(n => {
      return Err('Not a valid date')
    })

    const composedValidator1 = stringToInt.then(timestampOk)
    const result1 = composedValidator1.validate('01')
    expect(result1.ok && result1.value.getMilliseconds()).toBe(1)

    const result2 = composedValidator1.validate(1)
    expect(result2.ok).toBe(false)
    printErrorMessage(result2)

    const result3 = stringToInt.then(timestampNope).validate('01')
    expect(!result3.ok && result3.errors[0].message).toBe('Not a valid date')
    printErrorMessage(result3)
  })

  it('can validate a filtered value', () => {
    const positiveNumber = v.number.filter(x => x >= 0)

    function isPositiveNumber(n: number) {
      return n >= 0
    }

    expect((positiveNumber.validate(10) as Ok<unknown>).value).toBe(10)
    expect(positiveNumber.validate(-1).ok).toBe(false)

    printErrorMessage(positiveNumber.validate(-1))
    printErrorMessage(v.number.filter(isPositiveNumber).validate(-1))

    type PositiveNumber = typeof positiveNumber.T
    const num: PositiveNumber = 33
  })

  it('can validate an array', () => {
    const numArray = [1, 2, 3]
    expect((v.array(v.number).validate(numArray) as Ok<unknown>).value).toEqual(
      numArray
    )

    const badNumArray = [1, 'oops', 'fuu']
    const badValidation = v.array(v.number).validate(badNumArray)

    printErrorMessage(badValidation)

    if (badValidation.ok) {
      throw new Error('Should be an Error')
    }

    expect(badValidation.errors.length).toBe(2)
  })

  it('can validate an object', () => {
    const person = v.object({
      id: v.number,
      name: v.string,
      friends: v.array(
        v.object({
          name: v.string
        })
      )
    })

    const okValidation = person.validate({
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }],
      someIrrelevantKey: true
    })

    if (!okValidation.ok) throw new Error('Should be OK')

    expect(okValidation.value).toEqual({
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }]
    })

    const notOkValidation = person.validate({
      id: '123',
      name: 'Alex',
      friends: [{ name: 'bob' }, { id: 'john' }]
    })

    expect(!notOkValidation.ok && notOkValidation.errors.length).toBe(2)
    printErrorMessage(notOkValidation)

    type Person = typeof person.T

    // Tests the type derivation: it should compile
    const alex2: Person = {
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }]
    }
  })

  it('can expose object props', () => {
    const obj = {
      id: v.number,
      name: v.string,
      friends: v.array(
        v.object({
          name: v.string
        })
      )
    }
    const person = v.object(obj)

    expect(person.props).toBe(obj)
  })

  it('can validate a dictionary', () => {
    const strNumMap = v.dictionary(v.string, v.number)

    const okValidation = strNumMap.validate({
      a: 1,
      b: 2,
      c: 3
    })

    expect(okValidation.ok).toBe(true)

    const notOkValidation = strNumMap.validate({
      a: 1,
      b: 2,
      c: '3'
    })

    expect(notOkValidation.ok).toBe(false)

    // domain = more precise than strings
    const enumNumMap = v.dictionary(v.union(...(['a', 'b'] as const)), v.number)

    const okValidation2 = enumNumMap.validate({ a: 1, b: 2 })

    expect(okValidation2.ok).toBe(true)

    const notOkValidation2 = enumNumMap.validate({
      a: 1,
      bb: 2,
      c: '3'
    })

    expect(!notOkValidation2.ok && notOkValidation2.errors.length).toBe(3)
    printErrorMessage(notOkValidation2)
  })

  it('can validate a Map-like dictionary where all values are optional', () => {
    const dict = v.dictionary(v.union('A', 'B'), v.string.optional())
    type OptionalDict = typeof dict.T

    const okValidation = dict.validate({
      B: 'hello'
    })

    expect(okValidation.ok && okValidation.value).toEqual({ B: 'hello' })

    // Type assertion.
    const _dict: OptionalDict = { A: 'hey' }
    const _dict2: OptionalDict = {}
    const _dict3: OptionalDict = { A: undefined }
  })

  it('can validate an intersection of types', () => {
    const flying = v.object({
      flyingDistance: v.number
    })

    const squirrel = v.object({
      family: v.literal('Sciuridae'),
      isCute: v.boolean.optional()
    })

    const flyingSquirrel = v.intersection(flying, squirrel)

    const vulture = {
      flyingDistance: 5000,
      family: 'Accipitridae',
      isCute: false
    }

    const notOkValidation = flyingSquirrel.validate(vulture)
    expect(notOkValidation.ok).toBe(false)

    printErrorMessage(notOkValidation)

    const bob = {
      flyingDistance: 90,
      family: 'Sciuridae' as 'Sciuridae',
      hasAnAgenda: true
    }

    const okValidation = flyingSquirrel.validate(bob)
    expect(okValidation.ok && okValidation.value).toEqual({
      flyingDistance: 90,
      family: 'Sciuridae'
    })

    // smoke-test generated type
    type Squirel = typeof flyingSquirrel.T
    const x: Squirel = bob
  })

  it('can validate an union of types', () => {
    const helloOrObj = v.union(
      v.string,
      v.object({ id: v.string, name: v.string })
    )
    const okValidation = helloOrObj.validate('hello')
    const okValidation2 = helloOrObj.validate({ id: '123', name: 'hello' })

    expect(okValidation.ok).toBe(true)
    expect(okValidation2.ok).toBe(true)

    const notOkValidation = helloOrObj.validate(111)
    const notOkValidation2 = helloOrObj.validate({ name2: 'hello' })

    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)
    printErrorMessage(notOkValidation)
    printErrorMessage(notOkValidation2)

    type HelloOrObj = typeof helloOrObj.T
    const hello: HelloOrObj = 'hello'

    // Union of literals - shortcut
    const unionsOfLiterals = v.union(null, 'hello', true, 33)
    const okValidation3 = unionsOfLiterals.validate('hello')
    const okValidation4 = unionsOfLiterals.validate(33)
    const okValidation5 = unionsOfLiterals.validate(null)

    expect(okValidation3.ok).toBe(true)
    expect(okValidation4.ok).toBe(true)
    expect(okValidation5.ok).toBe(true)

    const notOkValidation3 = unionsOfLiterals.validate('hello2')
    const notOkValidation4 = unionsOfLiterals.validate(34)

    expect(notOkValidation3.ok).toBe(false)
    expect(notOkValidation4.ok).toBe(false)
    printErrorMessage(notOkValidation3)
  })

  it('can use an union validator to validate against the keys of an object', () => {
    const obj = {
      age: 10,
      address: '134 clapham manor street'
    }

    function keysOfValidator<T extends object>(object: T) {
      return v.union(...lift(object).keys().value())
    }

    const validator = keysOfValidator(obj)

    const okValidation = validator.validate('age')
    const notOkValidation = validator.validate('nope')

    expect(okValidation.ok && okValidation.value).toEqual('age')
    expect(notOkValidation.ok).toBe(false)
  })

  it('can validate a discriminated union of types', () => {
    const validator = v.discriminatedUnion(
      'type',
      v.object({ type: v.literal('A'), name: v.string }),
      v.object({ type: v.literal('B'), data: v.number })
    )

    const okValidation = validator.validate({
      type: 'A',
      name: 'Alfred',
      _meta: 10
    })

    const okValidation2 = validator.validate({ type: 'B', data: 10 })

    const notOkValidation = validator.validate({ _type: 'A', name: 'name' })
    const notOkValidation2 = validator.validate({ type: 'B', name: '10' })
    const notOkValidation3 = validator.validate({ type: 'C', name: '10' })
    const notOkValidation4 = validator.validate(null)

    expect(okValidation.ok && okValidation.value).toEqual({
      type: 'A',
      name: 'Alfred'
    })
    expect(okValidation2.ok && okValidation2.value).toEqual({
      type: 'B',
      data: 10
    })

    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)
    expect(notOkValidation3.ok).toBe(false)
    expect(notOkValidation4.ok).toBe(false)

    printErrorMessage(notOkValidation)
    printErrorMessage(notOkValidation2)
    printErrorMessage(notOkValidation3)
    printErrorMessage(notOkValidation4)
  })

  it('can validate a literal value', () => {
    const literalStr = v.literal('hello')

    const okValidation = literalStr.validate('hello')
    expect(okValidation.ok).toBe(true)

    const notOkValidation = literalStr.validate('boo')
    expect(notOkValidation.ok).toBe(false)
  })

  it('can validate an optional value', () => {
    const optionalString = v.string.optional()

    const okValidation = optionalString.validate('hello')
    expect(okValidation.ok).toBe(true)

    const okValidation2 = optionalString.validate(undefined)
    expect(okValidation2.ok).toBe(true)

    const notOkValidation = optionalString.validate(null)
    expect(notOkValidation.ok).toBe(false)

    const notOkValidation2 = optionalString.validate({})
    expect(notOkValidation2.ok).toBe(false)

    printErrorMessage(notOkValidation2)
  })

  it('can validate a primitive and tag it', () => {
    type UserId = string & { __tag: 'UserId' }

    const userIdValidator = v.string.tagged<UserId>()

    const okValidation = userIdValidator.validate('abcd')

    if (okValidation.ok) {
      // Check assignation/type
      const idAsUserId: UserId = okValidation.value
      const idAsString: string = okValidation.value
    } else {
      throw new Error()
    }

    const notOkValidation = v.string.tagged<UserId>().validate({})

    expect(notOkValidation.ok).toBe(false)
  })

  it('can validate a combination of object and union values', () => {
    const validator = v.object({
      id: v.string,
      params: v.union(v.null, v.object({ id: v.string }))
    })

    const okValidation = validator.validate({ id: '1', params: null })
    const okValidation2 = validator.validate({ id: '1', params: { id: '2' } })
    const notOkValidation = validator.validate({ id: '1', params: {} })

    expect(okValidation.ok).toBe(true)
    expect(okValidation2.ok).toBe(true)
    expect(notOkValidation.ok).toBe(false)
  })

  it('can validate and omit optional object values', () => {
    const validator = v.object({
      id: v.string,
      query: v.string.optional(),
      path: v.string.optional()
    })

    const okValidation = validator.validate({ id: '1', query: 'q' })
    expect(okValidation.ok && okValidation.value).toEqual({
      id: '1',
      query: 'q'
    })
  })

  it('can validate a combination of dictionary and union values', () => {
    const validator = v.dictionary(
      v.string,
      v.union(v.null, v.object({ id: v.string }))
    )

    const okValidation = validator.validate({ id: null })
    const okValidation2 = validator.validate({ id: { id: '2' } })
    const notOkValidation = validator.validate({ id: {} })

    expect(okValidation.ok).toBe(true)
    expect(okValidation2.ok).toBe(true)
    expect(notOkValidation.ok).toBe(false)
  })

  it('can validate a tuple', () => {
    const tuple0 = v.tuple()
    const tuple1 = v.tuple(v.number)
    const validator = v.tuple(v.number, v.string, v.null)

    const okValidation = validator.validate([10, '10', null])

    // The length is strictly validated so the type doesn't lie if we map, etc
    const notOkValidation = validator.validate([10, '10', null, 10, 10, 10])
    const notOkValidation2 = validator.validate([10, 10, null])
    const notOkValidation3 = validator.validate(33)

    expect(tuple0.validate([]).ok).toBe(true)
    expect(tuple1.validate([10]).ok).toBe(true)
    expect(okValidation.ok).toBe(true)
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)
    expect(notOkValidation3.ok).toBe(false)

    printErrorMessage(notOkValidation)
    printErrorMessage(notOkValidation2)
    printErrorMessage(notOkValidation3)
  })

  it('can transform snake cased inputs into camel case before validating', () => {
    const burger = v.object({
      id: v.number,
      meatCooking: v.string,
      awesomeSidesNomNom: v.array(v.string),
      options: v.object({
        doubleBacon: v.boolean
      })
    })

    const okSnakeCased = burger.validate(
      {
        id: 123,
        meat_cooking: 'rare',
        awesome_sides_nom_nom: ['loaded fries', 'barbecue sauce'],
        options: {
          double_bacon: true
        }
      },
      { transformObjectKeys: v.snakeCaseTransformation }
    )

    const expected = {
      id: 123,
      meatCooking: 'rare',
      awesomeSidesNomNom: ['loaded fries', 'barbecue sauce'],
      options: {
        doubleBacon: true
      }
    }

    if (!okSnakeCased.ok) throw new Error('Should be OK')

    expect(okSnakeCased.value).toEqual(expected)
  })

  it('reports transformed key names to the user in case of error', () => {
    const burger = v.object({
      id: v.number,
      meatCooking: v.string,
      awesomeSides: v.array(v.string)
    })

    const fieldInError = burger.validate(
      {
        id: 123,
        meat_cooking: 42,
        awesome_sides: ['loaded fries', 'barbecue sauce']
      },
      { transformObjectKeys: v.snakeCaseTransformation }
    )

    expect(fieldInError.ok).toBe(false)

    printErrorMessage(fieldInError)

    if (!fieldInError.ok) {
      const { path } = fieldInError.errors[0]
      expect(path).toEqual('meat_cooking')
    }
  })

  it('should be strict on input casing when using transformObjectKeys', () => {
    const burger = v.object({
      id: v.number,
      meatCooking: v.string,
      awesomeSides: v.array(v.string)
    })

    const errorCamelCased = burger.validate(
      {
        id: 456,
        meatCooking: 'blue',
        awesomeSides: ['potatoes', 'ketchup']
      },
      { transformObjectKeys: v.snakeCaseTransformation }
    )

    expect(errorCamelCased.ok).toBe(false)
  })

  it('default to international locale conversion and pass the turkish test', () => {
    const burger = v.object({
      burgerId: v.number
    })

    const expected = burger.validate(
      { burger_id: 456 },
      { transformObjectKeys: v.snakeCaseTransformation }
    )

    expect(expected.ok && expected.value).toEqual({ burgerId: 456 })
  })

  it('should allow missing keys for optional object keys when using the generated type', () => {
    const options = v.object({
      name: v.string,
      age: v.number.optional()
    })

    type Options = typeof options.T

    // Should compile, even if we didn't specify 'age'
    const a: Options = {
      name: 'a'
    }
  })

  it('can use a default value', () => {
    const validator = v.string.optional().default('yes')

    const validated1 = validator.validate(undefined)
    const validated2 = v.union(v.null, v.string).default('yes').validate(null)
    const validated3 = validator.validate('')
    const validated4 = validator.validate('hey')

    expect(validated1.ok && validated1.value).toEqual('yes')
    expect(validated2.ok && validated2.value).toEqual('yes')
    expect(validated3.ok && validated3.value).toEqual('')
    expect(validated4.ok && validated4.value).toEqual('hey')
  })

  it('can validate with a custom error string', () => {
    const validator = v.string.withError(value => `oh noes (${value})`)

    const result1 = validator.validate('123')
    const result2 = validator.validate(123)

    expect(result1.ok && result1.value).toEqual('123')

    expect(
      !result2.ok &&
        result2.errors.length === 1 &&
        result2.errors[0].path === '' &&
        result2.errors[0].message === 'oh noes (123)'
    ).toBe(true)

    printErrorMessage(result2)
  })

  it('can assign a custom nullable validator to a validator containing null', () => {
    function nullable<T>(validator: v.Validator<T>): v.Validator<T | null> {
      return v.union(v.null, validator)
    }

    const _validator: v.Validator<Object | null | undefined> = v.union(
      v.null,
      v.number
    )

    const _validator2: v.Validator<null | number> = nullable(v.number)
  })

  it('can transform a validator into a nullable validator', () => {
    const validator = v
      .object({
        a: v.number,
        b: v.string
      })
      .nullable()

    const result1 = validator.validate(null)
    const result2 = validator.validate(undefined)
    const result3 = validator.validate({ a: 10, b: 'aa' })
    const result4 = validator.validate('aa')
    const result5 = validator.validate({ a: 10 })

    expect(result1.ok && result1.value).toEqual(null)
    expect(result2.ok && result2.value).toEqual(undefined)
    expect(result3.ok && result3.value).toEqual({ a: 10, b: 'aa' })
    expect(!result4.ok)
    expect(!result5.ok)

    printErrorMessage(result4)
    console.log('\n\n')
    printErrorMessage(result5)
  })
})

function printErrorMessage(validation: v.Validation<any>) {
  if (!showErrorMessages) return
  if (!validation.ok) console.log(v.errorDebugString(validation.errors))
}

function immutable<T>(obj: T): Immutable<T> {
  return obj as any
}

// Manually test how a complex type tooltip looks like in our IDE

type UserId = string & { __tag: 'UserIds' }

const validator = v.object({
  id: v.string.tagged<UserId>(),
  address: v
    .object({
      street: v.string,
      zipCode: v.string
    })
    .map(address => ({ ...address, comment: 4312 })),
  preferences: v.union(
    v.object({ name: v.literal('name1'), data: v.string.optional() }),
    v.object({ name: v.literal('name2'), data: v.number })
  ),
  friends: v.array(
    v.object({
      id: v.string.tagged<UserId>(),
      name: v.string
    })
  ),
  dict: v.dictionary(v.string.tagged<UserId>(), v.number),
  intersectionOfUnions: v.intersection(
    v.union(
      v.object({ prop1: v.object({ aa: v.string }) }),
      v.object({ data1: v.string })
    ),
    v.union(
      v.object({ prop2: v.object({ bb: v.string }) }),
      v.object({ data2: v.number })
    )
  ),
  unionOfIntersections: v.union(
    v.intersection(
      v.object({ name: v.literal('aa') }),
      v.object({ data: v.number })
    ),
    v.intersection(
      v.object({ name: v.literal('bb') }),
      v.object({ data: v.string })
    )
  ),
  tuple: v.tuple(v.string, v.number, v.object({ name: v.string }))
})

type ValidatorType = typeof validator.T
type Dict = ValidatorType['dict']
type IntersectionOfUnions = ValidatorType['intersectionOfUnions']
type UnionOfIntersections = ValidatorType['unionOfIntersections']
type Tuple = ValidatorType['tuple']

// Helper types

type ImmutablePrimitive =
  | undefined
  | null
  | boolean
  | string
  | number
  | Function

type Immutable<T> = T extends ImmutablePrimitive
  ? T
  : T extends Array<infer U>
  ? ImmutableArray<U>
  : T extends Map<infer K, infer V>
  ? ImmutableMap<K, V>
  : T extends Set<infer M>
  ? ImmutableSet<M>
  : ImmutableObject<T>

type ImmutableArray<T> = ReadonlyArray<Immutable<T>>
type ImmutableMap<K, V> = ReadonlyMap<Immutable<K>, Immutable<V>>
type ImmutableSet<T> = ReadonlySet<Immutable<T>>
type ImmutableObject<T> = { readonly [K in keyof T]: Immutable<T[K]> }
