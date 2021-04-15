# idonttrustlikethat
(Used to be named `validation.ts` but some people struggled to make this `.ts` node module work in TS and we needed a more serious name)  

This module helps validating incoming JSON, Form values, url params, localStorage values, server Environment objects, etc in a concise and type safe manner.  
The focus of the lib is on small size and an easy API to add new validations.

Note: This module uses very precise Typescript types. Thus, it is mandatory to at least have the following `tsconfig` / `tsc`'s compiler options flag: `strict`: `true`.

- [How to](#how-to)

  - [Create a new validation](#create-a-new-validation)
  - [Deriving the typescript type from the validator type](#deriving-the-typescript-type-from-the-validator-type)
  - [Customize error messages](#customize-error-messages)

- [Exports](#exports)
- [API](#api)
  - [validate](#validate)
  - [primitives](#primitives)
  - [tagged string/number](#tagged-stringnumber)
  - [literal](#literal)
  - [object](#object)
  - [array](#array)
  - [tuple](#tuple)
  - [union](#union)
  - [intersection](#intersection)
  - [optional, nullable](#optional-nullable)
  - [default](#default)
  - [dictionary](#dictionary)
  - [map, filter](#map-filter)
  - [and](#and)
  - [then](#then)
  - [recursion](#recursion)
  - [minSize][#minSize]
  - [isoDate](#isoDate)
  - [url](#url)
  - [booleanFromString](#booleanFromString)
  - [numberFromString](#numberFromString)
  - [intFromString](#intFromString)

## How to

### Create a new validation

This library exposes a validator for all [primitive](#primitives) and object types so you should usually start from one of these then compose it with extra validations.

Here's how `isoDate` is defined internally:

```ts
import { string, Err, Ok } from 'idonttrustlikethat'

const isoDate = string.and(str => {
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

const bigArray = array(string).and(minSize(100))
bigArray.validate(['1', '2']).ok // false
```

Note: the extra `minSize` validator does exactly that, but for more input types.  

If you need to start from any value, you can use the `unknown` validator that always succeeds.

### Deriving the typescript type from the validator type

This can be used with any combination of validators except ones using `recursion`.

You can get the exact type of a validator's value easily:

```ts
import { object, string, number } from 'idonttrustlikethat'

const person = object({
  name: string,
  age: number,
})

type Person = typeof person.T

const person: Person = {
  name: 'Jon',
  age: 80
}
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
  dictionary,
  errorDebugString,
  intersection,
  union,
  is,
  literal,
  unknown,
  null as vnull,
  number,
  object,
  string,
  boolean,
  tuple,
  undefined,
} from 'idonttrustlikethat'
```

```ts
import {
  isoDate,
  recursion,
  snakeCaseTransformation,
  relativeUrl,
  absoluteUrl,
  url,
  booleanFromString,
  numberFromString,
  intFromString,
  minSize,
  nonEmpty
} from 'idonttrustlikethat/extra'
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

v.unknown
v.string
v.number
v.boolean
v.null
v.undefined

v.string.validate(12).ok // false
```

### tagged string/number

Sometimes, a `string` or a `number` is not just any string or number but carries extra meaning, e.g: `email`, `uuid`, `UserId`, `KiloGram`, etc.  
Tagging such a primitive as soon as it's being validated can help make the downstream code more robust and better documented.  

```ts
import { string, object } from 'idonttrustlikethat'

type UserId = string & { __tag: 'UserId' } // Note: You can use any naming convention for the tag.

const userId = string.tagged<UserId>()

const user = object({
  id: userId
})

```

If you don't use tagged types, it can lead to situations like:  

```ts
const user = object({
  id: string,
  companyId: string
})

const user = {
  id: '12345678',
  companyId: '7cd3821a-553f-4d26-84f9-88776005612b'
}

function fetchCompanyDetails(companyId: string) {}

// Nothing prevents you from passing the wrong ID "type"
fetchCompanyDetails(user.id)
```

Using tagged types fixes all these problems while also retaining that type's usefulness as a basic `string`/`number`.  

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

Note that if you validate an input object with extra properties compared to what the validator know, these will be dropped from the output.  
This helps keeping a clean object and let us avoid dangerous situations such as:  

```ts
import { string, object } from 'idonttrustlikethat'

const configValidator = object({
  clusterId: string,
  version: string
})

const config = {
  clusterId: '123',
  version: 'v191',
  extraStuffFromTheServer: 100,
  _metadata: true
}

// Let's imagine what could happen if this kept all non declared properties in the output.
const result = configValidator.validate(config)

if (result.ok) {
  // As far as typescript is concerned, all values are string in the validated object, which let us manipulate it as such, perhaps to pass it some generic utility:  
  const configDictionary: Record<string, string> = result.value

  // But it's a lie, some properties are still found in the object that aren't strings.
  // This will throw an exception when the entire point of validating is to avoid that.
  Object.values(configDictionary).forEach(str => str.padStart(2))
}
```

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

Unions of literal values do not have to use `literal()` but can be passed the values directly:  

```ts
import {union} from 'idonttrustlikethat'

const bag = union(null, 'hello', true, 33)
```

### discriminatedUnion

Although you could also use `union` for your discriminated unions, `discriminatedUnion` is faster and has better error messages for that special case. It will also catch common typos at the type level.  

```ts
import {discriminatedUnion, literal, string} from 'idonttrustlikethat'

const userSending = object({
  type: literal('sending')
})

const userEditing = object({
  type: literal('editing'),
  currentText: string
})

const userChatAction = discriminatedUnion('type', userSending, userEditing)
```

### intersection

```ts
import { intersection, object, string, number } from 'idonttrustlikethat'

const object1 = object({ id: string })
const object2 = object({ age: number })
const validator = intersection(object1, object2)

validator.validate({ id: '123', age: 80 }).ok // true
```

### optional, nullable

`optional()` transforms a validator to allow `undefined` values.  

`nullable()` transforms a validator to allow `undefined` and `null` values, akin to the std lib `NonNullable` type.  

If you must validate a `T | null` that shouldn't possibly be `undefined`, you can use `union()`  

```ts
import { string } from 'idonttrustlikethat'

const validator = string.nullable()

const result = validator.validate(undefined)

result.ok && result.value // undefined
```


### default

Returns a default value if the validated value was either null or undefined.  

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

If you need a partial dictionary, simply type your values as optional:  

```ts
import { dictionary, string, number, union } from 'idonttrustlikethat'

const validator = dictionary(union('a', 'b', 'c'), number.optional())

validator.validate({
  b: 1
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

### and

Unlike `map` which deals with a validated value and returns a new value, `and` can return either a validated value or an error.

```ts
import { string, Ok, Err } from 'idonttrustlikethat'

const validator = string.and(str =>
  str.length > 3 ? Ok(str) : Err(`No, that just won't do`)
)
```

### then

`then` allows the chaining of Validators. It can be used instead of `and` if you already have the Validators ready to be reused.

```ts
// Validate that a string is a valid number (e.g, query string param)
const stringToInt = v.string.and(str => {
  const result = Number.parseInt(str, 10)
  if (Number.isFinite(result)) return Ok(result)
  return Err('Expected an integer-like string, got: ' + str)
})

// unix time -> Date
const timestamp = v.number.and(n => {
  const date = new Date(n)
  if (isNaN(date.getTime())) return Err('Not a valid date')
  return Ok(date)
})

const timeStampFromQueryString = stringToInt.then(timestamp)

timeStampFromQueryString.validate('1604341882') // {ok: true, value: Date(...)}
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

### minSize

Ensures an Array, Object, string, Map or Set has a minimum size. You can also use `nonEmpty`.

```ts
import {dictionary, string} from 'idonttrustlikethat'
import {minSize} from 'idonttrustlikethat/extra'

const dictionaryWithAtLeast10Items = dictionary(string, string).and(minSize(10))
```

### isoDate

```ts
import { isoDate } from 'idonttrustlikethat/extra'

isoDate.validate('2011-10-05T14:48:00.000Z').ok // true
```

### url

Validates that a string is a valid URL, and returns that string.

```ts
import { url, absoluteUrl, relativeUrl } from 'idonttrustlikethat/extra'

absoluteUrl.validate('https://ebay.com').ok // true
```

### booleanFromString

Validates that a string encodes a boolean and returns the boolean.

```ts
import { booleanFromString } from 'idonttrustlikethat/extra'

booleanFromString.validate('true').ok // true
```

### numberFromString

Validates that a string encodes a number (float or integer) and returns the number.

```ts
import { numberFromString } from 'idonttrustlikethat/extra'

numberFromString.validate('123.4').ok // true
```

### intFromString

Validates that a string encodes an integer and returns the number.

```ts
import { intFromString } from 'idonttrustlikethat/extra'

intFromString.validate('123').ok // true
```

## Configuration

A Configuration object can be passed to modify the default behavior of the validators:

**Configuration.transformObjectKeys**

Transforms every keys of every objects before validating.

```ts
import {snakeCaseTransformation} from 'idonttrustlikethat/extra'

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
  { transformObjectKeys: snakeCaseTransformation }
)
```
