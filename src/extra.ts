import { string, Ok, Err, Validator, prettifyJson, union } from './core'

export function recursion<T>(
  definition: (self: Validator<T>) => Validator<unknown>
): Validator<T> {
  const Self = new Validator<T>((value, config, path) =>
    Result.validate(value, config, path)
  )
  const Result: any = definition(Self)
  return Result
}

export const isoDate = string.and(str => {
  const date = new Date(str)
  return isNaN(date.getTime())
    ? Err(`Expected ISO date, got: ${prettifyJson(str)}`)
    : Ok(date)
})

//--------------------------------------
//  url
//--------------------------------------

export const relativeUrl = (baseUrl: string = 'http://some-domain.com') =>
  string.and(str => {
    try {
      new URL(str, baseUrl)
      return Ok(str)
    } catch (err) {
      return Err(`${str} is not a relative URL for baseURL: ${baseUrl}`)
    }
  })

export const absoluteUrl = string.and(str => {
  try {
    new URL(str)
    return Ok(str)
  } catch (err) {
    return Err(`${str} is not an absolute URL`)
  }
})

export const url = union(absoluteUrl, relativeUrl())

//--------------------------------------
//  parsed from string
//--------------------------------------

export const booleanFromString = union('true', 'false')
  .withError(v => `Expected "true" | "false", got: ${v}`)
  .map(str => str === 'true')

export const numberFromString = string.and(str => {
  const parsed = Number(str)
  return Number.isNaN(parsed)
    ? Err(`"${str}" is not a stringified number`)
    : Ok(parsed)
})

export const intFromString = numberFromString.and(num => {
  return Number.isInteger(num) ? Ok(num) : Err(`${num} is not an int`)
})

//--------------------------------------
//  generic constraints
//--------------------------------------

type HasSize =
  | object
  | string
  | Array<unknown>
  | Map<unknown, unknown>
  | Set<unknown>

export function minSize<T extends HasSize>(minSize: number) {
  return (value: T) => {
    const size =
      typeof value === 'string'
        ? value.length
        : Array.isArray(value)
        ? value.length
        : value instanceof Map || value instanceof Set
        ? value.size
        : Object.keys(value).length

    return size >= minSize
      ? Ok(value)
      : Err(`Expected a min size of ${minSize}, got ${size}`)
  }
}

export const nonEmpty = minSize(1)
