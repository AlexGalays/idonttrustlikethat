# validation.ts
Validation for TypeScript  


## validate

Every validator has a `validate` function which returns a [Result](https://github.com/AlexGalays/spacelift#api.result)  

A validated value can be transformed at any point during the validation process (e.g. `isoDate`).  
Errors are accumulated.  

```ts
import { errorDebugString } from 'validation.ts'

const myValidator = ...

const result = myValidator.validate(myJson)

result.fold(
  errors => console.error(errorDebugString(errors)),
  validatedJson => console.log(validatedJson)
)
```


## primitives

```ts
import * as v from 'validation.ts'

v.string
v.number
v.boolean
v.null
v.undefined
v.isoDate
```

## literal

```ts
import { literal } from 'validation.ts'

// The only value that can ever pass this validation is the 'X' string literal
const validator = literal('X')
```

## array

```ts
import { array, string } from 'validation.ts'

const validator = array(string)
```


## object, literal union, optional

```ts
import { string, object, union, optional } from 'validation.ts'


const person = object({
  id: string,
  prefs: object({
    csvSeparator: optional(union(',', ';', '|'))
  })
})
```

Note: For bigger unions, consider using the `keyof` validator instead.


## dictionary

A dictionary is an object where all keys and all values share a common type.

```ts
import { dictionary, string, number } from 'validation.ts'

const validator = dictionary(string, number)
```


## keyof

```ts
import Set from 'space-lift/object/set'
import { keyof } from 'validation.ts'

const keys = Set('aa', 'bb', 'cc').value()

const keyValidator = keyof(keys)

keyValidator.validate('bb') // Ok<'aa' | 'bb' | 'cc'> = Ok('bb')

// keyof typeof keys === typeof keyValidator.T === 'aa' | 'bb' | 'cc'
```


## map, filter

```ts
import { map, filter, string } from 'validation.ts'

const validator = string.filter(str => str.length > 3).map(str => `${str}...`)
```

## recursion

```ts
import { recursion, string, array, object }

type Category = { name: string, categories: Category[] }

const category = recursion<Category>(self => object({
  name: string,
  categories: array(self)
}))
```


## Deriving the typescript type from the validator type

Note: this can be used with any combination of validators except ones using `recursion`.

```ts
import { object, string, number } from 'validation.ts'

const person = object({
  name: string,
  age: number
})

type Person = typeof person.T
/*
type Person = {
  name: string
  age: number
}
*/
```


## Thanks

To `gcanti` and his `io-ts` library which provided great inspiration.