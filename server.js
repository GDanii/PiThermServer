// server.js - NodeJS server for the PiThermServer project.

/* 

Parses data from DS18B20 temperature sensor and serves as a JSON object.
Uses node-static module to serve a plot of current temperature (uses highcharts).

Tom Holderness 03/01/2013
Ref: www.cl.cam.ac.uk/freshers/raspberrypi/tutorials/temperature/

Updates by Daniel Gehberger
*/

//The ID of the actually used themperature sensor:
var device_ID = '28-000005294c9c';

////////////////////////////////////////////////////////
// Load node modules
var fs = require('fs');
var sys = require('sys');
var http = require('http');
var sqlite3 = require('sqlite3');
var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');

// Load local module files
var gpio = require(__dirname+'/gpio');
var mailer = require(__dirname+'/mailer');

var fs = require('fs');


// Setup database connection for logging
var db = new sqlite3.Database(__dirname+'/piTemps.db');

////////////////////////////////////////////////////////
// Set up express and its handlers
var app = express()

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/www'));

app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

app.use(cookieParser());
app.use(session({
  secret: 'dewfwenfoewjfpowejcfmwehrmiwhuwieg',
  resave: false,
  saveUninitialized: true
}))

var https_options = {
  key: fs.readFileSync(__dirname + '/cert/key.pem'),
  cert: fs.readFileSync(__dirname + '/cert/cert.pem')
};

var http = require('https').createServer(https_options, app);

var server = http.listen(3001, function () {

  var host = server.address().address
  var port = server.address().port

  console.log('Example app listening at http://%s:%s', host, port)

})

//Used to validate the page access, redirect to the login page if 
//the session is not valid
function checkAuth(req, res, next) {
  if (!req.session.user_id) {
    //res.send('You are not authorized to view this page');
	res.redirect('/login');
  } else {
    next();
  }
}

//Display the login page if the session is not valid,
//redirect to the main page otherwise
app.get('/login', function (req, res) {
	if (!req.session.user_id) {
		res.render('login',{});
	} else {
		res.redirect('/');
	}
});

// POST handler for the login page
app.post('/login', function (req, res) {
  var post = req.body;
  
  //Perform the hash as the password is stored this way in the DB
  var hashed_password = require('crypto').createHash('sha256').update(post.password).digest('hex');
  
  var current_temp = db.get("SELECT * FROM auth WHERE name = ? AND password = ?;", post.user, hashed_password,
      function(err, row){
        if (err){
			   response.writeHead(500, { "Content-type": "text/html" });
			   response.end(err + "\n");
			   console.log('Error serving querying database. ' + err);
			   return;
		}
		
		//User not found
		if( row === undefined ) {
			res.redirect('/login');
			return;
		}
		
		//Let the user in
		req.session.user_id = row.id;
		res.redirect('/');
   });
});

app.get('/logout', function (req, res) {
  delete req.session.user_id;
  res.redirect('/login');
});

//Render the main page
app.get('/', checkAuth, function (req, res) {
   res.render('index',{});
});

// Query settings JSON data
app.get('/settings_query.json', checkAuth, function (req, res) {
	res.writeHead(200, { "Content-type": "application/json" });		
	res.end(JSON.stringify(settings), "ascii");
});

// POST handler for settings //
app.post('/change_settings', checkAuth, function (req, res) {
	var post = req.body;
	
	console.log("Change settings POST");
	console.log(post);
	
	if( post.enabled == "true" )
		post.enabled = 1;
	else
		post.enabled = 0;
	
	for(var property in post){
		db.run("UPDATE settings SET value = ? WHERE name = ?", post[property], property, function (err){
			if( err != null )
				console.log("DB error: "+err);
		});
	}
	
	//Update internal config
	read_config();
	
	res.writeHead(200, { "Content-type": "application/json" });
	res.end("Updated", "ascii");
	return;
});

// Query temperature JSON data
app.get('/temperature_query.json', checkAuth, function (req, res) {
	var url = require('url').parse(req.url, true);
	var pathfile = url.pathname;
    var query = url.query;

	if (query.start_date){
		var start_date = query.start_date;
	}
	else{
		var start_date = 0;
	}   
	// Send a message to console log
	console.log('Database query request from '+ req.connection.remoteAddress +' records from ' + start_date+'.');
	// call selectTemp function to get data from database
	selectTemp(start_date, function(data){
		res.writeHead(200, { "Content-type": "application/json" });		
		res.end(JSON.stringify(data), "ascii");
	});
	return;
});

// Express setup ends here
///////////////////////////////////////////////////


