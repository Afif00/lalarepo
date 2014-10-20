//brand new

var static = require('node-static');
var http = require('http');
// Create a node-static server instance
var file = new(static.Server)();
var users = {};

// We use the http moduleÕs createServer function and
// rely on our instance of node-static to serve the files
var app = http.createServer(function (req, res) {
  file.serve(req, res);
}).listen(8181);

// Use socket.io JavaScript library for real-time web applications
var io = require('socket.io').listen(app);

// Let's start managing connections...
io.sockets.on('connection', function (socket){
        
        // Handle 'create or join' messages

        socket.on('nickname', function(nickname){
                console.log("New user connected: " + nickname);
                io.emit('user connected', nickname);
                users[nickname] = socket;
        });

        // Handle 'message' messages
        socket.on('message', function (message) {
                console.log('S --> got message: ', message);

                if (message.destination == 'everyone') {
                  io.emit('message', message.msgObj);
                } else {
                  users[message.destination].emit('message', message.msgObj);
                }
        });


});