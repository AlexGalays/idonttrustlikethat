import * as expect from 'expect'
import { lift } from 'space-lift'

import * as v from '../commonjs/validation'
import { Ok, Err } from '../commonjs/validation'

const showErrorMessages = true

describe('validation core', () => {
  it('can validate that a value is a null', () => {
    expect(v.null.validate(null).ok).toBe(true)
    expect(v.is(null, v.null)).toBe(true)
    expect(v.null.meta.tag).toEqual('null')

    expect(v.null.validate(undefined).ok).toBe(false)
    expect(v.null.validate({}).ok).toBe(false)
    expect(v.is({}, v.null)).toBe(false)

    type Null = typeof v.null.T
    const n: Null = null
  })

  it('can validate that a value is a string', () => {
    expect(v.string.validate('hola').ok).toBe(true)
    expect(v.is('hola', v.string)).toBe(true)
    expect(v.string.meta.tag).toEqual('string')

    expect(v.string.validate(undefined).ok).toBe(false)
    expect(v.string.validate({}).ok).toBe(false)
    expect(v.is({}, v.string)).toBe(false)

    type String = typeof v.string.T
    const str: String = 'hola'
  })

  it('can validate a value and map it', () => {
    const validator = v.number.map(x => x * 2)

    expect((validator.validate(10) as any).value).toBe(20)
    expect(v.number.meta.tag).toEqual('number')

    type Number = typeof validator.T
    const num: Number = 33
  })

  it('can validate a value and further refine it', () => {
    const validator = v.number.and(x => Ok(String(x * 2)))

    type StringFromNumber = typeof validator.T
    const str: StringFromNumber = 'ok'

    expect((validator.validate(10) as Ok<unknown>).value).toBe('20')

    const validator2 = v.number.and(x => (x < 1000 ? Err('hell no') : Ok(x)))

    type Number = typeof validator2.T
    const num: Number = 33

    const result2 = validator2.validate(10)
    expect(!result2.ok && result2.errors[0]!.message).toBe('hell no')

    const validator3 = v.number.and(x =>
      x > 10 ? Ok(String(x).split('')) : Err('aww')
    )

    type StrArray = typeof validator3.T
    const strArray: StrArray = ['1']

    expect((validator3.validate(20) as Ok<unknown>).value).toEqual(['2', '0'])
    const result3 = validator3.validate(5)
    expect(!result3.ok && result3.errors[0]!.message).toBe('aww')
    printErrorMessage(result3)
  })

  it('can compose two validators returning a single string error', () => {
    const stringToInt = v.string.and(str => {
      const result = Number.parseInt(str, 10)
      if (Number.isFinite(result)) return Ok(result)
      return Err('Expected an integer-like string, got: ' + str)
    })

    const timestampOk = v.number.and(n => {
      const date = new Date(n)
      if (date.getTime() === NaN) return Err('Not a valid date')
      return Ok(date)
    })

    const timestampNope = v.number.and(n => {
      return Err('Not a valid date')
    })

    const composedValidator1 = stringToInt.then(timestampOk)
    const result1 = composedValidator1.validate('01')
    expect(result1.ok && result1.value.getMilliseconds()).toBe(1)

    const result2 = composedValidator1.validate(1)
    expect(result2.ok).toBe(false)
    printErrorMessage(result2)

    const result3 = stringToInt.then(timestampNope).validate('01')
    expect(!result3.ok && result3.errors[0]!.message).toBe('Not a valid date')
    printErrorMessage(result3)
  })

  it('can validate a filtered value', () => {
    const positiveNumber = v.number.filter(x => x >= 0)

    expect(positiveNumber.meta.tag).toEqual('number')

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
    const av = v.array(v.number)

    expect((av.validate(numArray) as Ok<unknown>).value).toEqual(numArray)
    expect(av.meta.tag).toEqual('array')
    expect(av.meta.value).toBe(v.number)

    const badNumArray = [1, 'oops', 'fuu']
    const badValidation = v.array(v.number).validate(badNumArray)

    printErrorMessage(badValidation)

    if (badValidation.ok) {
      throw new Error('Should be an Error')
    }

    expect(badValidation.errors.length).toBe(2)
  })

  it('can validate a readonly array', () => {
    const numArray: readonly number[] = [1, 2, 3]
    const av = v.readonlyArray(v.number)
    const result = av.validate(numArray)

    expect((result as Ok<unknown>).value).toEqual(numArray)
    expect(av.meta.tag).toEqual('array')
    expect(av.meta.value).toBe(v.number)

    if (!result.ok) {
      throw new Error('Should be a Success')
    }

    // Check type is readonly
    const _v: readonly number[] = result.value

    const badNumArray = [1, 'oops', 'fuu']
    const badValidation = v.readonlyArray(v.number).validate(badNumArray)

    printErrorMessage(badValidation)

    if (badValidation.ok) {
      throw new Error('Should be an Error')
    }

    expect(badValidation.errors.length).toBe(2)
  })

  it('can validate an array as set', () => {
    const numArray = [1, 2, 3]
    const av = v.arrayAsSet(v.number)
    const rs = v.arrayAsReadonlySet(v.number)

    expect((av.validate(numArray) as Ok<unknown>).value).toEqual(new Set(numArray))
    expect(av.meta.tag).toEqual('set')
    expect(av.meta.value).toBe(v.number)

    expect((rs.validate(numArray) as Ok<unknown>).value).toEqual(new Set(numArray))
    expect(rs.meta.tag).toEqual('set')
    expect(rs.meta.value).toBe(v.number)

    const badNumArray = [1, 'oops', 'fuu']
    const badValidation1 = v.arrayAsSet(v.number).validate(badNumArray)
    const badValidation2 = v.arrayAsReadonlySet(v.number).validate(badNumArray)

    printErrorMessage(badValidation1)
    printErrorMessage(badValidation2)

    if (badValidation1.ok) {
      throw new Error('Should be an Error #1')
    }

    if (badValidation2.ok) {
      throw new Error('Should be an Error #2')
    }

    expect(badValidation1.errors.length).toBe(2)
    expect(badValidation2.errors.length).toBe(2)

    const duplicateArray = ['foo', 'bar', 'bar']
    const duplicateValidation1 = v.arrayAsSet(v.string).validate(duplicateArray)
    const duplicateValidation2 = v.arrayAsReadonlySet(v.string).validate(duplicateArray)

    printErrorMessage(duplicateValidation1)
    printErrorMessage(duplicateValidation2)

    if (duplicateValidation1.ok) {
      throw new Error('Should be an Error #1')
    }

    if (duplicateValidation2.ok) {
      throw new Error('Should be an Error #2')
    }

    expect(duplicateValidation1.errors.map(e => e.message)).toEqual([
      'Duplicate value in set: bar'
    ])

    expect(duplicateValidation2.errors.map(e => e.message)).toEqual([
      'Duplicate value in set: bar'
    ])
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
    expect(person.meta.tag).toEqual('object')

    // e.g. Generate shell mapper from metadata
    const shellVarsToJson = Object.keys(person.props).map(k => {
      const v = (person.props as any)[k]
      const shellVar = k.toUpperCase()
      const tpe = v.meta.tag

      if (tpe == 'string') {
        // Quote string
        return `"${k}": "\$${shellVar}"`
      } else {
        return `"${k}": \$${shellVar}`
      }
    })

    const shellScript = `cat > /dev/stdout << EOF
{
  ${shellVarsToJson.join(',\n  ')}
}
EOF`

    expect(shellScript).toEqual(`cat > /dev/stdout << EOF
{
  "id": \$ID,
  "name": "\$NAME",
  "friends": \$FRIENDS
}
EOF`)
  })

  it('can validate a dictionary', () => {
    const strNumMap = v.dictionary(v.string, v.number)

    expect(strNumMap.meta.tag).toEqual('dictionary')
    expect(strNumMap.meta.value).toBe(v.number)

    const okValidation = strNumMap.validate({
      a: 1,
      b: 2,
      c: 3
    })

    expect(okValidation.ok).toBe(true)

    const notOkValidation = v.object({ dic: strNumMap }).validate({
      dic: {
        a: 1,
        b: 2,
        c: '3'
      }
    })

    expect(notOkValidation.ok).toBe(false)
    printErrorMessage(notOkValidation)

    // domain = more precise than strings and object values
    const enumNumMap = v.dictionary(
      v.union(...(['a', 'b'] as const)),
      v.object({ id: v.number })
    )

    const okValidation2 = enumNumMap.validate({ a: { id: 1 }, b: { id: 2 } })

    expect(okValidation2.ok).toBe(true)

    const notOkValidation2 = v.object({ dic: enumNumMap }).validate({
      dic: {
        a: { id: 1 },
        bb: { id: '2' },
        c: { id: '3' }
      }
    })

    expect(!notOkValidation2.ok && notOkValidation2.errors.length).toBe(4)
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

    expect(flyingSquirrel.meta.tag).toEqual('object')

    const vulture = {
      flyingDistance: 5000,
      family: 'Accipitridae',
      isCute: false
    }

    const honeyBadger = {
      isCute: 'ohno'
    }

    const notOkValidation = flyingSquirrel.validate(vulture)
    const notOkValidation2 = flyingSquirrel.validate(honeyBadger)

    printErrorMessage(notOkValidation)
    printErrorMessage(notOkValidation2)

    expect(notOkValidation.ok).toBe(false)

    // All 3 fields are missing so we should get 3 errors.
    expect(!notOkValidation2.ok && notOkValidation2.errors.length).toBe(3)

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

    expect(helloOrObj.meta.tag).toEqual('union')

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
    const validator = v
      .discriminatedUnion(
        'type',
        v.object({ type: v.literal('A'), name: v.string }),
        v.object({ type: v.literal('B'), data: v.number })
      )
      .mapErrors(errors =>
        errors.map(error => {
          if (error.path === 'type') return { ...error, message: 'OHNO' }
          return error
        })
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

    expect(
      !notOkValidation.ok &&
        notOkValidation.errors.find(e => e.path === 'type')!.message
    ).toBe('OHNO')
    expect(notOkValidation2.ok).toBe(false)
    expect(notOkValidation3.ok).toBe(false)
    expect(notOkValidation4.ok).toBe(false)

    printErrorMessage(notOkValidation)
    printErrorMessage(notOkValidation2)
    printErrorMessage(notOkValidation3)
    printErrorMessage(notOkValidation4)
  })

  it('can validate a discriminated union made of intersection types', () => {
    const a = v.object({ type: v.literal('a'), a: v.number })
    const b = v.object({ b: v.string })
    const ab = v.intersection(a, b)

    const c = v.object({ type: v.union('c', 'cc'), c: v.number })
    const d = v.object({ d: v.string })
    const cd = v.intersection(c, d)

    const validator = v.discriminatedUnion('type', ab, cd)

    const notOKValidation = validator.validate({ type: 'c', c: 10 })
    const okValidation = validator.validate({ type: 'c', c: 10, d: 'dd' })

    expect(notOKValidation.ok).toBe(false)
    expect(okValidation.ok && okValidation.value).toEqual({
      type: 'c',
      c: 10,
      d: 'dd'
    })
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

    expect(optionalString.meta.tag).toEqual('string')
    expect(optionalString.meta.optional).toBe(true)

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

    expect(validator.meta.tag).toEqual('dictionary')

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

    expect(validator.meta.tag).toEqual('tuple')

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
      const { path } = fieldInError.errors[0]!
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

    expect(validator.meta.tag).toEqual('string')
    expect(validator.meta.optional).toBe(true)
    expect(validator.meta.default).toEqual('yes')

    const validated1 = validator.validate(undefined)
    const validated2 = v.union(v.null, v.string).default('yes').validate(null)
    const validated3 = validator.validate('')
    const validated4 = validator.validate('hey')
    const validated5 = v.string.default('yes').validate(undefined)

    expect(validated1.ok && validated1.value).toEqual('yes')
    expect(validated2.ok && validated2.value).toEqual('yes')
    expect(validated3.ok && validated3.value).toEqual('')
    expect(validated4.ok && validated4.value).toEqual('hey')
    expect(validated5.ok && validated5.value).toEqual('yes')
  })

  it('can validate with a custom error string', () => {
    const validator = v.string
      .withError(value => `not a string (${value})`)
      .and(v.minSize(2))
      .withError(_ => 'wrong size')
      .filter(value => value !== 'GOD')
      .withError(_ => 'God is not allowed')

    expect(validator.meta.tag).toEqual('string')

    const validator2 = v.string
      .withError(() => 'string is mandatory')
      .nullable()
    const validator3 = v.string
      .withError(() => 'string is mandatory')
      .optional()
    const validator4 = v.string
      .withError(() => 'string is mandatory')
      .default('')

    const result1 = validator.validate('123')
    const result2 = validator.validate(123)
    const result3 = validator.validate('1')
    const result4 = validator.validate('GOD')
    const result5 = validator2.validate(null)
    const result6 = validator3.validate(undefined)
    const result7 = validator4.validate(undefined)

    expect(result1.ok && result1.value).toEqual('123')
    expect(result5.ok && result5.value).toBe(null)
    expect(result6.ok && result6.value).toBe(undefined)
    expect(result7.ok && result7.value).toBe('')

    expect(
      !result2.ok &&
        result2.errors.length === 1 &&
        result2.errors[0]!.path === '' &&
        result2.errors[0]!.message
    ).toBe('not a string (123)')

    expect(!result3.ok && result3.errors[0]!.message).toBe('wrong size')
    expect(!result4.ok && result4.errors[0]!.message).toBe('God is not allowed')

    printErrorMessage(result2)
    printErrorMessage(result3)
  })

  it('can validate with a custom error string for each item of an Array or value of an Object', () => {
    const user = v.object({
      id: v.string
        .withError(_ => 'user id is mandatory')
        .and(v.minSize(1))
        .withError(_ => 'min size is 1')
        .filter(value => Number(value) >= 0)
        .withError(v => `Got a negative id (${v})`)
    })

    const arrayValidator = v.array(user)

    const objectValidator = v.object({
      a: user,
      b: user,
      c: user,
      d: user,
      e: user
    })

    const result1 = arrayValidator.validate([{ id: '1' }, { id: '2' }])
    const result2 = arrayValidator.validate([
      { id: '1' },
      { id: 3 },
      { id: '' },
      { id: '-5' },
      {}
    ])
    const result3 = objectValidator.validate({
      a: { id: '1' },
      b: { id: 3 },
      c: { id: '' },
      d: { id: '-5' },
      e: {}
    })

    expect(result1.ok).toBe(true)
    if (result2.ok) throw new Error('should be Err')
    if (result3.ok) throw new Error('should be Err')

    expect(result2.errors.length).toBe(4)
    expect(result2.errors[0]!.message).toBe('user id is mandatory')
    expect(result2.errors[1]!.message).toBe('min size is 1')
    expect(result2.errors[2]!.message).toBe('Got a negative id (-5)')
    expect(result2.errors[3]!.message).toBe('user id is mandatory')

    expect(result3.errors.length).toBe(4)
    expect(result3.errors.find(e => e.path === 'b.id')!.message).toBe(
      'user id is mandatory'
    )

    expect(result3.errors.find(e => e.path === 'c.id')!.message).toBe(
      'min size is 1'
    )

    expect(result3.errors.find(e => e.path === 'd.id')!.message).toBe(
      'Got a negative id (-5)'
    )

    expect(result3.errors.find(e => e.path === 'e.id')!.message).toBe(
      'user id is mandatory'
    )
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

  it('can validate an ISO date', () => {
    const okValidation = v.isoDate.validate('2017-06-23T12:14:38.298Z')
    expect(okValidation.ok && okValidation.value.getFullYear() === 2017).toBe(
      true
    )

    const notOkValidation = v.isoDate.validate('hello')
    expect(notOkValidation.ok).toBe(false)
  })

  it('can validate a recursive type', () => {
    type Category = { name: string; categories: Category[] }

    const category = v.recursion<Category>(self =>
      v.object({
        name: v.string,
        categories: v.array(self)
      })
    )

    const okValidation = category.validate({
      name: 'tools',
      categories: [{ name: 'piercing', categories: [] }]
    })

    expect(okValidation.ok).toBe(true)

    const notOkValidation = category.validate({
      name: 'tools',
      categories: [{ name2: 'piercing', categories: [] }]
    })

    expect(!notOkValidation.ok && notOkValidation.errors.length).toBe(1)
    printErrorMessage(notOkValidation)
  })

  //--------------------------------------
  //  parsed from string
  //--------------------------------------

  it('can validate a boolean from a string', () => {
    const okValidation = v.booleanFromString.validate('true')
    const okValidation2 = v.booleanFromString.validate('false')
    const notOkValidation = v.booleanFromString.validate('nope')
    const notOkValidation2 = v.booleanFromString.validate(true)

    expect(okValidation.ok && okValidation.value).toBe(true)
    expect(okValidation2.ok && okValidation2.value).toBe(false)
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  it('can validate a number from a string', () => {
    const okValidation = v.numberFromString.validate('123.4')
    const okValidation2 = v.numberFromString.validate('100')
    const notOkValidation = v.numberFromString.validate('aa123')
    const notOkValidation2 = v.numberFromString.validate('123aa')

    expect(okValidation.ok && okValidation.value).toBe(123.4)
    expect(okValidation2.ok && okValidation2.value).toBe(100)
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  it('can validate an int from a string', () => {
    const okValidation = v.intFromString.validate('123')
    const notOkValidation = v.intFromString.validate('123.4')
    const notOkValidation2 = v.intFromString.validate('123aa')
    const notOkValidation3 = v.intFromString.validate('aaa123')

    expect(okValidation.ok && okValidation.value).toBe(123)
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)
    expect(notOkValidation3.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  //--------------------------------------
  //  url
  //--------------------------------------

  it('can validate a relative URL', () => {
    const v1 = v.relativeUrl()
    const v2 = v.relativeUrl('http://use-this-domain.com/hey')

    expect(v1.meta.tag).toEqual('string')
    expect(v1.meta.logicalType).toEqual('relativeUrl')

    expect(v2.meta.tag).toEqual('string')
    expect(v2.meta.logicalType).toEqual('relativeUrl')

    const okValidation = v1.validate('path')
    const okValidation2 = v2.validate('path/subpath')
    const notOkValidation = v
      .relativeUrl('http://use-this-domain.com/hey')
      .validate('////')
    const notOkValidation2 = v.relativeUrl().validate(true)

    expect(okValidation.ok && okValidation.value).toBe('path')
    expect(okValidation2.ok && okValidation2.value).toBe('path/subpath')
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  it('can validate an absolute URL', () => {
    const okValidation = v.absoluteUrl.validate('http://hi.com')
    const notOkValidation = v.absoluteUrl.validate('//aa')
    const notOkValidation2 = v.absoluteUrl.validate('/hey')

    expect(v.absoluteUrl.meta.tag).toEqual('string')
    expect(v.absoluteUrl.meta.logicalType).toEqual('absoluteUrl')

    expect(okValidation.ok && okValidation.value).toBe('http://hi.com')
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  it('can validate an URL', () => {
    const v1 = v.url

    expect(v1.meta.tag).toEqual('union')

    const okValidation = v1.validate('http://hi.com')
    const okValidation2 = v.url.validate('path/subpath')
    const notOkValidation = v.url.validate('////')

    expect(okValidation.ok && okValidation.value).toBe('http://hi.com')
    expect(okValidation2.ok && okValidation2.value).toBe('path/subpath')
    expect(notOkValidation.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  //--------------------------------------
  //  generic constraints
  //--------------------------------------

  it('can validate that a container has a minimum size', () => {
    const okValidation = v.array(v.number).and(v.minSize(2)).validate([1, 2, 3])
    const okValidation2 = v.string.and(v.minSize(3)).validate('abc')
    const okValidation3 = v
      .dictionary(v.string, v.string)
      .and(v.minSize(1))
      .validate({ a: 'a' })

    const notOkValidation = v.array(v.number).and(v.minSize(2)).validate([0])
    const notOkValidation2 = v.string.and(v.minSize(3)).validate('')
    const notOkValidation3 = v
      .dictionary(v.string, v.string)
      .and(v.minSize(2))
      .validate({ a: 'a' })

    expect(okValidation.ok && okValidation.value).toEqual([1, 2, 3])
    expect(okValidation2.ok && okValidation2.value).toEqual('abc')
    expect(okValidation3.ok && okValidation3.value).toEqual({ a: 'a' })

    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)
    expect(notOkValidation3.ok).toBe(false)

    printErrorMessage(notOkValidation)
    printErrorMessage(notOkValidation2)
    printErrorMessage(notOkValidation3)
  })

  it('can validate that a container is not empty', () => {
    const array = [1, 2, 3]
    type ArrayType = typeof array
    const okValidation = v.array(v.number).and(v.nonEmpty).validate(array)

    const obj = { a: 'a' }
    type ObjType = typeof obj
    const okValidation2 = v
      .object({ a: v.string })
      .and(v.nonEmpty)
      .validate(obj)

    const notOkValidation = v
      .object({ a: v.string })
      .and(v.nonEmpty)
      .validate({})

    if (okValidation.ok && okValidation2.ok) {
      // Type assertion.
      const _arrayType = okValidation.value.map(_ => _)
      const _nonEmpty = okValidation.value[0].toExponential() // The returned array should let you access its first item
      const _objType: ObjType = okValidation2.value
    } else {
      throw new Error()
    }

    expect(notOkValidation.ok).toBe(false)
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

const tooltipValidator = v.object({
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

type ValidatorType = typeof tooltipValidator.T
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
