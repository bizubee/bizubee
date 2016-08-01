# [Bizubee](https://bizubee.github.io)

This is the bizubee command line tool. For other bizubee tools and libraries check out [bizubee.github.io/tools](https://bizubee.github.io/tools.html)

## Usage

```
	$ bizubee -c bizubee/file/path.bz 				# to compile single file to JS
	$ bizubee -b bizubee/file/path.bz               # to bundle file + dependencies
	$ bizubee bizubee/file/path.bz					# to execute bizubee file
	$ bizubee bizubee/file/path.bz <arguments>     	# to execute file with arguments
	$ bizubee <options> bizubee/file/path.bz <arguments>    # to add runtime args
```


### Options
```
    -c,	--compile   	Compile bizubee file and all dependencies into single file
    -b, --bundle		Compile and bundle entire dependeny tree with Rollup
	-v,	--version   	Show version of bizubee
	-h,	--help      	Shows this list of commands and information
```