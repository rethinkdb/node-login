# Basic login and Account Management system built in Node.js and using RethinkDB

A fork of Stephen Braitsch's [Node-Login](http://node-login.braitsch.io) application providing
a basic login & account management system built in Node.js with the following features :

* New User Account Creation
* Secure Password Reset via Email
* Ability to Update / Delete Account
* Session Tracking for Logged-In Users
* Local Cookie Storage for Returning Users
* Blowfish-based Scheme Password Encryption

***

# Complete stack #

* [Node.js](http://nodejs.org/) - Application Server
* [RethinkDB](http://www.rethinkdb.com/) - Database Storage
* [Express.js](http://expressjs.com/) - Node.js Web Framework
* [Jade](http://jade-lang.com/) - HTML Templating Engine
* [Stylus](http://learnboost.github.com/stylus/) - CSS Preprocessor
* [EmailJS](http://github.com/eleith/emailjs) - Node.js > SMTP Server Middleware
* [Moment.js](http://momentjs.com/) - Lightweight Date Library
* [Twitter Bootstrap](http://twitter.github.com/bootstrap/) - UI Component & Layout Library

***

# Installation & Setup #

```
git clone git://github.com/rethinkdb/node-login.git node-login
cd node-login
npm install -d
node app
```

This assumes you already have node.js, npm & RethinkDB installed. 
If you don't follow [these instructions to get RethinkDB up and running](http://www.rethinkdb.com/docs/install/)

