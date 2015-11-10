
const co        = require('co');
const vm        = require('vm');
const rl        = require('readline');
const psr       = require('./parser');
const lib       = require('./lib');

const qi = rl.createInterface({
    input: process.stdin,
    output: process.stderr
});

process.on('SIGINT', function(){
    for (var ctrl of inputwaits) {
        ctrl.win(null);
    }
    
    cmd = "";
    inputwaits = [];
});

function getCommand(prompt) {
    return new Promise(function(win, fail) {
        qi.question(prompt, function(input, err) {
           if (err) {
               fail(err);
           } else {
               win(input);
           }
           
        });
    });
}

exports.run = function() {
    return co(function*(){
        const context = lib.createContext(null);
        while (true) {
            const command   = yield getCommand('bizubee> ');
            if (command === null) {
                qi.close();
                return;
            }
            
            console.log(command);
            const ctrl      = psr.parseString(command, {file: null});
            console.log('parsed');
            const js        = ctrl.getJSText();
            
            console.log('tuned to js');

            const script = vm.createScript(js, {
              filename: 'imagination.js',
              displayErrors: true
            });
            
            console.log(js);
            
            console.log('another test');
            const result = script.runInContext(context);

            
            console.log('mapa');
            
            console.log(result);
        }
    });
}