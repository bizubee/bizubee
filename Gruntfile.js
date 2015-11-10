
module.exports = function(grunt) {
    require("load-grunt-tasks")(grunt);    
    
    grunt.initConfig({
        package: grunt.file.readJSON('package.json'),
        babel: {
            options: {
                blacklist: [
                    "es6.classes",
                    "regenerator"
                ]
            },
            js: {
                files: {
                    'src/js-nodes.js': 'src/js-nodes.babel.js'
                }
            },
            bz: {
                files: {
                    'src/bz-nodes.js': 'src/bz-nodes.babel.js'
                }
            }
        },
        jison: {
            target: {
                options: {},
                files: {
                    'src/generated-parser.js':'src/parser.jison'
                }
            }
        }
    });
    
    grunt.registerTask('default', ['babel', 'jison']);
};