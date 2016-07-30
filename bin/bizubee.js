#!/usr/bin/env node

const cmd 		= require('minimist');
const tangler 	= require('tangler');

const args 	= cmd(process.argv.slice(1));
const mod	= tangler.require('../src/index.js', __filename);

mod.main(args);