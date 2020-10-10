# idonttrustlikethat

Validation for TypeScript

This module helps validating incoming JSON, url params, localStorage values, server Environment objects, etc in a concise and type safe manner.  
The focus of the lib is on small size and an easy API to add new validations.

- [How to](#how-to)

  - [Create a new validation](#create-a-new-validation)
  - [Deriving the typescript type from the validator type](#deriving-the-typescript-type-from-the-validator-type)
  - [Customize error messages](#customize-error-messages)

- [Exports](#exports)
- [API](#api)
  - [validate](#validate)
  - [primitives](#primitives)
  - [tagged string/number](#tagged-string/number)
  - [literal](#literal)
  - [object](#object)
  - [array](#array)
  - [tuple](#tuple)
  - [union](#union)
  - [intersection](#intersection)
  - [keyof](#keyof)
  - [dictionary](#dictionary)
  - [default](#default)
  - [map, filter](#map,-filter)
  - [flatMap](#flatMap)
  - [transform](#transform)
  - [recursion](#recursion)

## How to

### Create a new validation

This library exposes a validator for all primitive and object types so you should usually start from one of these then compose it with extra validations.

Here's how `isoDate` is defined internally:

```ts
import { string, Err, Ok } from 'idonttrustlikethat'

const isoDate = string.flatMap(str => {
  const date = new Date(str)
  return isNaN(date.getTime())
    ? Err(`Expected ISO date, got: ${pretty(str)}`)
    : Ok(date)
})

isoDate.validate('2011-10-05T14:48:00.000Z').ok // true
```

This creates a new Validator that reads a string then tries to create a Date out of it.

You can also create an optional validation step that wouldn't make sense on its own:

```ts
import { string, Err, Ok, array, string } from 'idonttrustlikethat'

// This is essentially a basic filter() but with a nicer, custom error message.
const minSize = (size: number) => <T>(array: T[]) =>
  array.length >= size
    ? Ok(array)
    : Err(`Expected an array with at least ${size} items`)

const bigArray = array(string).flatMap(minSize(100))
bigArray.validate(['1', '2']).ok // false
```

### Deriving the typescript type from the validator type

This can be used with any combination of validators except ones using `recursion`.

Instead of using the derived type as your interface everywhere in the app, use it to compare its compatibility with your
handcrafted interfaces which will be more readable in IDE's tooltips and keep compilation performances high.

```ts
import { object, string, number } from 'idonttrustlikethat'

const person = object({
  name: string,
  age: number,
})

type PersonFromValidator = typeof person.T

type Person = {
  name: string
  age: number
}

type Equals<A1, A2> = (<A>() => A extends A1 ? true : false) extends <
  A
>() => A extends A2 ? true : false
  ? true
  : false

const _typesAreEqual: Equals<Person, PersonFromValidator> = true
```

### Customize error messages

If you say, use this library to validate a Form data, it's best to assign your error messages directly in the validator so that the proper error messages get accumulated, ready for you to display them.

```ts
import { object, string } from 'idonttrustlikethat'

const mandatoryFieldError = 'This field is mandatory'
const mandatoryString = string.withError(mandatoryFieldError)

const formValidator = object({
  name: mandatoryString,
})

// {ok: false, errors: [{path: 'name', message: 'This field is mandatory'}]}
const result = formValidator.validate({})
```

## Exports

Here are all the values this library exposes:

```ts
import {
  Err,
  Ok,
  array,
  boolean,
  dictionary,
  errorDebugString,
  intersection,
  is,
  isoDate,
  keyof,
  literal,
  null as vnull,
  number,
  object,
  string,
  snakeCaseTransformation,
  recursion,
  tuple,
  undefined,
  union,
} from 'idonttrustlikethat'
```

And all the types:

```ts
import {
  Result,
  Err,
  Ok,
  Validation,
  Validator,
  Configuration,
} from 'idonttrustlikethat'
```

## API

### validate

Every validator has a `validate` function which returns a Result (either a `{ok: true, value}` or a `{ok: false, errors}`)
Errors are accumulated.

```ts
import { object, errorDebugString } from 'idonttrustlikethat'

const myValidator = object({})
const result = myValidator.validate(myJson)

if (result.ok) {
  console.log(result.value)
} else {
  console.error(errorDebugString(result.errors))
}
```

In case of errors, `errors` contains an Array of `{ message: string, path: string }` where `message` is a debug error message for developers and `path` is the path where the error occured (e.g `people.0.name`)

`errorDebugString` will give you a complete debug string of all errors, e.g.

```
At [root / c] Error validating the key. "c" is not a key of {
  "a": true,
  "b": true
}
At [root / c] Error validating the value. Type error: expected number but got string
```

### primitives

```ts
import * as v from 'idonttrustlikethat'

v.string
v.number
v.boolean
v.null
v.undefined
v.isoDate

v.string.validate(12).ok // false
```

### tagged string/number

Sometimes, a `string` or a `number` is not just any string or number but carries extra meaning, e.g: `email`, `uuid`, `userId`, `KiloGram`, etc.  
Tagging such a primitive as it's being validated can help make the downstream code more robust.

```ts
type UserId = string & { __tag: 'UserId' } // Note: You can use any naming convention for the tag.

const userIdValidator = v.string.tagged<UserId>()
```

### literal

```ts
import { literal } from 'idonttrustlikethat'

// The only value that can ever pass this validation is the 'X' string literal
const validator = literal('X')
```

### object

```ts
import { string, object, union } from 'idonttrustlikethat'

const person = object({
  id: string,
  prefs: object({
    csvSeparator: union(',', ';', '|').optional(),
  }),
})

validator.validate({
  id: '123',
  prefs: {},
}).ok // true
```

Note: For bigger unions of strings, consider using the `keyof` validator instead.

### array

```ts
import { array, string } from 'idonttrustlikethat'

const validator = array(string)

validator.validate(['a', 'b']).ok // true
```

### tuple

```ts
import { tuple, string, number } from 'idonttrustlikethat'

const validator = tuple(string, number)

validator.validate(['a', 1]).ok // true
```

### union

```ts
import { union, string, number } from 'idonttrustlikethat'

const stringOrNumber = union(string, number)

validator.validate(10).ok // true
```

### intersection

```ts
import { intersection, object, string, number } from 'idonttrustlikethat'

const object1 = object({ id: string })
const object2 = object({ age: number })
const validator = intersection(object1, object2)

validator.validate({ id: '123', age: 80 }).ok // true
```

### keyof

```ts
import { keyof } from 'idonttrustlikethat'

const keys = { aa: 1, bb: 1, cc: 1 }
const keyValidator = keyof(keys)

keyValidator.validate('bb').ok // true
```

### default

default() only works with Validator that _can_ return a null or undefined value.

```ts
import { string } from 'idonttrustlikethat'

const validator = string.optional().default(':(')

const result = validator.validate(undefined)

result.ok && result.value // :(
```

### dictionary

A dictionary is an object where all keys and all values share a common type.

```ts
import { dictionary, string, number } from 'idonttrustlikethat'

const validator = dictionary(string, number)

validator.validate({
  a: 1,
  b: 2,
}).ok // true
```

### map, filter

```ts
import { string } from 'idonttrustlikethat'

const validator = string.filter(str => str.length > 3).map(str => `${str}...`)

const result = validator.validate('1234')
result.ok // true
result.value // 1234...
```

### flatMap

Unlike `map` which deals with a validated value and returns a new value, `flatMap` can return either a validated value or an error.

```ts
import { string, Ok, Err } from 'idonttrustlikethat'

const validator = string.flatMap(str =>
  str.length > 3 ? Ok(str) : Err(`No, that just won't do`)
)
```

### transform

`transform` allows any validated value or error to be transformed into any other validated or error.

```ts
import { string, Ok, Err } from 'idonttrustlikethat'

const validator = string.transform(result =>
  result.ok ? Err('No way') : Ok('yes way')
)
```

### recursion

```ts
import { recursion, string, array, object } from 'idonttrustlikethat'

type Category = { name: string; categories: Category[] }

const category = recursion<Category>(self =>
  object({
    name: string,
    categories: array(self),
  })
)
```

## Configuration

A Configuration object can be passed to modify the default behavior of the validators:

**Configuration.transformObjectKeys**

Transforms every keys of every objects before validating.

```ts
const burger = v.object({
  options: v.object({
    doubleBacon: v.boolean,
  }),
})

const ok = burger.validate(
  {
    options: {
      double_bacon: true,
    },
  },
  { transformObjectKeys: v.snakeCaseTransformation }
)
```
