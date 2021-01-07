import * as v from '../'

// type derivation to null but assigned to a number @shouldNotCompile
const a: typeof v.null.T = 33

// type derivation to string but assigned to null @shouldNotCompile
const b: typeof v.string.T = null

const person = v.object({
  id: v.number,
  name: v.string,
  friends: v.array(
    v.object({
      name: v.string,
    })
  ),
})

type Person = typeof person.T

// Deriving the type and then assigning to a completely wrong type @shouldNotCompile
const c: typeof person.T = undefined

// Deriving the type and then assigning to a completely wrong type @shouldNotCompile
const d: typeof person.T = {}

// Deriving the type and then assigning to a wrong type @shouldNotCompile
const e: typeof person.T = {
  id: 123,
  name: '111',
  friends: [{ name: 111 }],
}

// Creating an union with completely wrong members @shouldNotCompile
v.union(new Date(), new Date())

// Deriving from an union type and assigning to an unrelated type @shouldNotCompile
const helloOrObj = v.union(v.string, v.object({ name: v.string }))
type HelloOrObj = typeof helloOrObj.T
const hello: HelloOrObj = {}

// Deriving from an intersection type and assigning to an unrelated type @shouldNotCompile
const fooAndBar = v.intersection(
  v.object({ foo: v.number }),
  v.object({ bar: v.string })
)
type FooAndBar = typeof fooAndBar.T
const foo: FooAndBar = { foo: 10 }

// Assigning to the wrong literal @shouldNotCompile
const aaa = v.literal('AAA')
type OnlyAAA = typeof aaa.T
const bbb: OnlyAAA = 'bbb'

// tagged() called on a non Primitive validator (string | number) @shouldNotCompile
const validator = v.object({}).tagged<string>()

// validateAs with an incompatible type param @shouldNotCompile 1
v.validateAs<string>(v.number, {})

// validateAs with an incompatible type param @shouldNotCompile 2
v.validateAs<{ id: string; prefs?: { lang: string } }>(
  v.object({ id: v.string, prefs: v.object({}).optional() }),
  {}
)

// discriminatedUnion where the type key is not found in all the members @shouldNotCompile
v.discriminatedUnion(
  'type',
  v.object({ type: v.literal('A') }),
  v.object({ name: v.string })
)

// discriminatedUnion where the type key is not found in all the members (2) @shouldNotCompile
v.discriminatedUnion('type', v.object({ type: v.literal('A') }), v.string)

// discriminatedUnion where the type value is not a literal validator in all the members (3) @shouldNotCompile
v.discriminatedUnion(
  'type',
  v.object({ type: v.literal('A') }),
  v.object({ type: v.string })
)
