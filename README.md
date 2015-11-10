# Bizubee Syntax

The philosophy behind Bizubee is to have a language that preserved javascript semantics, while simultaneously simplifying and extending the JS. Bizubee syntax is very much inspired by CoffeeScript though the semantics differ significanty.  Here is a walk through the language

##Significan Line Breaks
In JS line breaks are for all practical purposes ignored (it's more complicated), whereas in Bizubee, line breaks signify a new line unless they are found adjacent to binary operators and other special cases. This means semicolons are unnecessary, but still usable in Bizubee. So the following JS if statement
```js
console.log("a is greater than b!");
console.log("a is greater than b again!");
```

would be written as

```js
console.log("Hello,")
console.log("World!")
```

in Bizubee

##No Unnecessary Parentheses
In JS an `if` statement requires parentheses around the boolean expression, but in Bizubee
```js
if (a > b) {
	console.log("a is greater than b")
}
```

is written as

```js
if a > b {
	console.log("a is greater than b")
}
```

Note that since the conditional is an expression it can still be wrapped in parentheses in Bizubee.

or a try-catch statement from JS that would be written as

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


##Optional Indentation
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

##For-loops
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

C style for loops and JS for-in loops have no special syntactic support, as the C-style for loops are just down right ugly and provide little advantage over while-loops, and there is the `keys`, and `keyvals` generator functions from the standard library to iterate over object keys in Bizubee's for-in loop, which makes syntax level support for this feature unnecessary.

For-on loops are the async equivalent of for-in loops. Whereas a for-in loop iterates over an iterator, a for-on loop using similar syntax iterates over an async-iterator. Async-iterators are useful for iterating over async sequences of data

```js
for packet on tcpConnection {
	processPacket(packet)
}
```

##Functions

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

which works just like in Coffeescript (and now JavaScript!), but preserving the `this` binding of the parent scope.

Just like ES2015, Bizubee has support for generator functions. A function is turned into a generator function by adding an asterix after the function's arrow (`->` or `=>`).

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

The 3rd type of function is the async-generator function, a function is defined as an async generator by placing a `~*` to the right of the arrow, for example one could write an async generator that reads stock valuations for some company, and yields changes.

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

Calling an async-generator returns an async iterator, this mean one can iterate over the price changes above with a for-on loop

```js
for change on getStockPriceChanges('AOL')
	doSomethingWithChange(change)
```

Note that for-on loops can only exist within async functions, infact the above example is just sugar over 

```coffee
const asyncIterator = getStockPriceChanges('AOL')
while true
	const controller = await asyncIterator.next()
	if controller.done
		break
	const change = controller.value
	
	doSomethingWithChange(change)
```

Notice the `await` in the desugared example.