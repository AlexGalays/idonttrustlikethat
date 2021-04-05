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

export const isoDate = string.flatMap(str => {
  const date = new Date(str)
  return isNaN(date.getTime())
    ? Err(`Expected ISO date, got: ${prettifyJson(str)}`)
    : Ok(date)
})

export const relativeUrl = string.flatMap(str => {
  try {
    new URL(str, 'http://some-domain.com')
    return Ok(str)
  } catch (err2) {
    return Err(`${str} is not a correct URL (absolute or relative)`)
  }
})

export const booleanFromString = union('true', 'false').map(
  str => str === 'true'
)
