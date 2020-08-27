import * as v from '..'
import {Ok, Err, isOk} from '..'
import * as expect from 'expect'

const showErrorMessages = true

describe('validation', () => {

  it('can validate that a value is a null', () => {
    expect(isOk(v.null.validate(null))).toBe(true)
    expect(v.is(null, v.null)).toBe(true)

    expect(isOk(v.null.validate(undefined))).toBe(false)
    expect(isOk(v.null.validate({}))).toBe(false)
    expect(v.is({}, v.null)).toBe(false)

    type Null = typeof v.null.T
    const n: Null = null
  })

  it('can validate that a value is a string', () => {
    expect(isOk(v.string.validate('hola'))).toBe(true)
    expect(v.is('hola', v.string)).toBe(true)

    expect(isOk(v.string.validate(undefined))).toBe(false)
    expect(isOk(v.string.validate({}))).toBe(false)
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

    const validator2 = v.number.flatMap(x => x < 1000 ? Err('hell no') : Ok(x))

    type Number = typeof validator2.T
    const num: Number = 33

    const result2 = validator2.validate(10)
    expect(!isOk(result2) && result2.errors[0].message).toBe('hell no')

    const validator3 = v.number.flatMap(x => x > 10 ? Ok(String(x).split('')) : Err('aww'))

    type StrArray = typeof validator3.T
    const strArray: StrArray = ['1']

    expect((validator3.validate(20) as Ok<unknown>).value).toEqual(['2', '0'])
    const result3 = validator3.validate(5);
    expect(!isOk(result3) && result3.errors[0].message).toBe('aww');
    printErrorMessage(result3);
  })

  it('can validate a filtered value', () => {
    const positiveNumber = v.number.filter(x => x >= 0)

    function isPositiveNumber(n: number) { return n >= 0 }

    expect((positiveNumber.validate(10) as Ok<unknown>).value).toBe(10)
    expect(isOk(positiveNumber.validate(-1))).toBe(false)

    printErrorMessage(positiveNumber.validate(-1))
    printErrorMessage(v.number.filter(isPositiveNumber).validate(-1))

    type PositiveNumber = typeof positiveNumber.T
    const num: PositiveNumber = 33
  })

  it('can validate an array', () => {
    const numArray = [1, 2, 3]
    expect((v.array(v.number).validate(numArray) as Ok<unknown>).value).toEqual(numArray)

    const badNumArray = [1, 'oops', 'fuu']
    const badValidation = v.array(v.number).validate(badNumArray)

    printErrorMessage(badValidation)

    if (isOk(badValidation)) {
      throw new Error('Should be an Error')
    }

    expect(badValidation.errors.length).toBe(2)
  })

  it('can validate an object', () => {

    const person = v.object({
      id: v.number,
      name: v.string,
      friends: v.array(v.object({
        name: v.string
      }))
    })

    const okValidation = person.validate({
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }],
      someIrrelevantKey: true
    })

    if (!isOk(okValidation))throw new Error('Should be OK')

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

    expect(!isOk(notOkValidation) && notOkValidation.errors.length).toBe(2)
    printErrorMessage(notOkValidation)

    type Person = typeof person.T

    // Tests the type derivation: it should compile
    const alex2: Person = {
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }]
    }
  })

  it('can validate that a value is a key of an object', () => {
    const phoneMap = {'mobile': 1, 'work': 1, 'landline': 1}
    const phoneNumberNames = v.keyof(phoneMap)

    const okValidation = phoneNumberNames.validate('mobile')

    expect(isOk(okValidation)).toBe(true)

    const notOkValidation = phoneNumberNames.validate('oops')

    expect(isOk(notOkValidation)).toBe(false)
  })

  it('can expose object props', () => {
    const obj = {
      id: v.number,
      name: v.string,
      friends: v.array(v.object({
        name: v.string
      }))
    }
    const person = v.object(obj)

    expect(person.props).toBe(obj)
  })

  it('can validate a dictionary', () => {
    const strNumMap = v.dictionary(v.string, v.number)

    const okValidation = strNumMap.validate({
      a: 1, b: 2, c: 3
    })

    expect(isOk(okValidation)).toBe(true)

    const notOkValidation = strNumMap.validate({
      a: 1, b: 2, c: '3'
    })

    expect(isOk(notOkValidation)).toBe(false)


    // domain = more precise than strings
    const enumNumMap = v.dictionary(v.keyof({a: 1, b: 1}), v.number)

    const okValidation2 = enumNumMap.validate({ a: 1, b: 2 })

    expect(isOk(okValidation2)).toBe(true)

    const notOkValidation2 = enumNumMap.validate({
      a: 1, bb: 2, c: '3'
    })

    expect(!isOk(notOkValidation2) && notOkValidation2.errors.length).toBe(3)
    printErrorMessage(notOkValidation2)
  })

  it('can be recursive', () => {
    type Category = { name: string, categories: Category[] }

    const category = v.recursion<Category>(self => v.object({
      name: v.string,
      categories: v.array(self)
    }))

    const okValidation = category.validate(
      { name: 'tools', categories: [{ name: 'piercing', categories: [] }] })

    expect(isOk(okValidation)).toBe(true)

    const notOkValidation = category.validate(
      { name: 'tools', categories: [{ name2: 'piercing', categories: [] }] })

    expect(!isOk(notOkValidation) && notOkValidation.errors.length).toBe(1)
    printErrorMessage(notOkValidation)
  })

  it('can validate an ISO date', () => {
    const okValidation = v.isoDate.validate('2017-06-23T12:14:38.298Z')
    expect(isOk(okValidation) && okValidation.value.getFullYear() === 2017).toBe(true)

    const notOkValidation = v.isoDate.validate('hello')
    expect(isOk(notOkValidation)).toBe(false)
  })

  it('can validate an intersection of types', () => {

    const flying = v.object({
      flyingDistance: v.number
    })

    const squirrel = v.object({
      family: v.literal('Sciuridae'),
      isCute: v.optional(v.boolean)
    })

    const flyingSquirrel = v.intersection(flying, squirrel)

    const vulture = {
      flyingDistance: 5000,
      family: 'Accipitridae',
      isCute: false
    }

    const notOkValidation = flyingSquirrel.validate(vulture)
    expect(isOk(notOkValidation)).toBe(false)

    printErrorMessage(notOkValidation)

    const bob = {
      flyingDistance: 90,
      family: 'Sciuridae' as 'Sciuridae',
      hasAnAgenda: true
    }

    const okValidation = flyingSquirrel.validate(bob)
    expect(isOk(okValidation) && okValidation.value).toEqual({
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

    expect(isOk(okValidation)).toBe(true)
    expect(isOk(okValidation2)).toBe(true)

    const notOkValidation = helloOrObj.validate(111)
    const notOkValidation2 = helloOrObj.validate({ name2: 'hello' })

    expect(isOk(notOkValidation)).toBe(false)
    expect(isOk(notOkValidation2)).toBe(false)
    printErrorMessage(notOkValidation)
    printErrorMessage(notOkValidation2)

    type HelloOrObj = typeof helloOrObj.T
    const hello: HelloOrObj = 'hello'


    // Union of literals - shortcut
    const unionsOfLiterals = v.union(null, 'hello', true, 33)
    const okValidation3 = unionsOfLiterals.validate('hello')
    const okValidation4 = unionsOfLiterals.validate(33)
    const okValidation5 = unionsOfLiterals.validate(null)

    expect(isOk(okValidation3)).toBe(true)
    expect(isOk(okValidation4)).toBe(true)
    expect(isOk(okValidation5)).toBe(true)

    const notOkValidation3 = unionsOfLiterals.validate('hello2')
    const notOkValidation4 = unionsOfLiterals.validate(34)

    expect(isOk(notOkValidation3)).toBe(false)
    expect(isOk(notOkValidation4)).toBe(false)
    printErrorMessage(notOkValidation3)
  })

  it('can validate a literal value', () => {
    const literalStr = v.literal('hello')

    const okValidation = literalStr.validate('hello')
    expect(isOk(okValidation)).toBe(true)

    const notOkValidation = literalStr.validate('boo')
    expect(isOk(notOkValidation)).toBe(false)
  })

  it('can validate an optional value', () => {
    const optionalString = v.optional(v.string)

    const okValidation = optionalString.validate('hello')
    expect(isOk(okValidation)).toBe(true)

    const okValidation2 = optionalString.validate(undefined)
    expect(isOk(okValidation2)).toBe(true)

    const notOkValidation = optionalString.validate(null)
    expect(isOk(notOkValidation)).toBe(false)

    const notOkValidation2 = optionalString.validate({})
    expect(isOk(notOkValidation2)).toBe(false)
  })

  it('can validate a primitive and tag it', () => {
    type UserId = string & { __tag: 'UserId' }

    const userIdValidator = v.string.tagged<UserId>()

    const okValidation = userIdValidator.validate('abcd')

    if (isOk(okValidation)) {
      // Check assignation/type
      const idAsUserId: UserId = okValidation.value
      const idAsString: string = okValidation.value
    }
    else {
      throw new Error()
    }

    const notOkValidation = v.string.tagged<UserId>().validate({})

    expect(isOk(notOkValidation)).toBe(false)
  })

  it('can validate a combination of object and union values', () => {
    const validator = v.object({
      id: v.string,
      params: v.union(v.null, v.object({ id: v.string }))
    })

    const okValidation = validator.validate({ id: '1', params: null })
    const okValidation2 = validator.validate({ id: '1', params: { id: '2' } })
    const notOkValidation = validator.validate({ id: '1', params: {} })

    expect(isOk(okValidation)).toBe(true)
    expect(isOk(okValidation2)).toBe(true)
    expect(isOk(notOkValidation)).toBe(false)
  })

  it('can validate a combination of dictionary and union values', () => {
    const validator = v.dictionary(v.string, v.union(v.null, v.object({ id: v.string })))

    const okValidation = validator.validate({ id: null })
    const okValidation2 = validator.validate({ id: { id: '2' } })
    const notOkValidation = validator.validate({ id: {} })

    expect(isOk(okValidation)).toBe(true)
    expect(isOk(okValidation2)).toBe(true)
    expect(isOk(notOkValidation)).toBe(false)
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

    expect(isOk(tuple0.validate([]))).toBe(true)
    expect(isOk(tuple1.validate([10]))).toBe(true)
    expect(isOk(okValidation)).toBe(true)
    expect(isOk(notOkValidation)).toBe(false)
    expect(isOk(notOkValidation2)).toBe(false)
    expect(isOk(notOkValidation3)).toBe(false)

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

    const okSnakeCased = burger.validate({
      id: 123,
      'meat_cooking': 'rare',
      'awesome_sides_nom_nom': ['loaded fries', 'barbecue sauce'],
      options: {
        'double_bacon': true
      }
    }, { transformObjectKeys: v.snakeCaseTransformation })

    const expected = {
      id: 123,
      meatCooking: 'rare',
      awesomeSidesNomNom: ['loaded fries', 'barbecue sauce'],
      options: {
        doubleBacon: true
      }
    }

    if (!isOk(okSnakeCased))
      throw new Error('Should be OK')

    expect(okSnakeCased.value).toEqual(expected)
  })

  it('reports transformed key names to the user in case of error', () => {

    const burger = v.object({
      id: v.number,
      meatCooking: v.string,
      awesomeSides: v.array(v.string)
    })

    const fieldInError = burger.validate({
      id: 123,
      'meat_cooking': 42,
      'awesome_sides': ['loaded fries', 'barbecue sauce']
    }, { transformObjectKeys: v.snakeCaseTransformation })

    expect(isOk(fieldInError)).toBe(false)

    printErrorMessage(fieldInError)

    if (!isOk(fieldInError)) {
      const { context } = fieldInError.errors[0]
      expect(context).toEqual('root / meat_cooking')
    }
  })

  it('should be strict on input casing when using transformObjectKeys', () => {

    const burger = v.object({
      id: v.number,
      meatCooking: v.string,
      awesomeSides: v.array(v.string)
    })

    const errorCamelCased = burger.validate({
      id: 456,
      meatCooking: 'blue',
      awesomeSides: ['potatoes', 'ketchup']
    }, { transformObjectKeys: v.snakeCaseTransformation })

    expect(isOk(errorCamelCased)).toBe(false)
  })

  it('default to international locale conversion and pass the turkish test', () => {

    const burger = v.object({
      burgerId: v.number,
    })

    const expected = burger.validate({
      'burger_id': 456,
    }, { transformObjectKeys: v.snakeCaseTransformation })

    expect(isOk(expected) && expected.value).toEqual({ burgerId: 456 })
  })

  it('should allow missing keys for optional object keys when using the generated type', () => {
    const options = v.object({
      name: v.string,
      age: v.optional(v.number)
    })

    type Options = typeof options.T

    // Should compile, even if we didn't specify 'age'
    const a: Options = {
      name: 'a'
    }
  })

})


function printErrorMessage(validation: v.Validation<any>) {
  if (!showErrorMessages) return

  if (!isOk(validation))
    console.log(v.errorDebugString(validation.errors))
}