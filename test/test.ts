import * as v from '..'
import { Ok, Err } from '..'
import * as expect from 'expect'

const showErrorMessages = true

describe('validation', () => {
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
          name: v.string,
        })
      ),
    })

    const okValidation = person.validate({
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }],
      someIrrelevantKey: true,
    })

    if (!okValidation.ok) throw new Error('Should be OK')

    expect(okValidation.value).toEqual({
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }],
    })

    const notOkValidation = person.validate({
      id: '123',
      name: 'Alex',
      friends: [{ name: 'bob' }, { id: 'john' }],
    })

    expect(!notOkValidation.ok && notOkValidation.errors.length).toBe(2)
    printErrorMessage(notOkValidation)

    type Person = typeof person.T

    // Tests the type derivation: it should compile
    const alex2: Person = {
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }],
    }
  })

  it('can expose object props', () => {
    const obj = {
      id: v.number,
      name: v.string,
      friends: v.array(
        v.object({
          name: v.string,
        })
      ),
    }
    const person = v.object(obj)

    expect(person.props).toBe(obj)
  })

  it('can validate a dictionary', () => {
    const strNumMap = v.dictionary(v.string, v.number)

    const okValidation = strNumMap.validate({
      a: 1,
      b: 2,
      c: 3,
    })

    expect(okValidation.ok).toBe(true)

    const notOkValidation = strNumMap.validate({
      a: 1,
      b: 2,
      c: '3',
    })

    expect(notOkValidation.ok).toBe(false)

    // domain = more precise than strings
    const enumNumMap = v.dictionary(v.union(...(['a', 'b'] as const)), v.number)

    const okValidation2 = enumNumMap.validate({ a: 1, b: 2 })

    expect(okValidation2.ok).toBe(true)

    const notOkValidation2 = enumNumMap.validate({
      a: 1,
      bb: 2,
      c: '3',
    })

    expect(!notOkValidation2.ok && notOkValidation2.errors.length).toBe(3)
    printErrorMessage(notOkValidation2)
  })

  it('can be recursive', () => {
    type Category = { name: string; categories: Category[] }

    const category = v.recursion<Category>(self =>
      v.object({
        name: v.string,
        categories: v.array(self),
      })
    )

    const okValidation = category.validate({
      name: 'tools',
      categories: [{ name: 'piercing', categories: [] }],
    })

    expect(okValidation.ok).toBe(true)

    const notOkValidation = category.validate({
      name: 'tools',
      categories: [{ name2: 'piercing', categories: [] }],
    })

    expect(!notOkValidation.ok && notOkValidation.errors.length).toBe(1)
    printErrorMessage(notOkValidation)
  })

  it('can validate an ISO date', () => {
    const okValidation = v.isoDate.validate('2017-06-23T12:14:38.298Z')
    expect(okValidation.ok && okValidation.value.getFullYear() === 2017).toBe(
      true
    )

    const notOkValidation = v.isoDate.validate('hello')
    expect(notOkValidation.ok).toBe(false)
  })

  it('can validate an intersection of types', () => {
    const flying = v.object({
      flyingDistance: v.number,
    })

    const squirrel = v.object({
      family: v.literal('Sciuridae'),
      isCute: v.boolean.optional(),
    })

    const flyingSquirrel = v.intersection(flying, squirrel)

    const vulture = {
      flyingDistance: 5000,
      family: 'Accipitridae',
      isCute: false,
    }

    const notOkValidation = flyingSquirrel.validate(vulture)
    expect(notOkValidation.ok).toBe(false)

    printErrorMessage(notOkValidation)

    const bob = {
      flyingDistance: 90,
      family: 'Sciuridae' as 'Sciuridae',
      hasAnAgenda: true,
    }

    const okValidation = flyingSquirrel.validate(bob)
    expect(okValidation.ok && okValidation.value).toEqual({
      flyingDistance: 90,
      family: 'Sciuridae',
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
      params: v.union(v.null, v.object({ id: v.string })),
    })

    const okValidation = validator.validate({ id: '1', params: null })
    const okValidation2 = validator.validate({ id: '1', params: { id: '2' } })
    const notOkValidation = validator.validate({ id: '1', params: {} })

    expect(okValidation.ok).toBe(true)
    expect(okValidation2.ok).toBe(true)
    expect(notOkValidation.ok).toBe(false)
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
        doubleBacon: v.boolean,
      }),
    })

    const okSnakeCased = burger.validate(
      {
        id: 123,
        meat_cooking: 'rare',
        awesome_sides_nom_nom: ['loaded fries', 'barbecue sauce'],
        options: {
          double_bacon: true,
        },
      },
      { transformObjectKeys: v.snakeCaseTransformation }
    )

    const expected = {
      id: 123,
      meatCooking: 'rare',
      awesomeSidesNomNom: ['loaded fries', 'barbecue sauce'],
      options: {
        doubleBacon: true,
      },
    }

    if (!okSnakeCased.ok) throw new Error('Should be OK')

    expect(okSnakeCased.value).toEqual(expected)
  })

  it('reports transformed key names to the user in case of error', () => {
    const burger = v.object({
      id: v.number,
      meatCooking: v.string,
      awesomeSides: v.array(v.string),
    })

    const fieldInError = burger.validate(
      {
        id: 123,
        meat_cooking: 42,
        awesome_sides: ['loaded fries', 'barbecue sauce'],
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
      awesomeSides: v.array(v.string),
    })

    const errorCamelCased = burger.validate(
      {
        id: 456,
        meatCooking: 'blue',
        awesomeSides: ['potatoes', 'ketchup'],
      },
      { transformObjectKeys: v.snakeCaseTransformation }
    )

    expect(errorCamelCased.ok).toBe(false)
  })

  it('default to international locale conversion and pass the turkish test', () => {
    const burger = v.object({
      burgerId: v.number,
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
      age: v.number.optional(),
    })

    type Options = typeof options.T

    // Should compile, even if we didn't specify 'age'
    const a: Options = {
      name: 'a',
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
    const validator = v.string.withError('oh noes')

    const result1 = validator.validate('123')
    const result2 = validator.validate(123)

    expect(result1.ok && result1.value).toEqual('123')

    expect(
      !result2.ok &&
        result2.errors.length === 1 &&
        result2.errors[0].path === '' &&
        result2.errors[0].message === 'oh noes'
    ).toBe(true)
  })

  it('can validateAs', () => {
    const result1 = v.validateAs<string>(v.string, '123')

    const person = v.object({
      id: v.string,
      age: v.number,
      preferences: v.object({
        langs: v.array(v.string),
      }),
    })

    interface Person {
      id: string
      age: number
      preferences: {
        langs: string[]
      }
    }

    const input = {
      id: '123',
      age: 50,
      preferences: {
        langs: ['fr', 'en', 'es'],
      },
    }

    const result2 = v.validateAs<Person>(person, input)

    // This should compile
    v.validateAs<{ id: string; prefs?: {} }>(
      v.object({
        id: v.string,
        prefs: v.object({ langs: v.array(v.string) }).optional(),
      }),
      {}
    )
  })
})

function printErrorMessage(validation: v.Validation<any>) {
  if (!showErrorMessages) return
  if (!validation.ok) console.log(v.errorDebugString(validation.errors))
}
