import './main.css';

import firebase from 'firebase'
    var firebaseConfig = {
      "projectId": "huntington-video-349d9",
      "appId": "1:932847590550:web:de84bbf1a0356ef705b6b7",
      "databaseURL": "https://huntington-video-349d9.firebaseio.com",
      "storageBucket": "huntington-video-349d9.appspot.com",
      "locationId": "us-central",
      "apiKey": "AIzaSyCBJUVvMk-S0Ex0m_mPnhyGBXz6hvXzk8g",
      "authDomain": "huntington-video-349d9.firebaseapp.com",
      "messagingSenderId": "932847590550",
      "measurementId": "G-N6PXFG1QD4"
    };
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);



mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));

const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;

function init() {
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#createBtn').addEventListener('click',createRoom);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));
  document.querySelector('#chatWindow').style.visibility = 'hidden';
  document.querySelector('#sendChatButton').addEventListener('click', sendChat);
 
}

async function createRoom() {
  await openUserMedia();
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').doc();

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);
  registerPeerConnectionListeners();
  
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below
  const callerCandidatesCollection = roomRef.collection('callerCandidates');

  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      console.log('Got final candidate!');
      return;
    }
    console.log('Got candidate: ', event.candidate);
    callerCandidatesCollection.add(event.candidate.toJSON());
  });
  // Code for collecting ICE candidates above

  // Code for creating a room below
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log('Created offer:', offer);

  const roomWithOffer = {
    'offer': {
      type: offer.type,
      sdp: offer.sdp,
    },
    'status': 'waiting'
  };
 await roomRef.set(roomWithOffer);

  roomId = roomRef.id;
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
 

  //Adding to waiting Calls List
  const waitingCalls = {
  'status': 'waiting'
  };
  await db.collection('waitingRooms').doc(roomId).set(waitingCalls);
   listenChat();
  //Display Chat Window
  document.querySelector('#chatWindow').style.visibility = 'visible';

  // Code for creating a room above

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      console.log('Got remote description: ', data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }
  });
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

  
  // Listen for Room removal
  db.collection('rooms').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'removed' && roomId === change.doc.id ){
        console.log('hang up');
             hangUp();

      }
    });
  });
  // Listen for remote ICE candidates above  

}


async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia(
      {video: true, audio: true});
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
}

// async function hangUp(e) {
  async function hangUp() {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    
    await roomRef.delete();

    //Deleting Waiting room on hangup
    db.collection('waitingRooms').doc(roomId).delete();

  }

  document.location.reload(true);
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}

  async function sendChat(){
  const db = firebase.firestore();
  //Sending New Mesage
  const message = {
  'message': "Customer:   "+document.getElementById("chatText").value
  };
  const newChatRef =  db.collection('chats').doc(roomId).collection('messages').doc();
  await newChatRef.set(message);
  document.getElementById("chatText").value="";
}

async function listenChat(){
  const db = firebase.firestore();
  db.collection('chats').doc(roomId).collection('messages').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          var element = document.createElement("P");
          element.innerText =data.message;
          var parentobj = document.getElementById("chatMessages");
          //Append the element in page (in span).  
          parentobj.appendChild(element);
        }
        });
    });
}

init();