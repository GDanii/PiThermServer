
var mail_period = 60 * 60 * 1000; //1 hour
//var mail_period = 60 * 1000; //1 minute

var mail_to = "";

var last_mail = Date.now() - mail_period; //This way we can send the first mail right away

exports.alert_control = function( celsius ) {
	//Only send if enough time elapsed
	if( Date.now() >= mail_period + last_mail ) {
		
		console.log("Sending alert message!");
		
		var email   = require("emailjs");
		var server  = email.server.connect({
		   user:    "", 
		   password:"", 
		   host:    "smtp.gmail.com", 
		   ssl:     true
		});

		// send the message and get a callback with an error or details of the message that was sent
		server.send({
		   text:    "Temperature is too low ("+celsius+" °C)!", 
		   from:    "", 
		   to:      mail_to,
		   cc:      "",
		   subject: "Balaton temperature alert ("+celsius+" °C)!"
		}, function(err, message) { console.log(err || message); });
		
		//Update the counter
		last_mail = Date.now();
	}

}
