import * as expect from 'expect'

import {
  Validation,
  errorDebugString,
  object,
  string,
  array
} from '../commonjs/core'

import {
  isoDate,
  recursion,
  booleanFromString,
  relativeUrl,
  absoluteUrl,
  url
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

  it('can validate a boolean from a string', () => {
    const okValidation = booleanFromString.validate('true')
    const okValidation2 = booleanFromString.validate('false')
    const notOkValidation = booleanFromString.validate('nope')
    const notOkValidation2 = booleanFromString.validate(true)

    expect(okValidation.ok && okValidation.value).toBe(true)
    expect(okValidation2.ok && okValidation2.value).toBe(false)
    expect(notOkValidation.ok).toBe(false)
    expect(notOkValidation2.ok).toBe(false)
  })

  it('can validate a relative URL', () => {
    const okValidation = relativeUrl.validate('path')
    const okValidation2 = relativeUrl.validate('path/subpath')
    const notOkValidation = relativeUrl.validate('////')
    const notOkValidation2 = relativeUrl.validate(true)

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
})

function printErrorMessage(validation: Validation<any>) {
  if (!showErrorMessages) return
  if (!validation.ok) console.log(errorDebugString(validation.errors))
}
