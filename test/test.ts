import * as v from '../'
import * as expect from 'expect'
import 'space-lift/all'
import Set from 'space-lift/object/set'


const showErrorMessages = false

describe('validation', () => {

  it('can validate that a value is a null', () => {
    expect(v.null.validate(null).isOk()).toBe(true)
    expect(v.is(null, v.null)).toBe(true)

    expect(v.null.validate(undefined).isOk()).toBe(false)
    expect(v.null.validate({}).isOk()).toBe(false)
    expect(v.is({}, v.null)).toBe(false)

    type Null = typeof v.null.T
    const n: Null = null
  })

  it('can validate that a value is a string', () => {
    expect(v.string.validate('hola').isOk()).toBe(true)
    expect(v.is('hola', v.string)).toBe(true)

    expect(v.string.validate(undefined).isOk()).toBe(false)
    expect(v.string.validate({}).isOk()).toBe(false)
    expect(v.is({}, v.string)).toBe(false)

    type String = typeof v.string.T
    const str: String = 'hola'
  })

  it('can validate a value and map it', () => {
    const validator = v.number.map(x => x * 2)

    expect(validator.validate(10).get()).toBe(20)

    type Number = typeof validator.T
    const num: Number = 33
  })

  it('can validate a filtered value', () => {
    const positiveNumber = v.number.filter(x => x >= 0)

    expect(positiveNumber.validate(10).get()).toBe(10)
    expect(positiveNumber.validate(-1).isOk()).toBe(false)

    printErrorMessage(positiveNumber.validate(-1))

    type PositiveNumber = typeof positiveNumber.T
    const num: PositiveNumber = 33
  })

  it('can validate an array', () => {
    const numArray = [1, 2, 3]
    expect(v.array(v.number).validate(numArray).get()).toBe(numArray)

    const badNumArray = [1, 'oops', 'fuu']
    const badValidation = v.array(v.number).validate(badNumArray)

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

    const okValidation = person.validate({
      id: 123,
      name: 'Alex',
      friends: [{ name: 'bob' }, { name: 'john' }]
    })

    expect(okValidation.isOk()).toBe(true)


    const notOkValidation = person.validate({
      id: '123',
      name: 'Alex',
      friends: [{ name: 'bob' }, { id: 'john' }]
    })

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

    const okValidation = phoneNumberNames.validate('mobile')

    expect(okValidation.isOk()).toBe(true)

    const notOkValidation = phoneNumberNames.validate('oops')

    expect(notOkValidation.isOk()).toBe(false)
  })

  it('can validate a dictionary', () => {
    const strNumMap = v.dictionary(v.string, v.number)

    const okValidation = strNumMap.validate({
      a: 1, b: 2, c: 3
    })

    expect(okValidation.isOk()).toBe(true)

    const notOkValidation = strNumMap.validate({
      a: 1, b: 2, c: '3'
    })

    expect(notOkValidation.isOk()).toBe(false)


    // domain = more precise than strings
    const enumNumMap = v.dictionary(v.keyof(Set('a', 'b').value()), v.number)

    const okValidation2 = enumNumMap.validate({ a: 1, b: 2 })

    expect(okValidation2.isOk()).toBe(true)

    const notOkValidation2 = enumNumMap.validate({
      a: 1, bb: 2, c: '3'
    })

    expect(!notOkValidation2.isOk() && notOkValidation2.get().length).toBe(3)
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

    expect(okValidation.isOk()).toBe(true)

    const notOkValidation = category.validate(
      { name: 'tools', categories: [{ name2: 'piercing', categories: [] }] })

    expect(!notOkValidation.isOk() && notOkValidation.get().length).toBe(1)
    printErrorMessage(notOkValidation)
  })

  it('can validate an ISO date', () => {
    const okValidation = v.isoDate.validate('2017-06-23T12:14:38.298Z')
    expect(okValidation.isOk() && okValidation.get().getFullYear() === 2017).toBe(true)

    const notOkValidation = v.isoDate.validate('hello')
    expect(notOkValidation.isOk()).toBe(false)
  })

  it('can validate an union of types', () => {
    const helloOrObj = v.union(
      v.string,
      v.object({ name: v.string })
    )
    const okValidation = helloOrObj.validate('hello')
    const okValidation2 = helloOrObj.validate({ name: 'hello' })

    expect(okValidation.isOk()).toBe(true)
    expect(okValidation2.isOk()).toBe(true)

    const notOkValidation = helloOrObj.validate(111)
    const notOkValidation2 = helloOrObj.validate({ name2: 'hello' })

    expect(notOkValidation.isOk()).toBe(false)
    expect(notOkValidation2.isOk()).toBe(false)
    printErrorMessage(notOkValidation)

    type HelloOrObj = typeof helloOrObj.T
    const hello: HelloOrObj = 'hello'


    // Union of literals - shortcut
    const unionsOfLiterals = v.union('hello', true, 33)
    const okValidation3 = unionsOfLiterals.validate('hello')
    const okValidation4 = unionsOfLiterals.validate(33)

    expect(okValidation3.isOk()).toBe(true)
    expect(okValidation4.isOk()).toBe(true)

    const notOkValidation3 = unionsOfLiterals.validate('hello2')
    const notOkValidation4 = unionsOfLiterals.validate(34)

    expect(notOkValidation3.isOk()).toBe(false)
    expect(notOkValidation4.isOk()).toBe(false)
    printErrorMessage(notOkValidation3)
  })

  it('can validate a literal value', () => {
    const literalStr = v.literal('hello')

    const okValidation = literalStr.validate('hello')
    expect(okValidation.isOk()).toBe(true)

    const notOkValidation = literalStr.validate('boo')
    expect(notOkValidation.isOk()).toBe(false)
  })

  it('can validate an optional value', () => {
    const optionalString = v.optional(v.string)

    const okValidation = optionalString.validate('hello')
    expect(okValidation.isOk()).toBe(true)

    const okValidation2 = optionalString.validate(undefined)
    expect(okValidation2.isOk()).toBe(true)

    const notOkValidation = optionalString.validate(null)
    expect(notOkValidation.isOk()).toBe(false)

    const notOkValidation2 = optionalString.validate({})
    expect(notOkValidation2.isOk()).toBe(false)
  })

})


function printErrorMessage(validation: v.Validation<any>) {
  if (!showErrorMessages) return

  if (!validation.isOk())
    console.log(v.errorDebugString(validation.get()))
}