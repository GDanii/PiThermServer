var gpio = require('rpi-gpio');
var async = require('async');
exports.LED = {
    HEAT : 11, CONTROL : 13
}; //GPIO17 and GPIO27
var HEAT = 11, CONTROL = 13;
var pins = [HEAT, CONTROL];
var initialized = false;
function setup_LED(callBack){
    if(initialized){
	callBack();
	return;
    }
    async.each(pins,  function(pin,callback) {
        gpio.setup(pin, gpio.DIR_OUT, callback);
    }, function(err){
	initialized = true;
	callBack(err);
    });
};


exports.write = function(leds) {
    setup_LED(function(err){
	clearLED(function(){
	    async.each(leds,function(led,callback){
		delayedWrite(led,true,callback);
	    });
	});
    });
    
};

function clearLED(callBack){
    async.each(pins, function(pin, callback){
	delayedWrite(pin,false,callback);
    },callBack);
}

function delayedWrite(pin, value, callback) {
    setTimeout(function() {
        gpio.write(pin, value, callback);
    }, 2);
}


exports.shutDown = function(callBack) {
    clearLED(function(){
        gpio.destroy(callBack);
    });
}
