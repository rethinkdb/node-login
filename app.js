
/**
 * Node.js Login Boilerplate
 * Author : Stephen Braitsch
 * More Info : http://bit.ly/LsODY8
 * Modified to use RethinkDB: Alex Popescu
 */

var express = require('express');
var http = require('http');
var session = require('express-session');
var app = express();
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');

app.set('port', 8081);
app.set('views', __dirname + '/app/server/views');
app.set('view engine', 'jade');
app.locals.pretty = true;
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(session({ 
        secret : 'super-duper-secret-secret',
        resave : true,
        saveUninitialized : true
}));
app.use(require('stylus').middleware({ src: __dirname + '/app/public' }));
app.use(express.static(__dirname + '/app/public'));

require('./app/server/router')(app);

http.createServer(app).listen(app.get('port'), function(){
	console.log("Express server listening on port " + app.get('port'));
})