//Stores the settings from the DB
var settings = {};
var heating_on = false;

//Read the settings from the DB into an object
function read_config(){
	db.each("SELECT * FROM settings", 
		function(err, row) {
			if(err) {
				console.log("DB error");
				return;
			}
			
			settings[row.name] = row.value;
			//console.log(JSON.stringify(settings, null, 4));
		}
	);
}

//This function handles the GPIO for the heating
function heating_control(command) {
	//Save the state into the global object
	heating_on = command;
	
	if( heating_on ){
		gpio.write([gpio.LED.HEAT, gpio.LED.CONTROL]);
	} else {
		gpio.write([gpio.LED.CONTROL]);
	}
}

// Write a single temperature record in JSON format to database table.
function insertTemp(data){
   
   var celsius = data.temperature_record[0].celsius;

	//Examine the alarm threshold for all inputs
	if( celsius < settings.alert ) {
		mailer.alert_control( celsius );
	}
  
	if( settings.enabled == 1 ){
		/*
			If celsius is under ON then enable the heating
			Heat until the celsius is under OFF
		*/
		if ( !heating_on ) {
			if( celsius < settings.on ) {
				console.log("Start heating! " + celsius + " < " + settings.on + " (on)");
				heating_control(true); 
			} else {
				console.log("Waiting to cool until " + celsius + " > " + settings.on + " (on)");
			}
		}else if ( celsius < settings.off ) {
			console.log("Heating until " + celsius + " < " + settings.off + " (off)");
		} else {
			console.log("Stop heating! " + celsius + " >= " + settings.off + " (off)");
			heating_control(false);
		}
	} else {
		//NO heating
		console.log("!enabled, temperature: " + celsius);
		heating_control(false);
	}

   // data is a javascript object   
   var statement = db.prepare("INSERT INTO temperature_records VALUES (?, ?, ?, ?, ?)");
   // Insert values into prepared statement
   statement.run(data.temperature_record[0].unix_time, data.temperature_record[0].celsius, settings.off, settings.on, heating_on);
   // Execute the statement
   statement.finalize();
}

// Read current temperature from sensor
function readTemp(callback){
   fs.readFile('/sys/bus/w1/devices/'+device_ID+'/w1_slave', function(err, buffer)
	{
      if (err){
         console.error(err);
         process.exit(1);
      }

      // Read data from file (using fast node ASCII encoding).
      var data = buffer.toString('ascii').split(" "); // Split by space

      // Extract temperature from string and divide by 1000 to give celsius
      var temp  = parseFloat(data[data.length-1].split("=")[1])/1000.0;

      // Round to one decimal place
      temp = Math.round(temp * 10) / 10;

      // Add date/time to temperature
   	var data = {
            temperature_record:[{
            unix_time: Date.now(),
            celsius: temp
            }]};

      // Execute call back with data
      callback(data);
   });
};

// Create a wrapper function which we'll use specifically for logging
function logTemp(interval){
      // Call the readTemp function with the insertTemp function as output to get initial reading
      readTemp(insertTemp);
      // Set the repeat interval (milliseconds). Third argument is passed as callback function to first (i.e. readTemp(insertTemp)).
      setInterval(readTemp, interval, insertTemp);
};

// Get temperature records from database
function selectTemp(start_date, callback){
   // - Num records is an SQL filter from latest record back trough time series, 
   // - start_date is the first date in the time-series required, 
   // - callback is the output function
   var current_temp = db.all("SELECT * FROM temperature_records WHERE unix_time > ? ORDER BY unix_time", start_date,
      function(err, rows){
         if (err){
			   response.writeHead(500, { "Content-type": "text/html" });
			   response.end("\n");
			   console.log('Error serving querying database. ' + err);
			   return;
		 }
         data = {temperature_record:[rows]}
         callback(data);
   });
};

/////////////////////////////////////////////////////////////////
// Exit and error handling

process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + err);
  exit();
});

process.on('SIGINT',exit);
process.on('SIGTERM',exit);
process.on('SIGHUP',exit);

function exit(){
    console.log("Received exit command.");
    
	//This disables all the GPIO outputs
	gpio.shutDown(function(){
		return  process.exit();
    });
}


/////////////////////////////////////////////////////////////////
// Actual startup part:

read_config();

// Start temperature logging (every 5 min).
var msecs = (5*60) * 1000; // log interval duration in milliseconds
logTemp(msecs);
// Send a message to console
console.log('Server is logging to database at '+msecs+'ms intervals');
//Switch on the control LED
gpio.write([gpio.LED.CONTROL]);
