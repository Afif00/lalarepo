'use strict';

// Look after different browser vendors' ways of calling the getUserMedia() API method:
// Opera --> getUserMedia
// Chrome --> webkitGetUserMedia
// Firefox --> mozGetUserMedia
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia 
							|| navigator.mozGetUserMedia;


// Data channel information
var sendChannel, receiveChannel;
var sendButton = document.getElementById("checkAndStart");
var endCallButton = document.getElementById("endCall");

// HTML5 <video> elements
var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

// Handler associated with 'Send' button
sendButton.onclick = checkAndStart();
endCallButton.onclick = checkAndStart();

// Flags...
var isChannelReady = false;
var isInitiator = false;
var isStarted = false;

// WebRTC data structures
// Streams
var localStream;
var remoteStream;
// Peer Connection
var pc;

// Peer Connection ICE protocol configuration (either Firefox or Chrome)
var pc_config = webrtcDetectedBrowser === 'firefox' ?
  {'iceServers':[{'url':'stun:23.21.150.121'}]} : // IP address
  {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};
  
var pc_constraints = {
  'optional': [
    {'DtlsSrtpKeyAgreement': true}
  ]};

// Session Description Protocol constraints:
var sdpConstraints = {};
/////////////////////////////////////////////

// Let's get started: prompt user for input (room name)
var nickname = prompt('Sender/Receiver: (S/R)');
var destination = "everyone";

// Connect to signalling server
var socket = io.connect();

// Send 'Create or join' message to singnalling server
if (nickname.toUpperCase() == 'S') {
  nickname = "Afif";
  isInitiator = true;
  destination = "Ahmad";
  console.log('Joining as sender', nickname);
  socket.emit('nickname', nickname);
} else {
  nickname = "Ahmad";
  destination = "Afif";
  console.log('Joining as Receiver', nickname);
  socket.emit('nickname', nickname);
}

// Set getUserMedia constraints
var constraints = {video: true, audio: false};

// From this point on, execution proceeds based on asynchronous events...

/////////////////////////////////////////////

// getUserMedia() handlers...
/////////////////////////////////////////////
function handleUserMedia(stream) {
	localStream = stream;
	attachMediaStream(localVideo, stream);
	console.log('Adding local stream.');
	sendMessage('got user media');
}

function handleUserMediaError(error){
	console.log('navigator.getUserMedia error: ', error);
}
/////////////////////////////////////////////


// Server-mediated message exchanging...
/////////////////////////////////////////////

// 1. Server-->Client...
/////////////////////////////////////////////

// Handle 'created' message coming back from server:
// this peer is the initiator
socket.on('user connected', function (user){
  console.log('user connected ' + user);
  isChannelReady = true;
  
  // Call getUserMedia()
  navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);
  console.log('Getting user media with constraints', constraints);
});

// Receive message from the other peer via the signalling server 
socket.on('message', function (message){
  console.log('Received message:', message);
  if (message === 'got user media') {
      checkAndStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      checkAndStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({sdpMLineIndex:message.label,
      candidate:message.candidate});
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});
////////////////////////////////////////////////

// 2. Client-->Server
////////////////////////////////////////////////
// Send message to the other peer via the signalling server
function sendMessage(message){
  console.log('Sending message: ', message);
  socket.emit('message', {
    'destination' : destination,
    'msgObj' : message
  });
}
////////////////////////////////////////////////////

////////////////////////////////////////////////////
// Channel negotiation trigger function
function checkAndStart() {
  console.error(isStarted);
  console.error(localStream);
  console.error(isChannelReady);
  if (!isStarted && typeof localStream != 'undefined' && isChannelReady) {  
	createPeerConnection();
    isStarted = true;
    if (isInitiator) {
      doCall();
    }
  }
}

/////////////////////////////////////////////////////////
// Peer Connection management...
function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(pc_config, pc_constraints);
    
    console.log("Calling pc.addStream(localStream)! Initiator: " + isInitiator);
    pc.addStream(localStream);
    
    pc.onicecandidate = handleIceCandidate;
    console.log('Created RTCPeerConnnection with:\n' +
      '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
      '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.'); 
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
      return;
  }

  pc.onaddstream = handleRemoteStreamAdded;
  pc.onremovestream = handleRemoteStreamRemoved;

  
}


// ICE candidates management
function handleIceCandidate(event) {
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate});
  } else {
    console.log('End of candidates.');
  }
}

// Create Offer
function doCall() {
  console.log('Creating Offer...');
  pc.createOffer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
}

// Signalling error handler
function onSignalingError(error) {
	console.log('Failed to create signaling message : ' + error.name);
}

// Create Answer
function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer(setLocalAndSendMessage, onSignalingError, sdpConstraints);  
}

// Success handler for both createOffer()
// and createAnswer()
function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  sendMessage(sessionDescription);
}

/////////////////////////////////////////////////////////
// Remote stream handlers...

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  attachMediaStream(remoteVideo, event.stream);
  console.log('Remote stream attached!!.');
  remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}
/////////////////////////////////////////////////////////

/////////////////////////////////////////////////////////
// Clean-up functions...


function hangup() {
  console.log('Hanging up.');
  stop();
}

function stop() {
  isStarted = false;
  if (sendChannel) sendChannel.close();
  if (receiveChannel) receiveChannel.close();
  if (pc) pc.close();  
  pc = null;
  sendButton.disabled=true;
}


///////////////////////////////////////////