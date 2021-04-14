import * as expect from 'expect'

import {
  Validation,
  errorDebugString,
  object,
  string,
  array,
  number,
  dictionary
} from '../commonjs/core'

import {
  isoDate,
  recursion,
  booleanFromString,
  relativeUrl,
  absoluteUrl,
  url,
  numberFromString,
  intFromString,
  minSize
} from '../commonjs/extra'

const showErrorMessages = true

describe('validation extras', () => {
  it('can validate an ISO date', () => {
    const okValidation = isoDate.validate('2017-06-23T12:14:38.298Z')
    expect(okValidation.ok && okValidation.value.getFullYear() === 2017).toBe(
      true
    )

    const notOkValidation = isoDate.validate('hello')
    expect(notOkValidation.ok).toBe(false)
  })

  it('can validate a recursive type', () => {
    type Category = { name: string; categories: Category[] }

    const category = recursion<Category>(self =>
      object({
        name: string,
        categories: array(self)
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
    const okValidation = booleanFromString.validate('true')
    const okValidation2 = booleanFromString.validate('false')
    const notOkValidation = booleanFromString.validate('nope')
    const notOkValidation2 = booleanFromString.validate(true)

    expect(okValidation.ok && okValidation.value).toBe(true)
    expect(okValidation2.ok && okValidation2.value).toBe(false)
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  it('can validate a number from a string', () => {
    const okValidation = numberFromString.validate('123.4')
    const okValidation2 = numberFromString.validate('100')
    const notOkValidation = numberFromString.validate('aa123')
    const notOkValidation2 = numberFromString.validate('123aa')

    expect(okValidation.ok && okValidation.value).toBe(123.4)
    expect(okValidation2.ok && okValidation2.value).toBe(100)
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  it('can validate an int from a string', () => {
    const okValidation = intFromString.validate('123')
    const notOkValidation = intFromString.validate('123.4')
    const notOkValidation2 = intFromString.validate('123aa')
    const notOkValidation3 = intFromString.validate('aaa123')

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
    const okValidation = relativeUrl().validate('path')
    const okValidation2 = relativeUrl(
      'http://use-this-domain.com/hey'
    ).validate('path/subpath')
    const notOkValidation = relativeUrl(
      'http://use-this-domain.com/hey'
    ).validate('////')
    const notOkValidation2 = relativeUrl().validate(true)

    expect(okValidation.ok && okValidation.value).toBe('path')
    expect(okValidation2.ok && okValidation2.value).toBe('path/subpath')
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  it('can validate an absolute URL', () => {
    const okValidation = absoluteUrl.validate('http://hi.com')
    const notOkValidation = absoluteUrl.validate('//aa')
    const notOkValidation2 = absoluteUrl.validate('/hey')

    expect(okValidation.ok && okValidation.value).toBe('http://hi.com')
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  it('can validate an URL', () => {
    const okValidation = url.validate('http://hi.com')
    const okValidation2 = url.validate('path/subpath')
    const notOkValidation = url.validate('////')

    expect(okValidation.ok && okValidation.value).toBe('http://hi.com')
    expect(okValidation2.ok && okValidation2.value).toBe('path/subpath')
    expect(notOkValidation.ok).toBe(false)

    printErrorMessage(notOkValidation)
  })

  //--------------------------------------
  //  generic constraints
  //--------------------------------------

  it('can validate that a container has a minimum size', () => {
    const okValidation = array(number).flatMap(minSize(2)).validate([1, 2, 3])
    const okValidation2 = string.flatMap(minSize(3)).validate('abc')
    const okValidation3 = dictionary(string, string)
      .flatMap(minSize(1))
      .validate({ a: 'a' })

    const notOkValidation = array(number).flatMap(minSize(2)).validate([0])
    const notOkValidation2 = string.flatMap(minSize(3)).validate('')
    const notOkValidation3 = dictionary(string, string)
      .flatMap(minSize(2))
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
})

function printErrorMessage(validation: Validation<any>) {
  if (!showErrorMessages) return
  if (!validation.ok) console.log(errorDebugString(validation.errors))
}
