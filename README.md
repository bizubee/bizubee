# Bizubee 

Bizubee aims to preserve JavaScript semantics while simultaneously simplifying and extending JS. Bizubee syntax is largely inspired by CoffeeScript and Dart, though the semantics differ significanty from both.  Unlike most compile-to-js languages, the Bizubee compiler targets modern JavaScript (currently ES2015), since transpilers like Traceur can further transpile for support in legacy browsers.

Additions and deviations from JS:

## Line Breaks
Whereas in JS line breaks without semicolons lead to strange behavior, in Bizubee line breaks signify a new line unless they are found adjacent to binary operators and other special cases. This means semicolons are unnecessary, but still usable in Bizubee. So the following JS if statement
```js

console.log("a is greater than b!");
console.log("a is greater than b again!");
```

can be written as

```js

console.log("Hello,")
console.log("World!")
```

in Bizubee

## Variables

In Bizubee the a `var` declaration is equivalent to the `let` declaration in modern JavaScript, and is therefore block scoped. A `const` declaration in Bizubee is also block scoped like in modern JS.

so

```js

if true
	var a = 7
    const b = 6
    
console.log(a)
console.log(b)
```

prints undefined twice because `a` and `b` are both local to the block scope.

## No Unnecessary Parentheses
In JS an `if` statement requires parentheses around the boolean expression, but in Bizubee
```js

if (a > b) {
	console.log("a is greater than b")
}
```

can be written as

```js

if a > b {
	console.log("a is greater than b")
}
```

Note that since the conditional is an expression it can still be wrapped in parentheses in Bizubee.

Similarly, a try-catch statement from JS that would be written as

```js

try {
	doSomethingRisky();
} catch (e) {
	recoverFromError(e);
}
```
is instead written as

```js

try {
	doSomethingRisky()
} catch e {
	recoverFromError(e)
}
```

The parentheses are also omitted from for-loops and while-loops.

## Optional Indentation
`try-catch`, `if-else`,  function blocks and other similar code blocks can use either curly brackets or indentation as block delimiters. For example in Bizubee

```js

if a > b {
	console.log("a is greater than b")
} else {
	console.log("a is no greater than b")
}
```

is equivalent to

```js

if a > b
	console.log("a is greater than b")
else
	console.log("a is no greater than b")
```

In a curly bracketed block indentation is ignored, though line breaks are still not. In indented blocks neither line breaks or indentation are ignored.

## For-loops
The semantics of `for` loops in Bizubee differs significantly from JS For loops. There are only two types of for loops, for-in loops and for-on loops. The for-in loop is equivalent to the for-of loop in modern JS (as of ES2015). So

```js

for i in range(0, 10) {
	console.log("i is now ${i}")
}
```

is equivalent to the folowing in JS

```js

// Note that this code uses ES2015 JS features
for (let i of range(0, 10)) {
	console.log(`i is now ${i}`);
}
```

C style for loops and JS for-in loops have no special syntactic support, however the `keys` function from the "bizubee lib" library iterates over the keys of the object.

```js

import {keys} from bizubee lib

const myObject = {
	a: 1
	b: 4
}

for key in keys(myObject)
	console.log(key)
```

Produces

```
a
b
```

For-on loops are the async equivalent of for-in loops. Whereas a for-in loop iterates over an iterator, a for-on loop iterates over an async-iterable. Async-iterables are useful for iterating over async sequences of data.

```js

for packet on tcpConnection {
	processPacket(packet)
}
```

## Functions

Bizubee functions come in 8 flavors, but the simplest function for is defined as

```coffee

const divide = (numerator, denominator) -> {
	return numerator / denominator
}
```

whereas in JS this would be

```js

const divide = function(numerator, denominator) {
	return numerator / denominator;
};
```

Just like Coffeescript (and ES2015 JS) there is also a fat arrow function type in Bizubee

```js

@numerator = 5
@denominator = 10
const myDivide = () => {
	return @numerator / @denominator
}
```

which works just like in Coffeescript (and now JavaScript!), by preserving the `this` binding of the parent scope.

Just like ES2015, Bizubee has support for generator functions. A function is turned into a generator function by adding an asterix after the function's arrow (`->` or `=>`) as in

```js

const range = (start, end) -> * {
	var i = start
	while i != end {
		yield i
		i += 1
	}
}
```

Bizubee also supports async functions using a `~` after the function's arrow. 

