import * as v from '../'
import * as expect from 'expect'
import 'space-lift/all'
import Set from 'space-lift/object/set'


const showErrorMessages = false

describe('validation', () => {

  it('can validate that a value is a null', () => {
    expect(v.validate(null, v.null).isOk()).toBe(true)
    expect(v.is(null, v.null)).toBe(true)

    expect(v.validate(undefined, v.null).isOk()).toBe(false)
    expect(v.validate({}, v.null).isOk()).toBe(false)
    expect(v.is({}, v.null)).toBe(false)

    type Null = typeof v.null.T
    const n: Null = null
  })

  it('can validate that a value is a string', () => {
    expect(v.validate('hola', v.string).isOk()).toBe(true)
    expect(v.is('hola', v.string)).toBe(true)

    expect(v.validate(undefined, v.string).isOk()).toBe(false)
    expect(v.validate({}, v.string).isOk()).toBe(false)
    expect(v.is({}, v.string)).toBe(false)

    type String = typeof v.string.T
    const str: String = 'hola'
  })

  it('can validate a value and map it', () => {
    const validator = v.map(v.number, x => x * 2)

    expect(v.validate(10, validator).get()).toBe(20)

    type Number = typeof validator.T
    const num: Number = 33
  })

  it('can validate a filtered value', () => {
    const positiveNumber = v.filter(v.number, x => x >= 0)

    expect(v.validate(10, positiveNumber).get()).toBe(10)
    expect(v.validate(-1, positiveNumber).isOk()).toBe(false)

    printErrorMessage(v.validate(-1, positiveNumber))

    type PositiveNumber = typeof positiveNumber.T
    const num: PositiveNumber = 33
  })

  it('can validate an array', () => {
    const numArray = [1, 2, 3]
    expect(v.validate(numArray, v.array(v.number)).get()).toBe(numArray)

    const badNumArray = [1, 'oops', 'fuu']
    const badValidation = v.validate(badNumArray, v.array(v.number)) as any

    printErrorMessage(badValidation)

    expect(badValidation.isOk()).toBe(false)
    expect(badValidation.get().length).toBe(2)
  })

  it('can validate an object', () => {

    const person = v.object({
      id: v.number,
      name: v.string,
      friends: v.array(v.object({
        name: v.string
      }))
    })

    const okValidation = v.validate({
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }]
    }, person)

    expect(okValidation.isOk()).toBe(true)


    const notOkValidation = v.validate({
      id: '123',
      name: 'Alex',
      friends: [{ name: 'bob' }, { id: 'john' }]
    }, person)

    expect(notOkValidation.isOk()).toBe(false)
    expect(!notOkValidation.isOk() && notOkValidation.get().length).toBe(2)
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
    const phoneMap = Set('mobile', 'work', 'landline').value()
    type LOl = keyof typeof phoneMap
    const phoneNumberNames = v.keyof(phoneMap)

    const okValidation = v.validate('mobile', phoneNumberNames)

    expect(okValidation.isOk()).toBe(true)

    const notOkValidation = v.validate('oops', phoneNumberNames)

    expect(notOkValidation.isOk()).toBe(false)
  })

  it('can validate a dictionary', () => {
    const strNumMap = v.dictionary(v.string, v.number)

    const okValidation = v.validate({
      a: 1, b: 2, c: 3
    }, strNumMap)

    expect(okValidation.isOk()).toBe(true)

    const notOkValidation = v.validate({
      a: 1, b: 2, c: '3'
    }, strNumMap)

    expect(notOkValidation.isOk()).toBe(false)


    // domain = more precise than strings
    const enumNumMap = v.dictionary(v.keyof(Set('a', 'b').value()), v.number)

    const okValidation2 = v.validate({ a: 1, b: 2 }, enumNumMap)

    expect(okValidation2.isOk()).toBe(true)

    const notOkValidation2 = v.validate({
      a: 1, bb: 2, c: '3'
    }, enumNumMap)

    expect(!notOkValidation2.isOk() && notOkValidation2.get().length).toBe(3)
    printErrorMessage(notOkValidation2)
  })  

  it('can be recursive', () => {
    type Category = { name: string, categories: Category[] }

    const category = v.recursion<Category>(self => v.object({
      name: v.string,
      categories: v.array(self)
    }))

    const okValidation = v.validate(
      { name: 'tools', categories: [{ name: 'piercing', categories: [] }] },
      category)

    expect(okValidation.isOk()).toBe(true)

    const notOkValidation = v.validate(
      { name: 'tools', categories: [{ name2: 'piercing', categories: [] }] },
      category)

    expect(!notOkValidation.isOk() && notOkValidation.get().length).toBe(1)
    printErrorMessage(notOkValidation)
  })

  it('can validate an ISO date', () => {
    const okValidation = v.validate('2017-06-23T12:14:38.298Z', v.isoDate)
    expect(okValidation.isOk() && okValidation.get().getFullYear() === 2017).toBe(true)

    const notOkValidation = v.validate('hello', v.isoDate)
    expect(notOkValidation.isOk()).toBe(false)
  })

  it('can validate an union of types', () => {
    const helloOrObj = v.union(
      v.string,
      v.object({ name: v.string })
    )
    const okValidation = v.validate('hello', helloOrObj)
    const okValidation2 = v.validate({ name: 'hello' }, helloOrObj)

    expect(okValidation.isOk()).toBe(true)
    expect(okValidation2.isOk()).toBe(true)

    const notOkValidation = v.validate(111, helloOrObj)
    const notOkValidation2 = v.validate({ name2: 'hello' }, helloOrObj)

    expect(notOkValidation.isOk()).toBe(false)
    expect(notOkValidation2.isOk()).toBe(false)
    printErrorMessage(notOkValidation)

    type HelloOrObj = typeof helloOrObj.T
    const hello: HelloOrObj = 'hello'


    // Union of literals - shortcut
    const unionsOfLiterals = v.union('hello', true, 33)
    const okValidation3 = v.validate('hello', unionsOfLiterals)
    const okValidation4 = v.validate(33, unionsOfLiterals)

    expect(okValidation3.isOk()).toBe(true)
    expect(okValidation4.isOk()).toBe(true)

    const notOkValidation3 = v.validate('hello2', unionsOfLiterals)
    const notOkValidation4 = v.validate(34, unionsOfLiterals)

    expect(notOkValidation3.isOk()).toBe(false)
    expect(notOkValidation4.isOk()).toBe(false)
    printErrorMessage(notOkValidation3)
  })

  it('can validate a literal value', () => {
    const literalStr = v.literal('hello')

    const okValidation = v.validate('hello', literalStr)
    expect(okValidation.isOk()).toBe(true)

    const notOkValidation = v.validate('boo', literalStr)
    expect(notOkValidation.isOk()).toBe(false)
  })

  it('can validate an optional value', () => {
    const optionalString = v.optional(v.string)

    const okValidation = v.validate('hello', optionalString)
    expect(okValidation.isOk()).toBe(true)

    const okValidation2 = v.validate(undefined, optionalString)
    expect(okValidation2.isOk()).toBe(true)

    const notOkValidation = v.validate(null, optionalString)
    expect(notOkValidation.isOk()).toBe(false)

    const notOkValidation2 = v.validate({}, optionalString)
    expect(notOkValidation2.isOk()).toBe(false)
  })

})


function printErrorMessage(validation: v.Validation<any>) {
  if (!showErrorMessages) return

  if (!validation.isOk())
    console.log(v.errorDebugString(validation.get()))
}