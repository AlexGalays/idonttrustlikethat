import * as v from '../'
import Set from 'space-lift/object/set'


// type derivation to null but assigned to a number @shouldNotCompile
const a: typeof v.null.T = 33

// type derivation to string but assigned to null @shouldNotCompile
const b: typeof v.string.T = null


const person = v.object({
  id: v.number,
  name: v.string,
  friends: v.array(v.object({
    name: v.string
  }))
})

// Deriving the type and then assigning to a completely wrong type @shouldNotCompile
const c: typeof person.T = undefined

// Deriving the type and then assigning to a completely wrong type @shouldNotCompile
const d: typeof person.T = {}

// Deriving the type and then assigning to a wrong type @shouldNotCompile
const e: typeof person.T = {
  id: 123,
  name: '111',
  friends: [{ name: 111 }]
}

// Deriving from a keyof validation but then assigning to a wrong string @shouldNotCompile
const keys = Set('bob', 'tonton').value()
const keysValidator = v.keyof(keys)
const f: typeof keysValidator.T = 'bob2'


// Deriving from an union type and assigning to an unrelated type @shouldNotCompile
const helloOrObj = v.union(
  v.string,
  v.object({ name: v.string })
)
type HelloOrObj = typeof helloOrObj.T
const hello: HelloOrObj = {}


// Assigning to the wrong literal @shouldNotCompile
const aaa = v.literal('AAA')
type OnlyAAA = typeof aaa.T
const bbb: OnlyAAA = 'bbb'