An async function that fetches some html via HTTP and returns it parsed might look like

```js

const getHTMLTree = (url) -> ~ {
	var string = await getStringFromUrl(url)
	return parseHTML(string)
}
```

The `await` operator works on any object following the Promise/A+ spec. When `await` is encountered, function execution blocks until the promise argument is resolved, then the function continues with the resolution value taking the place of the await expression, if the promise is rejected an error is thrown which can be handled via usual error handling techniques. What gets returned by an async function call is not the return value of the function but rather a promise that resolves to the return value.

The 3rd function variation is the async-generator, a function is defined as an async generator by placing a `~*` to the right of the arrow, for example one could write an async generator that reads stock valuations for some company, and yields changes.

```js

const getStockPriceChanges = (company)-> ~* {
	var previous
	var priceURL = "${baseURL}?company=${company}"
	while true
		var price = await getNextPrice(priceURL)
		if defined(previous)
			yield price - previous
		previous = price
}
```

Calling an async-generator returns an async iterator, this means one can iterate over the price changes above with a for-on loop

```js

for change on getStockPriceChanges('AOL')
	doSomethingWithChange(change)
```

Note that for-on loops can only exist within async functions, in fact the above example is just sugar over 

```js

const asyncIterator = getStockPriceChanges('AOL')
while true
	const controller = await asyncIterator.next()
	if controller.done
		break
	const change = controller.value
	
	doSomethingWithChange(change)
```

Notice the `await` in the desugared example.

### Function Declarations

Much like JavaScript, Bizubee supports function declarations, so

```js

myFunc() -> {
	doSomething()
}
```

is equivalent to 

```js

const myFunc = () -> {
	doSomething()
}
```

However, all functions declarations are bubbled to the top of their scope, so functionally they behave like JavaScript's function declarations in that

```js

myFunc()

myFunc() -> {
  doSomething()
}

```

will run, where as

```js

myFunc()

const myFunc = () -> {
  doSomething()
}

```

will throw an error.

## Modules

Module semantics in bizubee is an ever expanding subset of the ES2015 module specification


### Exports

Variable and constant declarations, function, and class declarations can be exported with their values also being accessible in the current file.

```coffee

export var a = 1, b = 4		# exports names a and b
export const c = 3, d = 5	# exports names c and d

export someFunc() -> {		# exports name someFunc
	return c + b
}

export class SomeClass {	# exports name SomeClass
	constructor(a) -> {
    	@someProp = a
    }
}

console.log(someFunc()) # prints 8 cause names are accessible in file too

```

One can also export names explicitly

```coffee

var a = 1, b = 4
const c = 3, d = 5

someFunc() -> {
	return c + b
}


export {a, b, c, d, someFunc} # exports names of all variables declared

```


One can optionally set the default value of the export, if no value is provided, a module object with all the names as properties is exported as the default value

```coffee

export var 1 = 5

export func() -> {
	doSomething()
}

export default () -> {		# default value for export
	doSomethingCool()
}
```

### Imports

Exported values can be accessed in the following manner

```coffee

# import names from someFile
import {a, b} from ./someFile	# if we export a, b from file 'someFile'

# import aliased names
import {c as myName, d as myOtherName} from ./someFile

# import default values from someFile
import defaultValue from ./someFile

const c = doSomethingWith(b, myName)

defaultValue(c) 		# if defaultValue is a function

```

Note that "./someFile" is imported multiple times, but the file is evaluated only once, with its module object cached, so each import is based on the same module object.

## Usage

```

	$ bizubee -c bizubee/file/path.bz 				# to compile file
	$ bizubee bizubee/file/path.bz                 	# to execute file
	$ bizubee bizubee/file/path.bz <arguments>     	# to execute file with arguments
	$ bizubee <options> bizubee/file/path.bz <arguments>    # to add runtime args
```


### Options
```

    -c,	--compile   	Compile bisubee file and all dependencies into single file
	-t,	--target    	Specify target for file compilation output (defaults to <filename>.js)
	-m,	--mapfile   	Specify custom mapfile name when compiling
	-v,	--version   	Show version of bizubee
	-h,	--help      	Shows this list of commands and information

```

Note that with static compilation (`-c`), all dependencies are resolved statically and dumped into a single file. This is generally the prefered options to use when targeting the browser, whereas execution can be used for other platforms.
